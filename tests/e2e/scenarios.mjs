// e2e 场景：每个场景 { name, run(ctx) }，截图名为 <场景>-<时刻>.png。新增玩法时补场景。
export const SCENARIOS = [
  {
    name: 'smoke',
    async run({ open, shot, tap, state, assert }) {
      await open('?seed=1');
      assert((await state()).phase === 'title', '应停在标题页');
      await shot('title');
      await tap(195, 422);
      let s = await state();
      assert(s.phase === 'play', '点击后应开局');
      await tap(s.target.x, s.target.y);
      s = await state();
      assert(s.score === 1, `点中目标应得 1 分，实际 ${s.score}`);
      await tap(5, 5);
      assert((await state()).score === 1, '点空不加分');
      await shot('play');
    },
  },
];
