import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import type { LookDef } from '../battle/types';
import { ENEMIES } from '../data/enemies';
import { ActorView } from '../battleView/actor';
import { segmentHitsRect, type FieldState } from '../field/logic';
import type { Rect } from '../field/types';

// 歩く場所の3D。形はすべてプログラムで作る（外の素材なし）。
// 見回りとカメラの「見える範囲」は床に扇の形で出す。影は床の暗い部分。

const WALL_COLORS = { wall: 0x4a4458, hedge: 0x2f5a35, shelf: 0x5a4632 } as const;
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
  private moon: THREE.DirectionalLight;
  private time = 0;
  private ring: THREE.Mesh;
  private lastHidden = false;
  private walls: { mesh: THREE.Mesh; rect: Rect }[] = [];

  constructor(state: FieldState, playerLook: LookDef, vrm: VRM | null) {
    this.state = state;
    const s = this.scene;
    s.background = new THREE.Color(0x0e111c);
    s.fog = new THREE.Fog(0x0e111c, 18, 40);
    s.add(new THREE.HemisphereLight(0x8899cc, 0x1a1420, 1.0));
    this.moon = new THREE.DirectionalLight(0xdfe6ff, 1.8);
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
      const m = box(w, h, WALL_COLORS[w.kind ?? 'wall']);
      m.castShadow = true;
      m.receiveShadow = true;
      s.add(m);
      this.walls.push({ mesh: m, rect: w });
    }
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
    const b = map.boss.pos;
    const gate = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.6, 0.3), new THREE.MeshStandardMaterial({ color: 0x302040, emissive: 0x7a30ff, emissiveIntensity: 0.5, metalness: 0.6 }));
    gate.position.set(b[0], 1.3, b[1] + 1.2);
    s.add(gate);
    const glow = new THREE.PointLight(0x9a50ff, 6, 6);
    glow.position.set(b[0], 1.5, b[1]);
    s.add(glow);

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

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1.9 ? 55 : 50;
    this.camera.updateProjectionMatrix();
  }

  /** 毎コマ：状態を見た目に写す */
  update(dt: number, moving: number, hidden: boolean): void {
    this.time += dt;
    const st = this.state;
    const [px, pz] = st.pos;
    this.player.root.position.set(px, 0, pz);
    this.player.root.rotation.y = -st.dir;
    this.player.walk += (moving - this.player.walk) * Math.min(1, dt * 10);
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

    for (const p of st.patrols) {
      const v = this.patrols.get(p.def.id)!;
      const vis = !p.defeated;
      v.actor.root.visible = vis;
      v.cone.visible = vis;
      if (!vis) continue;
      v.actor.root.position.set(p.pos[0], 0, p.pos[1]);
      v.actor.root.rotation.y = -p.dir;
      v.actor.walk = p.alerted ? 1 : 0.5;
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
