# 怪盗RPG（仮）

スマホ横画面で遊ぶ、学校と怪盗の順番に戦うRPG。ブラウザ（Three.js ＋ VRoid の3Dキャラ）で作る。

- 設計：[docs/2026-11-18-design.md](docs/2026-11-18-design.md)
- 計画：[docs/2026-11-18-plan.md](docs/2026-11-18-plan.md)

## 動かし方

```bash
npm install
npm run dev
```

表示された `Network:` のアドレスを、同じWi-Fiのスマホで開く。左上に重さの表示が出る（公開版では `?perf` を付けると出る）。

- `npm test`：自動テスト
- `npm run build`：公開用に組み立てる（`dist/`）
