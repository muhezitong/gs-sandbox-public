// 图像工具：参数校验、请求组装、写文件、来源登记、调用日志、MCP 包装；用模拟 fetch，离线、不花钱。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateImage, buildImageRequest } from '../../tools/asset-image.mjs';
import { parseArgs, register, sniffImage } from '../../tools/asset-lib.mjs';
import { handle, toArgv } from '../../tools/asset-mcp.mjs';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const env = { OPENAI_API_KEY: 'test-key', OPENAI_BASE_URL: 'https://gw.example/v1/' };

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), 'gs-asset-'));
  mkdirSync(join(root, 'assets'));
  cpSync(join(REPO, 'assets/README.md'), join(root, 'assets/README.md'));
  return root;
}
function mockFetch(calls, body = { data: [{ b64_json: PNG.toString('base64') }] }, status = 200) {
  return async (url, init) => { calls.push({ url, init }); return new Response(JSON.stringify(body), { status }); };
}
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]);
const base = { out: 'public/images/hero.png', use: '标题页主视觉', prompt: '竖版标题插画，木纹，暖色' };

test('参数解析：可重复的 --ref、开关、缺值报错', () => {
  assert.deepEqual(parseArgs(['image', '--out', 'a', '--ref', 'x', '--ref', 'y', '--force']), { cmd: 'image', opts: { out: 'a', ref: ['x', 'y'], force: true } });
  assert.throws(() => parseArgs(['image', '--out']), { code: 'bad_args' });
});

test('校验：路径只能在 public/ 或 assets/ 下、格式、透明背景与模型限制、已存在不覆盖', () => {
  const root = sandbox();
  try {
    const b = (o) => () => buildImageRequest({ ...base, ...o }, { root, env });
    assert.throws(b({ out: 'src/x.png' }), { code: 'bad_args' });
    assert.throws(b({ out: '../x.png' }), { code: 'bad_args' });
    assert.throws(b({ out: 'public/x.gif' }), { code: 'bad_args' });
    assert.throws(b({ use: undefined }), { code: 'bad_args' });
    assert.throws(b({ background: 'transparent', out: 'public/x.jpg', model: 'gpt-image-1.5' }), /透明背景需要/);
    assert.throws(b({ background: 'transparent' }), /不支持透明背景/);
    assert.equal(b({ background: 'transparent', model: 'gpt-image-1.5' })().params.background, 'transparent');
    mkdirSync(join(root, 'public/images'), { recursive: true });
    writeFileSync(join(root, base.out), 'x');
    assert.throws(b({}), { code: 'exists' });
    assert.doesNotThrow(b({ force: true }));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('请求组装：网关地址、默认模型、jpg 映射为 jpeg', () => {
  const root = sandbox();
  try {
    const r = buildImageRequest({ ...base, out: 'public/a.jpg' }, { root, env: { ...env, IMAGE_MODEL: 'gpt-image-2' } });
    assert.equal(r.endpoint, 'https://gw.example/v1/images/generations');
    assert.equal(r.params.model, 'gpt-image-2');
    assert.equal(r.params.output_format, 'jpeg');
    assert.equal(buildImageRequest(base, { root, env: { OPENAI_API_KEY: 'k' } }).endpoint, 'https://api.openai.com/v1/images/generations');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('dry-run 不发请求、不写文件、不需要密钥', async () => {
  const root = sandbox();
  try {
    const calls = [];
    const r = await generateImage({ ...base, 'dry-run': true }, { root, env: {}, fetch: mockFetch(calls) });
    assert.equal(r.dryRun, true);
    assert.equal(calls.length, 0);
    assert.equal(existsSync(join(root, base.out)), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('真实路径（模拟服务）：写文件、登记一行、记调用日志；覆盖时更新同一行', async () => {
  const root = sandbox();
  try {
    const calls = [];
    const r = await generateImage(base, { root, env, fetch: mockFetch(calls) });
    assert.equal(r.ok, true);
    assert.equal(calls[0].init.headers.Authorization, 'Bearer test-key');
    assert.deepEqual(readFileSync(join(root, base.out)), PNG);
    const readme = () => readFileSync(join(root, 'assets/README.md'), 'utf8');
    assert.match(readme(), /\| `public\/images\/hero\.png` \| 标题页主视觉 \| 生成 \| gpt-image-2\.5-sunburst \| 竖版标题插画，木纹，暖色 \| - \| \d{4}-\d{2}-\d{2} \|/);
    await generateImage({ ...base, force: true, prompt: '换一版' }, { root, env, fetch: mockFetch(calls) });
    assert.equal(readme().split('\n').filter((l) => l.includes('`public/images/hero.png`')).length, 1);
    assert.match(readme(), /\| 换一版 \|/);
    const log = readFileSync(join(root, '.game-studio/run/asset-calls.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(log.length, 2);
    assert.equal(log[0].kind, 'image');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('失败：缺密钥 no_key；服务报错 http 且记日志、不写文件、不登记', async () => {
  const root = sandbox();
  try {
    await assert.rejects(generateImage(base, { root, env: {} }), { code: 'no_key' });
    const calls = [];
    await assert.rejects(generateImage(base, { root, env, fetch: mockFetch(calls, { error: { message: '额度不足' } }, 402) }), /HTTP 402：额度不足/);
    assert.equal(existsSync(join(root, base.out)), false);
    assert.doesNotMatch(readFileSync(join(root, 'assets/README.md'), 'utf8'), /hero\.png/);
    assert.match(readFileSync(join(root, '.game-studio/run/asset-calls.jsonl'), 'utf8'), /"ok":false,"code":"http"/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('登记表单元格转义竖线与换行', () => {
  const root = sandbox();
  try {
    register(root, { file: 'public/a.png', use: 'a|b', model: 'm', prompt: '第一行\n第二行', taskId: '-', date: '2026-10-16' });
    assert.match(readFileSync(join(root, 'assets/README.md'), 'utf8'), /\| a\\\|b \| 生成 \| m \| 第一行 第二行 \|/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('MCP：initialize、tools/list、参数转 argv、未知工具报错、通知不回复', async () => {
  assert.equal((await handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })).result.serverInfo.name, 'game-studio-assets');
  const list = await handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.deepEqual(list.result.tools.map((t) => t.name), ['asset_image', 'asset_model']);
  assert.deepEqual(toArgv('asset_image', { out: 'public/a.png', dry_run: true, ref: ['x.png'], force: false }), ['image', '--out', 'public/a.png', '--dry-run', '--ref', 'x.png']);
  assert.equal((await handle({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'nope' } })).error.code, -32602);
  assert.equal(await handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  const call = await handle({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'asset_image', arguments: { out: 'src/x.png', use: 'u', prompt: 'p' } } });
  assert.equal(call.result.isError, true);
  assert.equal(JSON.parse(call.result.content[0].text).code, 'bad_args');
});

test('格式：按文件头识别；服务返回格式不符时转换，转不了就改扩展名并警告；超大给警告', async () => {
  assert.equal(sniffImage(PNG), 'png');
  assert.equal(sniffImage(WEBP), 'webp');
  assert.equal(sniffImage(Buffer.from('ffd8ffe0', 'hex')), 'jpeg');
  assert.equal(sniffImage(Buffer.from('hello')), null);
  const root = sandbox();
  try {
    const calls = [];
    const conv = await generateImage({ ...base, out: 'public/a.webp' }, { root, env, fetch: mockFetch(calls), convert: () => ({ bytes: WEBP, tool: 'magick' }) });
    assert.equal(conv.out, 'public/a.webp');
    assert.deepEqual(readFileSync(join(root, 'public/a.webp')), WEBP);
    assert.match(conv.warnings[0], /已用 magick 转为 webp/);
    const fallback = await generateImage({ ...base, out: 'public/b.webp' }, { root, env, fetch: mockFetch(calls), convert: () => null });
    assert.equal(fallback.out, 'public/b.png');
    assert.equal(existsSync(join(root, 'public/b.webp')), false);
    assert.match(readFileSync(join(root, 'assets/README.md'), 'utf8'), /\| `public\/b\.png` \|/);
    const big = await generateImage({ ...base, out: 'public/c.png', 'max-kb': '0' }, { root, env, fetch: mockFetch(calls), convert: () => null });
    assert.match(big.warnings.at(-1), /超过 0 KB/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('空字符串的网关与模型当作未设置', () => {
  const root = sandbox();
  try {
    const r = buildImageRequest(base, { root, env: { OPENAI_API_KEY: 'k', OPENAI_BASE_URL: '', IMAGE_MODEL: '' } });
    assert.equal(r.endpoint, 'https://api.openai.com/v1/images/generations');
    assert.equal(r.params.model, 'gpt-image-2.5-sunburst');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
