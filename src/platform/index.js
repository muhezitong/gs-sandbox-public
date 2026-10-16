// 平台入口：按运行环境选择实现。新增平台（如微信小游戏）在这里分派。
import { createBrowserPlatform } from './browser.js';

export function createPlatform() {
  return createBrowserPlatform();
}
