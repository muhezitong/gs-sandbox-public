import { defineConfig } from 'vite';

// 相对路径：构建产物可以直接放到任意子路径或打包进客户端
export default defineConfig({
  base: './',
  server: { port: 5190 },
  preview: { port: 5191 },
});
