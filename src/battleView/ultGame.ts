// 必殺技のタッチ遊び。うまくいくほど必殺技が強くなる（1〜1.5倍）。
//   mash   ：決まった時間のあいだ、丸を連打する
//   timing ：左右に動く印を、まん中の金色のところで止める

import { ULT_BOOST_MAX } from '../battle/battle';

export type UltGameKind = 'mash' | 'timing';

const MASH_SEC = 1.8;
const MASH_FULL = 16; // この回数でいちばん強い

export function playUltGame(kind: UltGameKind, who: string, color: string): Promise<number> {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'ultgame';
    el.style.setProperty('--c', color);
    document.body.appendChild(el);
    const finish = (boost: number) => {
      const b = Math.max(1, Math.min(ULT_BOOST_MAX, boost));
      const word = b >= ULT_BOOST_MAX - 0.001 ? 'パーフェクト！' : b >= 1.3 ? 'いい感じ！' : b > 1.05 ? 'まあまあ' : 'ざんねん…';
      el.innerHTML = `<div class="ug-result">×${b.toFixed(2)}<small>${word}</small></div>`;
      setTimeout(() => {
        el.remove();
        resolve(b);
      }, 650);
    };

    if (kind === 'mash') {
      el.innerHTML = `<div class="ug-title">${who}の必殺技　<b>連打！</b></div>
        <button class="ug-mash"><span>タップ</span></button>
        <div class="ug-bar"><i></i></div><div class="ug-count">0</div>`;
      let taps = 0;
      const bar = el.querySelector('.ug-bar i') as HTMLElement;
      const count = el.querySelector('.ug-count') as HTMLElement;
      const btn = el.querySelector('.ug-mash') as HTMLButtonElement;
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        taps++;
        count.textContent = String(taps);
        bar.style.width = `${Math.min(100, (taps / MASH_FULL) * 100)}%`;
        btn.classList.remove('hit');
        void btn.offsetWidth;
        btn.classList.add('hit');
      });
      const t0 = performance.now();
      const tick = () => {
        const left = MASH_SEC - (performance.now() - t0) / 1000;
        if (left <= 0) return finish(1 + (ULT_BOOST_MAX - 1) * Math.min(1, taps / MASH_FULL));
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      return;
    }

    // timing
    el.innerHTML = `<div class="ug-title">${who}の必殺技　<b>金色で止めて！</b></div>
      <div class="ug-track"><div class="ug-zone"></div><div class="ug-zone2"></div><div class="ug-mark"></div></div>
      <button class="ug-stop">止める</button>`;
    const mark = el.querySelector('.ug-mark') as HTMLElement;
    const t0 = performance.now();
    let pos = 0;
    let done = false;
    const tick = () => {
      if (done) return;
      const t = (performance.now() - t0) / 1000;
      pos = (Math.sin(t * 3.4 - Math.PI / 2) + 1) / 2; // 0〜1 を行ったり来たり
      mark.style.left = `${pos * 100}%`;
      if (t > 4) return stop(); // 押さなければ、そこで止まる
      requestAnimationFrame(tick);
    };
    const stop = () => {
      if (done) return;
      done = true;
      const d = Math.abs(pos - 0.5);
      finish(d <= 0.05 ? ULT_BOOST_MAX : d <= 0.13 ? 1.3 : d <= 0.25 ? 1.12 : 1);
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      stop();
    });
    requestAnimationFrame(tick);
  });
}
