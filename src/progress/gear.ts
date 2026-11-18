// 装備を作る・強くする・付ける。

import type { Rng } from '../battle/rng';
import {
  enhanceCost,
  GEAR_MAX_LEVEL,
  MAX_SUBS,
  SLOTS,
  SUB_EVERY,
  SUB_ROLLS,
  type SlotId,
  type StatKey,
} from '../data/gear';
import type { GearPiece, SaveData } from './save';

const SUB_POOL = Object.keys(SUB_ROLLS) as StatKey[];

const roll = (rng: Rng, stat: StatKey): number => {
  const [lo, hi] = SUB_ROLLS[stat];
  const v = lo + (hi - lo) * rng();
  return stat === 'hp' || stat === 'atk' || stat === 'def' || stat === 'spd' ? Math.round(v) : Math.round(v * 1000) / 1000;
};

/** 新しい装備（副ステータスは2つか3つ、ランダム） */
export function makeGear(rng: Rng, id: number, slot?: SlotId): GearPiece {
  const def = slot ? SLOTS.find((s) => s.id === slot)! : SLOTS[Math.floor(rng() * SLOTS.length)];
  const count = rng() < 0.3 ? 3 : 2;
  const pool = SUB_POOL.filter((s) => s !== def.main);
  const subs: GearPiece['subs'] = [];
  while (subs.length < count) {
    const stat = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    subs.push({ stat, value: roll(rng, stat) });
  }
  return { id, slot: def.id, level: 0, main: def.main, subs, owner: null };
}

export function gearMainValue(g: GearPiece): number {
  const def = SLOTS.find((s) => s.id === g.slot)!;
  const v = def.mainBase + def.mainPerLevel * g.level;
  return def.main === 'spd' || def.main === 'hp' || def.main === 'atk' ? Math.round(v) : Math.round(v * 1000) / 1000;
}

export type EnhanceResult =
  | { ok: true; newSub?: StatKey; grew?: StatKey }
  | { ok: false; reason: string };

/** 強化（部品を使う）。3レベルごとに副ステータスが増える（4つあれば1つが伸びる） */
export function enhanceGear(save: SaveData, gearId: number, rng: Rng): EnhanceResult {
  const g = save.gear.find((x) => x.id === gearId);
  if (!g) return { ok: false, reason: '装備が見つからない' };
  if (g.level >= GEAR_MAX_LEVEL) return { ok: false, reason: 'これ以上強くできない' };
  const cost = enhanceCost(g.level);
  if ((save.items.parts ?? 0) < cost) return { ok: false, reason: `部品が${cost}個いる` };
  save.items.parts -= cost;
  g.level++;
  if (g.level % SUB_EVERY !== 0) return { ok: true };
  if (g.subs.length < MAX_SUBS) {
    const pool = SUB_POOL.filter((s) => s !== g.main && !g.subs.some((x) => x.stat === s));
    const stat = pool[Math.floor(rng() * pool.length)];
    g.subs.push({ stat, value: roll(rng, stat) });
    return { ok: true, newSub: stat };
  }
  const sub = g.subs[Math.floor(rng() * g.subs.length)];
  sub.value = Math.round((sub.value + roll(rng, sub.stat)) * 1000) / 1000;
  return { ok: true, grew: sub.stat };
}

/** 付ける（同じ枠の装備ははずれる。ほかの人が付けていたら、その人からはずれる） */
export function equipGear(save: SaveData, gearId: number, charId: string): void {
  const g = save.gear.find((x) => x.id === gearId);
  if (!g) return;
  for (const other of save.gear) if (other.owner === charId && other.slot === g.slot) other.owner = null;
  g.owner = charId;
}

export function unequipGear(save: SaveData, gearId: number): void {
  const g = save.gear.find((x) => x.id === gearId);
  if (g) g.owner = null;
}

export function equippedGear(save: SaveData, charId: string): GearPiece[] {
  return save.gear.filter((g) => g.owner === charId);
}

/** 装備の数字を足し合わせる（% は % のまま） */
export function sumGear(pieces: GearPiece[]): Partial<Record<StatKey, number>> {
  const out: Partial<Record<StatKey, number>> = {};
  const add = (k: StatKey, v: number) => (out[k] = (out[k] ?? 0) + v);
  for (const g of pieces) {
    add(g.main, gearMainValue(g));
    for (const s of g.subs) add(s.stat, s.value);
  }
  return out;
}

/** おおまかな良さ（おまかせで選ぶとき用） */
export function gearScore(g: GearPiece): number {
  const w: Record<StatKey, number> = { hp: 0.04, atk: 0.25, def: 0.1, spd: 1.2, critRate: 120, critDmg: 60, atkPct: 90, hpPct: 30 };
  let s = gearMainValue(g) * w[g.main];
  for (const x of g.subs) s += x.value * w[x.stat];
  return s;
}
