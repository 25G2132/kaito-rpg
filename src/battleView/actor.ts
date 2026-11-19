import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import type { LookDef } from '../battle/types';

// 戦いの画面の1人ぶんの見た目。VRM があれば VRM、無ければ仮の形。
// 動き（踏み込み・のけぞり・必殺技のポーズ）はプログラムで作る。

export class ActorView {
  readonly root = new THREE.Group(); // 立ち位置
  readonly body = new THREE.Group(); // 動かす部分
  readonly hitbox: THREE.Mesh;
  readonly height: number;
  readonly facing: 1 | -1; // 1＝右（敵の方）を向く
  readonly floating: boolean;
  vrm?: VRM;
  private placeholder = new THREE.Group();
  private mats: THREE.MeshStandardMaterial[] = [];
  private phase = Math.random() * 10;

  // 動きの値（clock の tween で書きかえる）
  offset = new THREE.Vector3();
  lean = 0; // 前に傾く
  armRaise = 0; // 右腕を上げる（攻撃）
  ultPose = 0; // 両手を上げる（必殺技）
  shake = 0; // 当たったときの揺れ
  flash = 0; // 当たったときに白く光る
  down = 0; // 倒れる（0〜1）
  highlight = 0; // 番が来ている
  walk = 0; // 歩く速さ（0〜1。歩く場所で使う）
  private walkPhase = 0;

  constructor(look: LookDef, facing: 1 | -1) {
    this.facing = facing;
    const s = look.scale ?? 1;
    const built = buildShape(look, facing);
    this.placeholder = built.group;
    this.mats = built.mats;
    this.height = built.height * s;
    this.floating = look.shape === 'drone';
    this.placeholder.scale.setScalar(s);
    this.body.add(this.placeholder);
    this.root.add(this.body);

    // 指で押しやすいよう、見た目より大きい当たり判定（見えない）
    this.hitbox = new THREE.Mesh(
      new THREE.CylinderGeometry(0.75 * s, 0.75 * s, this.height + 0.4, 8),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    this.hitbox.position.y = (this.height + 0.4) / 2;
    this.root.add(this.hitbox);
    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o !== this.hitbox) o.castShadow = true;
    });
  }

  /** 仮の形を VRM に差しかえる */
  setVrm(vrm: VRM | undefined): void {
    if (this.vrm) this.body.remove(this.vrm.scene);
    this.vrm = vrm;
    this.placeholder.visible = !vrm;
    if (vrm) {
      vrm.scene.rotation.y = this.facing > 0 ? Math.PI / 2 : -Math.PI / 2;
      vrm.scene.traverse((o) => {
        o.frustumCulled = false;
        if ((o as THREE.Mesh).isMesh) o.castShadow = true;
      });
      this.body.add(vrm.scene);
    }
  }

  update(t: number, dt: number): void {
    const tt = t + this.phase;
    this.walkPhase += dt * (5 + 5 * this.walk) * (this.walk > 0.02 ? 1 : 0);
    const step = this.walk > 0.02 ? Math.abs(Math.sin(this.walkPhase)) * 0.07 * this.walk : 0;
    const bob = (this.floating ? Math.sin(tt * 2.2) * 0.1 + 0.15 : 0) + step;
    const shakeX = this.shake > 0 ? Math.sin(tt * 90) * 0.08 * this.shake : 0;
    this.body.position.set(this.offset.x + shakeX, this.offset.y + bob, this.offset.z);
    // 倒れる：味方は後ろに倒れる、敵は沈んで小さくなる
    const fall = this.down;
    this.body.rotation.z = -this.lean * this.facing + fall * 1.35 * this.facing * (this.vrm || this.facing > 0 ? 1 : 0);
    if (this.facing < 0 && !this.vrm) {
      this.body.scale.setScalar(Math.max(0.01, 1 - fall));
      this.body.position.y -= fall * 0.6;
    }
    for (const m of this.mats) {
      m.emissiveIntensity = this.flash * 1.2 + this.highlight * 0.06;
    }
    if (this.vrm) {
      poseVrm(this.vrm, tt, this.armRaise, this.ultPose, this.walk, this.walkPhase);
      this.vrm.update(dt);
    } else if (!this.floating) {
      // 仮の形の呼吸
      this.placeholder.scale.y = (this.placeholder.scale.x) * (1 + Math.sin(tt * 2.2) * 0.012);
    }
  }

  /** 頭の上（名前やHPを出す位置）*/
  topPoint(out: THREE.Vector3): THREE.Vector3 {
    return out.set(0, this.height + 0.2 + (this.floating ? 0.15 : 0), 0).applyMatrix4(this.root.matrixWorld);
  }
  chestPoint(out: THREE.Vector3): THREE.Vector3 {
    return out.set(0, this.height * 0.6 + (this.floating ? 0.15 : 0), 0).applyMatrix4(this.root.matrixWorld);
  }
}

function poseVrm(vrm: VRM, t: number, arm: number, ult: number, walk = 0, wp = 0): void {
  const h = vrm.humanoid;
  const breath = Math.sin(t * 2.2);
  const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
  h.getNormalizedBoneNode('spine')?.rotation.set(breath * 0.02, 0, Math.sin(t * 1.1) * 0.03);
  h.getNormalizedBoneNode('chest')?.rotation.set(breath * 0.03, 0, 0);
  h.getNormalizedBoneNode('head')?.rotation.set(0, Math.sin(t * 0.6) * 0.15, 0);
  const leftDown = -1.2 + breath * 0.03;
  const rightDown = 1.2 - breath * 0.03;
  h.getNormalizedBoneNode('leftUpperArm')?.rotation.set(0, 0, lerp(leftDown, 0.9, ult));
  h.getNormalizedBoneNode('rightUpperArm')?.rotation.set(0, lerp(0, -0.8, arm * (1 - ult)), lerp(lerp(rightDown, -0.3, arm), -0.9, ult));
  h.getNormalizedBoneNode('leftLowerArm')?.rotation.set(0, -0.3, 0);
  h.getNormalizedBoneNode('rightLowerArm')?.rotation.set(0, lerp(0.3, 0, arm), 0);
  // 歩く：足を前後に振り、腕を逆に振る
  const sw = Math.sin(wp) * 0.7 * walk;
  h.getNormalizedBoneNode('leftUpperLeg')?.rotation.set(sw, 0, 0);
  h.getNormalizedBoneNode('rightUpperLeg')?.rotation.set(-sw, 0, 0);
  h.getNormalizedBoneNode('leftLowerLeg')?.rotation.set(-Math.max(0, -Math.sin(wp)) * 0.9 * walk, 0, 0);
  h.getNormalizedBoneNode('rightLowerLeg')?.rotation.set(-Math.max(0, Math.sin(wp)) * 0.9 * walk, 0, 0);
  if (walk > 0.02 && arm < 0.01 && ult < 0.01) {
    h.getNormalizedBoneNode('leftUpperArm')?.rotation.set(-sw * 0.8, 0, leftDown);
    h.getNormalizedBoneNode('rightUpperArm')?.rotation.set(sw * 0.8, 0, rightDown);
  }
}

// ---------- 仮の形 ----------

function mat(color: THREE.ColorRepresentation, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.55, emissive: 0xffffff, emissiveIntensity: 0, ...opts });
}

function buildShape(look: LookDef, facing: 1 | -1): { group: THREE.Group; mats: THREE.MeshStandardMaterial[]; height: number } {
  const g = new THREE.Group();
  const mats: THREE.MeshStandardMaterial[] = [];
  const add = (geo: THREE.BufferGeometry, m: THREE.MeshStandardMaterial, x: number, y: number, z = 0) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    g.add(mesh);
    if (!mats.includes(m)) mats.push(m);
    return mesh;
  };
  const f = facing; // 前（顔）の向き
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff3355 });
  const eye = (x: number, y: number, r = 0.08) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), eyeMat);
    m.position.set(x, y, 0);
    g.add(m);
  };

  switch (look.shape) {
    case 'hero': {
      const cloth = mat(look.color, { roughness: 0.45 });
      const skin = mat('#f1d3c0');
      const hair = mat(new THREE.Color(look.color).multiplyScalar(0.45));
      add(new THREE.CapsuleGeometry(0.24, 0.62, 6, 16), cloth, 0, 0.62);
      add(new THREE.SphereGeometry(0.2, 20, 14), skin, 0, 1.3);
      const cap = add(new THREE.SphereGeometry(0.215, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), hair, -0.03 * f, 1.33);
      cap.rotation.z = 0.25 * f;
      // 顔の向きが分かる目印（マスク）
      const mask = add(new THREE.BoxGeometry(0.05, 0.06, 0.3), mat('#20222c'), 0.17 * f, 1.32);
      mask.rotation.z = 0;
      // 足もとの光る輪
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.36, 0.44, 32),
        new THREE.MeshBasicMaterial({ color: look.color, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.02;
      g.add(ring);
      return { group: g, mats, height: 1.55 };
    }
    case 'drone': {
      const shell = mat(look.color, { metalness: 0.6, roughness: 0.35 });
      add(new THREE.SphereGeometry(0.32, 20, 14), shell, 0, 1.1);
      const rotor = add(new THREE.TorusGeometry(0.45, 0.04, 8, 28), mat('#2b3242'), 0, 1.25);
      rotor.rotation.x = Math.PI / 2;
      eye(0.28 * f, 1.12, 0.09);
      return { group: g, mats, height: 1.45 };
    }
    case 'robot': {
      const metal = mat(look.color, { metalness: 0.7, roughness: 0.35 });
      add(new THREE.BoxGeometry(0.7, 0.8, 0.6), metal, 0, 0.75);
      add(new THREE.BoxGeometry(0.4, 0.32, 0.36), metal, 0.05 * f, 1.35);
      add(new THREE.BoxGeometry(0.18, 0.4, 0.18), mat('#2b3242'), -0.1, 0.2, 0.2);
      add(new THREE.BoxGeometry(0.18, 0.4, 0.18), mat('#2b3242'), -0.1, 0.2, -0.2);
      eye(0.26 * f, 1.37, 0.07);
      return { group: g, mats, height: 1.55 };
    }
    case 'guard': {
      const suit = mat(look.color);
      add(new THREE.CapsuleGeometry(0.27, 0.75, 6, 16), suit, 0, 0.7);
      add(new THREE.SphereGeometry(0.2, 18, 12), mat('#d9b9a2'), 0, 1.45);
      add(new THREE.BoxGeometry(0.06, 0.07, 0.32), mat('#0d0e12'), 0.17 * f, 1.47);
      return { group: g, mats, height: 1.7 };
    }
    case 'boss': {
      const armor = mat(look.color, { metalness: 0.5, roughness: 0.4 });
      const dark = mat('#1d1822', { metalness: 0.4 });
      add(new THREE.CapsuleGeometry(0.42, 0.8, 6, 18), armor, 0, 0.85);
      add(new THREE.BoxGeometry(0.5, 0.42, 0.5), dark, 0, 1.55);
      const hornL = add(new THREE.ConeGeometry(0.07, 0.35, 10), mat('#c9a24a', { metalness: 0.8 }), 0, 1.9, 0.18);
      const hornR = add(new THREE.ConeGeometry(0.07, 0.35, 10), mat('#c9a24a', { metalness: 0.8 }), 0, 1.9, -0.18);
      hornL.rotation.x = 0.3;
      hornR.rotation.x = -0.3;
      add(new THREE.BoxGeometry(0.4, 0.2, 0.9), armor, 0, 1.25); // 肩
      eye(0.26 * f, 1.58, 0.07);
      const e2 = g.children[g.children.length - 1];
      e2.position.z = 0.12;
      eye(0.26 * f, 1.58, 0.07);
      g.children[g.children.length - 1].position.z = -0.12;
      return { group: g, mats, height: 2.05 };
    }
  }
}
