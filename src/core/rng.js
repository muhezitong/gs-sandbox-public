// 可播种随机数（mulberry32）。全游戏随机统一走这里，同一种子复现同一局。
export function createRng(seed) {
  let state = seed >>> 0;
  const rng = {
    next() {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(n) { return Math.floor(rng.next() * n); },
    range(a, b) { return a + rng.next() * (b - a); },
    getState() { return state >>> 0; },
    setState(s) { state = s >>> 0; },
  };
  return rng;
}
