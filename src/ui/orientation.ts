// 縦向きのときは「横にしてください」を出す。
// 画面の向きを固定する API は iPhone の Safari では使えないので、案内で済ませる。

export function isPortrait(): boolean {
  return window.innerHeight > window.innerWidth;
}

export function watchOrientation(onChange: (portrait: boolean) => void): void {
  const overlay = document.getElementById('rotate');
  const update = () => {
    const portrait = isPortrait();
    if (overlay) overlay.hidden = !portrait;
    onChange(portrait);
  };
  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', update);
  update();
}
