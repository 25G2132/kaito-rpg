import { describe, expect, it } from 'vitest';
import { GAME_DATA, DEFAULT_LEVEL, DEFAULT_PARTY } from '../data';
import { runAuto } from './auto';
import { Battle, SP_MAX, type BattleEvent, type Unit } from './battle';
import type { CharacterDef, EncounterDef, GameData } from './types';

const party = (level = DEFAULT_LEVEL) => DEFAULT_PARTY.map((id) => ({ id, level }));
const one = (enemy: string): EncounterDef => ({ id: 't', name: 't', desc: '', level: 20, waves: [[enemy]] });

function make(encounter: string | EncounterDef, seed = 1, data: GameData = GAME_DATA): Battle {
  const b = new Battle(data, { party: party(), encounter, seed });
  // 会心は運なので、テストでは止める
  for (const u of b.units) u.stats.critRate = 0;
  return b;
}
const ally = (b: Battle, id: string): Unit => b.allies.find((u) => u.defId === id)!;
/** 指定した味方の番にする */
function giveTurn(b: Battle, u: Unit): void {
  b.phase = 'command';
  b.activeId = u.uid;
}
const of = <T extends BattleEvent['t']>(ev: BattleEvent[], t: T) =>
  ev.filter((e): e is Extract<BattleEvent, { t: T }> => e.t === t);

describe('行動の順番', () => {
  it('素早い人から番が来る', () => {
    const b = make(one('drone'));
    const order = b.turnOrder(5);
    expect(order[0]).toBe(ally(b, 'shin').uid); // 素早さ115で一番
    const ev = b.nextTurn();
    expect(of(ev, 'turn')[0].unit).toBe(ally(b, 'shin').uid);
    expect(b.phase).toBe('command');
  });

  it('素早さが2倍なら、番も約2倍来る', () => {
    const b = make(one('robot'));
    const robot = b.enemies[0];
    robot.stats.spd = 230; // シン(115)の2倍
    robot.av = 10000 / 230;
    const order = b.turnOrder(30);
    const r = order.filter((x) => x === robot.uid).length;
    const s = order.filter((x) => x === ally(b, 'shin').uid).length;
    expect(r / s).toBeGreaterThan(1.7);
    expect(r / s).toBeLessThan(2.3);
  });
});

describe('スキルの点数と必殺技', () => {
  it('通常攻撃で+1、スキルで-1。上限は5、0のときスキルは使えない', () => {
    const b = make(one('boss_kurogane'));
    const akari = ally(b, 'akari');
    expect(b.sp).toBe(3);
    giveTurn(b, akari);
    b.command('basic');
    expect(b.sp).toBe(4);
    giveTurn(b, akari);
    b.command('skill');
    expect(b.sp).toBe(3);
    b.sp = SP_MAX;
    giveTurn(b, akari);
    b.command('basic');
    expect(b.sp).toBe(SP_MAX);
    b.sp = 0;
    giveTurn(b, akari);
    expect(b.canSkill()).toBe(false);
    expect(() => b.command('skill')).toThrow();
  });

  it('必殺技はゲージが満タンのときだけ。番を待たずに割り込める（いまの番は変わらない）', () => {
    const b = make(one('boss_kurogane'));
    const akari = ally(b, 'akari');
    const shin = ally(b, 'shin');
    b.nextTurn(); // シンの番
    expect(b.activeId).toBe(shin.uid);
    expect(b.canUlt(akari.uid)).toBe(false);
    akari.energy = akari.energyMax;
    expect(b.canUlt(akari.uid)).toBe(true);
    const avBefore = akari.av;
    const ev = b.ultimate(akari.uid);
    expect(of(ev, 'action')[0].kind).toBe('ult');
    expect(of(ev, 'damage').length).toBeGreaterThan(0);
    expect(b.activeId).toBe(shin.uid); // シンの番のまま
    expect(b.phase).toBe('command');
    expect(akari.av).toBe(avBefore);
    expect(akari.energy).toBeLessThan(akari.energyMax);
  });

  it('行動でゲージがたまる', () => {
    const b = make(one('boss_kurogane'));
    const akari = ally(b, 'akari');
    const before = akari.energy;
    giveTurn(b, akari);
    b.command('basic');
    expect(akari.energy).toBe(before + 20);
  });
});

describe('弱点と守りの崩れ', () => {
  it('弱点の属性だと守りが削れ、削り切ると崩れて1回休み', () => {
    const b = make(one('drone')); // 弱点：炎・風。守り20
    const akari = ally(b, 'akari');
    const drone = b.enemies[0];
    drone.stats.hp = drone.maxHp = drone.hp = 99999; // 倒れないように
    drone.toughness = 20; // 紅蓮一閃1回で削り切れる量
    giveTurn(b, akari);
    const ev = b.command('skill'); // 炎・削り20
    expect(of(ev, 'damage')[0].weak).toBe(true);
    expect(of(ev, 'break')).toHaveLength(1);
    expect(drone.broken).toBe(true);
    // ドローンの番が来ても動けず、守りが戻る
    for (const u of b.allies) u.av = 99999;
    drone.av = 0;
    const ev2 = b.nextTurn();
    expect(of(ev2, 'recover')).toHaveLength(1);
    expect(of(ev2, 'action')).toHaveLength(0);
    expect(drone.broken).toBe(false);
    expect(drone.toughness).toBe(drone.maxToughness);
  });

  it('弱点でない属性は守りが削れず、ダメージも減る', () => {
    const b = make(one('drone'));
    const shin = ally(b, 'shin'); // 雷はドローンの弱点ではない
    giveTurn(b, shin);
    const ev = b.command('basic');
    expect(of(ev, 'damage')[0].weak).toBe(false);
    expect(of(ev, 'toughness')).toHaveLength(0);
  });

  it('シンの〔解析〕で、どの属性でも弱点になる', () => {
    const b = make(one('robot')); // 弱点：雷・風。炎は弱点ではない
    const robot = b.enemies[0];
    expect(b.isWeak(robot, 'fire')).toBe(false);
    giveTurn(b, ally(b, 'shin'));
    b.command('skill');
    expect(b.hasStatus(robot, 'exposed')).toBeTruthy();
    expect(b.isWeak(robot, 'fire')).toBe(true);
  });
});

describe('相性', () => {
  it('〔解析〕×「紅蓮一閃」で、ダメージがはっきり大きくなる（2倍以上）', () => {
    const plain = make(one('robot'));
    giveTurn(plain, ally(plain, 'akari'));
    const d1 = of(plain.command('skill'), 'damage')[0];
    expect(d1.synergy).toBeUndefined();

    const combo = make(one('robot'));
    const robot = combo.enemies[0];
    combo.addStatus(ally(combo, 'shin'), robot, 'exposed', 2, 1);
    giveTurn(combo, ally(combo, 'akari'));
    const d2 = of(combo.command('skill'), 'damage')[0];
    expect(d2.synergy?.status).toBe('exposed');
    expect(d2.synergy?.from).toBe(ally(combo, 'shin').uid);
    expect(d2.amount / d1.amount).toBeGreaterThanOrEqual(2);
  });

  it('アカリの〔燃焼〕を、ハヤテの「煽り風」が2倍にしてすぐ燃やす', () => {
    const b = make(one('robot'));
    const robot = b.enemies[0];
    robot.stats.hp = robot.maxHp = robot.hp = 99999;
    const akari = ally(b, 'akari');
    giveTurn(b, akari);
    b.command('basic'); // 燃焼1
    giveTurn(b, akari);
    b.command('basic'); // 燃焼2
    expect(b.hasStatus(robot, 'burn')?.stacks).toBe(2);
    giveTurn(b, ally(b, 'hayate'));
    const ev = b.command('skill');
    const amp = of(ev, 'amplify')[0];
    expect(amp.from).toBe(2);
    expect(amp.to).toBe(4);
    expect(amp.synergyFrom).toBe(akari.uid);
    const dot = of(ev, 'damage').find((d) => d.dot === 'burn');
    expect(dot).toBeTruthy();
  });

  it('倍にした燃焼は、あとの燃焼で減らない。上限なら相性にならない', () => {
    const b = make(one('robot'));
    const robot = b.enemies[0];
    robot.stats.hp = robot.maxHp = robot.hp = 99999;
    const akari = ally(b, 'akari');
    b.addStatus(akari, robot, 'burn', 3, 5);
    giveTurn(b, ally(b, 'hayate'));
    b.command('skill');
    expect(b.hasStatus(robot, 'burn')?.stacks).toBe(10);
    giveTurn(b, akari);
    b.command('basic'); // 燃焼を足す
    expect(b.hasStatus(robot, 'burn')?.stacks).toBe(10);
    giveTurn(b, ally(b, 'hayate'));
    const ev = b.command('skill');
    expect(of(ev, 'amplify')).toHaveLength(0);
  });
});

describe('敵の動き', () => {
  function bossTurn(b: Battle): BattleEvent[] {
    for (const u of b.allies) u.av = 99999;
    b.enemies[0].av = 0;
    return b.nextTurn();
  }

  it('ボスは力をためたあと、次の番に大技を使う', () => {
    const b = make(one('boss_kurogane'));
    const boss = b.enemies[0];
    const used = [bossTurn(b), bossTurn(b), bossTurn(b), bossTurn(b)].map((ev) => of(ev, 'action')[0].skill);
    expect(used).toEqual(['boss_slam', 'boss_sweep', 'boss_charge', 'boss_hammer']);
    expect(b.hasStatus(boss, 'charging')).toBeUndefined();
  });

  it('ためている間に守りを崩すと、大技を止められる', () => {
    const b = make(one('boss_kurogane'));
    const boss = b.enemies[0];
    boss.actions = 2; // 次は「力をためる」
    const ev = bossTurn(b);
    expect(of(ev, 'warn')).toHaveLength(1);
    expect(b.hasStatus(boss, 'charging')).toBeTruthy();
    boss.toughness = 10;
    giveTurn(b, ally(b, 'akari'));
    b.command('skill');
    expect(boss.broken).toBe(true);
    expect(b.hasStatus(boss, 'charging')).toBeUndefined();
    const ev2 = bossTurn(b);
    expect(of(ev2, 'recover')).toHaveLength(1);
    expect(of(ev2, 'action')).toHaveLength(0);
  });

  it('ボスはHPが半分を切ると怒る', () => {
    const b = make(one('boss_kurogane'));
    const boss = b.enemies[0];
    boss.hp = Math.floor(boss.maxHp * 0.5) + 1;
    giveTurn(b, ally(b, 'akari'));
    const ev = b.command('skill');
    expect(of(ev, 'warn')).toHaveLength(1);
    expect(b.hasStatus(boss, 'rage')).toBeTruthy();
  });
});

describe('群れと勝ち負け', () => {
  it('群れを倒し切ると次の群れ、最後まで倒すと勝ち', () => {
    const b = make('vault');
    const hayate = ally(b, 'hayate');
    for (const e of b.enemies) e.hp = 1;
    hayate.energy = hayate.energyMax;
    const ev = b.ultimate(hayate.uid);
    const w = of(ev, 'wave');
    expect(w).toHaveLength(1);
    expect(w[0].index).toBe(1);
    expect(b.enemies.every((e) => e.alive && e.uid.startsWith('e1_'))).toBe(true);
    // 残りも倒す
    for (let i = 0; i < 2; i++) {
      for (const e of b.enemies) e.hp = 1;
      hayate.energy = hayate.energyMax;
      b.ultimate(hayate.uid);
    }
    expect(b.phase).toBe('won');
  });

  it('味方が全員倒れると負け', () => {
    const b = make(one('robot'));
    for (const u of b.allies) u.hp = 1;
    for (let i = 0; i < 20 && !b.ended; i++) {
      if (b.phase === 'command') b.command('basic', undefined);
      else b.nextTurn();
    }
    expect(b.phase).toBe('lost');
  });

  it('仮の4人（レベル20）で、群れとボスにほぼ必ず勝てる', () => {
    let wins = 0;
    const N = 30;
    for (let seed = 1; seed <= N; seed++) {
      const b = new Battle(GAME_DATA, { party: party(), encounter: 'vault', seed });
      if (runAuto(b) === 'won') wins++;
    }
    expect(wins / N).toBeGreaterThanOrEqual(0.9);
  });

  it('練習の群れには必ず勝てる', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const b = new Battle(GAME_DATA, { party: party(), encounter: 'patrol', seed });
      expect(runAuto(b)).toBe('won');
    }
  });

  it('育てていない（レベル1）と、ボスにはまず勝てない', () => {
    let wins = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const b = new Battle(GAME_DATA, { party: party(1), encounter: 'vault', seed });
      if (runAuto(b) === 'won') wins++;
    }
    expect(wins).toBe(0);
  });
});

describe('データ', () => {
  it('データの中の名前（状態・技・敵・属性）がすべて見つかる', () => {
    const d = GAME_DATA;
    const skills = [
      ...Object.values(d.characters).flatMap((c) => [c.basic, c.skill, c.ult]),
      ...Object.values(d.enemies).flatMap((e) => e.skills),
    ];
    for (const s of skills) {
      for (const e of s.effects) {
        if ('status' in e) expect(d.statuses[e.status], `${s.id}: ${e.status}`).toBeTruthy();
        if (e.kind === 'damage' && e.synergy) expect(d.statuses[e.synergy.status]).toBeTruthy();
      }
      if (s.element) expect(d.elements[s.element]).toBeTruthy();
    }
    for (const c of Object.values(d.characters)) expect(d.elements[c.element], c.id).toBeTruthy();
    for (const e of Object.values(d.enemies)) {
      for (const w of e.weaknesses) expect(d.elements[w], `${e.id}: ${w}`).toBeTruthy();
      for (const p of e.pattern ?? []) expect(e.skills.some((k) => k.id === p), `${e.id}: ${p}`).toBe(true);
      if (e.enrage) expect(d.statuses[e.enrage.status]).toBeTruthy();
    }
    for (const st of Object.values(d.statuses)) {
      if (st.forcesSkill) expect(skills.some((k) => k.id === st.forcesSkill)).toBe(true);
    }
    for (const enc of Object.values(d.encounters)) {
      for (const w of enc.waves) for (const id of w) expect(d.enemies[id], `${enc.id}: ${id}`).toBeTruthy();
    }
  });

  it('キャラはデータを足すだけで戦える（コードを変えなくてよい）', () => {
    const newcomer: CharacterDef = {
      ...GAME_DATA.characters.yuki,
      id: 'test_shadow',
      name: 'テスト',
      element: 'shadow',
      skill: { ...GAME_DATA.characters.akari.skill, id: 'test_skill', element: 'shadow' },
    };
    const data: GameData = { ...GAME_DATA, characters: { ...GAME_DATA.characters, test_shadow: newcomer } };
    const b = new Battle(data, {
      party: ['test_shadow', 'shin', 'akari', 'hayate'].map((id) => ({ id, level: 20 })),
      encounter: 'patrol',
      seed: 3,
    });
    expect(runAuto(b)).toBe('won');
  });
});
