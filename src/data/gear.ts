// 装備。1人4枠。枠ごとに主な効果は決まっていて、副ステータスはランダム。
// 強化（部品を使う）で主な効果が伸び、3レベルごとに副ステータスが増えるか伸びる。

export type StatKey = 'hp' | 'atk' | 'def' | 'spd' | 'critRate' | 'critDmg' | 'atkPct' | 'hpPct';
export type SlotId = 'mask' | 'gloves' | 'shoes' | 'badge';

export const STAT_NAMES: Record<StatKey, string> = {
  hp: 'HP',
  atk: '攻撃',
  def: '防御',
  spd: '素早さ',
  critRate: '会心率',
  critDmg: '会心ダメージ',
  atkPct: '攻撃%',
  hpPct: 'HP%',
};
export const PCT_STATS: StatKey[] = ['critRate', 'critDmg', 'atkPct', 'hpPct'];

export interface SlotDef {
  id: SlotId;
  name: string;
  main: StatKey;
  mainBase: number; // 強化0のときの主な効果
  mainPerLevel: number;
}

export const SLOTS: SlotDef[] = [
  { id: 'mask', name: '仮面', main: 'hp', mainBase: 150, mainPerLevel: 45 },
  { id: 'gloves', name: '手袋', main: 'atk', mainBase: 30, mainPerLevel: 9 },
  { id: 'shoes', name: '靴', main: 'spd', mainBase: 3, mainPerLevel: 0.8 },
  { id: 'badge', name: '記章', main: 'atkPct', mainBase: 0.05, mainPerLevel: 0.017 },
];

/** 副ステータス1回ぶんの伸び（この間でランダム） */
export const SUB_ROLLS: Record<StatKey, [number, number]> = {
  hp: [40, 60],
  atk: [10, 16],
  def: [10, 16],
  spd: [2, 3],
  critRate: [0.025, 0.04],
  critDmg: [0.05, 0.08],
  atkPct: [0.03, 0.05],
  hpPct: [0.03, 0.05],
};

export const GEAR_MAX_LEVEL = 15;
export const SUB_EVERY = 3; // 3レベルごとに副ステータス
export const MAX_SUBS = 4;
/** 強化1回に要る部品（今のレベル＋2） */
export const enhanceCost = (level: number) => level + 2;
