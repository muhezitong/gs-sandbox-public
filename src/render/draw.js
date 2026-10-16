// Canvas 绘制：只读游戏状态，不改规则。
import { DESIGN_W, DESIGN_H } from '../platform/screen.js';

const FONT = '-apple-system, "PingFang SC", "Noto Sans SC", sans-serif';

function text(ctx, str, x, y, size, color = '#f2ede1') {
  ctx.fillStyle = color;
  ctx.font = `600 ${size}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(str, x, y);
}

export function drawFrame(ctx, state, title) {
  ctx.fillStyle = '#101317';
  ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
  if (state.phase === 'title') {
    text(ctx, title, DESIGN_W / 2, DESIGN_H * 0.4, 40);
    text(ctx, '点一下开始', DESIGN_W / 2, DESIGN_H * 0.6, 20, '#9fb3a6');
    return;
  }
  text(ctx, `得分 ${state.score}`, DESIGN_W / 2, 60, 22);
  text(ctx, `剩余 ${Math.ceil(state.timeLeft)} 秒`, DESIGN_W / 2, 96, 16, '#9fb3a6');
  if (state.phase === 'play') {
    const t = state.target;
    ctx.fillStyle = '#e0a458';
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
    ctx.fill();
  } else {
    text(ctx, '时间到', DESIGN_W / 2, DESIGN_H * 0.45, 36);
    text(ctx, '点击再来一局', DESIGN_W / 2, DESIGN_H * 0.55, 20, '#9fb3a6');
  }
}
