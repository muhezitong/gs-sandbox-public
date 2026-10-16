// 规则单测：直接导入 src/core/，不需要浏览器。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../../src/core/game.js';
import { createRng } from '../../src/core/rng.js';

const W = 390, H = 844;

test('同一种子复现同一串随机数', () => {
  const a = createRng(42), b = createRng(42);
  for (let i = 0; i < 10; i++) assert.equal(a.next(), b.next());
});

test('开局后点中目标加分并换位置', () => {
  const g = createGame({ seed: 7, width: W, height: H });
  g.start();
  const { x, y } = g.state.target;
  assert.equal(g.tap(x, y), true);
  assert.equal(g.state.score, 1);
  assert.notDeepEqual(g.state.target, { x, y, r: g.state.target.r });
});

test('没点中不加分', () => {
  const g = createGame({ seed: 7, width: W, height: H });
  g.start();
  assert.equal(g.tap(-100, -100), false);
  assert.equal(g.state.score, 0);
});

test('时间耗尽后结束，结束后点击无效', () => {
  const g = createGame({ seed: 7, width: W, height: H });
  g.start();
  g.update(1000);
  assert.equal(g.state.phase, 'over');
  const { x, y } = g.state.target;
  assert.equal(g.tap(x, y), false);
});

test('目标始终在屏幕边距以内', () => {
  const g = createGame({ seed: 3, width: W, height: H });
  g.start();
  for (let i = 0; i < 200; i++) {
    const t = g.state.target;
    assert.ok(t.x >= 60 && t.x <= W - 60 && t.y >= 60 && t.y <= H - 60);
    g.tap(t.x, t.y);
  }
});
