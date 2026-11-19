// ガチャを引く。確率・天井（★5は決まった回数までに必ず、★4以上は10回ごとに必ず）・重なったときの交換。

import type { Rng } from '../battle/rng';
import { CHARACTERS } from '../data/characters';
import { BANNERS, DUP_CHAR, DUP_WEAPON, PULL_COST } from '../data/gacha';
import { WEAPONS } from '../data/weapons';
import { LEVEL_CAPS } from './growth';
import type { SaveData } from './save';

export interface PullResult {
  stars: 3 | 4 | 5;
  kind: 'char' | 'weapon' | 'item';
  id: string; // キャラ・武器の id（item なら空）
  name: string;
  isNew: boolean;
  items: Record<string, number>; // はずれ・重なったときにもらう材料
}

const key5 = (b: string) => `${b}_since5`;
const key4 = (b: string) => `${b}_since4`;

/** あと何回で★5が確定か */
export function pityLeft(save: SaveData, bannerId: string): number {
  const b = BANNERS[bannerId];
  return b.pity5 - (save.gacha[key5(bannerId)] ?? 0);
}

export function canPull(save: SaveData, n: number): boolean {
  return (save.items.stone ?? 0) >= PULL_COST * n;
}

function give(save: SaveData, items: Record<string, number>): void {
  for (const [k, v] of Object.entries(items)) save.items[k] = (save.items[k] ?? 0) + v;
}

function grant(save: SaveData, kind: 'char' | 'weapon', id: string, stars: 4 | 5): PullResult {
  if (kind === 'char') {
    const c = CHARACTERS[id];
    if (save.chars[id]) {
      give(save, DUP_CHAR);
      return { stars, kind, id, name: c.name, isNew: false, items: { ...DUP_CHAR } };
    }
    // 仲間のいちばん低いレベルにそろえて迎える
    const level = Math.max(1, Math.min(...save.party.map((p) => save.chars[p]?.level ?? 1)));
    const asc = Math.max(0, LEVEL_CAPS.findIndex((cap) => cap >= level));
    save.chars[id] = { level, exp: 0, asc, skill: 1, weapon: null };
    return { stars, kind, id, name: c.name, isNew: true, items: {} };
  }
  const w = WEAPONS[id];
  if (save.weapons.includes(id)) {
    give(save, DUP_WEAPON);
    return { stars, kind, id, name: w.name, isNew: false, items: { ...DUP_WEAPON } };
  }
  save.weapons.push(id);
  return { stars, kind, id, name: w.name, isNew: true, items: {} };
}

/** n 回引く（月の石が足りなければ null） */
export function pull(save: SaveData, bannerId: string, n: number, rng: Rng): PullResult[] | null {
  const b = BANNERS[bannerId];
  if (!b || !canPull(save, n)) return null;
  save.items.stone -= PULL_COST * n;
  const out: PullResult[] = [];
  for (let i = 0; i < n; i++) {
    const s5 = (save.gacha[key5(bannerId)] ?? 0) + 1;
    const s4 = (save.gacha[key4(bannerId)] ?? 0) + 1;
    const r = rng();
    let stars: 3 | 4 | 5 = 3;
    if (s5 >= b.pity5 || r < b.rate5) stars = 5;
    else if (s4 >= b.pity4 || r < b.rate5 + b.rate4) stars = 4;
    save.gacha.total = (save.gacha.total ?? 0) + 1;
    save.gacha[key5(bannerId)] = stars === 5 ? 0 : s5;
    save.gacha[key4(bannerId)] = stars >= 4 ? 0 : s4;
    if (stars === 5) {
      const id = b.pick5[Math.floor(rng() * b.pick5.length)];
      out.push(grant(save, b.kind, id, 5));
    } else if (stars === 4) {
      const p = b.pick4[Math.floor(rng() * b.pick4.length)];
      out.push(grant(save, p.kind, p.id, 4));
    } else {
      give(save, b.fallback);
      out.push({ stars: 3, kind: 'item', id: '', name: '材料', isNew: false, items: { ...b.fallback } });
    }
  }
  return out;
}
