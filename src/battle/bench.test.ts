import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../data';
import { runAuto } from './auto';
import { Battle, type BattleEvent } from './battle';
import type { EncounterDef } from './types';

const one = (enemy: string): EncounterDef => ({ id: 't', name: 't', desc: '', level: 20, waves: [[enemy]] });
/** 6人（うしろの2人は控え）。ためしに同じキャラを控えにも入れる */
const six = ['akari', 'shin', 'yuki', 'hayate', 'yuki', 'shin'].map((id) => ({ id, level: 20 }));
const of = <T extends BattleEvent['t']>(ev: BattleEvent[], t: T) => ev.filter((e): e is Extract<BattleEvent, { t: T }> => e.t === t);

describe('控えと入れかえ', () => {
  it('うしろの2人は控え：番が来ず、ねらわれない', () => {
    const b = new Battle(GAME_DATA, { party: six, encounter: one('robot'), seed: 1 });
    expect(b.allies.filter((u) => u.bench)).toHaveLength(2);
    const order = b.turnOrder(20);
    expect(order.some((uid) => b.unit(uid)!.bench)).toBe(false);
    expect(b.foesOf(b.enemies[0]).some((u) => u.bench)).toBe(false);
  });

  it('味方の番に1回だけ入れかえられる。番の人を下げると、入った人がその番を使う', () => {
    const b = new Battle(GAME_DATA, { party: six, encounter: one('robot'), seed: 1 });
    b.nextTurn();
    const active = b.active!;
    const bench = b.benchAllies()[0];
    const ev = b.swap(active.uid, bench.uid);
    expect(of(ev, 'swap')).toHaveLength(1);
    expect(b.activeId).toBe(bench.uid);
    expect(bench.bench).toBe(false);
    expect(active.bench).toBe(true);
    expect(b.canSwap(b.aliveAllies()[0].uid, b.benchAllies()[0].uid)).toBe(false); // 2回目はできない
    b.command('basic');
  });

  it('前の4人が全員倒れても、控えが出てきて負けにならない', () => {
    const b = new Battle(GAME_DATA, { party: six, encounter: one('boss_kurogane'), seed: 1 });
    for (const u of b.aliveAllies()) u.hp = 1;
    for (const u of b.allies) u.av = 99999;
    const boss = b.enemies[0];
    boss.actions = 1; // 次は「薙ぎ払い」（全員に当たる）
    boss.av = 0;
    const ev = b.nextTurn();
    expect(of(ev, 'swap')).toHaveLength(2); // 控えの2人が前に出る
    expect(b.phase).not.toBe('lost');
    expect(b.aliveAllies()).toHaveLength(2);
  });

  it('6人で自動で戦っても、最後まで終わる', () => {
    const b = new Battle(GAME_DATA, { party: six, encounter: { ...GAME_DATA.encounters.vault, level: 20 }, seed: 2 });
    expect(['won', 'lost']).toContain(runAuto(b));
  });
});

describe('必殺技のタッチ遊び', () => {
  it('うまくいくほど必殺技が強い（最大1.5倍）', () => {
    const hit = (boost: number) => {
      const b = new Battle(GAME_DATA, { party: six.slice(0, 4), encounter: one('robot'), seed: 3 });
      const akari = b.allies[0];
      akari.stats.critRate = 0;
      akari.energy = akari.energyMax;
      return of(b.ultimate(akari.uid, undefined, boost), 'damage')[0].amount;
    };
    const base = hit(1);
    expect(hit(1.5)).toBeGreaterThan(base * 1.4);
    expect(hit(9)).toBe(hit(1.5)); // 上限は1.5倍
  });
});

describe('説得', () => {
  it('弱った（HP3割以下の）敵にだけ説得できる。ボスはできない', () => {
    const b = new Battle(GAME_DATA, { party: six.slice(0, 4), encounter: one('drone'), seed: 1 });
    b.nextTurn();
    const e = b.enemies[0];
    expect(b.canPersuade(e.uid)).toBe(false);
    e.hp = Math.floor(e.maxHp * 0.2);
    expect(b.canPersuade(e.uid)).toBe(true);
    const boss = new Battle(GAME_DATA, { party: six.slice(0, 4), encounter: one('boss_kurogane'), seed: 1 });
    boss.nextTurn();
    boss.enemies[0].hp = 1;
    expect(boss.canPersuade(boss.enemies[0].uid)).toBe(false);
  });

  it('弱っているほど、守りが崩れているほど成功しやすい。成功すると戦いから抜け、仲間になる', () => {
    const b = new Battle(GAME_DATA, { party: six.slice(0, 4), encounter: one('drone'), seed: 1 });
    b.nextTurn();
    const e = b.enemies[0];
    e.hp = Math.floor(e.maxHp * 0.28);
    const a = b.persuadeChance(e.uid);
    e.hp = 1;
    const c = b.persuadeChance(e.uid);
    e.broken = true;
    expect(c).toBeGreaterThan(a);
    expect(b.persuadeChance(e.uid)).toBeGreaterThan(c);
    // 何度か試すと成功する（種で決まる）
    let won = false;
    for (let seed = 1; seed <= 20 && !won; seed++) {
      const t = new Battle(GAME_DATA, { party: six.slice(0, 4), encounter: one('drone'), seed });
      t.nextTurn();
      while (t.phase !== 'command') t.nextTurn();
      t.enemies[0].hp = 1;
      const ev = t.persuade(t.enemies[0].uid);
      if (of(ev, 'persuade')[0].ok) {
        won = true;
        expect(t.recruited).toEqual(['drone']);
        expect(t.phase).toBe('won');
      }
    }
    expect(won).toBe(true);
  });
});
