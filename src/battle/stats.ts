import type { Stats } from './types';

// レベルによる伸び。HP・攻撃・防御がレベル1つにつき基本の10%ずつ伸びる。
// 素早さ・会心は伸びない（段階3の装備で伸ばす）。
export function growth(level: number): number {
  return 1 + 0.1 * (Math.max(1, level) - 1);
}

export function statsAtLevel(base: Stats, level: number, bonus?: Partial<Stats>): Stats {
  const g = growth(level);
  return {
    hp: Math.round(base.hp * g) + (bonus?.hp ?? 0),
    atk: Math.round(base.atk * g) + (bonus?.atk ?? 0),
    def: Math.round(base.def * g) + (bonus?.def ?? 0),
    spd: base.spd + (bonus?.spd ?? 0),
    critRate: base.critRate + (bonus?.critRate ?? 0),
    critDmg: base.critDmg + (bonus?.critDmg ?? 0),
  };
}

/** 1回の番までの長さ（素早さ100で100） */
export function actionLength(spd: number): number {
  return 10000 / Math.max(1, spd);
}
