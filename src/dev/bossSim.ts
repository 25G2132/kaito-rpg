// 開発用：今のチーム（保存のまま）で、ボスと何回も自動で戦って勝率を出す。
// 端末の上で回す（チームは端末の保存にしかないため）。固まらないよう、少しずつ回す。

import { Battle } from '../battle/battle';
import { runAuto } from '../battle/auto';
import { GAME_DATA } from '../data';
import { partyFor } from '../progress/growth';
import type { SaveData } from '../progress/save';

export const BOSS_ENCOUNTER = 'vault';

/** 裏の遊び方：auto＝裏も自動、manual＝裏を手で遊んだときのまね（自分でねらいを選び、光をよけ、速く破る） */
export type SimUra = 'auto' | 'manual';

export interface SimStats {
  ura: SimUra;
  runs: number;
  wins: number;
  /** 1回の平均ターン数 */
  avgTurns: number;
  /** 負けたときの平均ターン数 */
  lossTurns: number;
  /** 負けたとき、ボスの群れまで行けた割合 */
  lossReachedBoss: number;
  /** 負けたとき（ボスの群れまで行けたもの）の、ボスの残りHPの平均（0〜1） */
  lossBossHp: number;
  /** 負けたとき、どの群れで負けたか（1, 2, 3…ごとの回数） */
  lossWave: number[];
}

/** 1回戦う。結果と、負けたところ */
export function simOnce(save: SaveData, ura: SimUra, seed: number): { won: boolean; turns: number; wave: number; bossHp: number | null } {
  const b = new Battle(GAME_DATA, { party: partyFor(save), encounter: BOSS_ENCOUNTER, seed });
  const phase = runAuto(b, 500, ura);
  const boss = b.enemies.find((u) => b.enemyDef(u)?.boss);
  return { won: phase === 'won', turns: b.turnCount, wave: b.wave, bossHp: boss ? Math.max(0, boss.hp) / boss.maxHp : null };
}

export function emptyStats(ura: SimUra, waves: number): SimStats {
  return { ura, runs: 0, wins: 0, avgTurns: 0, lossTurns: 0, lossReachedBoss: 0, lossBossHp: 0, lossWave: Array(waves).fill(0) };
}

/** 結果を1回ぶん足す（平均はその場で更新） */
export function addResult(s: SimStats, r: ReturnType<typeof simOnce>): void {
  const losses = s.runs - s.wins;
  const reached = Math.round(s.lossReachedBoss * losses);
  s.avgTurns = (s.avgTurns * s.runs + r.turns) / (s.runs + 1);
  s.runs++;
  if (r.won) {
    s.wins++;
    return;
  }
  s.lossTurns = (s.lossTurns * losses + r.turns) / (losses + 1);
  s.lossWave[r.wave] = (s.lossWave[r.wave] ?? 0) + 1;
  if (r.bossHp !== null) {
    s.lossBossHp = (s.lossBossHp * reached + r.bossHp) / (reached + 1);
    s.lossReachedBoss = (reached + 1) / (losses + 1);
  } else {
    s.lossReachedBoss = reached / (losses + 1);
  }
}

/**
 * n 回ずつ（裏が自動・裏を手で遊んだまね）回す。1コマに少しずつ回し、進み具合を知らせる。
 * stop() が true を返したらやめる
 */
export async function simBoss(
  save: SaveData,
  n: number,
  onProgress: (done: number, total: number, stats: SimStats[]) => void,
  stop: () => boolean = () => false,
): Promise<SimStats[]> {
  const waves = GAME_DATA.encounters[BOSS_ENCOUNTER].waves.length;
  const stats = [emptyStats('auto', waves), emptyStats('manual', waves)];
  const total = n * 2;
  const seed0 = Date.now() % 1_000_000;
  let done = 0;
  for (const s of stats) {
    for (let i = 0; i < n; i++) {
      if (stop()) return stats;
      addResult(s, simOnce(save, s.ura, seed0 + i * 7919));
      done++;
      // 1回ごとに画面へ返す（重い端末でも固まらない）
      if (done % 2 === 0 || done === total) {
        onProgress(done, total, stats);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
  }
  return stats;
}
