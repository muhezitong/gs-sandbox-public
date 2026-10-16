// 资产工具的 MCP 服务（stdio，每行一条 JSON-RPC）：asset_image、asset_model。只是 tools/asset.mjs 的包装，参数与输出相同。
// 本地 Claude Code：claude --mcp-config .game-studio/mcp.json
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { run } from './asset.mjs';
import { realpathSync } from 'node:fs';
// 是否被直接运行：比较真实路径（macOS 上 /var 是 /private/var 的符号链接，直接比字符串会误判）
const isMain = (url) => { try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(url)); } catch { return false; } };

const common = {
  out: { type: 'string', description: '输出路径，相对仓库根，必须在 public/ 或 assets/ 下' },
  use: { type: 'string', description: '用途，写进 assets/README.md 登记表' },
  force: { type: 'boolean', description: '允许覆盖已有文件' },
  dry_run: { type: 'boolean', description: '只校验并返回将要发送的请求，不调用、不花钱' },
};
export const TOOLS = [
  {
    name: 'asset_image',
    description: '生成或编辑一张图片并自动登记来源。每次真实调用都花钱；草稿用 quality=low。',
    inputSchema: { type: 'object', required: ['out', 'use', 'prompt'], properties: {
      ...common,
      prompt: { type: 'string' },
      size: { type: 'string', description: 'WIDTHxHEIGHT 或 auto，默认 1024x1024' },
      quality: { type: 'string', enum: ['low', 'medium', 'high', 'auto'] },
      background: { type: 'string', enum: ['transparent', 'opaque', 'auto'] },
      ref: { type: 'array', items: { type: 'string' }, description: '参考图路径；有参考图时走编辑' },
      model: { type: 'string' },
    } },
  },
  {
    name: 'asset_model',
    description: '用 Tripo 从参考图（推荐）或文字生成 GLB 并自动登记来源。每次真实调用都花积分，耗时 1–5 分钟。',
    inputSchema: { type: 'object', required: ['out', 'use'], properties: {
      ...common,
      image: { type: 'string', description: '参考图路径（与 prompt 二选一）' },
      prompt: { type: 'string', description: '文字描述（与 image 二选一）' },
      model: { type: 'string', description: '默认 tripo-p2' },
      seed: { type: 'integer' },
      timeout: { type: 'integer', description: '轮询超时秒数，默认 600' },
    } },
  },
];
const CMD = { asset_image: 'image', asset_model: 'model' };

// MCP 参数 → CLI argv
export function toArgv(name, args) {
  const argv = [CMD[name]];
  for (const [k, v] of Object.entries(args ?? {})) {
    const flag = `--${k.replace(/_/g, '-')}`;
    if (v === true) argv.push(flag);
    else if (Array.isArray(v)) for (const x of v) argv.push(flag, String(x));
    else if (v !== false && v !== undefined && v !== null) argv.push(flag, String(v));
  }
  return argv;
}

export async function handle(msg) {
  const { id, method, params } = msg;
  if (method === 'initialize') return { jsonrpc: '2.0', id, result: { protocolVersion: params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'game-studio-assets', version: '1' } } };
  if (method === 'tools/list') return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
  if (method === 'tools/call') {
    if (!CMD[params?.name]) return { jsonrpc: '2.0', id, error: { code: -32602, message: `没有工具 ${params?.name}` } };
    const { result } = await run(toArgv(params.name, params.arguments));
    return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(result) }], isError: !result.ok } };
  }
  if (id === undefined) return null; // 通知（如 notifications/initialized）不回复
  return { jsonrpc: '2.0', id, error: { code: -32601, message: `不支持 ${method}` } };
}

if (isMain(import.meta.url)) {
  const rl = createInterface({ input: process.stdin });
  rl.on('line', async (line) => {
    if (!line.trim()) return;
    let msg;
    try { msg = JSON.parse(line); } catch { return; }
    const reply = await handle(msg);
    if (reply) process.stdout.write(JSON.stringify(reply) + '\n');
  });
}
