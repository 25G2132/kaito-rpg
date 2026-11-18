import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm';
import '../battleView/battle.css';
import '../ui/menus.css';
import { Battle } from '../battle/battle';
import { runAuto } from '../battle/auto';
import { makeRng } from '../battle/rng';
import type { EncounterDef } from '../battle/types';
import { GAME_DATA, DEFAULT_PARTY } from '../data';
import { CHARACTERS } from '../data/characters';
import { BattleController, type RunResult } from '../battleView/controller';
import { GameClock } from '../battleView/clock';
import { Hud } from '../battleView/hud';
import { Stage } from '../battleView/stage';
import { PerfHud } from '../dev/perfHud';
import { applyRewards, autoInvest, partyFor, partyPower, recordLoss, rollRewards, type Reward } from '../progress/growth';
import { defaultSave, loadSave, storeSave } from '../progress/save';
import { esc, matsHtml } from '../ui/fmt';
import { GrowthView } from '../ui/growthView';
import { watchOrientation } from '../ui/orientation';

// 段階3：先行版。拠点 → 戦う → ごほうび → 育てる → 前に負けたボスに勝つ、をくり返す。
// 保存はブラウザの中（localStorage）。
// キャラは VRM があれば VRM（4人とも同じモデル）、無ければ仮の形で動く。
//   開発サーバー：public/models/sample-a.vrm があれば自動で読む（?novrm で読まない）
//   公開ページ：「VRMを選ぶ」でスマホの中のファイルを選ぶ（ファイルはどこにも送らない）

export function start(): void {
  const params = new URLSearchParams(location.search);
  const storage = (() => {
    try {
      return window.localStorage;
    } catch {
      return undefined;
    }
  })();
  const loaded = loadSave(storage);
  let save = loaded.save;
  const persist = () => storeSave(storage, save);
  const rng = makeRng(Date.now());

  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const clock = new GameClock();
  const stage = new Stage(canvas, clock);
  let ctrl: BattleController | null = null;
  let growth: GrowthView | null = null;
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
    showHub('VRM を読み込み中…');
    try {
      await loadVrm(await file.arrayBuffer(), file.name);
      showHub();
    } catch (e) {
      showHub(`VRM を読み込めませんでした（${String(e)}）`);
    }
  });

  // ---- 拠点 ----
  let hubEl: HTMLDivElement | null = null;
  function closeHub(): void {
    hubEl?.remove();
    hubEl = null;
  }

  function showHub(note = ''): void {
    closeHub();
    growth?.close();
    growth = null;
    hud.closeOverlay();
    hud.clearBattle();
    stage.clearEnemies();
    stage.showParty(save.party.map((id) => CHARACTERS[id]), vrms);
    const power = partyPower(save);
    const encs = Object.values(GAME_DATA.encounters)
      .map((e) => {
        const wins = save.wins[e.id] ?? 0;
        const losses = save.losses[e.id] ?? 0;
        const tag = wins ? `<span class="tag won">勝った ${wins}回</span>` : losses ? `<span class="tag lost">負けた ${losses}回</span>` : '';
        const rec = e.recommend ? `おすすめ戦力 ${e.recommend}` : '';
        const canSkip = e.kind === 'farm' && wins > 0;
        return `<div class="enc${e.kind === 'boss' ? ' boss' : ''}">
          <div class="grow"><div class="ename2">${esc(e.name)}${tag}</div><div class="edesc">${esc(e.desc)}<br>${rec}</div></div>
          ${canSkip ? `<button class="btn" data-skip="${e.id}">すぐ終わらせる<small>自動で一瞬</small></button>` : ''}
          <button class="btn main" data-fight="${e.id}">戦う</button>
        </div>`;
      })
      .join('');
    const lostBoss = (save.losses.vault ?? 0) > 0 && !(save.wins.vault > 0);
    const notice = note
      ? `<div class="hub-notice">${esc(note)}</div>`
      : lostBoss
        ? `<div class="hub-notice">番人に負けた…。材料の戦いで材料を集めて「育てる」で強くしよう。戦力 ${power} / おすすめ ${GAME_DATA.encounters.vault.recommend}</div>`
        : !(save.wins.vault > 0) && !Object.keys(save.wins).length
          ? `<div class="hub-notice">まずはボス「金庫室の番人」に挑んでみよう。勝てなければ、材料を集めて育てよう。</div>`
          : '';
    hubEl = document.createElement('div');
    hubEl.className = 'screen hub';
    hubEl.innerHTML = `<div class="hub-main">
      <div class="row"><div class="grow"><div class="hub-title">第1章　夜の金庫室</div>
        <div class="power">チーム戦力 ${power}</div></div>
        <button class="btn gold" data-act="grow">育てる</button></div>
      ${notice}
      <div class="mats">${matsHtml(save.items)}</div>
      ${encs}
      <div class="row muted">
        <button class="btn" data-act="vrm">VRMを選ぶ</button><span class="grow">見た目：${esc(vrmLabel)}</span>
        <button class="btn" data-act="reset">データを消す</button>
      </div>
    </div>`;
    hubEl.addEventListener('click', (ev) => {
      const t = (ev.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (!t) return;
      if (t.dataset.fight) void runBattle(t.dataset.fight);
      else if (t.dataset.skip) skipBattle(t.dataset.skip);
      else if (t.dataset.act === 'grow') openGrowth();
      else if (t.dataset.act === 'vrm') picker.click();
      else if (t.dataset.act === 'reset') {
        if (window.confirm('育てたデータをすべて消して、はじめからにします。よいですか？')) {
          save = defaultSave();
          persist();
          showHub('データを消しました');
        }
      }
    });
    document.body.appendChild(hubEl);
  }

  function openGrowth(charId?: string): void {
    closeHub();
    growth = new GrowthView(save, rng, persist, () => showHub(), charId);
  }

  // ---- 戦い ----
  async function runBattle(encId: string): Promise<void> {
    closeHub();
    hud.closeOverlay();
    ctrl?.stop();
    const enc = GAME_DATA.encounters[encId];
    ctrl = new BattleController({ data: GAME_DATA, stage, hud, clock, party: partyFor(save), encounter: encId, vrms, auto, speed });
    const res = await ctrl.run();
    ctrl = null;
    finish(enc, res);
  }

  /** 勝ったことのある材料の戦いは、自動で一瞬で終わらせられる */
  function skipBattle(encId: string): void {
    const enc = GAME_DATA.encounters[encId];
    const b = new Battle(GAME_DATA, { party: partyFor(save), encounter: encId, seed: Date.now() });
    const phase = runAuto(b);
    finish(enc, { result: phase === 'won' ? 'won' : 'lost', turns: b.turnCount, biggest: 0, synergies: 0 }, true);
  }

  function finish(enc: EncounterDef, res: RunResult, skipped = false): void {
    closeHub();
    const won = res.result === 'won';
    const beforeLevels = Object.fromEntries(save.party.map((id) => [id, save.chars[id].level]));
    const revenge = won && enc.kind === 'boss' && !(save.wins[enc.id] > 0) && (save.losses[enc.id] ?? 0) > 0;
    let reward: Reward | null = null;
    if (won) {
      reward = rollRewards(enc, rng, save);
      applyRewards(save, reward, enc);
    } else {
      recordLoss(save, enc);
    }
    persist();
    const ups = save.party
      .filter((id) => save.chars[id].level > beforeLevels[id])
      .map((id) => `${CHARACTERS[id].name} Lv${beforeLevels[id]}→${save.chars[id].level}`)
      .join('　');
    const stats = skipped ? `自動で終わらせた（番の数 ${res.turns}）` : `番の数 ${res.turns}　いちばん大きな数字 ${res.biggest}　相性 ${res.synergies}回`;
    const rewardHtml = reward
      ? `<div class="rewards">${matsHtml(reward.items, true)}${reward.gear.length ? `<span class="mat">装備 ${reward.gear.length}個</span>` : ''}<span class="mat">経験値 +${reward.exp}（4人それぞれ）</span></div>
         ${ups ? `<p style="text-align:center" class="gain">レベルアップ！ ${ups}</p>` : ''}`
      : '';
    const advice =
      !won && enc.kind === 'boss'
        ? `<p style="text-align:center">チーム戦力 ${partyPower(save)} / おすすめ ${enc.recommend}。材料の戦いで集めて「育てる」で強くしよう。</p>`
        : !won
          ? '<p style="text-align:center">守りが崩れた敵は1回休み。相性を使うと大きな数字が出る。</p>'
          : '';
    const p = hud.overlay(
      `<h1>${won ? '勝った！' : '負けた…'}</h1>
       ${revenge ? '<div class="celebrate">前に負けた番人に、勝った！ 育てた成果だ！</div>' : ''}
       <p style="text-align:center">${stats}</p>
       ${rewardHtml}${advice}
       <div class="choices" style="margin-top:10px">
         <button class="choice" data-act="again"><b>もう一度</b><span>${esc(enc.name)}</span></button>
         <button class="choice" data-act="grow"><b>育てる</b><span>材料を使って強くする</span></button>
         <button class="choice" data-act="hub"><b>拠点へ</b><span>ほかの相手を選ぶ</span></button>
       </div>`,
      `result ${won ? 'won' : 'lost'}`,
    );
    p.querySelector('[data-act="again"]')?.addEventListener('click', () => (skipped ? skipBattle(enc.id) : void runBattle(enc.id)));
    p.querySelector('[data-act="grow"]')?.addEventListener('click', () => {
      hud.closeOverlay();
      hud.clearBattle();
      stage.clearEnemies();
      openGrowth();
    });
    p.querySelector('[data-act="hub"]')?.addEventListener('click', () => showHub());
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

  // 開発サーバーだけ：確かめ用に、戦いを一瞬で終わらせる（公開ページには入らない）
  if (import.meta.env.DEV) Object.assign(window, { __kaito: { skip: skipBattle, save: () => save, invest: () => autoInvest(save, rng) } });

  showHub(loaded.reset ? '保存データが読めなかったので、はじめからにしました' : '');
  // 開発サーバーでは見本の VRM を自動で読む（公開ページには置いていないので、無ければ仮の形のまま）
  void (async () => {
    if (params.has('novrm')) return;
    try {
      const res = await fetch('models/sample-a.vrm');
      if (!res.ok || (res.headers.get('content-type') ?? '').includes('text/html')) return;
      await loadVrm(await res.arrayBuffer(), 'models/sample-a.vrm');
      if (hubEl) showHub();
    } catch {
      /* 無ければ仮の形 */
    }
  })();
}
