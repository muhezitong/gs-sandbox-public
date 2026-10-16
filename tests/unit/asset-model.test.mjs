// 三维工具：校验、GLB 统计、模型地址、上传 → 提交 → 轮询 → 下载、重试退避、失败与超时；模拟 Tripo，离线、不花钱。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateModel, buildModelRequest, glbStats, modelUrl, tripoModel } from '../../tools/asset-model.mjs';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const env = { TRIPO_API_KEY: 'tsk-test' };

// 最小 GLB：一个 primitive，indices 访问器 count=36（12 个三角形）
export function fakeGlb(count = 36) {
  const json = Buffer.from(JSON.stringify({ asset: { version: '2.0' }, meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }], accessors: [{ count: 8 }, { count }] }));
  const pad = Buffer.alloc((4 - (json.length % 4)) % 4, 0x20);
  const chunk = Buffer.concat([json, pad]);
  const head = Buffer.alloc(20);
  head.write('glTF', 0, 'ascii'); head.writeUInt32LE(2, 4); head.writeUInt32LE(20 + chunk.length, 8);
  head.writeUInt32LE(chunk.length, 12); head.writeUInt32LE(0x4e4f534a, 16);
  return Buffer.concat([head, chunk]);
}

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), 'gs-model-'));
  mkdirSync(join(root, 'assets'));
  cpSync(join(REPO, 'assets/README.md'), join(root, 'assets/README.md'));
  mkdirSync(join(root, 'public/images'), { recursive: true });
  writeFileSync(join(root, 'public/images/crate-ref.png'), Buffer.from('89504e470d0a1a0a', 'hex'));
  return root;
}

// 模拟 Tripo：statuses 依次返回；记录每次请求
function tripo(calls, { statuses = ['queued', 'running', 'success'], glb = fakeGlb(), output } = {}) {
  let polls = 0;
  const ok = (data) => new Response(JSON.stringify({ code: 0, data }), { status: 200 });
  return async (url, init = {}) => {
    calls.push({ url, method: init.method ?? 'GET', init });
    if (url.endsWith('/v3/files')) return ok({ file_token: 'ft-1' });
    if (/\/v3\/generation\//.test(url)) return ok({ task_id: 'task-1' });
    if (/\/v3\/tasks\//.test(url)) {
      const status = statuses[Math.min(polls++, statuses.length - 1)];
      return ok({ task_id: 'task-1', status, output: status === 'success' ? (output ?? { pbr_model: 'https://cdn.example/m.glb?sig=1', rendered_image: 'https://cdn.example/r.webp' }) : { running_left_time: 4 } });
    }
    if (url.startsWith('https://cdn.example/')) return new Response(glb);
    return new Response('nope', { status: 404 });
  };
}
const base = { out: 'public/models/crate.glb', use: '场景道具：木箱', image: 'public/images/crate-ref.png' };
const noSleep = async () => {};

test('模型版本别名与默认值', () => {
  assert.equal(tripoModel({}, {}), 'P2-20260801');
  assert.equal(tripoModel({ model: 'tripo-p1' }, ), 'P1-20260311');
  assert.equal(tripoModel({}, { TRIPO_MODEL: 'v2.5-20250123' }), 'v2.5-20250123');
});

test('校验：只能 .glb、prompt 与 image 二选一、默认海外端点', () => {
  const root = sandbox();
  try {
    const b = (o) => () => buildModelRequest({ ...base, ...o }, { root, env });
    assert.throws(b({ out: 'public/models/a.fbx' }), { code: 'bad_args' });
    assert.throws(b({ prompt: '木箱' }), /二选一/);
    assert.throws(b({ image: undefined }), /二选一/);
    assert.throws(b({ image: 'public/images/a.gif' }), /参考图格式/);
    assert.equal(b({})().endpoint, 'https://openapi.tripo3d.ai/v3/generation/image-to-model');
    assert.equal(buildModelRequest({ ...base, image: undefined, prompt: '木箱', seed: '7' }, { root, env: { ...env, TRIPO_BASE_URL: 'https://openapi.tripo3d.com/' } }).endpoint, 'https://openapi.tripo3d.com/v3/generation/text-to-model');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('GLB 统计与模型地址挑选', () => {
  assert.equal(glbStats(fakeGlb(36)).faces, 12);
  assert.throws(() => glbStats(Buffer.from('not a glb at all, nope')), /不是 GLB/);
  assert.equal(modelUrl({ pbr_model: 'https://a/x.glb', model: 'https://a/y.glb' }), 'https://a/x.glb');
  assert.equal(modelUrl({ model: { url: 'https://a/y.glb' } }), 'https://a/y.glb');
  assert.equal(modelUrl({ extra: { files: ['https://a/r.webp', 'https://a/z.glb?sig=2'] } }), 'https://a/z.glb?sig=2');
  assert.equal(modelUrl({ rendered_image: 'https://a/r.webp' }), null);
});

test('参考图生成：上传拿 file_token → 提交 → 轮询到成功 → 下载、存任务详情、登记、记日志', async () => {
  const root = sandbox();
  try {
    const calls = [];
    const r = await generateModel(base, { root, env, fetch: tripo(calls), sleep: noSleep });
    assert.equal(r.ok, true);
    assert.equal(r.taskId, 'task-1');
    assert.equal(r.faces, 12);
    const submit = calls.find((c) => /image-to-model/.test(c.url));
    assert.deepEqual(JSON.parse(submit.init.body), { model: 'P2-20260801', input: 'ft-1' });
    assert.equal(submit.init.headers.Authorization, 'Bearer tsk-test');
    assert.equal(calls.filter((c) => /\/v3\/tasks\//.test(c.url)).length, 3);
    assert.deepEqual(readFileSync(join(root, base.out)), fakeGlb());
    assert.equal(JSON.parse(readFileSync(join(root, `${base.out}.task.json`), 'utf8')).task_id, 'task-1');
    assert.match(readFileSync(join(root, 'assets/README.md'), 'utf8'), /\| `public\/models\/crate\.glb` \| 场景道具：木箱 \| 生成 \| Tripo P2-20260801 \| 参考：public\/images\/crate-ref\.png \| task-1 \| \d{4}-\d{2}-\d{2} \|/);
    assert.match(readFileSync(join(root, '.game-studio/run/asset-calls.jsonl'), 'utf8'), /"kind":"model".*"taskId":"task-1"/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('面数超限给警告不失败；任务失败与超时报对应错误码且不写文件', async () => {
  const root = sandbox();
  try {
    const big = await generateModel({ ...base, 'max-faces': '10' }, { root, env, fetch: tripo([]), sleep: noSleep });
    assert.match(big.warnings[0], /面数 12 超过 10/);
    await assert.rejects(generateModel({ ...base, out: 'public/models/b.glb' }, { root, env, fetch: tripo([], { statuses: ['running', 'failed'] }), sleep: noSleep }), { code: 'task_failed' });
    await assert.rejects(generateModel({ ...base, out: 'public/models/c.glb', timeout: '0' }, { root, env, fetch: tripo([], { statuses: ['running'] }), sleep: noSleep }), { code: 'timeout' });
    assert.equal(existsSync(join(root, 'public/models/b.glb')), false);
    await assert.rejects(generateModel({ ...base, out: 'public/models/d.glb' }, { root, env, fetch: tripo([], { output: { rendered_image: 'https://cdn.example/r.webp' } }), sleep: noSleep }), /没有模型地址/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('信封错误（code 非 0）报 http；缺密钥 no_key；dry-run 不调用', async () => {
  const root = sandbox();
  try {
    const bad = async () => new Response(JSON.stringify({ code: 2010, message: '余额不足' }), { status: 200 });
    await assert.rejects(generateModel(base, { root, env, fetch: bad, sleep: noSleep }), /code 2010 余额不足/);
    await assert.rejects(generateModel(base, { root, env: {} }), { code: 'no_key' });
    const calls = [];
    const r = await generateModel({ ...base, 'dry-run': true }, { root, env: {}, fetch: tripo(calls) });
    assert.equal(r.dryRun, true);
    assert.equal(calls.length, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('连不上服务时提示网络与区域，而不是笼统的 fetch failed', async () => {
  const root = sandbox();
  try {
    const down = async () => { const e = new TypeError('fetch failed'); e.cause = { code: 'UND_ERR_CONNECT_TIMEOUT' }; throw e; };
    await assert.rejects(generateModel(base, { root, env, fetch: down, sleep: noSleep }), /连不上 https:\/\/openapi\.tripo3d\.ai（UND_ERR_CONNECT_TIMEOUT）.*TRIPO_BASE_URL/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
