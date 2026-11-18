import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm';
import { PerfHud } from '../dev/perfHud';
import { watchOrientation } from '../ui/orientation';

// 段階1：重さの試作。
// VRoid のキャラ4体と敵3体を、戦いの画面と同じ並びで出して、スマホでの重さを測る。
// 画面右下のボタンで、人数・影・画面の細かさ・揺れもの を切り替えられる。
// モデルは public/models/ に置く（再配布できないので git には入れない）。
//   ?spike            → models/sample-a.vrm
//   ?spike&model=xxx  → models/xxx.vrm

type Settings = {
  count: number; // 映すキャラの数（1〜4）
  shadows: boolean;
  pixelRatio: number; // 画面の細かさの上限
  springs: boolean; // 髪や服の揺れもの
};

const PARTY_POS: [number, number][] = [
  [-1.6, 0.9],
  [-2.3, -0.5],
  [-1.2, -1.6],
  [-2.8, 1.9],
];
const ENEMY_POS: [number, number][] = [
  [2.0, 0.6],
  [2.6, -0.9],
  [1.7, -2.0],
];

export async function start(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const modelName = (params.get('model') ?? 'sample-a').replace(/[^a-zA-Z0-9_-]/g, '');
  const settings: Settings = {
    count: 4,
    shadows: true,
    pixelRatio: Math.min(window.devicePixelRatio, 2),
    springs: true,
  };

  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x141826);
  scene.fog = new THREE.Fog(0x141826, 14, 32);

  // 戦いの画面：少し上から、味方（左）と敵（右）を横から見る
  const camera = new THREE.PerspectiveCamera(35, 16 / 9, 0.1, 100);
  camera.position.set(0, 2.1, 7.2);
  camera.lookAt(0, 0.9, 0);

  scene.add(new THREE.HemisphereLight(0x8899cc, 0x221a22, 1.2));
  const moon = new THREE.DirectionalLight(0xdfe6ff, 2.4);
  moon.position.set(3, 8, 5);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  Object.assign(moon.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6 });
  scene.add(moon);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(14, 48),
    new THREE.MeshStandardMaterial({ color: 0x2a3042, roughness: 0.9 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // 敵の仮の形（段階4で本物に置き換える）
  const enemyMat = new THREE.MeshStandardMaterial({ color: 0x5b6378, roughness: 0.4, metalness: 0.6 });
  const enemyEye = new THREE.MeshBasicMaterial({ color: 0xff3355 });
  const enemies: THREE.Group[] = ENEMY_POS.map(([x, z], i) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.5 + i * 0.15, 6, 20), enemyMat);
    body.position.y = 0.7 + i * 0.08;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), enemyEye);
    eye.position.set(-0.3, 1.0 + i * 0.12, 0);
    g.add(body, eye);
    g.position.set(x, 0, z);
    g.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    scene.add(g);
    return g;
  });

  const hud = new PerfHud(renderer);
  const status = addStatusLine();
  status.textContent = `読み込み中… models/${modelName}.vrm`;

  // ---- キャラの読み込み（同じファイルを4回組み立てる＝4人分のメモリを使う）----
  // 開発サーバーでは models/ から読む。公開ページにはモデルを置かないので、
  // 「VRMを選ぶ」でスマホの中のファイルを選んで読む（ファイルはどこにも送らない）。
  let vrms: VRM[] = [];
  let loadInfo = '';
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));

  async function loadFrom(getBuffer: () => Promise<ArrayBuffer>, label: string): Promise<void> {
    vrms.forEach((v) => {
      scene.remove(v.scene);
      VRMUtils.deepDispose(v.scene);
    });
    vrms = [];
    status.textContent = `読み込み中… ${label}`;
    const loadStart = performance.now();
    try {
      const buf = await getBuffer();
      for (let i = 0; i < PARTY_POS.length; i++) {
        const gltf = await loader.parseAsync(buf.slice(0), '');
        const vrm = gltf.userData.vrm as VRM;
        VRMUtils.removeUnnecessaryVertices(vrm.scene);
        VRMUtils.combineSkeletons(vrm.scene);
        VRMUtils.combineMorphs(vrm);
        vrm.scene.traverse((o) => {
          o.frustumCulled = false;
          if ((o as THREE.Mesh).isMesh) o.castShadow = true;
        });
        const [x, z] = PARTY_POS[i];
        vrm.scene.position.set(x, 0, z);
        vrm.scene.rotation.y = Math.PI / 2; // 右（敵の方）を向く
        lowerArms(vrm);
        scene.add(vrm.scene);
        vrms.push(vrm);
        status.textContent = `読み込み中… ${i + 1}/${PARTY_POS.length}`;
      }
      const sec = (performance.now() - loadStart) / 1000;
      loadInfo = `${label} ${(buf.byteLength / 1048576).toFixed(1)}MB  読み込み ${sec.toFixed(1)}秒`;
    } catch (e) {
      loadInfo = `読み込めませんでした：${label}（${String(e)}）
右下の「VRMを選ぶ」でファイルを選んでください`;
    }
    apply();
  }

  const picker = document.createElement('input');
  picker.type = 'file'; // accept は付けない（Android で .vrm が選べなくなることがある）
  picker.hidden = true;
  document.body.appendChild(picker);
  picker.addEventListener('change', () => {
    const file = picker.files?.[0];
    if (file) void loadFrom(() => file.arrayBuffer(), file.name);
    picker.value = '';
  });

  // ---- 切り替えボタン ----
  const apply = () => {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, settings.pixelRatio));
    renderer.shadowMap.enabled = settings.shadows;
    moon.castShadow = settings.shadows;
    scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (m) (Array.isArray(m) ? m : [m]).forEach((mm) => (mm.needsUpdate = true));
    });
    vrms.forEach((v, i) => (v.scene.visible = i < settings.count));
    resize();
    status.textContent = `${loadInfo}\n人数 ${settings.count}  影 ${settings.shadows ? 'あり' : 'なし'}  細かさ ${settings.pixelRatio}  揺れ ${settings.springs ? 'あり' : 'なし'}`;
  };
  addButtons([
    ['人数', () => { settings.count = (settings.count % 4) + 1; apply(); }],
    ['影', () => { settings.shadows = !settings.shadows; apply(); }],
    ['細かさ', () => { settings.pixelRatio = nextOf([1, 1.5, 2, 3], settings.pixelRatio); apply(); }],
    ['揺れ', () => { settings.springs = !settings.springs; apply(); }],
    ['VRMを選ぶ', () => picker.click()],
  ]);

  function resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);

  let paused = false;
  watchOrientation((portrait) => (paused = portrait));
  document.addEventListener('visibilitychange', () => (paused = document.hidden));

  await loadFrom(async () => {
    const res = await fetch(`models/${modelName}.vrm`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.arrayBuffer();
  }, `models/${modelName}.vrm`);

  const clock = new THREE.Clock();
  let t = 0;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    if (paused) return;
    t += dt;
    vrms.forEach((vrm, i) => {
      if (!vrm.scene.visible) return;
      idle(vrm, t + i * 0.7);
      if (settings.springs) vrm.update(dt);
      else vrm.humanoid.update();
    });
    enemies.forEach((g, i) => (g.position.y = Math.sin(t * 2 + i) * 0.08 + 0.08));
    renderer.render(scene, camera);
    hud.tick();
  });
}

/** T字の腕を下ろす（VRM1.0 の正規化した骨で） */
function lowerArms(vrm: VRM): void {
  const h = vrm.humanoid;
  h.getNormalizedBoneNode('leftUpperArm')?.rotation.set(0, 0, -1.2);
  h.getNormalizedBoneNode('rightUpperArm')?.rotation.set(0, 0, 1.2);
  h.getNormalizedBoneNode('leftLowerArm')?.rotation.set(0, -0.3, 0);
  h.getNormalizedBoneNode('rightLowerArm')?.rotation.set(0, 0.3, 0);
}

/** 待機の動き：呼吸と小さな揺れ（段階2で本物の動きに置き換える） */
function idle(vrm: VRM, t: number): void {
  const h = vrm.humanoid;
  const breath = Math.sin(t * 2.2);
  h.getNormalizedBoneNode('spine')?.rotation.set(breath * 0.02, 0, Math.sin(t * 1.1) * 0.03);
  h.getNormalizedBoneNode('chest')?.rotation.set(breath * 0.03, 0, 0);
  h.getNormalizedBoneNode('head')?.rotation.set(0, Math.sin(t * 0.6) * 0.15, 0);
  h.getNormalizedBoneNode('leftUpperArm')?.rotation.set(0, 0, -1.2 + breath * 0.03);
  h.getNormalizedBoneNode('rightUpperArm')?.rotation.set(0, 0, 1.2 - breath * 0.03);
}

function nextOf<T>(list: T[], cur: T): T {
  return list[(list.indexOf(cur) + 1) % list.length];
}

function addStatusLine(): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'spike-status';
  document.body.appendChild(el);
  return el;
}

function addButtons(items: [string, () => void][]): void {
  const bar = document.createElement('div');
  bar.className = 'spike-buttons';
  for (const [label, onTap] of items) {
    const b = document.createElement('button');
    b.textContent = label;
    b.addEventListener('click', onTap);
    bar.appendChild(b);
  }
  document.body.appendChild(bar);
}
