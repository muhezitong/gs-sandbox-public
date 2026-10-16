// 图像生成与编辑：OpenAI 兼容的 /images/generations 与 /images/edits（网关用 OPENAI_BASE_URL）。
import { readFileSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { AssetError, checkOut, writeOut, register, logCall, needKey, readJson, sniffImage, convertImage } from './asset-lib.mjs';
import { existsSync } from 'node:fs';

export const IMAGE_EXTS = ['png', 'webp', 'jpg', 'jpeg'];
const QUALITIES = ['low', 'medium', 'high', 'auto'];
const BACKGROUNDS = ['transparent', 'opaque', 'auto'];
const MIME = { png: 'image/png', webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg' };

export const imageModel = (opts, env) => opts.model ?? env.IMAGE_MODEL ?? env.OPENAI_IMAGE_MODEL ?? 'gpt-image-2.5-sunburst';

// 只做校验与组装，不发请求；dry-run 与单测直接用
export function buildImageRequest(opts, { root, env }) {
  if (!opts.prompt) throw new AssetError('bad_args', '缺少 --prompt');
  if (!opts.use) throw new AssetError('bad_args', '缺少 --use（写进登记表的用途）');
  const { rel, ext } = checkOut(root, opts.out, IMAGE_EXTS, opts.force);
  const size = opts.size ?? '1024x1024';
  if (size !== 'auto' && !/^[1-9]\d*x[1-9]\d*$/.test(size)) throw new AssetError('bad_args', `--size 应为 WIDTHxHEIGHT 或 auto：${size}`);
  const quality = opts.quality ?? 'medium';
  if (!QUALITIES.includes(quality)) throw new AssetError('bad_args', `--quality 可用：${QUALITIES.join('、')}`);
  const background = opts.background ?? 'auto';
  if (!BACKGROUNDS.includes(background)) throw new AssetError('bad_args', `--background 可用：${BACKGROUNDS.join('、')}`);
  const model = imageModel(opts, env);
  if (background === 'transparent') {
    if (!['png', 'webp'].includes(ext)) throw new AssetError('bad_args', '透明背景需要 .png 或 .webp');
    if (/^gpt-image-2/.test(model)) throw new AssetError('bad_args', `${model} 不支持透明背景；透明抠图请加 --model gpt-image-1.5（换模型需用户同意）`);
  }
  const format = ext === 'jpg' ? 'jpeg' : ext;
  const base = (env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '');
  const refs = opts.ref ?? [];
  const params = { model, prompt: opts.prompt, size, quality, output_format: format, n: 1, ...(background !== 'auto' ? { background } : {}) };
  const maxKb = Number(opts['max-kb'] ?? 1024);
  return { rel, ext: format, maxKb, model, refs, endpoint: `${base}/images/${refs.length ? 'edits' : 'generations'}`, params };
}

export async function generateImage(opts, { root, env = process.env, fetch = globalThis.fetch, convert = convertImage } = {}) {
  const req = buildImageRequest(opts, { root, env });
  if (opts['dry-run']) return { ok: true, dryRun: true, kind: 'image', out: req.rel, model: req.model, endpoint: req.endpoint, params: req.params, refs: req.refs };
  const key = needKey(env, 'OPENAI_API_KEY');
  const t0 = Date.now();
  let init;
  if (req.refs.length) {
    const form = new FormData();
    for (const [k, v] of Object.entries(req.params)) form.append(k, String(v));
    for (const r of req.refs) {
      const ext = extname(r).slice(1).toLowerCase();
      form.append('image[]', new Blob([readFileSync(join(root, r))], { type: MIME[ext] ?? 'application/octet-stream' }), basename(r));
    }
    init = { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form };
  } else {
    init = { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(req.params) };
  }
  try {
    const body = await readJson(await fetch(req.endpoint, init));
    const item = body.data?.[0];
    let bytes;
    if (item?.b64_json) bytes = Buffer.from(item.b64_json, 'base64');
    else if (item?.url) bytes = Buffer.from(await (await fetch(item.url)).arrayBuffer());
    else throw new AssetError('http', '返回里没有图片数据');
    // 服务可能忽略 output_format：按文件头确认，不符就转；转不了就改扩展名保存并警告
    const warnings = [];
    let out = req.rel;
    const actual = sniffImage(bytes);
    if (actual && actual !== req.ext) {
      const conv = convert(bytes, actual, req.ext);
      if (conv) { bytes = conv.bytes; warnings.push(`服务返回 ${actual}，已用 ${conv.tool} 转为 ${req.ext}`); }
      else {
        out = req.rel.replace(/\.[a-z]+$/i, `.${actual === 'jpeg' ? 'jpg' : actual}`);
        if (existsSync(join(root, out)) && !opts.force) throw new AssetError('exists', `服务返回 ${actual}，改存为 ${out}，但它已存在；确认覆盖时加 --force`);
        warnings.push(`服务返回 ${actual}，本机没有可用的转换工具（ImageMagick 或 cwebp），已改存为 ${out}`);
      }
    }
    if (bytes.length > req.maxKb * 1024) warnings.push(`文件 ${Math.round(bytes.length / 1024)} KB，超过 ${req.maxKb} KB；游戏里用之前考虑压缩或缩小尺寸`);
    writeOut(root, out, bytes);
    const prompt = req.refs.length ? `${opts.prompt}；参考：${req.refs.join('、')}` : opts.prompt;
    register(root, { file: out, use: opts.use, model: req.model, prompt, taskId: '-' });
    const ms = Date.now() - t0;
    logCall(root, { kind: 'image', model: req.model, out, ok: true, code: null, taskId: null, ms });
    return { ok: true, kind: 'image', out, model: req.model, taskId: null, prompt: opts.prompt, refs: req.refs, bytes: bytes.length, ms, warnings };
  } catch (e) {
    logCall(root, { kind: 'image', model: req.model, out: req.rel, ok: false, code: e.code ?? 'http', taskId: null, ms: Date.now() - t0 });
    throw e instanceof AssetError ? e : new AssetError('http', e.message);
  }
}
