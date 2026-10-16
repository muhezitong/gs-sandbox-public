// 资产工具共用：参数、输出路径、来源登记、调用日志、错误（《模型工具接口》，game-studio docs/02-架构/03）。
import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { join, dirname, extname, normalize } from 'node:path';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

export class AssetError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

// --key value / --flag；可重复的参数收成数组
const REPEAT = new Set(['ref']);
const FLAGS = new Set(['force', 'dry-run', 'json']);
export function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  const opts = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith('--')) throw new AssetError('bad_args', `多余的参数：${a}`);
    const k = a.slice(2);
    if (FLAGS.has(k)) { opts[k] = true; continue; }
    const v = rest[++i];
    if (v === undefined) throw new AssetError('bad_args', `${a} 缺少取值`);
    if (REPEAT.has(k)) (opts[k] ??= []).push(v); else opts[k] = v;
  }
  return { cmd, opts };
}

// 输出路径：相对仓库根，限 public/ 与 assets/，扩展名在允许范围内
export function checkOut(root, out, exts, force) {
  if (!out) throw new AssetError('bad_args', '缺少 --out');
  const rel = normalize(out).replace(/\\/g, '/');
  if (rel.startsWith('/') || rel.startsWith('..') || !/^(public|assets)\//.test(rel)) throw new AssetError('bad_args', `--out 必须在 public/ 或 assets/ 下：${out}`);
  const ext = extname(rel).slice(1).toLowerCase();
  if (!exts.includes(ext)) throw new AssetError('bad_args', `不支持的格式 .${ext}，可用：${exts.join('、')}`);
  if (existsSync(join(root, rel)) && !force) throw new AssetError('exists', `${rel} 已存在；确认要覆盖时加 --force`);
  return { rel, ext };
}

export const today = () => new Date().toLocaleDateString('sv-SE');

export function writeOut(root, rel, bytes) {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), bytes);
}

// 登记表一行；表格里的竖线与换行要转义
const cell = (v) => String(v ?? '-').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim() || '-';
export function register(root, row) {
  const file = join(root, 'assets/README.md');
  const text = readFileSync(file, 'utf8');
  const line = `| \`${row.file}\` | ${cell(row.use)} | 生成 | ${cell(row.model)} | ${cell(row.prompt)} | ${cell(row.taskId)} | ${row.date ?? today()} |`;
  const lines = text.split('\n');
  const i = lines.findIndex((l) => l.startsWith(`| \`${row.file}\` |`));
  if (i >= 0) lines[i] = line;
  else {
    // 追加到登记表最后一行之后（表格在文件末尾，跳过尾部空行）
    let end = lines.length;
    while (end > 0 && lines[end - 1].trim() === '') end--;
    lines.splice(end, 0, line);
  }
  writeFileSync(file, lines.join('\n').replace(/\n*$/, '\n'));
}

export function logCall(root, rec) {
  mkdirSync(join(root, '.game-studio/run'), { recursive: true });
  appendFileSync(join(root, '.game-studio/run/asset-calls.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...rec }) + '\n');
}

export function needKey(env, name) {
  if (!env[name]) throw new AssetError('no_key', `缺少 ${name}（放在环境变量或仓库 Secrets，不要写进文件）`);
  return env[name];
}

// 读服务返回：非 2xx 抛 http，带服务端原文（截断）
export async function readJson(res) {
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = null; }
  if (!res.ok) throw new AssetError('http', `HTTP ${res.status}：${(body?.error?.message ?? body?.message ?? text).slice(0, 300)}`);
  if (!body) throw new AssetError('http', `返回不是 JSON：${text.slice(0, 200)}`);
  return body;
}

// 按文件头判断图片实际格式（服务可能忽略 output_format）
export function sniffImage(bytes) {
  const b = Buffer.from(bytes);
  if (b.length >= 8 && b.readUInt32BE(0) === 0x89504e47) return 'png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

// 用本机已有的工具转格式：ImageMagick、cwebp（只能转 webp）、macOS sips（不支持写 webp）；都没有返回 null
export function convertImage(bytes, from, to) {
  const dir = join(tmpdir(), `gs-conv-${process.pid}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  const src = join(dir, `in.${from}`);
  const dst = join(dir, `out.${to}`);
  writeFileSync(src, bytes);
  const has = (c) => { try { execFileSync('sh', ['-c', `command -v ${c}`], { stdio: 'ignore' }); return true; } catch { return false; } };
  const tries = [
    ['magick', [src, '-quality', '86', dst]],
    ['convert', [src, '-quality', '86', dst]],
    ...(to === 'webp' ? [['cwebp', ['-q', '86', src, '-o', dst]]] : []),
    ...(to !== 'webp' ? [['sips', ['-s', 'format', to === 'jpg' ? 'jpeg' : to, src, '--out', dst]]] : []),
  ];
  try {
    for (const [cmd, args] of tries) {
      if (!has(cmd)) continue;
      try { execFileSync(cmd, args, { stdio: 'ignore' }); } catch { continue; }
      if (existsSync(dst)) return { bytes: readFileSync(dst), tool: cmd };
    }
    return null;
  } finally { try { execFileSync('rm', ['-rf', dir]); } catch { /* 临时目录 */ } }
}
