import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm';
import '../battleView/battle.css';
import { GAME_DATA, DEFAULT_LEVEL, DEFAULT_PARTY } from '../data';
import { BattleController } from '../battleView/controller';
import { GameClock } from '../battleView/clock';
import { Hud } from '../battleView/hud';
import { Stage } from '../battleView/stage';
import { PerfHud } from '../dev/perfHud';
import { watchOrientation } from '../ui/orientation';

// 段階2：戦いの画面。はじめに戦う相手を選び、終わったら結果を出す。
// キャラは VRM があれば VRM（4人とも同じモデル）、無ければ仮の形で動く。
//   開発サーバー：public/models/sample-a.vrm があれば自動で読む
//   公開ページ：「VRMを選ぶ」でスマホの中のファイルを選ぶ（ファイルはどこにも送らない）
//   ?lv=10 で味方のレベルを変えられる（釣り合いの確かめ用）。?novrm で見本の VRM を読まない

export function start(): void {
  const params = new URLSearchParams(location.search);
  const level = Math.max(1, Math.min(90, Number(params.get('lv')) || DEFAULT_LEVEL));
  const party = DEFAULT_PARTY.map((id) => ({ id, level }));

  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const clock = new GameClock();
  const stage = new Stage(canvas, clock);
  let ctrl: BattleController | null = null;
  let auto = false;
  let speed = 1;

  const hud = new Hud(GAME_DATA, {
    onBasic: () => ctrl?.tapBasic(),
    onSkill: () => ctrl?.tapSkill(),
    onUlt: (uid) => ctrl?.tapUlt(uid),
    onTarget: (uid) => ctrl?.tapTarget(uid),
    onAuto: () => {
      ctrl?.toggleAuto();
      auto = ctrl?.auto ?? auto;
    },
    onSpeed: () => {
      ctrl?.toggleSpeed();
      speed = ctrl?.speed ?? speed;
    },
  });

  // 3D の敵をタップしてねらう
  canvas.addEventListener('pointerdown', (ev) => {
    if (!ctrl) return;
    const uid = stage.pick(ev.clientX, ev.clientY, ctrl.battle.aliveEnemies());
    if (uid) ctrl.tapTarget(uid);
  });

  // ---- VRM（あれば） ----
  let vrms: VRM[] | null = null;
  let vrmLabel = '仮の形';
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  async function loadVrm(buf: ArrayBuffer, label: string): Promise<void> {
    const list: VRM[] = [];
    for (let i = 0; i < DEFAULT_PARTY.length; i++) {
      const gltf = await loader.parseAsync(buf.slice(0), '');
      const vrm = gltf.userData.vrm as VRM;
      VRMUtils.removeUnnecessaryVertices(vrm.scene);
      VRMUtils.combineSkeletons(vrm.scene);
      VRMUtils.combineMorphs(vrm);
      list.push(vrm);
    }
    vrms?.forEach((v) => VRMUtils.deepDispose(v.scene));
    vrms = list;
    vrmLabel = label;
  }
  const picker = document.createElement('input');
  picker.type = 'file'; // accept は付けない（Android で .vrm が選べなくなることがある）
  picker.hidden = true;
  document.body.appendChild(picker);
  picker.addEventListener('change', async () => {
    const file = picker.files?.[0];
    picker.value = '';
    if (!file) return;
    showMenu('読み込み中…');
    try {
      await loadVrm(await file.arrayBuffer(), file.name);
      showMenu();
    } catch (e) {
      showMenu(`読み込めませんでした（${String(e)}）`);
    }
  });

  // ---- はじめの画面 ----
  function showMenu(note = ''): void {
    const members = DEFAULT_PARTY.map((id) => {
      const c = GAME_DATA.characters[id];
      const e = GAME_DATA.elements[c.element];
      return `<div class="member"><b style="color:${e.color}">${e.name}</b> <b>${c.name}</b><br>${c.role}<br>
        スキル：${c.skill.name}<br>必殺技：${c.ult.name}</div>`;
    }).join('');
    const encs = Object.values(GAME_DATA.encounters)
      .map((x) => `<button class="choice" data-enc="${x.id}"><b>${x.name}</b><span>${x.desc}</span></button>`)
      .join('');
    const p = hud.overlay(
      `<h1>戦いの試作</h1>
       <p>敵をタップしてねらい、右下のボタンで技を使う。カードが光ったら、タップで<b>必殺技</b>（いつでも割り込める）。</p>
       <p>相性：シンの〔解析〕→ アカリの「紅蓮一閃」が2倍。アカリの〔燃焼〕→ ハヤテの「煽り風」で倍にして燃やす。</p>
       <h2>仲間（レベル${level}）</h2><div class="members">${members}</div>
       <h2>戦う相手</h2><div class="choices">${encs}</div>
       <h2>見た目</h2>
       <p><button class="small" data-act="vrm">VRMを選ぶ</button>　いま：${vrmLabel}${note ? `　<b>${note}</b>` : ''}</p>`,
    );
    p.querySelectorAll<HTMLButtonElement>('[data-enc]').forEach((btn) =>
      btn.addEventListener('click', () => void runBattle(btn.dataset.enc!)),
    );
    p.querySelector('[data-act="vrm"]')?.addEventListener('click', () => picker.click());
  }

  async function runBattle(encounter: string): Promise<void> {
    hud.closeOverlay();
    ctrl?.stop();
    for (const [, a] of stage.actors) a.setVrm(undefined);
    ctrl = new BattleController({ data: GAME_DATA, stage, hud, clock, party, encounter, vrms, auto, speed });
    const res = await ctrl.run();
    const won = res.result === 'won';
    const p = hud.overlay(
      `<h1>${won ? '勝った！' : '負けた…'}</h1>
       <p style="text-align:center">番の数 ${res.turns}　いちばん大きな数字 ${res.biggest}　相性 ${res.synergies}回</p>
       ${won ? '' : '<p style="text-align:center">守りが崩れた敵は1回休み。ボスがためている間に崩すと、大技を止められる。</p>'}
       <div class="choices" style="margin-top:12px">
         <button class="choice" data-act="again"><b>もう一度</b><span>同じ相手と戦う</span></button>
         <button class="choice" data-act="menu"><b>相手を選ぶ</b><span>はじめの画面へ</span></button>
       </div>`,
      `result ${won ? 'won' : 'lost'}`,
    );
    p.querySelector('[data-act="again"]')?.addEventListener('click', () => void runBattle(encounter));
    p.querySelector('[data-act="menu"]')?.addEventListener('click', () => showMenu());
  }

  // ---- 毎コマ ----
  const perf = import.meta.env.DEV || params.has('perf') ? new PerfHud(stage.renderer) : null;
  let paused = false;
  watchOrientation((portrait) => (paused = portrait));
  document.addEventListener('visibilitychange', () => (paused = document.hidden));
  const timer = new THREE.Clock();
  stage.renderer.setAnimationLoop(() => {
    const real = Math.min(timer.getDelta(), 0.1);
    if (paused) return;
    const dt = clock.update(real);
    stage.update(dt);
    hud.follow(stage);
    stage.render();
    perf?.tick();
  });

  showMenu();
  // 開発サーバーでは見本の VRM を自動で読む（公開ページには置いていないので、無ければ仮の形のまま）
  void (async () => {
    if (params.has('novrm')) return; // 仮の形で確かめるとき
    try {
      const res = await fetch('models/sample-a.vrm');
      if (!res.ok || (res.headers.get('content-type') ?? '').includes('text/html')) return;
      showMenu('見本の VRM を読み込み中…');
      await loadVrm(await res.arrayBuffer(), 'models/sample-a.vrm');
      if (!ctrl) showMenu();
    } catch {
      /* 無ければ仮の形 */
    }
  })();
}
