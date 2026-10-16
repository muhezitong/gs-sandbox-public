// 逻辑画布尺寸：所有布局按 390×844 竖版设计，再等比缩放到实际屏幕。
export const DESIGN_W = 390;
export const DESIGN_H = 844;

export function fitScreen(availW, availH) {
  const scale = Math.min(availW / DESIGN_W, availH / DESIGN_H);
  const w = Math.floor(DESIGN_W * scale);
  const h = Math.floor(DESIGN_H * scale);
  return { scale, w, h, x: Math.floor((availW - w) / 2), y: Math.floor((availH - h) / 2) };
}
