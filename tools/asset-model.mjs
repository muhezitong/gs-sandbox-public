// 三维生成：Tripo /v3（上传参考图 → 提交生成 → 轮询任务 → 下载 GLB），检查面数与体积，自动登记来源。
import { readFileSync, writeFileSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { AssetError, checkOut, writeOut, register, logCall, needKey } from './asset-lib.mjs';

export const MODEL_EXTS = ['glb'];
// 用户写法 → 接口里的版本号（与 Tripo CLI 一致）
export const MODEL_ALIASES = { 'tripo-p2': 'P2-20260801', p2: 'P2-20260801', P2: 'P2-20260801', 'tripo-p1': 'P1-20260311', p1: 'P1-20260311', 'tripo-v3.1': 'v3.1-20260211', 'v3.1': 'v3.1-20260211' };
export const FAILED = ['failed', 'cancelled', 'banned', 'expired'];
const MIME = { png: 'image/png', webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg' };

export const tripoModel = (opts, env) => { const m = opts.model || env.TRIPO_MODEL || 'tripo-p2'; return MODEL_ALIASES[m] ?? m; };

// GLB：12 字节头 + JSON 块；三角面数 = 各 primitive 的 indices（没有就用 POSITION）计数 / 3
export function glbStats(bytes) {
  const b = Buffer.from(bytes);
  if (b.length < 20 || b.toString('ascii', 0, 4) !== 'glTF') throw new AssetError('http', '下载的文件不是 GLB');
  const jsonLen = b.readUInt32LE(12);
  if (b.readUInt32LE(16) !== 0x4e4f534a) throw new AssetError('http', 'GLB 第一个块不是 JSON');
  const gltf = JSON.parse(b.toString('utf8', 20, 20 + jsonLen));
  let faces = 0;
  for (const mesh of gltf.meshes ?? []) for (const p of mesh.primitives ?? []) {
    if ((p.mode ?? 4) !== 4) continue;
    const acc = gltf.accessors?.[p.indices ?? p.attributes?.POSITION];
    faces += Math.floor((acc?.count ?? 0) / 3);
  }
  return { faces, meshes: gltf.meshes?.length ?? 0, textures: gltf.images?.length ?? 0, bytes: b.length };
}

// 任务输出里的模型地址：优先 pbr_model，其次 model、base_model，再找任意 .glb 地址
export function modelUrl(output) {
  const pick = (v) => (typeof v === 'string' ? v : v?.url);
  for (const k of ['pbr_model', 'model', 'base_model']) if (pick(output?.[k])) return pick(output[k]);
  const all = [];
  const visit = (v) => { if (typeof v === 'string' && /^https?:\/\//.test(v)) all.push(v); else if (v && typeof v === 'object') Object.values(v).forEach(visit); };
  visit(output);
  return all.find((u) => /\.glb$/i.test(new URL(u).pathname)) ?? null;
}

export function buildModelRequest(opts, { root, env }) {
  if (!opts.use) throw new AssetError('bad_args', '缺少 --use（写进登记表的用途）');
  if (!opts.prompt === !opts.image) throw new AssetError('bad_args', '--prompt 与 --image 二选一');
  const { rel } = checkOut(root, opts.out, MODEL_EXTS, opts.force);
  if (opts.image && !MIME[extname(opts.image).slice(1).toLowerCase()]) throw new AssetError('bad_args', `参考图格式不支持：${opts.image}`);
  const model = tripoModel(opts, env);
  // 空字符串当未设置：Actions 里没设的 secrets / vars 注入成空串
  const base = (env.TRIPO_BASE_URL || 'https://openapi.tripo3d.ai').replace(/\/$/, '');
  const params = { model, ...(opts.prompt ? { prompt: opts.prompt } : {}), ...(opts.seed ? { model_seed: Number(opts.seed) } : {}) };
  return {
    rel, model, base, params, image: opts.image ?? null,
    endpoint: `${base}/v3/generation/${opts.image ? 'image-to-model' : 'text-to-model'}`,
    timeoutMs: Number(opts.timeout ?? 600) * 1000,
    maxFaces: Number(opts['max-faces'] ?? 20000),
    maxMb: Number(opts['max-mb'] ?? 10),
  };
}

export async function generateModel(opts, { root, env = process.env, fetch = globalThis.fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const req = buildModelRequest(opts, { root, env });
  if (opts['dry-run']) return { ok: true, dryRun: true, kind: 'model', out: req.rel, model: req.model, endpoint: req.endpoint, params: req.params, image: req.image };
  const key = needKey(env, 'TRIPO_API_KEY');
  const auth = { Authorization: `Bearer ${key}` };
  // Tripo 的信封：{ code: 0, data }；非 0 或非 2xx 都算失败，带服务端原文
  const call = async (method, path, init = {}) => {
    let res;
    // 连不上（超时、DNS）和密钥错是两回事：前者多半是网络或区域，提示换端点
    try { res = await fetch(`${req.base}${path}`, { method, ...init, headers: { ...auth, ...(init.headers ?? {}) } }); }
    catch (e) { throw new AssetError('http', `连不上 ${req.base}（${e.cause?.code ?? e.message}）：多半是网络问题而不是密钥问题。海外端点 https://openapi.tripo3d.ai、国内端点 https://openapi.tripo3d.com，用 TRIPO_BASE_URL 切换；密钥只在开通它的区域有效`); }
    const text = await res.text();
    let body; try { body = JSON.parse(text); } catch { body = null; }
    if (!res.ok || !body || body.code !== 0) throw new AssetError('http', `Tripo ${method} ${path}：HTTP ${res.status}${body?.code ? ` code ${body.code}` : ''} ${(body?.message ?? text).slice(0, 300)}`);
    return body.data;
  };
  const t0 = Date.now();
  let taskId = null;
  try {
    const payload = { ...req.params };
    if (req.image) {
      const form = new FormData();
      const ext = extname(req.image).slice(1).toLowerCase();
      form.append('file', new Blob([readFileSync(join(root, req.image))], { type: MIME[ext] }), basename(req.image));
      payload.input = (await call('POST', '/v3/files', { body: form })).file_token;
    }
    taskId = (await call('POST', req.endpoint.slice(req.base.length), { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })).task_id;
    // 轮询：参考 running_left_time，否则指数退避到 30 秒
    let task;
    let backoff = 2000;
    for (;;) {
      task = await call('GET', `/v3/tasks/${encodeURIComponent(taskId)}`);
      if (task.status === 'success') break;
      if (FAILED.includes(task.status)) throw new AssetError('task_failed', `Tripo 任务 ${taskId} ${task.status}${task.output?.message ? `：${task.output.message}` : ''}`);
      if (Date.now() - t0 > req.timeoutMs) throw new AssetError('timeout', `Tripo 任务 ${taskId} 超过 ${req.timeoutMs / 1000} 秒仍是 ${task.status}（服务端还在跑，可稍后重试下载）`);
      const left = task.running_left_time ?? task.output?.running_left_time;
      await sleep(typeof left === 'number' && left > 0 ? Math.max(2000, left * 500) : backoff);
      backoff = Math.min(backoff * 1.5, 30000);
    }
    const url = modelUrl(task.output);
    if (!url) throw new AssetError('http', `Tripo 任务 ${taskId} 成功但没有模型地址`);
    const bytes = Buffer.from(await (await fetch(url)).arrayBuffer());
    const stats = glbStats(bytes);
    const warnings = [];
    if (stats.faces > req.maxFaces) warnings.push(`面数 ${stats.faces} 超过 ${req.maxFaces}；移动端考虑减面`);
    if (bytes.length > req.maxMb * 1024 * 1024) warnings.push(`文件 ${(bytes.length / 1048576).toFixed(1)} MB，超过 ${req.maxMb} MB`);
    writeOut(root, req.rel, bytes);
    writeFileSync(join(root, `${req.rel}.task.json`), JSON.stringify({ task_id: taskId, model: req.model, status: task.status, input: req.image ?? req.params.prompt, created: task.create_time ?? null }, null, 2) + '\n');
    const prompt = req.image ? `参考：${req.image}${opts.prompt ? `；${opts.prompt}` : ''}` : opts.prompt;
    register(root, { file: req.rel, use: opts.use, model: `Tripo ${req.model}`, prompt, taskId });
    const ms = Date.now() - t0;
    logCall(root, { kind: 'model', model: req.model, out: req.rel, ok: true, code: null, taskId, ms });
    return { ok: true, kind: 'model', out: req.rel, model: req.model, taskId, prompt: opts.prompt ?? null, refs: req.image ? [req.image] : [], bytes: bytes.length, faces: stats.faces, ms, warnings };
  } catch (e) {
    logCall(root, { kind: 'model', model: req.model, out: req.rel, ok: false, code: e.code ?? 'http', taskId, ms: Date.now() - t0 });
    throw e instanceof AssetError ? e : new AssetError('http', e.message);
  }
}
