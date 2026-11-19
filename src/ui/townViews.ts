import type { Rng } from '../battle/rng';
import { ITEMS } from '../data/items';
import { SHOPS } from '../data/shops';
import type { SaveData } from '../progress/save';
import { boughtToday, buy, canBuy } from '../progress/town';
import { esc, toast } from './fmt';

// 街の小さな画面：えらぶ、お店、つり。

/** いくつかの中から1つえらぶ（例：街へ寄り道／家に帰る）。えらんだ番号、やめたら -1 */
export function choose(title: string, options: string[]): Promise<number> {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'overlay choose';
    el.innerHTML = `<div class="panel"><h2 style="text-align:center">${esc(title)}</h2>
      <div class="choices">${options.map((o, i) => `<button class="choice" data-i="${i}"><b>${esc(o)}</b></button>`).join('')}
      <button class="choice" data-i="-1"><b>やめる</b></button></div></div>`;
    document.body.appendChild(el);
    el.addEventListener('click', (ev) => {
      const t = (ev.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (!t) return;
      el.remove();
      resolve(Number(t.dataset.i));
    });
  });
}

/** お店（1日に買える数が決まっている） */
export function openShop(save: SaveData, shopId: string, onChange: () => void): Promise<void> {
  return new Promise((resolve) => {
    const shop = SHOPS[shopId];
    const el = document.createElement('div');
    el.className = 'overlay choose';
    document.body.appendChild(el);
    const render = () => {
      const rows = shop.goods
        .map((g, i) => {
          const chk = canBuy(save, shopId, i);
          const left = g.perDay - boughtToday(save, shopId, i);
          return `<div class="card row"><div class="grow"><b>${ITEMS[g.item].name} ×${g.count}</b>　<span class="muted">きょうはあと${left}回</span><br>${esc(ITEMS[g.item].desc)}</div>
            <button class="btn main" data-i="${i}" ${chk.ok ? '' : 'disabled'}>${g.price}<small>${chk.ok ? 'おこづかい' : chk.reason}</small></button></div>`;
        })
        .join('');
      el.innerHTML = `<div class="panel"><h2>${esc(shop.name)}　<span class="muted">${esc(shop.greet)}</span></h2>
        <p>おこづかい <b>${save.items.coin ?? 0}</b></p>${rows}
        <div class="choices" style="margin-top:8px"><button class="choice" data-act="close"><b>お店を出る</b></button></div></div>`;
    };
    el.addEventListener('click', (ev) => {
      const t = (ev.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (!t) return;
      if (t.dataset.act === 'close') {
        el.remove();
        resolve();
        return;
      }
      const i = Number(t.dataset.i);
      if (buy(save, shopId, i)) {
        onChange();
        toast(`${ITEMS[shop.goods[i].item].name}を買った`);
      }
      render();
    });
    render();
  });
}

/** つり：浮きが沈んで「！」が出た瞬間にタップ。早すぎても遅すぎても逃げられる */
export function playFish(rng: Rng): Promise<boolean> {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'ultgame fish';
    el.innerHTML = '<div class="ug-title">浮きが沈んだら、すぐタップ！</div><div class="bobber"></div><div class="ug-count"></div>';
    document.body.appendChild(el);
    const bob = el.querySelector('.bobber') as HTMLElement;
    const msg = el.querySelector('.ug-count') as HTMLElement;
    const wait = 1200 + rng() * 2200;
    let bite = false;
    let done = false;
    const end = (ok: boolean, text: string) => {
      if (done) return;
      done = true;
      msg.textContent = text;
      setTimeout(() => {
        el.remove();
        resolve(ok);
      }, 700);
    };
    const t1 = setTimeout(() => {
      bite = true;
      bob.classList.add('bite');
      msg.textContent = '！';
      setTimeout(() => bite && end(false, '逃げられた…'), 650);
    }, wait);
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (done) return;
      if (!bite) {
        clearTimeout(t1);
        end(false, '早すぎた…');
      } else {
        bite = false;
        end(true, 'つれた！');
      }
    });
  });
}
