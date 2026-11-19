// 歩く場所の計算。画面とは切り離してあり、自動テストで確かめる。
// 歩く・壁にぶつかる・見回りとカメラが見る・影に隠れる・ハッキング・宝箱・戦いの始まり方。

import type { Opening } from '../battle/battle';
import type { CameraDef, ChestDef, HiddenDef, MapDef, NpcDef, PatrolDef, Rect, Slot, TerminalDef, Vec2 } from './types';

export const PLAYER_RADIUS = 0.35;
export const WALK_SPEED = 3.0;
export const RUN_SPEED = 5.5;
export const CHASE_SPEED = 3.6;
export const SPOT_TIME = 0.5; // 見られ続けて、この秒数で見つかる
export const CAMERA_SPOT_TIME = 0.8;
export const LOSE_TIME = 4; // 見失って、この秒数で見回りにもどる
export const CONTACT_RANGE = 0.9; // 敵とぶつかる近さ
export const ATTACK_RANGE = 1.7; // 攻撃が届く近さ
export const ATTACK_ANGLE = 1.2; // 攻撃が届く角度（片側、ラジアン）
export const INTERACT_RANGE = 1.6;
export const HEAR_RANGE = 1.6;
export const LENS_RANGE = 6; // 解析レンズで見える近さ
export const HINT_RANGE = 7; // これより近いと、レンズのボタンが知らせる // 影の中でも、これより近いと気づかれる（走っているとき）

export const inRect = (p: Vec2, r: Rect) => p[0] >= r.x && p[0] <= r.x + r.w && p[1] >= r.z && p[1] <= r.z + r.d;
const dist = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const angleDiff = (a: number, b: number) => {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
};

/** 円（体）が四角と重なるか */
export function circleHitsRect(p: Vec2, r: number, rect: Rect): boolean {
  const cx = Math.max(rect.x, Math.min(p[0], rect.x + rect.w));
  const cz = Math.max(rect.z, Math.min(p[1], rect.z + rect.d));
  return (p[0] - cx) ** 2 + (p[1] - cz) ** 2 < r * r;
}

/** 線分が四角を通るか（見通しを壁がさえぎるか） */
export function segmentHitsRect(a: Vec2, b: Vec2, rect: Rect): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const clip = (p: number, q: number) => {
    if (p === 0) return q >= 0;
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  return (
    clip(-dx, a[0] - rect.x) &&
    clip(dx, rect.x + rect.w - a[0]) &&
    clip(-dz, a[1] - rect.z) &&
    clip(dz, rect.z + rect.d - a[1]) &&
    t0 <= t1
  );
}

/** 扇の形の見張りで、相手が見えるか（壁でさえぎられる） */
export function canSee(from: Vec2, dir: number, fov: number, range: number, target: Vec2, blockers: Rect[]): boolean {
  if (dist(from, target) > range) return false;
  const ang = Math.atan2(target[1] - from[1], target[0] - from[0]);
  if (Math.abs(angleDiff(ang, dir)) > fov / 2) return false;
  // 低い生け垣・本棚も見通しをさえぎる（かがんで隠れる）
  return !blockers.some((r) => segmentHitsRect(from, target, r));
}

export type FieldEvent =
  | { t: 'spotted'; by: string } // 見回りに見つかった
  | { t: 'alarm'; camera: string; alerted: string[] } // カメラに見つかった（近くの見回りが来る）
  | { t: 'lost'; by: string } // 見失った
  | { t: 'battle'; patrol: string; encounter: string; opening: Opening }
  | { t: 'chest'; chest: string; items: Record<string, number> }
  | { t: 'hacked'; terminal: string; targets: string[] }
  | { t: 'boss' }
  | { t: 'talk'; npc: string } // 人に話しかけた（npc は NpcDef の id）
  | { t: 'exit' } // 出口
  | { t: 'spot'; id: string } // つりなど
  | { t: 'found'; id: string; text: string } // レンズで見つけた
  | { t: 'pickup'; id: string; items: Record<string, number>; text: string } // 隠れた材料を拾った
  | { t: 'hiddenBattle'; id: string; encounter: string; text: string } // 隠れた敵
  | { t: 'miss' }; // 攻撃が空ぶり

export interface PatrolState {
  def: PatrolDef;
  pos: Vec2;
  dir: number;
  wp: number; // 向かっている道の点
  suspicion: number; // 見られている時間
  alerted: boolean;
  lostTimer: number;
  defeated: boolean;
}

export interface NpcState {
  def: NpcDef;
  pos: Vec2;
  dir: number;
  wp: number;
  present: boolean; // いまの時間にいるか
}

export const NPC_WALK = 1.1;

export interface CameraState {
  def: CameraDef;
  dir: number;
  suspicion: number;
  disabled: boolean;
}

export interface FieldInput {
  move: Vec2; // スティック（長さ 0〜1。x＝右、z＝前。カメラの向きで回したもの）
  run: boolean;
}

export type Interactable =
  | { kind: 'chest'; def: ChestDef }
  | { kind: 'terminal'; def: TerminalDef }
  | { kind: 'boss' }
  | { kind: 'npc'; def: NpcDef }
  | { kind: 'exit'; label: string }
  | { kind: 'hidden'; def: HiddenDef }
  | { kind: 'spot'; id: string; label: string };

export class FieldState {
  readonly map: MapDef;
  pos: Vec2;
  dir: number;
  time = 0;
  patrols: PatrolState[];
  cameras: CameraState[];
  openDoors = new Set<string>();
  hacked = new Set<string>();
  opened = new Set<string>();

  slot: Slot;
  npcs: NpcState[] = [];

  /** 解析レンズ */
  lensOn = false;
  revealed = new Set<string>(); // レンズで見えた隠し要素
  collected: Set<string>; // もう拾った・倒した隠し要素（保存から）

  constructor(map: MapDef, slot: Slot = 'morning', collected: Iterable<string> = []) {
    this.collected = new Set(collected);
    this.map = map;
    this.slot = slot;
    this.pos = [...map.start];
    this.dir = map.startDir;
    this.patrols = map.patrols.map((def) => ({
      def,
      pos: [...def.route[0]] as Vec2,
      dir: 0,
      wp: 1 % def.route.length,
      suspicion: 0,
      alerted: false,
      lostTimer: 0,
      defeated: false,
    }));
    this.cameras = map.cameras.map((def) => ({ def, dir: def.dir, suspicion: 0, disabled: false }));
    this.npcs = (map.npcs ?? []).map((def) => ({ def, pos: [0, 0] as Vec2, dir: 0, wp: 0, present: false }));
    this.setSlot(slot);
  }

  /** 時間が変わる：人の居場所を入れかえる */
  setSlot(slot: Slot): void {
    this.slot = slot;
    for (const n of this.npcs) {
      const at = n.def.at[slot];
      n.present = !!at;
      if (at) {
        n.pos = [...at.pos];
        n.dir = at.dir;
        n.wp = 0;
      }
    }
  }

  /** 体がぶつかるもの（壁と、閉まっている扉） */
  solids(): Rect[] {
    // 話しかけられる人も、ぶつかる（すり抜けない）
    const people = this.npcs.filter((n) => n.present).map((n) => ({ x: n.pos[0] - 0.3, z: n.pos[1] - 0.3, w: 0.6, d: 0.6 }));
    return [...this.map.walls, ...this.map.doors.filter((d) => !this.openDoors.has(d.id)), ...people];
  }

  inShadow(p: Vec2 = this.pos): boolean {
    return this.map.shadows.some((s) => inRect(p, s));
  }

  /** 壁にぶつかりながら動く（x と z を分けて動かし、ぶつかる向きだけ止める） */
  moveBy(dx: number, dz: number): void {
    const solids = this.solids();
    const hits = (p: Vec2) => solids.some((r) => circleHitsRect(p, PLAYER_RADIUS, r));
    const nx: Vec2 = [this.pos[0] + dx, this.pos[1]];
    if (!hits(nx)) this.pos = nx;
    const nz: Vec2 = [this.pos[0], this.pos[1] + dz];
    if (!hits(nz)) this.pos = nz;
  }

  /** 1コマぶん進める。起きたことを返す */
  update(dt: number, input: FieldInput): FieldEvent[] {
    const ev: FieldEvent[] = [];
    this.time += dt;
    // 自分
    const len = Math.min(1, Math.hypot(input.move[0], input.move[1]));
    const running = input.run && len > 0.1;
    if (len > 0.05) {
      const speed = (running ? RUN_SPEED : WALK_SPEED) * len;
      const nx = input.move[0] / Math.hypot(input.move[0], input.move[1]);
      const nz = input.move[1] / Math.hypot(input.move[0], input.move[1]);
      this.moveBy(nx * speed * dt, nz * speed * dt);
      this.dir = Math.atan2(nz, nx);
    }
    // 歩きまわる人（近くにいると立ち止まる）
    for (const n of this.npcs) {
      const route = n.def.at[this.slot]?.route;
      if (!n.present || !route?.length || dist(n.pos, this.pos) < 2.2) continue;
      const t = route[n.wp % route.length];
      const tx = t[0] - n.pos[0];
      const tz = t[1] - n.pos[1];
      const tl = Math.hypot(tx, tz);
      if (tl < 0.1) n.wp = (n.wp + 1) % route.length;
      else {
        const step = Math.min(tl, NPC_WALK * dt);
        n.pos = [n.pos[0] + (tx / tl) * step, n.pos[1] + (tz / tl) * step];
        n.dir = Math.atan2(tz, tx);
      }
    }
    // 解析レンズ：近くの隠し要素が見える
    if (this.lensOn) {
      for (const h of this.map.hidden ?? []) {
        if (this.collected.has(h.id) || this.revealed.has(h.id)) continue;
        if (dist(h.pos, this.pos) <= LENS_RANGE) {
          this.revealed.add(h.id);
          ev.push({ t: 'found', id: h.id, text: h.text });
        }
      }
    }
    const hidden = this.inShadow();
    const blockers = this.solids();

    // カメラ
    for (const c of this.cameras) {
      if (c.disabled) continue;
      c.dir = c.def.dir + Math.sin((this.time / c.def.period) * Math.PI * 2) * c.def.sweep;
      const sees = !hidden && canSee(c.def.pos, c.dir, c.def.fov, c.def.range, this.pos, blockers);
      c.suspicion = sees ? c.suspicion + dt : Math.max(0, c.suspicion - dt);
      if (c.suspicion >= CAMERA_SPOT_TIME) {
        c.suspicion = 0;
        // 一番近い、倒していない見回りが追いかけてくる
        const near = this.patrols.filter((p) => !p.defeated).sort((a, b) => dist(a.pos, this.pos) - dist(b.pos, this.pos))[0];
        const alerted: string[] = [];
        if (near && !near.alerted) {
          near.alerted = true;
          near.lostTimer = 0;
          alerted.push(near.def.id);
        }
        ev.push({ t: 'alarm', camera: c.def.id, alerted });
      }
    }

    // 見回り
    for (const p of this.patrols) {
      if (p.defeated) continue;
      const d = dist(p.pos, this.pos);
      const heard = running && d < HEAR_RANGE;
      const sees = (!hidden && canSee(p.pos, p.dir, p.def.fov, p.def.range, this.pos, blockers)) || heard;
      if (!p.alerted) {
        p.suspicion = sees ? p.suspicion + dt : Math.max(0, p.suspicion - dt * 0.5);
        if (p.suspicion >= SPOT_TIME) {
          p.alerted = true;
          p.lostTimer = 0;
          ev.push({ t: 'spotted', by: p.def.id });
        }
      } else {
        p.lostTimer = sees || d < 3 ? 0 : p.lostTimer + dt;
        if (p.lostTimer >= LOSE_TIME) {
          p.alerted = false;
          p.suspicion = 0;
          ev.push({ t: 'lost', by: p.def.id });
        }
      }
      // 歩く：見つけていれば追いかけ、いなければ決まった道
      const target: Vec2 = p.alerted ? this.pos : p.def.route[p.wp];
      const speed = p.alerted ? CHASE_SPEED : p.def.speed;
      const tx = target[0] - p.pos[0];
      const tz = target[1] - p.pos[1];
      const tl = Math.hypot(tx, tz);
      if (tl > 0.05) {
        const step = Math.min(tl, speed * dt);
        p.pos = [p.pos[0] + (tx / tl) * step, p.pos[1] + (tz / tl) * step];
        p.dir = Math.atan2(tz, tx);
      }
      if (!p.alerted && tl < 0.1) p.wp = (p.wp + 1) % p.def.route.length;
      // ぶつかった：見つかっていれば敵が有利
      if (dist(p.pos, this.pos) < CONTACT_RANGE) {
        ev.push({ t: 'battle', patrol: p.def.id, encounter: p.def.encounter, opening: p.alerted ? 'surprised' : 'normal' });
        break;
      }
    }
    return ev;
  }

  /** 攻撃：前にいる敵に当たれば戦い。気づかれていなければ先制（有利） */
  attack(): FieldEvent {
    const target = this.patrols
      .filter((p) => !p.defeated && dist(p.pos, this.pos) <= ATTACK_RANGE)
      .filter((p) => Math.abs(angleDiff(Math.atan2(p.pos[1] - this.pos[1], p.pos[0] - this.pos[0]), this.dir)) <= ATTACK_ANGLE)
      .sort((a, b) => dist(a.pos, this.pos) - dist(b.pos, this.pos))[0];
    if (!target) return { t: 'miss' };
    return { t: 'battle', patrol: target.def.id, encounter: target.def.encounter, opening: target.alerted ? 'normal' : 'ambush' };
  }

  /** 戦いのあと：勝ったら見回りは消える。負けたら呼ぶ側で終わりにする */
  defeat(patrolId: string): void {
    const p = this.patrols.find((x) => x.def.id === patrolId);
    if (p) p.defeated = true;
    // ほかの見回りも、いったん落ち着く
    for (const q of this.patrols) {
      q.alerted = false;
      q.suspicion = 0;
    }
  }

  /** 近くにある、調べられるもの */
  nearby(): Interactable | null {
    const cands: { d: number; it: Interactable }[] = [];
    for (const c of this.map.chests) if (!this.opened.has(c.id)) cands.push({ d: dist(c.pos, this.pos), it: { kind: 'chest', def: c } });
    for (const t of this.map.terminals) if (!this.hacked.has(t.id)) cands.push({ d: dist(t.pos, this.pos), it: { kind: 'terminal', def: t } });
    if (this.map.boss) cands.push({ d: dist(this.map.boss.pos, this.pos), it: { kind: 'boss' } });
    for (const n of this.npcs) if (n.present) cands.push({ d: dist(n.pos, this.pos), it: { kind: 'npc', def: n.def } });
    if (this.map.exit) cands.push({ d: dist(this.map.exit.pos, this.pos), it: { kind: 'exit', label: this.map.exit.label } });
    for (const sp of this.map.spots ?? []) cands.push({ d: dist(sp.pos, this.pos), it: { kind: 'spot', id: sp.id, label: sp.label } });
    for (const h of this.map.hidden ?? []) {
      if (this.revealed.has(h.id) && !this.collected.has(h.id)) cands.push({ d: dist(h.pos, this.pos), it: { kind: 'hidden', def: h } });
    }
    const best = cands.filter((c) => c.d <= INTERACT_RANGE).sort((a, b) => a.d - b.d)[0];
    return best?.it ?? null;
  }

  /** 調べる（宝箱を開ける・ハッキングする・ボスに挑む） */
  interact(): FieldEvent | null {
    const it = this.nearby();
    if (!it) return null;
    if (it.kind === 'chest') {
      this.opened.add(it.def.id);
      return { t: 'chest', chest: it.def.id, items: { ...it.def.items } };
    }
    if (it.kind === 'terminal') {
      this.hacked.add(it.def.id);
      for (const id of it.def.targets) {
        const cam = this.cameras.find((c) => c.def.id === id);
        if (cam) cam.disabled = true;
        if (this.map.doors.some((d) => d.id === id)) this.openDoors.add(id);
      }
      return { t: 'hacked', terminal: it.def.id, targets: [...it.def.targets] };
    }
    if (it.kind === 'npc') return { t: 'talk', npc: it.def.id };
    if (it.kind === 'exit') return { t: 'exit' };
    if (it.kind === 'spot') return { t: 'spot', id: it.id };
    if (it.kind === 'hidden') {
      if (it.def.kind === 'enemy') return { t: 'hiddenBattle', id: it.def.id, encounter: it.def.encounter!, text: it.def.text };
      this.collected.add(it.def.id);
      return { t: 'pickup', id: it.def.id, items: { ...(it.def.items ?? {}) }, text: it.def.text };
    }
    return { t: 'boss' };
  }

/** まだ見つけていない隠し要素が近くにあるか（レンズのボタンを光らせる） */
  hiddenNearby(): boolean {
    return (this.map.hidden ?? []).some((h) => !this.collected.has(h.id) && !this.revealed.has(h.id) && dist(h.pos, this.pos) <= HINT_RANGE);
  }

  /** いまいる場所の名前 */
  areaName(): string {
    return this.map.areas.find((a) => inRect(this.pos, a))?.name ?? '';
  }
}
