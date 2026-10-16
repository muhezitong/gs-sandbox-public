// 逻辑尺寸：横屏 1280×720，等比缩放到实际窗口。
export const DESIGN_W = 1280;
export const DESIGN_H = 720;

export function fitScreen(availW, availH) {
  const scale = Math.min(availW / DESIGN_W, availH / DESIGN_H);
  return { scale, w: Math.floor(DESIGN_W * scale), h: Math.floor(DESIGN_H * scale) };
}
