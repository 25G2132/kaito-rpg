import * as THREE from 'three';
import { PerfHud } from './dev/perfHud';
import { watchOrientation } from './ui/orientation';

// 段階0：横画面の空の3D画面と、重さの表示。
// 段階1で、ここに VRoid のキャラを並べて重さを測る。

const MAX_PIXEL_RATIO = 2; // 細かすぎる画面で重くならないよう上限を置く（段階1で決め直す）

const canvas = document.getElementById('view') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x141826);
scene.fog = new THREE.Fog(0x141826, 12, 30);

const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 100);
camera.position.set(0, 2.2, 7);
camera.lookAt(0, 0.9, 0);

// 光：夜の怪盗らしく、月明かり＋足もとの弱い明かり
scene.add(new THREE.HemisphereLight(0x8899cc, 0x221a22, 0.6));
const moon = new THREE.DirectionalLight(0xdfe6ff, 2.2);
moon.position.set(4, 8, 3);
moon.castShadow = true;
moon.shadow.mapSize.set(1024, 1024);
moon.shadow.camera.left = -6;
moon.shadow.camera.right = 6;
moon.shadow.camera.top = 6;
moon.shadow.camera.bottom = -6;
scene.add(moon);

// 床と、キャラの代わりの柱（段階1で VRoid のキャラに置き換える）
const floor = new THREE.Mesh(
  new THREE.CircleGeometry(12, 48),
  new THREE.MeshStandardMaterial({ color: 0x2a3042, roughness: 0.9 }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const stand = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.3, 1.0, 6, 16),
  new THREE.MeshStandardMaterial({ color: 0xd4486a, roughness: 0.5 }),
);
stand.position.y = 0.8;
stand.castShadow = true;
scene.add(stand);

const hud = import.meta.env.DEV || new URLSearchParams(location.search).has('perf')
  ? new PerfHud(renderer)
  : null;

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

let paused = false;
watchOrientation((portrait) => {
  paused = portrait;
});
document.addEventListener('visibilitychange', () => {
  paused = document.hidden;
});

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  if (paused) return;
  stand.rotation.y += dt * 0.8;
  renderer.render(scene, camera);
  hud?.tick();
});
