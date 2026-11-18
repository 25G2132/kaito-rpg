// 入口。?spike を付けると段階1の重さの試作を開く。
const params = new URLSearchParams(location.search);

if (params.has('spike')) {
  void import('./spike/perfSpike').then((m) => m.start());
} else {
  void import('./scenes/emptyScene').then((m) => m.start());
}
