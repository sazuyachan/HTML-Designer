import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  base: './',
  // 单文件打包：把全部 JS/CSS 内联进 index.html → dist/index.html 双击（file://）即可用。
  // 否则 <script type="module" src="..."> 在 file:// 下会被浏览器以 CORS 拒绝，双击打不开。
  plugins: [viteSingleFile()],
  server: {
    port: 5173,
    open: true,
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
  },
});
