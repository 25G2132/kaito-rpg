// 育成：レベル・突破・技レベル・武器・装備から、戦いに出す数字を作る。
// 「何を上げると何が強くなるか」を画面で見せられるよう、数字を返す関数をそろえる。

import { SKILL_STEP } from '../battle/battle';
import type { Rng } from '../battle/rng';
import { statsAtLevel } from '../battle/stats';
import type { EncounterDef, Mods, PartyMember, Stats } from '../battle/types';
import { CHARACTERS } from '../data/characters';
import { SLOTS } from '../data/gear';
import { BOOK_EXP } from '../data/items';
import { WEAPONS } from '../data/weapons';
import { equipGear, equippedGear, enhanceGear, gearScore, makeGear, maxGearLevel, rollRarity, sumGear } from './gear';
import type { GearPiece, SaveData } from './save';

// ---------- 章ごとの上限 ----------

/** 突破の回数ごとのレベル上限 */
export const LEVEL_CAPS = [10, 20, 30, 40, 50];
/** 突破に要る鍵の欠片 */
export const ASC_COST = [4, 8, 12, 16];
/** 章ごとに、どこまで育てられるか */
export const CHAPTER_LIMITS: Record<number, { asc: number; skill: number }> = {
  1: { asc: 1, skill: 4 },
};
const limits = (save: SaveData) => CHAPTER_LIMITS[save.chapter] ?? CHAPTER_LIMITS[1];

export const levelCap = (asc: number) => LEVEL_CAPS[Math.min(asc, LEVEL_CAPS.length - 1)];
/** 次のレベルまでの経験値 */
export const expToNext = (level: number) => 40 + 20 * level;
/** 技レベルを1つ上げるのに要る技の手帳（今のレベルと同じ数） */
export const skillCost = (skill: number) => skill;

// ---------- レベル ----------

/** 経験値を足す。上限ならためておく（突破したら上がる）。上がった数を返す */
export function addExp(save: SaveData, charId: string, exp: number): number {
  const c = save.chars[charId];
  c.exp += exp;
  return settleLevel(save, charId);
}

function settleLevel(save: SaveData, charId: string): number {
  const c = save.chars[charId];
  const cap = levelCap(c.asc);
  let gained = 0;
  while (c.level < cap && c.exp >= expToNext(c.level)) {
    c.exp -= expToNext(c.level);
    c.level++;
    gained++;
  }
  return gained;
}

export function atCap(save: SaveData, charId: string): boolean {
  const c = save.chars[charId];
  return c.level >= levelCap(c.asc);
}

/** 参考書の数（次のレベルまで／上限まで） */
export function booksFor(save: SaveData, charId: string, untilCap: boolean): number {
  const c = save.chars[charId];
  const cap = levelCap(c.asc);
  if (c.level >= cap) return 0;
  let need = expToNext(c.level) - c.exp;
  if (untilCap) for (let l = c.level + 1; l < cap; l++) need += expToNext(l);
  return Math.max(1, Math.ceil(need / BOOK_EXP));
}

/** 参考書を使う（足りなければ、あるだけ） */
export function useBooks(save: SaveData, charId: string, count: number): { used: number; gained: number } {
  const used = Math.min(count, save.items.book ?? 0);
  if (used <= 0 || atCap(save, charId)) return { used: 0, gained: 0 };
  save.items.book -= used;
  return { used, gained: addExp(save, charId, used * BOOK_EXP) };
}

export function canAscend(save: SaveData, charId: string): { ok: boolean; reason?: string; cost: number } {
  const c = save.chars[charId];
  const cost = ASC_COST[c.asc] ?? 99;
  if (c.asc >= limits(save).asc) return { ok: false, reason: 'この章ではここまで', cost };
  if (!atCap(save, charId)) return { ok: false, reason: `レベル${levelCap(c.asc)}になったら突破できる`, cost };
  if ((save.items.key ?? 0) < cost) return { ok: false, reason: `鍵の欠片が${cost}個いる`, cost };
  return { ok: true, cost };
}

export function ascend(save: SaveData, charId: string): boolean {
  const chk = canAscend(save, charId);
  if (!chk.ok) return false;
  save.items.key -= chk.cost;
  save.chars[charId].asc++;
  settleLevel(save, charId);
  return true;
}

// ---------- 技レベル ----------

export function canRaiseSkill(save: SaveData, charId: string): { ok: boolean; reason?: string; cost: number } {
  const c = save.chars[charId];
  const cost = skillCost(c.skill);
  if (c.skill >= limits(save).skill) return { ok: false, reason: 'この章ではここまで', cost };
  if ((save.items.note ?? 0) < cost) return { ok: false, reason: `技の手帳が${cost}個いる`, cost };
  return { ok: true, cost };
}

export function raiseSkill(save: SaveData, charId: string): boolean {
  const chk = canRaiseSkill(save, charId);
  if (!chk.ok) return false;
  save.items.note -= chk.cost;
  save.chars[charId].skill++;
  return true;
}

// ---------- 武器 ----------

export function craftWeapon(save: SaveData, weaponId: string): boolean {
  const w = WEAPONS[weaponId];
  if (!w || save.weapons.includes(weaponId) || (save.items.blueprint ?? 0) < w.cost) return false;
  save.items.blueprint -= w.cost;
  save.weapons.push(weaponId);
  return true;
}

/** 付ける（ほかの人が付けていたら、その人からはずれる）。null ではずす */
export function equipWeapon(save: SaveData, charId: string, weaponId: string | null): void {
  if (weaponId) {
    if (!save.weapons.includes(weaponId)) return;
    for (const c of Object.values(save.chars)) if (c.weapon === weaponId) c.weapon = null;
  }
  save.chars[charId].weapon = weaponId;
}

// ---------- 戦いに出す数字 ----------

export function memberFor(save: SaveData, charId: string): PartyMember {
  const c = save.chars[charId];
  const def = CHARACTERS[charId];
  const base = statsAtLevel(def.base, c.level);
  const bonus: Partial<Stats> = {};
  const add = (k: keyof Stats, v: number) => (bonus[k] = (bonus[k] ?? 0) + v);
  let mods: Mods = {};
  const w = c.weapon ? WEAPONS[c.weapon] : undefined;
  if (w) {
    for (const [k, v] of Object.entries(w.stats)) add(k as keyof Stats, v as number);
    if (!w.owner || w.owner === charId) mods = { ...(w.mods ?? {}) };
  }
  const g = sumGear(equippedGear(save, charId));
  add('hp', (g.hp ?? 0) + Math.round(base.hp * (g.hpPct ?? 0)));
  add('atk', (g.atk ?? 0) + Math.round(base.atk * (g.atkPct ?? 0)));
  add('def', g.def ?? 0);
  add('spd', g.spd ?? 0);
  add('critRate', g.critRate ?? 0);
  add('critDmg', g.critDmg ?? 0);
  return { id: charId, level: c.level, skillLevel: c.skill, bonus, mods };
}

export function partyFor(save: SaveData): PartyMember[] {
  return save.party.map((id) => memberFor(save, id));
}

/** 育成をすべて足した数字（画面に出す） */
export function finalStats(save: SaveData, charId: string): Stats {
  const m = memberFor(save, charId);
  return statsAtLevel(CHARACTERS[charId].base, m.level, m.bonus);
}

/** 戦力：強さのめやす（1つの数字で「強くなった」が分かるように） */
export function powerOf(save: SaveData, charId: string): number {
  const s = finalStats(save, charId);
  const m = memberFor(save, charId);
  const skill = 1 + SKILL_STEP * ((m.skillLevel ?? 1) - 1);
  const mods = m.mods ?? {};
  const offense = s.atk * (1 + Math.min(1, s.critRate) * s.critDmg) * skill * (1 + (mods.dmgPct ?? 0) + (mods.synergyPct ?? 0) * 0.5);
  const support = 1 + (mods.healPct ?? 0) * 0.5 + (mods.energyPct ?? 0) * 0.5 + (mods.startEnergyPct ?? 0) * 0.3;
  return Math.round((offense * 2 + s.hp * 0.25 + s.def * 0.8 + s.spd * 4) * support);
}

export function partyPower(save: SaveData): number {
  return save.party.reduce((sum, id) => sum + powerOf(save, id), 0);
}

// ---------- ごほうび ----------

export interface Reward {
  exp: number;
  items: Record<string, number>;
  gear: GearPiece[];
}

export function rollRewards(enc: EncounterDef, rng: Rng, save: SaveData): Reward {
  const out: Reward = { exp: 0, items: {}, gear: [] };
  const first = !(save.wins[enc.id] > 0);
  const defs = [enc.rewards, first ? enc.firstClear : undefined].filter((x) => !!x);
  for (const r of defs) {
    out.exp += r!.exp;
    for (const [k, [lo, hi]] of Object.entries(r!.items)) {
      const n = lo + Math.floor(rng() * (hi - lo + 1));
      if (n > 0) out.items[k] = (out.items[k] ?? 0) + n;
    }
    for (let i = 0; i < r!.gear; i++) out.gear.push(makeGear(rng, 0, undefined, rollRarity(rng, enc.gearOdds ?? { 3: 1 })));
  }
  return out;
}

/** ごほうびを受け取る。レベルが上がった人と、上がった数を返す */
export function applyRewards(save: SaveData, reward: Reward, enc: EncounterDef): Record<string, number> {
  const ups: Record<string, number> = {};
  for (const id of save.party) {
    const n = addExp(save, id, reward.exp);
    if (n) ups[id] = n;
  }
  for (const [k, n] of Object.entries(reward.items)) save.items[k] = (save.items[k] ?? 0) + n;
  for (const g of reward.gear) {
    g.id = save.nextGearId++;
    save.gear.push(g);
  }
  save.wins[enc.id] = (save.wins[enc.id] ?? 0) + 1;
  return ups;
}

/** 挑めるか（前の段階に勝っていれば挑める） */
export function isUnlocked(save: SaveData, enc: EncounterDef): boolean {
  return !enc.unlock || (save.wins[enc.unlock] ?? 0) > 0;
}

export function recordLoss(save: SaveData, enc: EncounterDef): void {
  save.losses[enc.id] = (save.losses[enc.id] ?? 0) + 1;
}

// ---------- おまかせ（自動テストで「ふつうに育てた」を作る。画面の「おまかせ強化」にも使う） ----------

export function autoInvest(save: SaveData, rng: Rng): void {
  const party = save.party;
  // 突破
  for (const id of party) ascend(save, id);
  // 参考書：レベルの低い人から1冊ずつ
  for (let guard = 0; guard < 500 && (save.items.book ?? 0) > 0; guard++) {
    const open = party.filter((id) => !atCap(save, id));
    if (!open.length) break;
    open.sort((a, b) => save.chars[a].level - save.chars[b].level);
    useBooks(save, open[0], 1);
  }
  for (const id of party) ascend(save, id);
  // 技レベル：低い人から
  for (let guard = 0; guard < 50; guard++) {
    const can = party.filter((id) => canRaiseSkill(save, id).ok).sort((a, b) => save.chars[a].skill - save.chars[b].skill);
    if (!can.length) break;
    raiseSkill(save, can[0]);
  }
  // 専用武器を作って付ける
  for (const id of party) {
    const w = Object.values(WEAPONS).find((x) => x.owner === id);
    if (w && !save.weapons.includes(w.id)) craftWeapon(save, w.id);
    if (w && save.weapons.includes(w.id)) equipWeapon(save, id, w.id);
  }
  // 装備：枠ごとに一番よいものを付ける
  for (const slot of SLOTS) {
    for (const id of party) {
      const free = save.gear.filter((g) => g.slot === slot.id && (g.owner === null || g.owner === id));
      free.sort((a, b) => gearScore(b) - gearScore(a));
      if (free[0]) equipGear(save, free[0].id, id);
    }
  }
  // 付けている装備を、レベルの低い順に強化
  for (let guard = 0; guard < 500; guard++) {
    const worn = save.gear.filter((g) => g.owner && g.level < maxGearLevel(g)).sort((a, b) => a.level - b.level);
    if (!worn.length || !enhanceGear(save, worn[0].id, rng).ok) break;
  }
}
