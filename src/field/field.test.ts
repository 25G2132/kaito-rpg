import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../data';
import { MANSION, MAPS, SCHOOL_START, SCHOOL_ZONES, TOWN_START, TOWN_ZONES } from '../data/maps';
import { canSee, FieldState, inRect, LENS_RANGE, LENS_TIME, LINK_RANGE, PLAYER_RADIUS, segmentHitsRect } from './logic';
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

describe('黒金邸：端末は影の中', () => {
  it('どの端末も、影の中に立ったまま調べられる（隠れたままハッキングできる）', () => {
    for (const t of MANSION.terminals) {
      const f = new FieldState(MANSION);
      // 端末のまわりで、影の中かつ調べられる場所があるか
      let ok = false;
      for (let dx = -1.5; dx <= 1.5 && !ok; dx += 0.25) {
        for (let dz = -1.5; dz <= 1.5 && !ok; dz += 0.25) {
          f.pos = [t.pos[0] + dx, t.pos[1] + dz];
          if (f.inShadow() && f.nearby()?.kind === 'terminal' && !f.solids().some((r) => inRect(f.pos, r))) ok = true;
        }
      }
      expect(ok, t.id).toBe(true);
    }
  });
});

const slots = ['morning', 'lunch', 'after'] as const;

/** 体が置ける点か（壁から体の半径だけ離れている） */
const freeAt = (f: FieldState, p: Vec2) =>
  !f.map.walls.some((r) => r.x - PLAYER_RADIUS < p[0] && p[0] < r.x + r.w + PLAYER_RADIUS && r.z - PLAYER_RADIUS < p[1] && p[1] < r.z + r.d + PLAYER_RADIUS);

/** start から歩いて行ける点を、細かいます目で調べる */
function reachable(map: MapDef, from: Vec2): (p: Vec2, within?: number) => boolean {
  const f = new FieldState({ ...map, npcs: [] });
  const step = 0.25;
  const key = (x: number, z: number) => `${x},${z}`;
  const seen = new Set<string>();
  const ix0 = Math.round(from[0] / step);
  const iz0 = Math.round(from[1] / step);
  const queue: [number, number][] = [[ix0, iz0]];
  seen.add(key(ix0, iz0));
  while (queue.length) {
    const [ix, iz] = queue.pop()!;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = ix + dx;
      const nz = iz + dz;
      if (seen.has(key(nx, nz)) || nx < -4 || nz < -4 || nx > 400 || nz > 400) continue;
      if (!freeAt(f, [nx * step, nz * step])) continue;
      seen.add(key(nx, nz));
      queue.push([nx, nz]);
    }
  }
  return (p, within = 1.4) => {
    for (const k of seen) {
      const [x, z] = k.split(',').map(Number);
      if (Math.hypot(x * step - p[0], z * step - p[1]) <= within) return true;
    }
    return false;
  };
}

describe('学校と街：場所に分かれ、出入り口で行き来する', () => {
  const zones = [...SCHOOL_ZONES, ...TOWN_ZONES];

  it('出入り口は、行き先があり、帰りの出入り口もある。着く所は壁の外で、出入り口から離れている', () => {
    for (const z of zones) {
      for (const k of z.links ?? []) {
        const to = MAPS[k.to];
        expect(to, `${z.id}→${k.to}`).toBeTruthy();
        expect((to.links ?? []).some((b) => b.to === z.id), `${k.to} から ${z.id} へもどれる`).toBe(true);
        const f = new FieldState(to);
        expect(freeAt(f, k.at), `${z.id}→${k.to} 着く所`).toBe(true);
        for (const b of to.links ?? []) expect(Math.hypot(b.pos[0] - k.at[0], b.pos[1] - k.at[1]), `${z.id}→${k.to}`).toBeGreaterThan(LINK_RANGE + 0.5);
      }
    }
  });

  it('どの場所でも、着いた所から、出入り口・出口・つり場・隠し要素・人のそばまで歩ける', () => {
    for (const z of zones) {
      const from = z.start;
      const can = reachable(z, from);
      const pts: [string, Vec2][] = [
        ...(z.links ?? []).map((k) => [`link ${k.label}`, k.pos] as [string, Vec2]),
        ...(z.exit ? [['exit', z.exit.pos] as [string, Vec2]] : []),
        ...(z.spots ?? []).map((s) => [s.id, s.pos] as [string, Vec2]),
        ...(z.hidden ?? []).map((h) => [h.id, h.pos] as [string, Vec2]),
      ];
      for (const slot of slots) {
        const f = new FieldState(z, slot);
        for (const n of f.npcs.filter((x) => x.present)) pts.push([`${slot} ${n.def.id}`, n.pos]);
      }
      for (const [name, p] of pts) expect(can(p), `${z.id} ${name}`).toBe(true);
    }
  });

  it('同じ時間に、同じ人が2か所にいない。学校の仲間は時間で場所が変わる', () => {
    for (const group of [SCHOOL_ZONES, TOWN_ZONES]) {
      for (const slot of slots) {
        const ids = group.flatMap((z) => (z.npcs ?? []).filter((n) => n.at[slot]).map((n) => n.id));
        expect(new Set(ids).size, slot).toBe(ids.length);
      }
    }
    const where = (slot: (typeof slots)[number]) => SCHOOL_ZONES.find((z) => z.npcs?.some((n) => n.id === 'shin' && n.at[slot]))?.id;
    expect(where('morning')).not.toBe(where('lunch'));
    const shop = SCHOOL_ZONES.flatMap((z) => z.npcs ?? []).find((n) => n.id === 'shop')!;
    expect(shop.at.after).toBeUndefined();
  });

  it('どの時間のどの人にも、立てる場所から話しかけられる。人は壁の中にいない', () => {
    for (const z of zones) {
      for (const slot of slots) {
        const f = new FieldState(z, slot);
        for (const n of f.npcs.filter((x) => x.present)) {
          if (n.def.charId) expect(GAME_DATA.characters[n.def.charId], n.def.id).toBeTruthy();
          expect(z.walls.some((r) => inRect(n.pos, r)), `${z.id} ${slot} ${n.def.id}`).toBe(false);
          for (const p of n.def.at[slot]?.route ?? []) expect(z.walls.some((r) => inRect(p, r)), `${slot} ${n.def.id} 道`).toBe(false);
          let ok = false;
          for (let dx = -1.6; dx <= 1.6 && !ok; dx += 0.2) {
            for (let dz = -1.6; dz <= 1.6 && !ok; dz += 0.2) {
              f.pos = [n.pos[0] + dx, n.pos[1] + dz];
              const free = !f.solids().some((r) => r.x - 0.35 < f.pos[0] && f.pos[0] < r.x + r.w + 0.35 && r.z - 0.35 < f.pos[1] && f.pos[1] < r.z + r.d + 0.35);
              const it = f.nearby();
              if (free && it?.kind === 'npc' && it.def.id === n.def.id) ok = true;
            }
          }
          expect(ok, `${z.id} ${slot} ${n.def.id}`).toBe(true);
        }
      }
    }
  });

  it('学校は2階の教室から始まり、1階の昇降口で下校できる。街は駅前から始まり、駅前で家に帰れる', () => {
    expect(MAPS[SCHOOL_START].areas[0].name).toBe('教室 1-A');
    const exitZone = SCHOOL_ZONES.find((z) => z.exit)!;
    expect(exitZone.id).toBe('school_1f');
    const f = new FieldState(exitZone);
    f.pos = [exitZone.exit!.pos[0] + 0.5, exitZone.exit!.pos[1]];
    expect(f.interact()).toEqual({ t: 'exit' });
    expect(MAPS[TOWN_START].exit).toBeTruthy();
  });

  it('出入り口に歩いて入ると、ほかの場所へ移る合図が出る', () => {
    const z = MAPS[SCHOOL_START];
    const k = z.links![0];
    const f = new FieldState({ ...z, npcs: [] });
    f.pos = [k.pos[0] + 1.2, k.pos[1]];
    let ev: ReturnType<FieldState['update']> = [];
    for (let i = 0; i < 30 && !ev.some((e) => e.t === 'link'); i++) ev = f.update(0.05, { move: [-1, 0], run: false });
    expect(ev.find((e) => e.t === 'link')).toMatchObject({ t: 'link', link: { to: k.to } });
  });

  it('歩きまわる人は、道にそって動く', () => {
    const z = MAPS.school_2f;
    const f = new FieldState(z, 'lunch');
    const teacher = f.npcs.find((n) => n.def.id === 'teacher')!;
    const p0 = [...teacher.pos];
    f.pos = [11, 4]; // 教室の中（遠く）
    for (let i = 0; i < 40; i++) f.update(0.05, still);
    expect(teacher.pos).not.toEqual(p0);
  });

  it('仲間の体はすり抜けない', () => {
    const z = MAPS[SCHOOL_START];
    const n = z.npcs!.find((x) => x.at.morning)!;
    const at = n.at.morning!;
    const f = new FieldState({ ...z, start: [at.pos[0] - 2, at.pos[1]], walls: [], links: [], npcs: [n] }, 'morning');
    for (let i = 0; i < 60; i++) f.update(0.05, { move: [1, 0], run: false });
    expect(f.pos[0]).toBeLessThan(at.pos[0]);
  });
});

describe('解析レンズと隠し要素', () => {
  const free = (f: FieldState) => !f.solids().some((r) => r.x - 0.35 < f.pos[0] && f.pos[0] < r.x + r.w + 0.35 && r.z - 0.35 < f.pos[1] && f.pos[1] < r.z + r.d + 0.35);

  const lib = MAPS.school_1f;
  const libH = lib.hidden![0];
  it('レンズを開いて、隠れたものに重ね続けると見つかる。見えたら拾える', () => {
    const h = libH;
    const f = new FieldState(lib);
    f.pos = [h.pos[0] + 0.8, h.pos[1] - 0.6];
    expect(f.hiddenNearby()).toBe(true);
    f.update(0.05, still);
    expect(f.nearby()?.kind).not.toBe('hidden');
    f.lensOn = true;
    // 重ねていないと見つからない
    for (let t = 0; t < LENS_TIME * 2; t += 0.1) expect(f.update(0.1, still).some((e) => e.t === 'found')).toBe(false);
    // 少し重ねて、はずすと、たまった分が減る
    f.update(LENS_TIME / 2, { ...still, lens: h.id });
    f.update(LENS_TIME / 2, still);
    expect(f.lensProgress).toBe(0);
    // 重ね続けると見つかる
    let ev: ReturnType<FieldState['update']> = [];
    for (let t = 0; t < LENS_TIME + 0.2 && !ev.length; t += 0.1) ev = f.update(0.1, { ...still, lens: h.id });
    expect(ev.some((e) => e.t === 'found' && e.id === h.id)).toBe(true);
    const p = f.interact();
    expect(p?.t).toBe('pickup');
    expect(f.collected.has(h.id)).toBe(true);
    expect(f.hiddenNearby()).toBe(false);
  });

  it('もう拾ったものは、次に来ても出てこない。遠すぎると、重ねても見つからない', () => {
    const h = libH;
    const f = new FieldState(lib, 'morning', [h.id]);
    f.pos = [h.pos[0] + 0.8, h.pos[1] - 0.6];
    f.lensOn = true;
    for (let t = 0; t < LENS_TIME * 2; t += 0.1) expect(f.update(0.1, { ...still, lens: h.id }).some((e) => e.t === 'found')).toBe(false);
    const g = new FieldState(lib);
    g.pos = [Math.min(29, h.pos[0] + LENS_RANGE + 2), 2];
    g.lensOn = true;
    for (let t = 0; t < LENS_TIME * 2; t += 0.1) expect(g.update(0.1, { ...still, lens: h.id }).some((e) => e.t === 'found')).toBe(false);
  });

  it('レンズの間は歩かない', () => {
    const f = new FieldState(lib);
    const p0 = [...f.pos];
    f.lensOn = true;
    for (let i = 0; i < 20; i++) f.update(0.05, { move: [1, 0], run: false });
    expect(f.pos).toEqual(p0);
  });

  it('隠れた敵は戦いになる。どの隠し要素も、立てる場所から調べられる', () => {
    for (const map of Object.values(MAPS)) {
      for (const h of map.hidden ?? []) {
        if (h.kind === 'enemy') expect(GAME_DATA.encounters[h.encounter!], h.id).toBeTruthy();
        const f = new FieldState(map, 'morning');
        f.revealed.add(h.id);
        let ok = false;
        for (let dx = -1.5; dx <= 1.5 && !ok; dx += 0.25) {
          for (let dz = -1.5; dz <= 1.5 && !ok; dz += 0.25) {
            f.pos = [h.pos[0] + dx, h.pos[1] + dz];
            const it = f.nearby();
            if (free(f) && it?.kind === 'hidden' && it.def.id === h.id) ok = true;
          }
        }
        expect(ok, h.id).toBe(true);
        if (h.kind === 'enemy') expect(f.interact()?.t).toBe('hiddenBattle');
      }
    }
  });
});
