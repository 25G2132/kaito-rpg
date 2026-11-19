import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../data';
import { MANSION } from '../data/maps';
import { canSee, FieldState, inRect, segmentHitsRect } from './logic';
import type { MapDef, Vec2 } from './types';

const still = { move: [0, 0] as Vec2, run: false };

/** 見回りもカメラもいない、ためし用の部屋 */
function room(extra: Partial<MapDef> = {}): MapDef {
  return {
    ...MANSION,
    start: [2, 2],
    startDir: 0,
    walls: [{ x: 5, z: 0, w: 0.4, d: 10 }],
    doors: [],
    shadows: [],
    terminals: [],
    cameras: [],
    patrols: [],
    chests: [],
    boss: { pos: [50, 50], encounter: 'vault', name: '' },
    ...extra,
  };
}

describe('歩く', () => {
  it('壁は通れない（すべるように止まる）', () => {
    const f = new FieldState(room());
    for (let i = 0; i < 100; i++) f.update(0.05, { move: [1, 0], run: true });
    expect(f.pos[0]).toBeLessThan(5);
    expect(f.pos[0]).toBeGreaterThan(4);
  });

  it('閉まった扉は通れず、ハッキングで開くと通れる', () => {
    const f = new FieldState(
      room({
        walls: [],
        doors: [{ id: 'd', name: '扉', x: 5, z: 0, w: 0.4, d: 10 }],
        terminals: [{ id: 't', pos: [2.5, 2], targets: ['d'], hint: '' }],
      }),
    );
    for (let i = 0; i < 60; i++) f.update(0.05, { move: [1, 0], run: false });
    expect(f.pos[0]).toBeLessThan(5);
    f.pos = [2.5, 2];
    const ev = f.interact();
    expect(ev?.t).toBe('hacked');
    for (let i = 0; i < 80; i++) f.update(0.05, { move: [1, 0], run: false });
    expect(f.pos[0]).toBeGreaterThan(6);
  });
});

describe('見る・隠れる', () => {
  it('扇の中で、壁にさえぎられなければ見える', () => {
    const wall = { x: 4, z: 0, w: 1, d: 10 };
    expect(canSee([0, 5], 0, 1.2, 10, [3, 5], [wall])).toBe(true);
    expect(canSee([0, 5], 0, 1.2, 10, [8, 5], [wall])).toBe(false); // 壁の向こう
    expect(canSee([0, 5], Math.PI, 1.2, 10, [3, 5], [])).toBe(false); // 後ろ
    expect(canSee([0, 5], 0, 1.2, 2, [3, 5], [])).toBe(false); // 遠い
    expect(segmentHitsRect([0, 0], [10, 0], { x: 4, z: -1, w: 1, d: 2 })).toBe(true);
  });

  it('見回りに見られ続けると見つかる。影の中なら見つからない', () => {
    const patrol = { id: 'p', encounter: 'field_garden', look: 'guard', route: [[0, 2], [0.01, 2]] as Vec2[], speed: 0, fov: 1.6, range: 8 };
    const seen = new FieldState(room({ start: [3, 2], patrols: [patrol] }));
    seen.patrols[0].dir = 0;
    const ev = Array.from({ length: 20 }, () => seen.update(0.05, still)).flat();
    expect(ev.some((e) => e.t === 'spotted')).toBe(true);

    const hidden = new FieldState(room({ start: [3, 2], patrols: [patrol], shadows: [{ x: 2, z: 1, w: 2, d: 2 }] }));
    hidden.patrols[0].dir = 0;
    const ev2 = Array.from({ length: 20 }, () => hidden.update(0.05, still)).flat();
    expect(ev2.some((e) => e.t === 'spotted')).toBe(false);
  });

  it('カメラに見つかると、近くの見回りが追いかけてくる。ハッキングで止まる', () => {
    const cam = { id: 'c', pos: [0, 2] as Vec2, dir: 0, sweep: 0, period: 5, fov: 1.2, range: 8 };
    const patrol = { id: 'p', encounter: 'field_garden', look: 'guard', route: [[3, 9], [4, 9]] as Vec2[], speed: 1, fov: 1, range: 2 };
    const f = new FieldState(room({ start: [3, 2], cameras: [cam], patrols: [patrol], terminals: [{ id: 't', pos: [3, 2.5], targets: ['c'], hint: '' }] }));
    const ev = Array.from({ length: 20 }, () => f.update(0.05, still)).flat();
    const alarm = ev.find((e) => e.t === 'alarm');
    expect(alarm && alarm.t === 'alarm' && alarm.alerted).toEqual(['p']);
    expect(f.patrols[0].alerted).toBe(true);

    const g = new FieldState(room({ start: [3, 2], cameras: [cam], terminals: [{ id: 't', pos: [3, 2.5], targets: ['c'], hint: '' }] }));
    g.interact();
    const ev2 = Array.from({ length: 30 }, () => g.update(0.05, still)).flat();
    expect(ev2.some((e) => e.t === 'alarm')).toBe(false);
  });
});

describe('戦いの始まり方', () => {
  const route: Vec2[] = [[4, 2], [4.01, 2]];
  it('気づかれていない敵を後ろから攻撃すると、先制（有利）', () => {
    const f = new FieldState(room({ walls: [], start: [3, 2], patrols: [{ id: 'p', encounter: 'field_garden', look: 'guard', route, speed: 0, fov: 1, range: 5 }] }));
    f.patrols[0].dir = 0; // 向こうを向いている
    f.dir = 0;
    const ev = f.attack();
    expect(ev).toEqual({ t: 'battle', patrol: 'p', encounter: 'field_garden', opening: 'ambush' });
  });

  it('見つかってぶつかられると、敵が有利', () => {
    const f = new FieldState(room({ walls: [], start: [3, 2], patrols: [{ id: 'p', encounter: 'field_garden', look: 'guard', route: [[8, 2], [8.01, 2]], speed: 0, fov: 2, range: 10 }] }));
    f.patrols[0].dir = Math.PI; // こちらを見ている
    const ev = Array.from({ length: 80 }, () => f.update(0.05, still)).flat();
    const b = ev.find((e) => e.t === 'battle');
    expect(b && b.t === 'battle' && b.opening).toBe('surprised');
  });

  it('攻撃が届かなければ空ぶり。倒した見回りは消える', () => {
    const f = new FieldState(room({ walls: [], start: [0.5, 2], patrols: [{ id: 'p', encounter: 'field_garden', look: 'guard', route, speed: 0, fov: 1, range: 1 }] }));
    expect(f.attack().t).toBe('miss');
    f.defeat('p');
    expect(f.patrols[0].defeated).toBe(true);
  });
});

describe('黒金邸のデータ', () => {
  it('はじめの位置・宝箱・端末・ボスは壁の中になく、戦いの相手がすべて見つかる', () => {
    const f = new FieldState(MANSION);
    const solids = f.solids();
    const pts: Vec2[] = [MANSION.start, MANSION.boss.pos, ...MANSION.chests.map((c) => c.pos), ...MANSION.terminals.map((t) => t.pos)];
    for (const p of pts) expect(solids.some((r) => inRect(p, r)), String(p)).toBe(false);
    for (const p of MANSION.patrols) expect(GAME_DATA.encounters[p.encounter], p.encounter).toBeTruthy();
    expect(GAME_DATA.encounters[MANSION.boss.encounter]).toBeTruthy();
    // 扉とカメラは、どれかの端末で止められる
    const targets = new Set(MANSION.terminals.flatMap((t) => t.targets));
    for (const d of MANSION.doors) expect(targets.has(d.id), d.id).toBe(true);
    for (const c of MANSION.cameras) expect(targets.has(c.id), c.id).toBe(true);
  });

  it('扉を開けないと奥へ行けない（はじめの位置から歩いて金庫室の前に着けない）', () => {
    // 4方向に歩き回っても、資料室には入れない
    const f = new FieldState(MANSION);
    const dirs: Vec2[] = [[0, 1], [1, 0], [0, 1], [1, 0], [0, -1], [1, 0]];
    for (const d of dirs) for (let i = 0; i < 120; i++) f.moveBy(d[0] * 0.15, d[1] * 0.15);
    expect(f.pos[0]).toBeLessThan(16);
  });
});
