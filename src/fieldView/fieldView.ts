import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import type { LookDef } from '../battle/types';
import { ENEMIES } from '../data/enemies';
import { ActorView } from '../battleView/actor';
import { LENS_RANGE, segmentHitsRect, type FieldState } from '../field/logic';
import type { NpcDef, PropDef, Rect } from '../field/types';
import { CHARACTERS } from '../data/characters';

// 歩く場所の3D。形はすべてプログラムで作る（外の素材なし）。
// 見回りとカメラの「見える範囲」は床に扇の形で出す。影は床の暗い部分。

const WALL_COLORS = { wall: 0x4a4458, hedge: 0x2f5a35, shelf: 0x5a4632, desk: 0x8a6a48, locker: 0x5f8fd0, water: 0x3a8fd8, shopfront: 0xd98c5f } as const;
const PITCH = 0.95; // カメラの見下ろす角度
const CAM_DIST = 8.5;

function fan(range: number, fov: number, color: number): THREE.Mesh {
  const geo = new THREE.CircleGeometry(range, 24, -fov / 2, fov);
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false }));
  m.position.y = 0.03;
  return m;
}

const box = (r: Rect, h: number, color: number, y0 = 0): THREE.Mesh => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(r.w, h, r.d), new THREE.MeshStandardMaterial({ color, roughness: 0.85 }));
  m.position.set(r.x + r.w / 2, y0 + h / 2, r.z + r.d / 2);
  return m;
};

export class FieldView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 120);
  yaw = -Math.PI / 2; // カメラが主人公のどちら側にいるか
  private state: FieldState;
  private player: ActorView;
  private patrols = new Map<string, { actor: ActorView; cone: THREE.Mesh; mark: THREE.Sprite }>();
  private cams = new Map<string, { cone: THREE.Mesh; head: THREE.Mesh }>();
  private doors = new Map<string, THREE.Mesh>();
  private terminals = new Map<string, THREE.Mesh>();
  private chests = new Map<string, THREE.Group>();
  private hiddenMarks = new Map<string, THREE.Group>();
  private moon: THREE.DirectionalLight;
  private time = 0;
  private ring: THREE.Mesh;
  private lastHidden = false;
  private walls: { mesh: THREE.Mesh; rect: Rect }[] = [];
  private npcs: { def: NpcDef; actor: ActorView; label: THREE.Sprite; marks: Record<'!' | '?', THREE.Sprite> }[] = [];
  /** 画面の上に重なる表示（左上の場所名など）。名札がこの下にもぐるときは薄くする */
  avoid: DOMRect[] = [];
  private linkRings: THREE.Mesh[] = [];
  private tmpV = new THREE.Vector3();
  private npcMark?: (id: string) => '!' | '?' | null;

  constructor(
    state: FieldState,
    opts: { playerLook: LookDef; vrm: VRM | null; day?: boolean; npcVrms?: Record<string, VRM | null>; npcMark?: (id: string) => '!' | '?' | null },
  ) {
    this.state = state;
    this.npcMark = opts.npcMark;
    const { playerLook, vrm, day } = opts;
    const s = this.scene;
    // 昼（学校）は明るく、夜（忍び込む）は暗く
    const sky = day ? 0x9cc4ec : 0x0e111c;
    s.background = new THREE.Color(sky);
    s.fog = new THREE.Fog(sky, day ? 30 : 18, day ? 60 : 40);
    s.add(day ? new THREE.HemisphereLight(0xffffff, 0x6a6050, 1.8) : new THREE.HemisphereLight(0x8899cc, 0x1a1420, 1.0));
    this.moon = new THREE.DirectionalLight(day ? 0xfff2dd : 0xdfe6ff, day ? 2.4 : 1.8);
    this.moon.castShadow = true;
    this.moon.shadow.mapSize.set(1024, 1024);
    Object.assign(this.moon.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 40 });
    s.add(this.moon, this.moon.target);

    const map = state.map;
    // 床
    for (const a of map.areas) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(a.w, a.d), new THREE.MeshStandardMaterial({ color: a.floor, roughness: 0.95 }));
      f.rotation.x = -Math.PI / 2;
      f.position.set(a.x + a.w / 2, 0, a.z + a.d / 2);
      f.receiveShadow = true;
      s.add(f);
    }
    // 影（床の暗いところ）
    for (const r of map.shadows) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(r.w, r.d), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(r.x + r.w / 2, 0.02, r.z + r.d / 2);
      s.add(m);
    }
    // 壁（高い壁は低めにして、上から見やすくする）
    for (const w of map.walls) {
      const h = Math.min(w.h ?? 3, 2.4);
      const kind = w.kind ?? 'wall';
      const color = kind === 'wall' && map.wallColor ? new THREE.Color(map.wallColor).getHex() : WALL_COLORS[kind];
      const m = box(w, h, color);
      m.castShadow = true;
      m.receiveShadow = true;
      s.add(m);
      this.walls.push({ mesh: m, rect: w });
    }
    // 解析レンズで見えるもの（見えるまでは出さない）
    for (const h of map.hidden ?? []) {
      const g = new THREE.Group();
      const color = h.kind === 'enemy' ? 0xff3050 : 0x5ef0ff;
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.2 }));
      gem.position.y = 0.8;
      gem.name = 'gem';
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.55, 28), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.04;
      g.add(gem, ring);
      if (h.kind === 'enemy') {
        const look = ENEMIES.guard.look;
        const shade = new ActorView({ ...look, color: '#1a1020' }, 1);
        shade.root.position.set(0.9, 0, 0);
        g.add(shade.root);
      }
      g.position.set(h.pos[0], 0, h.pos[1]);
      g.visible = false;
      s.add(g);
      this.hiddenMarks.set(h.id, g);
    }
    // 見た目だけの小物
    for (const p of map.props ?? []) s.add(buildProp(p));
    // 扉（鍵がかかっている間は赤く光る）
    for (const d of map.doors) {
      const m = box(d, 2.4, 0x8a2036);
      (m.material as THREE.MeshStandardMaterial).emissive = new THREE.Color(0x601020);
      s.add(m);
      this.doors.set(d.id, m);
    }
    // 端末（ハッキングできる）
    for (const t of map.terminals) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.1, 0.5), new THREE.MeshStandardMaterial({ color: 0x223040, emissive: 0x1ec8ff, emissiveIntensity: 0.6 }));
      m.position.set(t.pos[0], 0.55, t.pos[1]);
      s.add(m);
      this.terminals.set(t.id, m);
    }
    // 監視カメラ
    for (const c of map.cameras) {
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.25, 0.25), new THREE.MeshStandardMaterial({ color: 0x222, emissive: 0xff2040, emissiveIntensity: 0.8 }));
      head.position.set(c.pos[0], 2.3, c.pos[1]);
      const cone = fan(c.range, c.fov, 0xff3050);
      cone.position.set(c.pos[0], 0.04, c.pos[1]);
      s.add(head, cone);
      this.cams.set(c.id, { cone, head });
    }
    // 宝箱
    for (const c of map.chests) {
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.45, 0.55), new THREE.MeshStandardMaterial({ color: 0x8a5a20, metalness: 0.3 }));
      base.position.y = 0.23;
      const lid = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.15, 0.57), new THREE.MeshStandardMaterial({ color: 0xd8a640, metalness: 0.6, emissive: 0x553300 }));
      lid.position.y = 0.52;
      lid.name = 'lid';
      g.add(base, lid);
      g.position.set(c.pos[0], 0, c.pos[1]);
      g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
      s.add(g);
      this.chests.set(c.id, g);
    }
    // ボスの扉
    if (map.boss) {
      const b = map.boss.pos;
      const gate = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.6, 0.3), new THREE.MeshStandardMaterial({ color: 0x302040, emissive: 0x7a30ff, emissiveIntensity: 0.5, metalness: 0.6 }));
      gate.position.set(b[0], 1.3, b[1] + 1.2);
      s.add(gate);
      const glow = new THREE.PointLight(0x9a50ff, 6, 6);
      glow.position.set(b[0], 1.5, b[1]);
      s.add(glow);
    }
    // 出口（学校の昇降口など）
    if (map.exit) {
      const e = map.exit.pos;
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.9, 32), new THREE.MeshBasicMaterial({ color: 0xffd25a, transparent: true, opacity: 0.8 }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(e[0], 0.04, e[1]);
      s.add(ring);
      const light = new THREE.PointLight(0xffd25a, 4, 5);
      light.position.set(e[0], 1.5, e[1]);
      s.add(light);
    }

    // ほかの場所への出入り口（階段・戸）：床の水色の輪と矢印、行き先の札
    for (const k of map.links ?? []) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.75, 32), new THREE.MeshBasicMaterial({ color: 0x5ec8ff, transparent: true, opacity: 0.85 }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(k.pos[0], 0.05, k.pos[1]);
      s.add(ring);
      const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(k.label, '#2f9bd6'), depthTest: false }));
      sign.scale.set(1.6, 0.4, 1);
      sign.position.set(k.pos[0], 2.1, k.pos[1]);
      s.add(sign);
      const light = new THREE.PointLight(0x5ec8ff, 3, 4);
      light.position.set(k.pos[0], 1.2, k.pos[1]);
      s.add(light);
      this.linkRings.push(ring);
    }

    // 話しかけられる人（名前を頭の上に出す）。仲間は VRM があれば VRM
    for (const n of map.npcs ?? []) {
      const c = n.charId ? CHARACTERS[n.charId] : undefined;
      const look = c?.look ?? n.look ?? { shape: 'hero' as const, color: '#cccccc' };
      const name = c?.name ?? n.name ?? '';
      const actor = new ActorView(look, 1);
      const v = n.charId ? opts.npcVrms?.[n.charId] : undefined;
      if (v) actor.setVrm(v);
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(name, c ? look.color : '#9aa3b8'), depthTest: false }));
      label.scale.set(1.6, 0.4, 1);
      label.position.y = actor.height + 0.55;
      actor.root.add(label);
      const mk = (t: string, c: string) => {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture(t, c), depthTest: false }));
        sp.scale.set(0.7, 0.7, 1);
        sp.position.y = actor.height + 1.1;
        sp.visible = false;
        actor.root.add(sp);
        return sp;
      };
      const marks = { '!': mk('！', '#ffb020'), '?': mk('？', '#30c070') };
      s.add(actor.root);
      this.npcs.push({ def: n, actor, label, marks });
    }

    // 見回り
    for (const p of state.patrols) {
      const look = ENEMIES[p.def.look]?.look ?? { shape: 'guard', color: '#333' };
      const actor = new ActorView({ ...look, scale: Math.min(1.2, look.scale ?? 1) }, 1);
      const cone = fan(p.def.range, p.def.fov, 0xffd040);
      const mark = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture('!', '#ff3050'), depthTest: false }));
      mark.scale.set(0.8, 0.8, 1);
      mark.position.y = actor.height + 0.7;
      mark.visible = false;
      actor.root.add(mark);
      s.add(actor.root, cone);
      this.patrols.set(p.def.id, { actor, cone, mark });
    }

    // 自分（VRM があれば VRM）
    this.player = new ActorView(playerLook, 1);
    if (vrm) this.player.setVrm(vrm);
    s.add(this.player.root);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.6, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    s.add(this.ring);
    this.yaw = state.dir + Math.PI; // 後ろから見る
  }

  /**
   * 解析レンズ：画面の (cx, cy) を中心に半径 r の丸の中に、まだ見つけていない隠し要素があるか。
   * id＝丸の中でいちばん中心に近いもの。near＝近くにあるほど 1 に近い（レンズのゆれに使う）
   */
  lensPick(cx: number, cy: number, r: number): { id: string | null; near: number } {
    const st = this.state;
    let id: string | null = null;
    let best = Infinity;
    let near = 0;
    for (const h of st.map.hidden ?? []) {
      if (st.collected.has(h.id) || st.revealed.has(h.id)) continue;
      if (Math.hypot(h.pos[0] - st.pos[0], h.pos[1] - st.pos[1]) > LENS_RANGE) continue;
      const p = this.tmpV.set(h.pos[0], 0.6, h.pos[1]).project(this.camera);
      if (p.z > 1) continue;
      const sx = ((p.x + 1) / 2) * window.innerWidth;
      const sy = ((1 - p.y) / 2) * window.innerHeight;
      const d = Math.hypot(sx - cx, sy - cy);
      near = Math.max(near, 1 - d / (r * 4));
      if (d <= r && d < best) {
        best = d;
        id = h.id;
      }
    }
    return { id, near: Math.max(0, near) };
  }

  /** その場所が画面で、上に重なる表示の下にあるか */
  private underHud(x: number, y: number, z: number): boolean {
    if (!this.avoid.length) return false;
    const p = this.tmpV.set(x, y, z).project(this.camera);
    if (p.z > 1) return false;
    const sx = ((p.x + 1) / 2) * window.innerWidth;
    const sy = ((1 - p.y) / 2) * window.innerHeight;
    const pad = 36;
    return this.avoid.some((r) => sx > r.left - pad && sx < r.right + pad && sy > r.top - pad && sy < r.bottom + pad);
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1.9 ? 55 : 50;
    this.camera.updateProjectionMatrix();
  }

  /** 毎コマ：状態を見た目に写す */
  update(dt: number, _moving: number, hidden: boolean): void { // 歩きの動きは、実際に動いた距離から決める（ActorView.gait）
    this.time += dt;
    const st = this.state;
    const [px, pz] = st.pos;
    this.player.root.position.set(px, 0, pz);
    turnToward(this.player.root, -st.dir, dt, 14);
    // 影の中では、足もとの輪が紫に光り、仮の形は半分すける（隠れている合図）
    this.ring.position.set(px, 0.05, pz);
    (this.ring.material as THREE.MeshBasicMaterial).color.setHex(hidden ? 0xa070ff : 0xffffff);
    (this.ring.material as THREE.MeshBasicMaterial).opacity = hidden ? 0.9 : 0.25;
    if (hidden !== this.lastHidden && !this.player.vrm) {
      this.lastHidden = hidden;
      this.player.root.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | undefined;
        if (m && o !== this.player.hitbox) {
          m.transparent = hidden;
          m.opacity = hidden ? 0.45 : 1;
        }
      });
    }
    this.player.update(this.time, dt);

    // 人：いまの時間にいる人だけ出す。近くに来るとこちらを向く
    for (const n of this.npcs) {
      const s = st.npcs.find((x) => x.def.id === n.def.id);
      n.actor.root.visible = !!s?.present;
      if (!s?.present) continue;
      n.actor.root.position.set(s.pos[0], 0, s.pos[1]);
      const mark = this.npcMark?.(n.def.id) ?? null;
      n.marks['!'].visible = mark === '!';
      n.marks['?'].visible = mark === '?';
      if (mark) n.marks[mark].position.y = n.actor.height + 1.1 + Math.sin(this.time * 4) * 0.08;
      const under = this.underHud(s.pos[0], n.actor.height + 0.8, s.pos[1]);
      for (const sp of [n.label, n.marks['!'], n.marks['?']]) sp.material.opacity += ((under ? 0.12 : 1) - sp.material.opacity) * Math.min(1, dt * 10);
      const dx = px - s.pos[0];
      const dz = pz - s.pos[1];
      const near = Math.hypot(dx, dz) < 3;
      turnToward(n.actor.root, -(near ? Math.atan2(dz, dx) : s.dir), dt, 8);
      n.actor.update(this.time, dt);
    }
    for (const p of st.patrols) {
      const v = this.patrols.get(p.def.id)!;
      const vis = !p.defeated;
      v.actor.root.visible = vis;
      v.cone.visible = vis;
      if (!vis) continue;
      v.actor.root.position.set(p.pos[0], 0, p.pos[1]);
      turnToward(v.actor.root, -p.dir, dt, 10);
      v.actor.update(this.time, dt);
      v.cone.position.set(p.pos[0], 0.03, p.pos[1]);
      v.cone.rotation.y = -p.dir;
      const mat = v.cone.material as THREE.MeshBasicMaterial;
      const warn = p.alerted ? 1 : Math.min(1, p.suspicion / 0.5);
      mat.color.setRGB(1, 0.82 - warn * 0.65, 0.25 - warn * 0.1);
      mat.opacity = 0.18 + warn * 0.2;
      v.mark.visible = p.alerted || p.suspicion > 0.05;
      v.mark.material.opacity = p.alerted ? 1 : 0.5;
    }
    for (const c of st.cameras) {
      const v = this.cams.get(c.def.id)!;
      v.cone.visible = !c.disabled;
      v.cone.rotation.y = -c.dir;
      (v.cone.material as THREE.MeshBasicMaterial).opacity = 0.18 + Math.min(1, c.suspicion / 0.8) * 0.3;
      (v.head.material as THREE.MeshStandardMaterial).emissive.setHex(c.disabled ? 0x103020 : 0xff2040);
    }
    for (const [id, m] of this.doors) {
      const open = st.openDoors.has(id);
      m.position.y += ((open ? -2.3 : 1.2) - m.position.y) * Math.min(1, dt * 3);
    }
    for (const [id, m] of this.terminals) {
      (m.material as THREE.MeshStandardMaterial).emissive.setHex(st.hacked.has(id) ? 0x30ff80 : 0x1ec8ff);
      (m.material as THREE.MeshStandardMaterial).emissiveIntensity = st.hacked.has(id) ? 0.4 : 0.5 + Math.sin(this.time * 4) * 0.3;
    }
    for (const ring of this.linkRings) {
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.55 + Math.sin(this.time * 4) * 0.3;
    }
    for (const [id, g] of this.hiddenMarks) {
      g.visible = st.revealed.has(id) && !st.collected.has(id);
      if (!g.visible) continue;
      const gem = g.getObjectByName('gem')!;
      gem.rotation.y += dt * 2;
      gem.position.y = 0.8 + Math.sin(this.time * 3) * 0.1;
    }
    for (const [id, g] of this.chests) {
      const lid = g.getObjectByName('lid') as THREE.Mesh;
      if (st.opened.has(id)) {
        lid.rotation.x = Math.min(1.2, lid.rotation.x + dt * 3);
        lid.position.set(0, 0.6, -0.2);
      } else {
        (lid.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.6 + Math.sin(this.time * 3) * 0.4;
      }
    }

    // カメラ：主人公を後ろ上から追う
    const target = new THREE.Vector3(px, 1.0, pz);
    const off = new THREE.Vector3(Math.cos(this.yaw) * Math.cos(PITCH), Math.sin(PITCH), Math.sin(this.yaw) * Math.cos(PITCH)).multiplyScalar(CAM_DIST);
    this.camera.position.copy(target).add(off);
    this.camera.lookAt(target);
    // カメラと主人公の間にある壁は透かす（主人公が隠れないように）
    const cam: [number, number] = [this.camera.position.x, this.camera.position.z];
    for (const w of this.walls) {
      const between = segmentHitsRect(cam, [px, pz], w.rect);
      const mat = w.mesh.material as THREE.MeshStandardMaterial;
      if (mat.transparent !== between) {
        mat.transparent = between;
        mat.opacity = between ? 0.18 : 1;
        mat.depthWrite = !between;
        mat.needsUpdate = true;
      }
    }
    this.moon.position.set(px + 4, 12, pz + 6);
    this.moon.target.position.set(px, 0, pz);
  }

  /** スティックの向き（画面の右・上）を、床の上の向きに直す */
  stickToWorld(sx: number, sy: number): [number, number] {
    const fx = -Math.cos(this.yaw);
    const fz = -Math.sin(this.yaw);
    const rx = -fz;
    const rz = fx;
    return [fx * sy + rx * sx, fz * sy + rz * sx];
  }

  /** 戦いのあと、VRM を歩く場所の主人公にもどす */
  attachVrm(vrm: VRM | null): void {
    this.player.setVrm(vrm ?? undefined);
  }

  dispose(): void {
    this.player.setVrm(undefined);
    for (const n of this.npcs) n.actor.setVrm(undefined);
  }
}

function textTexture(text: string, color: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = color;
  g.beginPath();
  g.arc(32, 32, 28, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#fff';
  g.font = 'bold 44px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 32, 34);
  return new THREE.CanvasTexture(c);
}

function labelTexture(text: string, color: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(16,19,32,0.85)';
  g.beginPath();
  g.roundRect(4, 8, 248, 48, 20);
  g.fill();
  g.strokeStyle = color;
  g.lineWidth = 4;
  g.stroke();
  g.fillStyle = '#fff';
  g.font = 'bold 30px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 34);
  return new THREE.CanvasTexture(c);
}

/** 小物を作る（黒板・時計・窓・掲示物・植木・フェンス・パン・ゴール） */
function buildProp(p: PropDef): THREE.Object3D {
  const g = new THREE.Group();
  const std = (color: THREE.ColorRepresentation, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  const w = p.w ?? 1;
  switch (p.kind) {
    case 'board': {
      add(new THREE.BoxGeometry(w, 1.2, 0.06), std(0x2f5a3c), 0, 1.5, 0);
      add(new THREE.BoxGeometry(w + 0.2, 0.08, 0.12), std(0x8a6a48), 0, 0.88, 0.04);
      // 白いチョークの字（線で）
      for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(w * (0.3 + Math.random() * 0.4), 0.04, 0.02), std(0xf4f4ee), -w * 0.2 + Math.random() * 0.4, 1.8 - i * 0.22, 0.04);
      break;
    }
    case 'clock': {
      const face = add(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 24), std(0xffffff), 0, 2.1, 0);
      face.rotation.x = Math.PI / 2;
      add(new THREE.BoxGeometry(0.03, 0.2, 0.02), std(0x222222), 0, 2.17, 0.05);
      add(new THREE.BoxGeometry(0.14, 0.03, 0.02), std(0x222222), 0.06, 2.1, 0.05);
      break;
    }
    case 'window': {
      add(new THREE.BoxGeometry(w, 1.1, 0.04), std(0xbfe6ff, { emissive: 0x9fd8ff, emissiveIntensity: 0.6, roughness: 0.1 }), 0, 1.5, 0);
      add(new THREE.BoxGeometry(0.06, 1.1, 0.06), std(0xffffff), 0, 1.5, 0.02);
      break;
    }
    case 'poster': {
      add(new THREE.BoxGeometry(0.7, 0.9, 0.03), std(p.color ?? 0xff8fa3), 0, 1.6, 0);
      add(new THREE.BoxGeometry(0.5, 0.08, 0.02), std(0xffffff), 0, 1.85, 0.02);
      add(new THREE.BoxGeometry(0.4, 0.06, 0.02), std(0xffffff), 0, 1.5, 0.02);
      break;
    }
    case 'plant': {
      add(new THREE.CylinderGeometry(0.22, 0.17, 0.4, 14), std(0xc06a3a), 0, 0.2, 0);
      add(new THREE.SphereGeometry(0.38, 14, 10), std(0x4caf50), 0, 0.75, 0);
      break;
    }
    case 'fence': {
      add(new THREE.BoxGeometry(w, 0.06, 0.06), std(0x6b7a8f, { metalness: 0.5 }), w / 2, 1.1, 0);
      for (let x = 0; x <= w; x += 0.6) add(new THREE.BoxGeometry(0.05, 1.1, 0.05), std(0x6b7a8f, { metalness: 0.5 }), x, 0.55, 0);
      break;
    }
    case 'bread': {
      const colors = [0xe2a85a, 0xf0c070, 0xc8833e, 0xffd27a];
      for (let i = 0; i < Math.round(w / 0.5); i++) {
        const b = add(new THREE.SphereGeometry(0.16, 10, 8), std(colors[i % colors.length]), i * 0.5, 1.12, 0.4);
        b.scale.set(1.3, 0.7, 1);
      }
      break;
    }
    case 'hoop': {
      add(new THREE.BoxGeometry(0.12, 2.9, 0.12), std(0x888888, { metalness: 0.6 }), 0, 1.45, 0);
      add(new THREE.BoxGeometry(0.06, 0.9, 1.4), std(0xffffff), 0, 2.9, 0);
      const ring = add(new THREE.TorusGeometry(0.28, 0.03, 8, 20), std(0xff6a3d), 0.35, 2.6, 0);
      ring.rotation.x = Math.PI / 2;
      break;
    }
  }
  g.position.set(p.x, 0, p.z);
  // 表の向き（+z 向きで作っているので回す）
  g.rotation.y = Math.PI / 2 - (p.dir ?? Math.PI / 2);
  return g;
}

/** 向きをなめらかに変える（いちばん近い回り方で） */
function turnToward(o: THREE.Object3D, target: number, dt: number, rate: number): void {
  let d = target - o.rotation.y;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  o.rotation.y += d * Math.min(1, dt * rate);
}
