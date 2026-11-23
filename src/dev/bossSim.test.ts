import { describe, expect, it } from 'vitest';
import { addResult, emptyStats, simBoss, simOnce } from './bossSim';
import { defaultSave } from '../progress/save';

describe('開発用：ボス戦の勝率', () => {
  it('負けたところの平均（ターン・ボスまで行けた割合・ボスの残りHP）を数える', () => {
    const s = emptyStats('auto', 3);
    addResult(s, { won: true, turns: 40, wave: 2, bossHp: 0 });
    addResult(s, { won: false, turns: 60, wave: 2, bossHp: 0.5 });
    addResult(s, { won: false, turns: 30, wave: 1, bossHp: null });
    addResult(s, { won: false, turns: 90, wave: 2, bossHp: 0.1 });
    expect(s.runs).toBe(4);
    expect(s.wins).toBe(1);
    expect(s.avgTurns).toBeCloseTo(55);
    expect(s.lossTurns).toBeCloseTo(60);
    expect(s.lossReachedBoss).toBeCloseTo(2 / 3);
    expect(s.lossBossHp).toBeCloseTo(0.3);
    expect(s.lossWave).toEqual([0, 1, 2]);
  });

  it('保存のままのチームで戦える。少しずつ回して進み具合を知らせる', async () => {
    const save = defaultSave();
    const r = simOnce(save, 'auto', 1);
    expect(r.turns).toBeGreaterThan(0);
    let calls = 0;
    const t0 = Date.now();
    const stats = await simBoss(save, 3, () => calls++);
    expect(stats.map((x) => x.runs)).toEqual([3, 3]);
    expect(calls).toBeGreaterThan(0);
    console.log(`ボス戦 6回: ${Date.now() - t0}ms`);
  });
});
