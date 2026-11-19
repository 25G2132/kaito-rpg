// 街：お店で買う、つりをする。どちらも1日に決まった数まで。

import type { Rng } from '../battle/rng';
import { FISH_PER_DAY, FISH_TABLE, SHOPS } from '../data/shops';
import type { SaveData } from './save';

export function boughtToday(save: SaveData, shop: string, i: number): number {
  return save.daily[`shop_${shop}_${i}`] ?? 0;
}

export function canBuy(save: SaveData, shop: string, i: number): { ok: boolean; reason?: string } {
  const g = SHOPS[shop]?.goods[i];
  if (!g) return { ok: false, reason: 'ない' };
  if (boughtToday(save, shop, i) >= g.perDay) return { ok: false, reason: 'きょうは売り切れ' };
  if ((save.items.coin ?? 0) < g.price) return { ok: false, reason: 'おこづかいが足りない' };
  return { ok: true };
}

export function buy(save: SaveData, shop: string, i: number): boolean {
  if (!canBuy(save, shop, i).ok) return false;
  const g = SHOPS[shop].goods[i];
  save.items.coin -= g.price;
  save.items[g.item] = (save.items[g.item] ?? 0) + g.count;
  save.daily[`shop_${shop}_${i}`] = boughtToday(save, shop, i) + 1;
  return true;
}

export function fishLeft(save: SaveData): number {
  return Math.max(0, FISH_PER_DAY - (save.daily.fish ?? 0));
}

/** つり：うまく引けたら何かがつれる（1日の回数を使う）。失敗でも回数は使う */
export function fish(save: SaveData, rng: Rng, success: boolean): { name: string; items: Record<string, number> } | null {
  if (fishLeft(save) <= 0) return null;
  save.daily.fish = (save.daily.fish ?? 0) + 1;
  if (!success) return { name: '', items: {} };
  const total = FISH_TABLE.reduce((a, f) => a + f.weight, 0);
  let r = rng() * total;
  const f = FISH_TABLE.find((x) => (r -= x.weight) < 0) ?? FISH_TABLE[0];
  for (const [k, n] of Object.entries(f.items)) save.items[k] = (save.items[k] ?? 0) + n;
  return { name: f.name, items: { ...f.items } };
}
