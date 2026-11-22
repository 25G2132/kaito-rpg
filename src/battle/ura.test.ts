import { describe, expect, it } from 'vitest';
import { GAME_DATA, DEFAULT_PARTY } from '../data';
import { Battle, type BattleEvent } from './battle';
import { HackNet, LOCKOUT_SEC, RELOCK_SEC } from './hack';
import type { EncounterDef } from './types';

const party = DEFAULT_PARTY.map((id) => ({ id, level: 30 }));
const one = (enemy: string): EncounterDef => ({ id: 't', name: 't', desc: '', level: 30, waves: [[enemy]] });
const of = <T extends BattleEvent['t']>(ev: BattleEvent[], t: T) => ev.filter((e): e is Extract<BattleEvent, { t: T }> => e.t === t);
const careful = { autoPick: true, careful: true };

/** 指定した種類の装置が破れるまで、裏を進める */
function crackUntil(b: Battle, kind: string, max = 200): BattleEvent[] {
  const out: BattleEvent[] = [];
  for (let i = 0; i < max; i++) {
    const ev = b.advanceUra(0.25, 'manual', careful);
    out.push(...ev);
    if (b.net!.nodes.some((n) => n.kind === kind && n.cracked)) break;
  }
  return out;
}

describe('表と裏', () => {
  it('シン（裏の担当）は表の4人に入らない。表はほかの人、裏に回線図ができる', () => {
    const b = new Battle(GAME_DATA, { party, encounter: one('robot'), seed: 1 });
    expect(b.hacker?.defId).toBe('shin');
    expect(b.allies.some((u) => u.defId === 'shin')).toBe(false);
    expect(b.turnOrder(10)).not.toContain('h');
    expect(b.net!.nodes.filter((n) => n.enemy === b.enemies[0].uid).map((n) => n.kind).sort()).toEqual(['buff', 'ctrl', 'wall', 'weak']);
  });

  it('敵の弱点は「？」で始まり、裏で弱点の装置を破ると見える。しばらくすると直されて効果が切れる', () => {
    const b = new Battle(GAME_DATA, { party, encounter: one('guard'), seed: 1 });
    const e = b.enemies[0];
    expect(e.revealed).toBe(false);
    const ev = crackUntil(b, 'weak');
    expect(of(ev, 'reveal')).toHaveLength(1);
    expect(e.revealed).toBe(true);
    expect(b.hasStatus(e, 'exposed')).toBeTruthy();
    // 直されると〔解析〕が切れる（弱点が見えたことは残る）
    for (let t = 0; t < RELOCK_SEC + 1; t += 0.5) b.advanceUra(0.5, 'manual', { autoPick: false, careful: true });
    expect(b.hasStatus(e, 'exposed')).toBeFalsy();
    expect(e.revealed).toBe(true);
  });

  it('手で遊ぶと、自動より速く破れる（敵1体の装置をすべて破るまでの時間）', () => {
    const time = (mode: 'auto' | 'manual') => {
      const n = new HackNet([{ uid: 'e0', boss: false, machine: false }]);
      for (let t = 0; t < 120; t += 0.25) {
        n.update(0.25, mode, { autoPick: true, careful: true });
        if (n.nodes.filter((x) => x.enemy).every((x) => x.cracked)) return t;
      }
      return 999;
    };
    expect(time('manual')).toBeLessThan(time('auto') * 0.8);
  });

  it('光が来ている線を破り続けると、追跡ゲージが満タンになり、しめ出されて入口にもどる', () => {
    const n = new HackNet([{ uid: 'e0', boss: false, machine: false }]);
    // 光が通る線（入口→中継点0）を、光をよけずに破り続ける
    n.lights = [{ path: ['entry', 'r0'], pos: 0, speed: 0 }];
    n.choose('r0');
    for (let t = 0; t < 2 && n.lockout === 0; t += 0.05) n.update(0.05, 'manual');
    // 中継点は破れてしまうことがあるので、光をその先の線にも置いて確かめる
    n.lights = [{ path: ['r0', 'n0w'], pos: 0, speed: 0 }];
    if (n.lockout === 0) {
      n.choose('n0w');
      for (let t = 0; t < 5 && n.lockout === 0; t += 0.05) n.update(0.05, 'manual');
    }
    expect(n.lockout).toBeGreaterThan(0);
    expect(n.at).toBe('entry');
    for (let t = 0; t < LOCKOUT_SEC + 0.2; t += 0.1) n.update(0.1, 'manual');
    expect(n.lockout).toBe(0);
    expect(n.trace).toBe(0);
  });

  it('ボスは防壁でダメージが大きく減る。裏で防壁の装置を破ると消え、直されるともどる', () => {
    const b = new Battle(GAME_DATA, { party, encounter: one('boss_kurogane'), seed: 1 });
    const boss = b.enemies[0];
    expect(b.hasStatus(boss, 'firewall')).toBeTruthy();
    const ev = crackUntil(b, 'wall', 400);
    expect(of(ev, 'hack').some((h) => h.node === 'wall')).toBe(true);
    expect(b.hasStatus(boss, 'firewall')).toBeFalsy();
    for (let t = 0; t < RELOCK_SEC + 1; t += 0.5) b.advanceUra(0.5, 'manual', { autoPick: false, careful: true });
    expect(b.hasStatus(boss, 'firewall')).toBeTruthy();
  });

  it('機械の敵は、制御の装置を破ると乗っ取れて、次の番に動けない', () => {
    const b = new Battle(GAME_DATA, { party, encounter: one('robot'), seed: 1 });
    const robot = b.enemies[0];
    const net = b.net!;
    // 弱点 → 制御の順に破る
    for (const id of ['r0', 'n0w', 'n0c']) {
      net.choose(id);
      for (let i = 0; i < 100 && !net.node(id)!.cracked; i++) b.advanceUra(0.1, 'manual', { autoPick: false, careful: true });
    }
    expect(b.hasStatus(robot, 'hijacked')).toBeTruthy();
    for (const u of b.allies) u.av = 99999;
    robot.av = 0;
    const ev = b.nextTurn();
    expect(of(ev, 'action')).toHaveLength(0);
    expect(of(ev, 'warn')[0].text).toContain('乗っ取られて');
  });
});

describe('盗む', () => {
  it('アカリの通常攻撃は、敵の強化（ボスのため技）を盗んで止める。盗んだ物は味方に渡せる', () => {
    const b = new Battle(GAME_DATA, { party, encounter: one('boss_kurogane'), seed: 1 });
    const boss = b.enemies[0];
    const akari = b.allies.find((u) => u.defId === 'akari')!;
    b.addStatus(boss, boss, 'charging', 1, 1);
    b.phase = 'command';
    b.activeId = akari.uid;
    const ev = b.command('basic');
    expect(of(ev, 'steal')[0]).toMatchObject({ status: 'charging', got: true });
    expect(b.hasStatus(boss, 'charging')).toBeFalsy();
    expect(b.hasStatus(boss, 'firewall')).toBeTruthy(); // 防壁は盗めない
    expect(b.stolen).toBe(1);
    const e0 = akari.energy;
    b.useStolen(akari.uid);
    expect(b.stolen).toBe(0);
    expect(b.hasStatus(akari, 'stolen_power')).toBeTruthy();
    expect(akari.energy).toBeGreaterThan(e0);
  });
});

describe('合わせ技', () => {
  it('データ：3〜4種類。表＋表と表＋裏の両方があり、主人公2人だけのものではない。演出は組み合わせごとにちがう', () => {
    const list = Object.values(GAME_DATA.combos);
    expect(list.length).toBeGreaterThanOrEqual(3);
    expect(list.length).toBeLessThanOrEqual(4);
    for (const c of list) for (const m of c.members) expect(GAME_DATA.characters[m], c.id).toBeTruthy();
    const ura = (c: (typeof list)[number]) => c.members.some((m) => GAME_DATA.characters[m].ura);
    expect(list.some(ura)).toBe(true);
    expect(list.some((c) => !ura(c))).toBe(true);
    expect(list.some((c) => !(c.members.includes('akari') && c.members.includes('shin')))).toBe(true);
    const looks = new Set(list.map((c) => `${c.fx.camera}/${c.fx.effect}/${c.fx.color}`));
    expect(looks.size).toBe(list.length);
    expect(new Set(list.map((c) => c.fx.callout)).size).toBe(list.length);
  });

  it('2人とも出ていて、2人のゲージがたまっていると撃てる。撃つと2人のゲージが減る', () => {
    const b = new Battle(GAME_DATA, { party, encounter: one('robot'), seed: 1 });
    const akari = b.allies.find((u) => u.defId === 'akari')!;
    expect(b.combosAvailable().map((c) => c.id).sort()).toEqual(['guren_senpu', 'hyoran', 'ice_wall', 'zero_day']);
    b.hacker!.energy = 0;
    expect(b.canCombo('zero_day')).toBe(false); // シンのゲージがない
    b.hacker!.energy = 100;
    akari.energy = akari.energyMax;
    expect(b.canCombo('zero_day')).toBe(true);
    const ev = b.combo('zero_day');
    expect(of(ev, 'combo')[0].id).toBe('zero_day');
    expect(of(ev, 'reveal')).toHaveLength(1);
    expect(b.enemies[0].revealed).toBe(true);
    expect(akari.energy).toBeCloseTo(akari.energyMax / 2);
    expect(b.hacker!.energy).toBe(50);
  });

  it('組み合わせの人がいなければ、その合わせ技は出ない', () => {
    const b = new Battle(GAME_DATA, { party: ['akari', 'shin', 'yuki'].map((id) => ({ id, level: 30 })), encounter: one('robot'), seed: 1 });
    expect(b.combosAvailable().map((c) => c.id).sort()).toEqual(['ice_wall', 'zero_day']);
  });
});
