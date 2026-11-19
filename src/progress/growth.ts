// 育成：レベル・突破・技レベル・武器・装備から、戦いに出す数字を作る。
// 「何を上げると何が強くなるか」を画面で見せられるよう、数字を返す関数をそろえる。

import { SKILL_STEP } from '../battle/battle';
import type { Rng } from '../battle/rng';
import { statsAtLevel } from '../battle/stats';
import type { EncounterDef, Mods, PartyMember, Stats } from '../battle/types';
import { CHARACTERS } from '../data/characters';
import { ENEMIES } from '../data/enemies';
import { SLOTS } from '../data/gear';
import { BOOK_EXP } from '../data/items';
import { WEAPONS } from '../data/weapons';
import { BONDS, BOND_MAX, BOND_NEED, bondLevel, type BondReward } from '../data/bonds';
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
  const extraEffects: NonNullable<PartyMember['extraEffects']> = {};
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
  // 絆で開いたもの
  for (const r of bondRewards(save, charId)) {
    if (r.statPct?.atk) add('atk', Math.round(base.atk * r.statPct.atk));
    if (r.statPct?.hp) add('hp', Math.round(base.hp * r.statPct.hp));
    if (r.statPct?.def) add('def', Math.round(base.def * r.statPct.def));
    for (const [k, v] of Object.entries(r.mods ?? {})) mods[k as keyof Mods] = (mods[k as keyof Mods] ?? 0) + (v as number);
    for (const [k, effs] of Object.entries(r.extraEffects ?? {})) {
      const key = k as keyof typeof extraEffects;
      extraEffects[key] = [...(extraEffects[key] ?? []), ...(effs ?? [])];
    }
  }
  return { id: charId, level: c.level, skillLevel: c.skill, bonus, mods, extraEffects };
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

// ---------- 絆と、昼と夜 ----------

export const TALKS_PER_DAY = 3;

export function bondOf(save: SaveData, charId: string): number {
  return bondLevel(save.bonds[charId] ?? 0);
}

/** いまの絆で開いているもの */
export function bondRewards(save: SaveData, charId: string): BondReward[] {
  const def = BONDS[charId];
  if (!def) return [];
  const lv = bondOf(save, charId);
  return def.rewards.filter((r) => r.level <= lv);
}

/** 次の絆のレベルまで、あと何回話すか（最大なら 0） */
export function talksToNext(save: SaveData, charId: string): number {
  const lv = bondOf(save, charId);
  if (lv >= BOND_MAX) return 0;
  return BOND_NEED[lv + 1] - (save.bonds[charId] ?? 0);
}

export type TalkResult =
  | { ok: true; lines: string[]; levelUp?: BondReward; level: number }
  | { ok: false; reason: string };

/** 昼に仲間と話す（1日3回まで）。絆が上がったら、開いたものを返す */
export function talk(save: SaveData, charId: string): TalkResult {
  const def = BONDS[charId];
  if (!def) return { ok: false, reason: '話せない' };
  if (save.phase !== 'day') return { ok: false, reason: '夜は学校にいない' };
  if (save.talksToday >= TALKS_PER_DAY) return { ok: false, reason: 'きょうはもう帰る時間' };
  const n = save.bonds[charId] ?? 0;
  const before = bondLevel(n);
  save.bonds[charId] = n + 1;
  save.talksToday++;
  const after = bondLevel(n + 1);
  const lines = def.talks[Math.min(n, def.talks.length - 1)];
  const levelUp = after > before ? def.rewards.find((r) => r.level === after) : undefined;
  return { ok: true, lines, levelUp, level: after };
}

/** 学校の時間：仲間と話した回数で進む（0回＝朝、1回＝昼休み、2回から＝放課後） */
export function slotOf(talksToday: number): 'morning' | 'lunch' | 'after' {
  return talksToday <= 0 ? 'morning' : talksToday === 1 ? 'lunch' : 'after';
}

// ---------- 怪盗手帳 ----------

/** 倒した・説得した敵を、怪盗手帳に書く */
export function recordSeen(save: SaveData, enemyIds: string[]): void {
  for (const id of enemyIds) if (ENEMIES[id]) save.seen[id] = (save.seen[id] ?? 0) + 1;
}

/** 怪盗手帳の埋まりぐあい（出会った敵と、仲間にした協力者） */
export function notebookProgress(save: SaveData): { found: number; total: number } {
  const enemies = Object.keys(ENEMIES);
  const allies = Object.values(ENEMIES).filter((e) => e.ally).map((e) => e.ally!);
  const found = enemies.filter((id) => (save.seen[id] ?? 0) > 0).length + allies.filter((id) => save.chars[id]).length;
  return { found, total: enemies.length + allies.length };
}

// ---------- 協力者と編成 ----------

export const PARTY_MAX = 6;

export type RecruitResult = { charId: string; isNew: true } | { charId: string; isNew: false; bonus: Record<string, number> };

/** 説得で仲間になった敵を、協力者として迎える。もういれば、代わりに参考書 */
export function recruitAlly(save: SaveData, enemyId: string): RecruitResult | null {
  const charId = ENEMIES[enemyId]?.ally;
  if (!charId || !CHARACTERS[charId]) return null;
  if (save.chars[charId]) {
    save.items.book = (save.items.book ?? 0) + 1;
    return { charId, isNew: false, bonus: { book: 1 } };
  }
  // 仲間のいちばん低いレベルにそろえて迎える（すぐ戦えるように）
  const level = Math.max(1, Math.min(...save.party.map((id) => save.chars[id]?.level ?? 1)));
  const asc = LEVEL_CAPS.findIndex((cap) => cap >= level);
  save.chars[charId] = { level, exp: 0, asc: Math.max(0, asc), skill: 1, weapon: null };
  return { charId, isNew: true };
}

/** 編成を決める（1〜6人、持っているキャラ、重ならない）。前の4人が戦い、うしろは控え */
export function setParty(save: SaveData, ids: string[]): boolean {
  if (ids.length < 1 || ids.length > PARTY_MAX) return false;
  if (new Set(ids).size !== ids.length) return false;
  if (!ids.every((id) => save.chars[id] && CHARACTERS[id])) return false;
  save.party = [...ids];
  return true;
}

/** 夜になる（学校から帰る） */
export function goNight(save: SaveData): void {
  save.phase = 'night';
}

/** 寝る：次の日の昼になる */
export function sleep(save: SaveData): void {
  save.day++;
  save.phase = 'day';
  save.talksToday = 0;
  save.daily = {};
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
