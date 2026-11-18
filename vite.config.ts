import { defineConfig } from 'vite';

// GitHub Pages ではリポジトリ名の下に置かれるので、相対パスで組み立てる
export default defineConfig({
  base: './',
  server: { host: true },
});
