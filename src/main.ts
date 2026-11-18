// 入口。ふだんは戦いの画面（段階2）。?spike を付けると段階1の重さの試作を開く。
const params = new URLSearchParams(location.search);

if (params.has('spike')) {
  void import('./spike/perfSpike').then((m) => m.start());
} else {
  void import('./scenes/battleScene').then((m) => m.start());
}
