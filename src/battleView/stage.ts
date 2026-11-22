import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import type { Battle, Unit } from '../battle/battle';
import type { CharacterDef } from '../battle/types';
import { ActorView } from './actor';
import { easeInOut, easeOut, type GameClock } from './clock';

// 3D の舞台：床・光・カメラと、味方（左）と敵（右）の並び。段階1の試作と同じカメラ・光・影。

const PARTY_POS: [number, number][] = [
  [-1.6, 0.9],
  [-2.7, -0.2],
  [-3.7, 0.9],
  [-4.7, -0.2],
];
const ENEMY_POS: [number, number][] = [
  // 右上の総ダメージと名札が重ならないよう、右端は少しあける
  [1.2, 0.6],
  [2.35, -0.5],
  [3.5, 0.6],
  [2.2, -1.9],
  [3.6, -1.9],
];
const CAM_POS = new THREE.Vector3(0, 2.5, 7.6);
const CAM_LOOK = new THREE.Vector3(0, 0.75, -0.4);

type Burst = { points: THREE.Points; vel: Float32Array; age: number; life: number };

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 100);
  readonly actors = new Map<string, ActorView>();
  private clock: GameClock;
  private time = 0;
  private shakeAmt = 0;
  private camFocus = new THREE.Vector3();
  private camFocusAmt = 0;
  private camOrbit = 0; // 合わせ技：まわりこむ（ラジアン）
  private camPull = 0; // 合わせ技：引いて上から（0〜1）
  private bursts: Burst[] = [];
  private raycaster = new THREE.Raycaster();

  constructor(canvas: HTMLCanvasElement, clock: GameClock) {
    this.clock = clock;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const s = this.scene;
    s.background = new THREE.Color(0x141826);
    s.fog = new THREE.Fog(0x141826, 14, 32);
    s.add(new THREE.HemisphereLight(0x8899cc, 0x221a22, 1.2));
    const moon = new THREE.DirectionalLight(0xdfe6ff, 2.4);
    moon.position.set(3, 8, 5);
    moon.castShadow = true;
    moon.shadow.mapSize.set(1024, 1024);
    Object.assign(moon.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7 });
    s.add(moon);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(14, 48),
      new THREE.MeshStandardMaterial({ color: 0x2a3042, roughness: 0.9 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);
    // 金庫室らしい床の線
    const grid = new THREE.GridHelper(16, 16, 0x3b4560, 0x323a52);
    grid.position.y = 0.005;
    s.add(grid);

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // 細長い画面でも左右の端の人が切れないように、横幅に合わせて少し引く
    this.camera.fov = w / h < 1.9 ? 42 : 38;
    this.camera.updateProjectionMatrix();
  }

  /** 味方を並べる（VRM があれば差しかえる） */
  setAllies(b: Battle, vrms: (VRM | null)[] | null): void {
    this.showParty(b.allies.map((u) => b.charDef(u)!), vrms);
  }

  /** 味方だけを並べる（戦いの外でも使う）。前の味方は片づける */
  showParty(defs: CharacterDef[], vrms: (VRM | null)[] | null): void {
    this.removeWhere((uid) => uid.startsWith('p'));
    defs.forEach((c, i) => {
      const a = new ActorView(c.look, 1);
      const [x, z] = PARTY_POS[i % PARTY_POS.length];
      a.root.position.set(x, 0, z);
      a.root.visible = i < PARTY_POS.length; // うしろの人は控え（見せない）
      if (vrms?.[i]) a.setVrm(vrms[i]);
      this.add(`p${i}`, a);
    });
  }

  /** 入れかえ：入る人を、下がる人の立ち位置に出す */
  swapActors(outUid: string, inUid: string): void {
    const o = this.actors.get(outUid);
    const i = this.actors.get(inUid);
    if (!o || !i) return;
    i.root.position.copy(o.root.position);
    i.root.visible = true;
    i.down = 0;
    o.root.visible = false;
    void this.clock.tween(0.35, (p) => (i.offset.y = Math.sin(p * Math.PI) * 0.5));
  }

  clearEnemies(): void {
    this.removeWhere((uid) => uid.startsWith('e'));
  }

  private removeWhere(test: (uid: string) => boolean): void {
    for (const [uid, a] of [...this.actors]) {
      if (!test(uid)) continue;
      a.setVrm(undefined); // VRM は次の戦いで使い回すので、はずすだけ
      this.scene.remove(a.root);
      this.actors.delete(uid);
    }
  }

  /** 敵の群れを並べなおす */
  setEnemies(b: Battle, appear: boolean): void {
    this.clearEnemies();
    b.enemies.forEach((u, i) => {
      const d = b.enemyDef(u)!;
      const a = new ActorView(d.look, -1);
      const [x, z] = d.boss ? [2.4, -0.9] : ENEMY_POS[i % ENEMY_POS.length];
      a.root.position.set(x, 0, z);
      this.add(u.uid, a);
      if (appear) {
        a.down = 1;
        void this.clock.tween(0.5, (p) => (a.down = 1 - easeOut(p)));
      }
    });
  }

  private add(uid: string, a: ActorView): void {
    this.scene.add(a.root);
    this.actors.set(uid, a);
  }

  actor(uid: string): ActorView | undefined {
    return this.actors.get(uid);
  }

  /** 画面の位置（CSS px）。カメラの後ろなら null */
  toScreen(p: THREE.Vector3): { x: number; y: number } | null {
    const v = p.clone().project(this.camera);
    if (v.z > 1) return null;
    return { x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight };
  }

  /** 画面をタップした位置にいる敵 */
  pick(clientX: number, clientY: number, alive: Unit[]): string | null {
    const ndc = new THREE.Vector2((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const boxes = alive.map((u) => this.actors.get(u.uid)?.hitbox).filter((x): x is THREE.Mesh => !!x);
    const hit = this.raycaster.intersectObjects(boxes, false)[0];
    if (!hit) return null;
    for (const [uid, a] of this.actors) if (a.hitbox === hit.object) return uid;
    return null;
  }

  // ---------- 動き ----------

  /** 相手の前まで踏み込む（戻るのは back()） */
  async lunge(uid: string, targetUid: string | null, kind: 'basic' | 'skill' | 'ult' | 'enemy'): Promise<() => Promise<void>> {
    const a = this.actors.get(uid);
    if (!a) return async () => {};
    const t = targetUid ? this.actors.get(targetUid) : undefined;
    const from = a.root.position;
    let dx = 0;
    let dz = 0;
    if (t && t !== a) {
      const to = t.root.position;
      const reach = kind === 'enemy' ? 0.4 : kind === 'basic' ? 0.62 : 0.5;
      dx = (to.x - from.x) * reach;
      dz = (to.z - from.z) * reach;
    } else {
      dx = 0.6 * a.facing;
    }
    await this.clock.tween(0.18, (p) => {
      const e = easeOut(p);
      a.offset.set(dx * e, Math.sin(p * Math.PI) * 0.25, dz * e);
      a.lean = 0.25 * e;
      a.armRaise = e;
    });
    return async () => {
      await this.clock.tween(0.25, (p) => {
        const e = 1 - easeInOut(p);
        a.offset.set(dx * e, 0, dz * e);
        a.lean = 0.25 * e;
        a.armRaise = e;
      });
    };
  }

  /** その場で光る（味方を助ける技） */
  async cast(uid: string): Promise<void> {
    const a = this.actors.get(uid);
    if (!a) return;
    await this.clock.tween(0.35, (p) => {
      a.offset.y = Math.sin(p * Math.PI) * 0.3;
      a.ultPose = Math.sin(p * Math.PI);
      a.flash = Math.sin(p * Math.PI) * 0.4;
    });
  }

  /** 必殺技の構え：跳んで両手を上げる、カメラが寄る */
  async ultPose(uid: string): Promise<void> {
    const a = this.actors.get(uid);
    if (!a) return;
    this.camFocus.copy(a.root.position).add(new THREE.Vector3(0, a.height * 0.6, 0));
    void this.clock.tween(0.3, (p) => (this.camFocusAmt = easeOut(p) * 0.55));
    await this.clock.tween(0.55, (p) => {
      a.offset.y = Math.sin(p * Math.PI) * 0.6;
      a.ultPose = Math.min(1, p * 2);
      a.body.rotation.y = p * Math.PI * 2;
    });
    a.body.rotation.y = 0;
    a.ultPose = 0;
    void this.clock.tween(0.3, (p) => (this.camFocusAmt = (1 - p) * 0.55));
  }

  /** 合わせ技のカメラ：zoom＝敵へ寄る、orbit＝まわりこむ、pull＝引いて上から、shake＝大きく揺れる */
  async comboCam(kind: 'zoom' | 'orbit' | 'pull' | 'shake', foeUids: string[]): Promise<void> {
    const foes = foeUids.map((id) => this.actors.get(id)).filter((a): a is ActorView => !!a);
    if (foes.length) {
      const c = new THREE.Vector3();
      for (const a of foes) c.add(a.root.position);
      this.camFocus.copy(c.multiplyScalar(1 / foes.length)).add(new THREE.Vector3(0, 1, 0));
    }
    const dur = 1.3;
    await this.clock.tween(dur, (p) => {
      const k = Math.sin(p * Math.PI); // 0 → 1 → 0
      switch (kind) {
        case 'zoom':
          this.camFocusAmt = k * 0.75;
          break;
        case 'orbit':
          this.camOrbit = k * 0.9;
          this.camFocusAmt = k * 0.3;
          break;
        case 'pull':
          this.camPull = k;
          break;
        case 'shake':
          this.shake(0.25 * k);
          break;
      }
    });
    this.camFocusAmt = 0;
    this.camOrbit = 0;
    this.camPull = 0;
  }

  hit(uid: string, strong: boolean): void {
    const a = this.actors.get(uid);
    if (!a) return;
    void this.clock.tween(strong ? 0.5 : 0.3, (p) => {
      a.shake = 1 - p;
      a.flash = (1 - p) * (strong ? 1 : 0.6);
      a.lean = -Math.sin(p * Math.PI) * (strong ? 0.35 : 0.18);
    });
  }

  defeat(uid: string): void {
    const a = this.actors.get(uid);
    if (!a) return;
    void this.clock.tween(0.6, (p) => (a.down = easeOut(p)));
  }

  revive(uid: string): void {
    const a = this.actors.get(uid);
    if (a) a.down = 0;
  }

  setActive(uid: string | null): void {
    for (const [id, a] of this.actors) a.highlight = id === uid ? 1 : 0;
  }

  shake(amount: number): void {
    this.shakeAmt = Math.max(this.shakeAmt, amount);
  }

  /** 光の粒が飛び散る */
  burst(uid: string, color: string, count = 40, power = 1): void {
    const a = this.actors.get(uid);
    if (!a) return;
    const center = a.chestPoint(new THREE.Vector3());
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos.set([center.x, center.y, center.z], i * 3);
      const dir = new THREE.Vector3().randomDirection().multiplyScalar((1.5 + Math.random() * 3) * power);
      vel.set([dir.x, dir.y + 1.5, dir.z], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color, size: 0.14 * power, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.scene.add(points);
    this.bursts.push({ points, vel, age: 0, life: 0.8 });
  }

  update(dt: number): void {
    this.time += dt;
    for (const a of this.actors.values()) a.update(this.time, dt);
    for (const b of [...this.bursts]) {
      b.age += dt;
      const attr = b.points.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      for (let i = 0; i < arr.length; i += 3) {
        b.vel[i + 1] -= 6 * dt;
        arr[i] += b.vel[i] * dt;
        arr[i + 1] += b.vel[i + 1] * dt;
        arr[i + 2] += b.vel[i + 2] * dt;
      }
      attr.needsUpdate = true;
      (b.points.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - b.age / b.life);
      if (b.age >= b.life) {
        this.scene.remove(b.points);
        b.points.geometry.dispose();
        (b.points.material as THREE.Material).dispose();
        this.bursts.splice(this.bursts.indexOf(b), 1);
      }
    }
    // カメラ：寄り・揺れ
    const look = CAM_LOOK.clone().lerp(this.camFocus, this.camFocusAmt);
    const pos = CAM_POS.clone().lerp(this.camFocus.clone().add(new THREE.Vector3(0.8, 1.0, 4.2)), this.camFocusAmt);
    if (this.camOrbit) {
      const off = pos.clone().sub(look).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.camOrbit);
      pos.copy(look).add(off);
    }
    if (this.camPull) pos.add(new THREE.Vector3(0, 3.2 * this.camPull, 3.5 * this.camPull));
    if (this.shakeAmt > 0.001) {
      pos.x += (Math.random() - 0.5) * this.shakeAmt;
      pos.y += (Math.random() - 0.5) * this.shakeAmt;
      this.shakeAmt *= Math.pow(0.02, dt);
    }
    this.camera.position.copy(pos);
    this.camera.lookAt(look);
    this.scene.updateMatrixWorld();
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}
