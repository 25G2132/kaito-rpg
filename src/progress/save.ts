// 保存データ。ブラウザの中（localStorage）に置く。
// 読んだときに形を確かめて、おかしければ初期値に戻す。

import { DEFAULT_PARTY } from '../data';
import { SLOTS, type SlotId, type StatKey, STAT_NAMES } from '../data/gear';
import { ITEMS } from '../data/items';
import { WEAPONS } from '../data/weapons';
import { START_STONES } from '../data/gacha';

export const SAVE_KEY = 'kaito-rpg-save-v1';
export const SAVE_VERSION = 1;
export const START_LEVEL = 5;

export interface CharProgress {
  level: number;
  exp: number; // 次のレベルまでにたまった経験値
  asc: number; // 突破の回数（レベル上限が上がる）
  skill: number; // 技レベル
  weapon: string | null;
}

export interface GearPiece {
  id: number;
  slot: SlotId;
  rarity: number; // ★2〜★5
  level: number;
  main: StatKey;
  subs: { stat: StatKey; value: number }[];
  owner: string | null; // 付けている人
}

export interface SaveData {
  v: number;
  chapter: number;
  party: string[];
  chars: Record<string, CharProgress>;
  items: Record<string, number>;
  weapons: string[]; // 持っている武器
  gear: GearPiece[];
  nextGearId: number;
  wins: Record<string, number>;
  flags: Record<string, number>; // 進み具合のしるし（ボスの扉に着いた、など）
  bonds: Record<string, number>; // 仲間と話した回数（絆）
  day: number; // 何日目
  phase: 'day' | 'night'; // 昼（学校）か夜（怪盗）
  talksToday: number; // きょう話した回数
  seen: Record<string, number>; // 怪盗手帳：倒した（出会った）敵の数
  questState: Record<string, number>; // 頼みごと：1＝受けた、2＝解決
  questBase: Record<string, number>; // 頼みごと：受けたときの数
  daily: Record<string, number>; // その日だけの数（お店で買った数・つりの回数）。寝ると0
  gacha: Record<string, number>; // ガチャ：★5・★4 が出てから引いた回数（天井）、引いた合計
  losses: Record<string, number>;
}

export function defaultSave(): SaveData {
  const chars: Record<string, CharProgress> = {};
  for (const id of DEFAULT_PARTY) chars[id] = { level: START_LEVEL, exp: 0, asc: 0, skill: 1, weapon: null };
  return {
    v: SAVE_VERSION,
    chapter: 1,
    party: [...DEFAULT_PARTY],
    chars,
    items: { book: 2, stone: START_STONES },
    weapons: [],
    gear: [],
    nextGearId: 1,
    wins: {},
    flags: {},
    bonds: {},
    day: 1,
    phase: 'day',
    talksToday: 0,
    seen: {},
    questState: {},
    questBase: {},
    daily: {},
    gacha: {},
    losses: {},
  };
}

const isInt = (x: unknown, min: number, max: number): x is number =>
  typeof x === 'number' && Number.isInteger(x) && x >= min && x <= max;
const isNum = (x: unknown, min: number, max: number): x is number =>
  typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max;
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isCountMap = (x: unknown): x is Record<string, number> =>
  isObj(x) && Object.values(x).every((v) => isInt(v, 0, 1e9));

/** 形を確かめる。正しければ SaveData、おかしければ null */
export function validateSave(raw: unknown): SaveData | null {
  if (!isObj(raw) || raw.v !== SAVE_VERSION) return null;
  if (!isInt(raw.chapter, 1, 99)) return null;
  if (!Array.isArray(raw.party) || raw.party.length < 1 || raw.party.length > 6 || new Set(raw.party).size !== raw.party.length) return null;
  if (!isObj(raw.chars)) return null;
  for (const id of raw.party) if (typeof id !== 'string' || !(id in raw.chars)) return null;
  for (const c of Object.values(raw.chars)) {
    if (!isObj(c)) return null;
    if (!isInt(c.level, 1, 90) || !isNum(c.exp, 0, 1e9) || !isInt(c.asc, 0, 9) || !isInt(c.skill, 1, 20)) return null;
    if (c.weapon !== null && !(typeof c.weapon === 'string' && c.weapon in WEAPONS)) return null;
  }
  if (!isCountMap(raw.items)) return null;
  for (const k of Object.keys(raw.items)) if (!(k in ITEMS)) return null;
  if (!Array.isArray(raw.weapons) || !raw.weapons.every((w) => typeof w === 'string' && w in WEAPONS)) return null;
  if (!Array.isArray(raw.gear) || !isInt(raw.nextGearId, 1, 1e9)) return null;
  const slotIds = SLOTS.map((s) => s.id as string);
  for (const g of raw.gear) {
    if (!isObj(g) || !isInt(g.id, 1, 1e9) || !slotIds.includes(g.slot as string) || !isInt(g.level, 0, 99)) return null;
    if (g.rarity === undefined) g.rarity = 3; // レア度がなかったころの保存データは★3として読む
    if (!isInt(g.rarity, 2, 5)) return null;
    if (typeof g.main !== 'string' || !(g.main in STAT_NAMES)) return null;
    if (!Array.isArray(g.subs) || g.subs.length > 4) return null;
    for (const s of g.subs) if (!isObj(s) || typeof s.stat !== 'string' || !(s.stat in STAT_NAMES) || !isNum(s.value, 0, 1e6)) return null;
    if (g.owner !== null && !(typeof g.owner === 'string' && g.owner in raw.chars)) return null;
  }
  if (!isCountMap(raw.wins) || !isCountMap(raw.losses)) return null;
  if (raw.flags === undefined) raw.flags = {}; // しるしがなかったころの保存データ
  if (!isCountMap(raw.flags)) return null;
  // 絆と日にちがなかったころの保存データは、1日目の夜として読む
  if (raw.bonds === undefined) raw.bonds = {};
  if (raw.day === undefined) raw.day = 1;
  if (raw.phase === undefined) raw.phase = 'night';
  if (raw.talksToday === undefined) raw.talksToday = 0;
  if (!isCountMap(raw.bonds) || !isInt(raw.day, 1, 1e6) || !isInt(raw.talksToday, 0, 99)) return null;
  if (raw.phase !== 'day' && raw.phase !== 'night') return null;
  if (raw.seen === undefined) raw.seen = {};
  if (!isCountMap(raw.seen)) return null;
  if (raw.questState === undefined) raw.questState = {};
  if (raw.questBase === undefined) raw.questBase = {};
  if (!isCountMap(raw.questState) || !isCountMap(raw.questBase)) return null;
  if (raw.daily === undefined) raw.daily = {};
  if (!isCountMap(raw.daily)) return null;
  // ガチャがなかったころの保存データには、はじめの月の石（10回ぶん）を1回だけわたす
  if (raw.gacha === undefined) {
    raw.gacha = {};
    const items = raw.items as Record<string, number>;
    items.stone = (items.stone ?? 0) + START_STONES;
  }
  if (!isCountMap(raw.gacha)) return null;
  const save = raw as unknown as SaveData;
  // 新しいキャラが足されたときは、その人だけ初期値で足す
  for (const id of DEFAULT_PARTY) save.chars[id] ??= { level: START_LEVEL, exp: 0, asc: 0, skill: 1, weapon: null };
  return save;
}

export interface Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadSave(storage: Storage | undefined): { save: SaveData; reset: boolean } {
  try {
    const text = storage?.getItem(SAVE_KEY);
    if (!text) return { save: defaultSave(), reset: false };
    const save = validateSave(JSON.parse(text));
    return save ? { save, reset: false } : { save: defaultSave(), reset: true };
  } catch {
    return { save: defaultSave(), reset: true };
  }
}

export function storeSave(storage: Storage | undefined, save: SaveData): void {
  try {
    storage?.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    /* 保存できない（プライベートモードなど）ときは、そのまま遊べるようにする */
  }
}
