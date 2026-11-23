import { describe, expect, it } from 'vitest';
import { GAME_DATA, DEFAULT_PARTY } from '../data';
import { makeRng } from './rng';
import { Battle } from './battle';
import { autoSwap, chooseCommand, readyCombos, readyUltimates, stolenTarget } from './auto';

// 画面でありうる押し方を、でたらめな順で混ぜて試す（戦いが途中で動かなくならないか）。
// 画面の流れ（controller）と同じく：合わせ技・必殺技はいつでも割り込み、裏は時間で進む。

const party = DEFAULT_PARTY.map((id) => ({ id, level: 30 }));

function fuzzOnce(encounter: string, seed: number): { phase: string; steps: number } {
  const r = makeRng(seed);
  const b = new Battle(GAME_DATA, { party, encounter, seed });
  let steps = 0;
  while (!b.ended && steps < 4000) {
    steps++;
    // 裏の時間（手と自動をまぜる）。手のときは点を押すこともある
    const manual = r() < 0.5;
    if (manual && b.net && r() < 0.2) {
      const f = b.net.frontier();
      if (f.length) b.net.choose(f[Math.floor(r() * f.length)].id);
    }
    b.advanceUra(r() * 0.4, manual ? 'manual' : 'auto', manual ? { autoPick: false, careful: false } : undefined);
    if (b.ended) break;
    // 割り込み（番に関係なく）
    if (r() < 0.3) for (const c of readyCombos(b)) if (b.canCombo(c.id) && !b.ended) b.combo(c.id, r() < 0.5 ? c.target : undefined);
    if (b.ended) break;
    if (r() < 0.3) for (const u of readyUltimates(b)) if (b.canUlt(u.uid) && !b.ended) b.ultimate(u.uid, r() < 0.5 ? u.target : undefined, 1 + r() * 0.5);
    if (b.ended) break;
    if (b.phase === 'between') {
      b.nextTurn();
      continue;
    }
    // 味方の番：入力待ちの状態はいつも正しいこと
    expect(b.phase).toBe('command');
    expect(b.active, '味方の番なのに、番の人がいない').toBeTruthy();
    expect(b.active!.alive || b.allies.some((u) => u.bench), '倒れた人の番').toBeTruthy();
    const roll = r();
    const s = autoSwap(b);
    if (s && roll < 0.5) {
      b.swap(s.out, s.in);
      continue;
    }
    const st = stolenTarget(b);
    if (st && roll < 0.6) {
      b.useStolen(st);
      continue;
    }
    const enemy = b.aliveEnemies()[Math.floor(r() * b.aliveEnemies().length)];
    if (enemy && roll < 0.65 && b.canPersuade(enemy.uid)) {
      b.persuade(enemy.uid);
      continue;
    }
    const c = chooseCommand(b);
    const kind = r() < 0.5 && b.sp >= 1 ? 'skill' : c.kind;
    b.command(kind, r() < 0.5 ? c.target : enemy?.uid);
  }
  return { phase: b.phase, steps };
}

describe('でたらめな押し方でも、戦いが止まらない', () => {
  const encs = Object.keys(GAME_DATA.encounters);
  for (const enc of encs) {
    it(enc, () => {
      for (let seed = 1; seed <= 12; seed++) {
        const res = fuzzOnce(enc, seed * 7919);
        expect(['won', 'lost'], `${enc} seed ${seed}: ${res.steps}歩で終わらない`).toContain(res.phase);
      }
    });
  }
});

describe('画面で出来事を見せるとき', () => {
  it('次の群れに入れかわったあとも、前の群れの敵と裏のシンを探せる（見つからずに戦いが止まった不具合）', () => {
    const b = new Battle(GAME_DATA, { party, encounter: 'archive1', seed: 3 });
    const first = b.enemies.map((u) => u.uid);
    // 1つめの群れを倒しきる
    for (const u of b.enemies) u.hp = 1;
    for (let i = 0; i < 200 && b.wave === 0 && !b.ended; i++) {
      if (b.phase === 'between') b.nextTurn();
      else b.command('basic', b.aliveEnemies()[0]?.uid);
      for (const u of b.aliveEnemies()) if (b.wave === 0) u.hp = 1;
    }
    expect(b.wave).toBe(1);
    for (const id of first) {
      expect(b.unit(id)).toBeUndefined();
      expect(b.anyUnit(id)?.uid).toBe(id);
    }
    expect(b.anyUnit(b.hacker!.uid)).toBe(b.hacker);
  });
});
