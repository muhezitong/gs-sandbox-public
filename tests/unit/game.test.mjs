// 规则单测：直接导入 src/core/，不需要浏览器与 three。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../../src/core/game.js';
import { TUNING } from '../../src/data/tuning.js';

const half = TUNING.arenaSize / 2;

test('开局：玩家在中心，木箱在平台内且不贴着玩家', () => {
  const g = createGame({ seed: 3 });
  g.start();
  const { player, crate } = g.state;
  assert.deepEqual(player, { x: 0, z: 0 });
  assert.ok(Math.abs(crate.x) <= half - TUNING.edgeMargin && Math.abs(crate.z) <= half - TUNING.edgeMargin);
  assert.ok(Math.hypot(crate.x, crate.z) > TUNING.pickupRadius);
});

test('移动：速度与斜向归一化，出不了平台', () => {
  const g = createGame({ seed: 1 });
  g.start();
  g.update(0.1, { x: 1, z: 0 });
  assert.ok(Math.abs(g.state.player.x - TUNING.playerSpeed * 0.1) < 1e-9);
  const before = { ...g.state.player };
  g.update(0.1, { x: 1, z: 1 });
  assert.ok(Math.abs(Math.hypot(g.state.player.x - before.x, g.state.player.z - before.z) - TUNING.playerSpeed * 0.1) < 1e-9);
  for (let i = 0; i < 200; i++) g.update(0.05, { x: -1, z: -1 });
  assert.ok(g.state.player.x >= -half && g.state.player.z >= -half);
});

test('走到木箱上得分并换位置；时间到结束且不再得分', () => {
  const g = createGame({ seed: 5 });
  g.start();
  const target = { ...g.state.crate };
  g.state.player.x = target.x;
  g.state.player.z = target.z;
  assert.equal(g.update(0.01), true);
  assert.equal(g.state.score, 1);
  assert.notDeepEqual(g.state.crate, target);
  g.update(TUNING.roundSeconds + 1);
  assert.equal(g.state.phase, 'over');
  g.state.player.x = g.state.crate.x;
  g.state.player.z = g.state.crate.z;
  assert.equal(g.update(0.01), false);
});

test('同一种子复现同一串木箱位置', () => {
  const run = () => { const g = createGame({ seed: 9 }); g.start(); const out = []; for (let i = 0; i < 5; i++) { out.push({ ...g.state.crate }); Object.assign(g.state.player, g.state.crate); g.update(0.01); } return out; };
  assert.deepEqual(run(), run());
});

test('最快间隔：取相邻两次拾取的最短用时，不足两次为 null，重开清零', () => {
  const g = createGame({ seed: 7 });
  g.start();
  const pick = (wait) => { g.update(wait); Object.assign(g.state.player, g.state.crate); assert.equal(g.update(0.01), true); };
  pick(1);
  assert.equal(g.state.bestInterval, null);
  pick(2);
  assert.ok(Math.abs(g.state.bestInterval - 2.01) < 1e-9);
  pick(0.5);
  assert.ok(Math.abs(g.state.bestInterval - 0.51) < 1e-9);
  pick(3);
  assert.ok(Math.abs(g.state.bestInterval - 0.51) < 1e-9);
  g.start();
  assert.equal(g.state.bestInterval, null);
  assert.equal(g.state.lastPickupAt, null);
});
