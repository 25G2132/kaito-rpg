import type { Rng } from '../battle/rng';
import { CHARACTERS } from '../data/characters';
import { ELEMENTS } from '../data/elements';
import { BANNERS, PULL_COST } from '../data/gacha';
import { ITEMS } from '../data/items';
import { WEAPONS } from '../data/weapons';
import { canPull, pityLeft, pull, type PullResult } from '../progress/gacha';
import type { SaveData } from '../progress/save';
import { esc, toast } from './fmt';

// ガチャの画面。確率と天井を出す。引いたら、カードを1枚ずつめくり、★5 は画面いっぱいの演出（1枚絵ができるまでは仮の絵）。

export function openGacha(save: SaveData, rng: Rng, persist: () => void, onClose: () => void): void {
  let bannerId = 'char';
  const el = document.createElement('div');
  el.className = 'screen';
  document.body.appendChild(el);

  const render = () => {
    const b = BANNERS[bannerId];
    const tabs = Object.values(BANNERS)
      .map((x) => `<button class="tab${x.id === bannerId ? ' on' : ''}" data-banner="${x.id}">${x.kind === 'char' ? 'キャラ' : '武器'}「${esc(x.name)}」</button>`)
      .join('');
    const p3 = 1 - b.rate5 - b.rate4;
    const pick5 = b.pick5.map((id) => (b.kind === 'char' ? CHARACTERS[id].name : WEAPONS[id].name)).join('・');
    const pick4 = b.pick4.map((p) => (p.kind === 'char' ? CHARACTERS[p.id].name : WEAPONS[p.id].name)).join('・');
    el.innerHTML = `
      <div class="row"><button class="btn" data-act="back">もどる</button><div class="tabs grow">${tabs}</div>
        <div class="power">月の石 ${save.items.stone ?? 0}</div></div>
      <div class="grow-body">
        <div class="statcard gbanner"><div class="cname">${esc(b.name)}</div><div class="role">${esc(b.desc)}</div>
          <div class="gportrait" style="--c:${b.kind === 'char' ? ELEMENTS[CHARACTERS[b.pick5[0]].element].color : '#ffc93d'}">${esc((b.kind === 'char' ? CHARACTERS[b.pick5[0]].name : WEAPONS[b.pick5[0]].name).slice(0, 1))}</div>
          <div class="muted">★5 まであと <b>${pityLeft(save, bannerId)}</b> 回（${b.pity5}回で必ず）</div></div>
        <div class="panel2"><div class="pane">
          <div class="card"><b class="t">確率</b><br>
            <span style="color:#ffc93d">★5 ${(b.rate5 * 100).toFixed(1)}%</span>：${esc(pick5)}<br>
            <span style="color:#c58bff">★4 ${(b.rate4 * 100).toFixed(1)}%</span>：${esc(pick4)}<br>
            ★3 ${(p3 * 100).toFixed(1)}%：${Object.entries(b.fallback).map(([k, n]) => `${ITEMS[k].name}×${n}`).join('・')}<br>
            <span class="muted">${b.pity5}回までに★5が必ず出る（天井）。${b.pity4}回ごとに★4以上が必ず出る。同じものが出たら材料にかわる。</span></div>
          <div class="card muted">月の石は、はじめての勝ち・頼みごと・隠し要素などでもらえる。お金は使わない。</div>
          <div class="row" style="justify-content:flex-end">
            <button class="btn" data-pull="1" ${canPull(save, 1) ? '' : 'disabled'}>1回<small>${PULL_COST}</small></button>
            <button class="btn gold" data-pull="10" ${canPull(save, 10) ? '' : 'disabled'}>10回<small>${PULL_COST * 10}</small></button>
          </div>
        </div></div>
      </div>`;
  };

  el.addEventListener('click', (ev) => {
    const t = (ev.target as HTMLElement).closest('button') as HTMLButtonElement | null;
    if (!t || t.disabled) return;
    if (t.dataset.act === 'back') {
      el.remove();
      onClose();
      return;
    }
    if (t.dataset.banner) {
      bannerId = t.dataset.banner;
      render();
      return;
    }
    if (t.dataset.pull) {
      const res = pull(save, bannerId, Number(t.dataset.pull), rng);
      if (!res) return toast('月の石が足りない');
      persist();
      void reveal(res).then(render);
    }
  });
  render();
}

/** 引いた結果を見せる：★5 があれば先に画面いっぱいの演出、そのあとカードを1枚ずつめくる */
function reveal(res: PullResult[]): Promise<void> {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'gacha-reveal';
    document.body.appendChild(el);
    const best = Math.max(...res.map((r) => r.stars));
    const five = res.filter((r) => r.stars === 5);
    const showCards = () => {
      el.innerHTML = `<div class="gcards">${res
        .map((r, i) => {
          const color = r.kind === 'char' ? ELEMENTS[CHARACTERS[r.id].element].color : r.stars === 5 ? '#ffc93d' : r.stars === 4 ? '#c58bff' : '#8a90a8';
          const sub = r.kind === 'item' ? Object.entries(r.items).map(([k, n]) => `${ITEMS[k].name}×${n}`).join('・') : r.isNew ? '<b class="new">NEW</b>' : `もう持っている→${Object.entries(r.items).map(([k, n]) => `${ITEMS[k].name}×${n}`).join('・')}`;
          return `<div class="gcard s${r.stars}" style="--c:${color};animation-delay:${(i * 0.18).toFixed(2)}s">
            <div class="gstars">${'★'.repeat(r.stars)}</div><div class="gname2">${esc(r.kind === 'item' ? '材料' : r.name)}</div><div class="gsub">${sub}</div></div>`;
        })
        .join('')}</div><div class="gtap">タップでもどる</div>`;
      el.onclick = () => {
        el.remove();
        resolve();
      };
    };
    if (best === 5) {
      // ★5：金色の光 → 1枚絵（public/art/gacha/<id>.webp があればそれ、なければ頭文字）と名前
      const r = five[0];
      const color = r.kind === 'char' ? ELEMENTS[CHARACTERS[r.id].element].color : '#ffc93d';
      el.innerHTML = `<div class="g5" style="--c:${color}"><div class="g5light"></div><div class="g5art">${esc(r.name.slice(0, 1))}</div>
        <div class="g5name"><small>★★★★★</small>${esc(r.name)}</div><div class="gtap">タップ</div></div>`;
      showArt(el.querySelector('.g5') as HTMLElement, r.id);
      el.onclick = showCards;
    } else showCards();
  });
}

/** 1枚絵があれば画面いっぱいに出す。ファイルがなければ何もしない（頭文字のまま） */
function showArt(box: HTMLElement, id: string): void {
  const img = new Image();
  img.className = 'g5img';
  img.alt = '';
  img.onload = () => {
    box.insertBefore(img, box.children[1] ?? null);
    box.classList.add('has-img');
  };
  img.src = `${import.meta.env.BASE_URL}art/gacha/${id}.webp`;
}
