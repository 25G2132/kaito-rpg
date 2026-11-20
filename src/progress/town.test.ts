import { describe, expect, it } from 'vitest';
import { makeRng } from '../battle/rng';
import { ITEMS } from '../data/items';
import { TOWN_ZONES } from '../data/maps';
import { FISH_PER_DAY, FISH_TABLE, SHOPS } from '../data/shops';
import { FieldState, inRect } from '../field/logic';
import { sleep } from './growth';
import { buy, canBuy, fish, fishLeft } from './town';
import { defaultSave } from './save';

describe('街', () => {
  it('お店：おこづかいで買える。1日に買える数が決まっていて、寝ると元にもどる', () => {
    const s = defaultSave();
    expect(canBuy(s, 'bookstore', 0).ok).toBe(false); // おこづかいがない
    s.items.coin = 1000;
    const g = SHOPS.bookstore.goods[0];
    for (let i = 0; i < g.perDay; i++) expect(buy(s, 'bookstore', 0)).toBe(true);
    expect(buy(s, 'bookstore', 0)).toBe(false); // 売り切れ
    expect(s.items.coin).toBe(1000 - g.price * g.perDay);
    sleep(s);
    expect(buy(s, 'bookstore', 0)).toBe(true);
  });

  it('つり：1日3回まで。うまく引くと何かがつれる', () => {
    const s = defaultSave();
    const rng = makeRng(2);
    expect(fishLeft(s)).toBe(FISH_PER_DAY);
    const r = fish(s, rng, true)!;
    expect(r.name).not.toBe('');
    expect(fish(s, rng, false)!.name).toBe(''); // 失敗でも回数は使う
    fish(s, rng, true);
    expect(fish(s, rng, true)).toBeNull();
    sleep(s);
    expect(fishLeft(s)).toBe(FISH_PER_DAY);
  });

  it('データ：お店の品とつれる物の名前がそろい、人・つり場・隠し要素・出口に行ける', () => {
    for (const sh of Object.values(SHOPS)) for (const g of sh.goods) expect(ITEMS[g.item], sh.id).toBeTruthy();
    for (const f of FISH_TABLE) for (const k of Object.keys(f.items)) expect(ITEMS[k]).toBeTruthy();
    for (const z of TOWN_ZONES) {
      const f = new FieldState(z);
      const pts = [z.start, ...(z.exit ? [z.exit.pos] : []), ...(z.spots ?? []).map((x) => x.pos), ...(z.hidden ?? []).map((h) => h.pos), ...f.npcs.map((n) => n.pos)];
      for (const p of pts) expect(z.walls.some((r) => inRect(p, r)), `${z.id} ${p}`).toBe(false);
      for (const n of z.npcs ?? []) if (n.shop) expect(SHOPS[n.shop], n.id).toBeTruthy();
    }
    expect(TOWN_ZONES.some((z) => z.spots?.some((s) => s.kind === 'fish'))).toBe(true);
    expect(TOWN_ZONES.some((z) => z.exit)).toBe(true);
  });
});
