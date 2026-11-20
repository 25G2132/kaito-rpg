import { randomTip } from '../data/tips';

// 場面が変わるときのロード画面。場所の名前とひとことを出し、その裏で次の場面を作る。
// 作り終わっても、読めるくらいの短い時間は出しておく。

const MIN_MS = 1100;

export async function transition(place: string, sub: string, build: () => void, minMs = MIN_MS): Promise<void> {
  const el = document.createElement('div');
  el.className = 'loading';
  el.innerHTML = `
    <div class="ld-place">${place}</div>
    <div class="ld-sub">${sub}</div>
    <div class="ld-runner"><i></i><i></i><i></i></div>
    <div class="ld-tip"><b>ひとこと</b>${randomTip()}</div>
    <div class="ld-bar"><i></i></div>`;
  document.body.appendChild(el);
  const t0 = performance.now();
  // 画面に出てから、裏で次の場面を作る
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  build();
  const rest = minMs - (performance.now() - t0);
  if (rest > 0) await new Promise((r) => setTimeout(r, rest));
  el.classList.add('out');
  setTimeout(() => el.remove(), 350);
}
