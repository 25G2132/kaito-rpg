import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm';
import '../battleView/battle.css';
import '../ui/menus.css';
import { Battle, type Opening } from '../battle/battle';
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
import { goNight, recruitAlly, sleep, slotOf, talk, talksToNext, TALKS_PER_DAY, type RecruitResult } from '../progress/growth';
import { SLOT_NAMES, type NpcDef } from '../field/types';
import { applyRewards, autoInvest, isUnlocked, partyFor, partyPower, recordLoss, rollRewards, type Reward } from '../progress/growth';
import { defaultSave, loadSave, storeSave } from '../progress/save';
import { ITEMS } from '../data/items';
import { esc, matsHtml, oddsText, slotName, stars } from '../ui/fmt';
import { GrowthView } from '../ui/growthView';
import { openFormation } from '../ui/formationView';
import { watchOrientation } from '../ui/orientation';
import '../fieldView/field.css';
import { MANSION, SCHOOL } from '../data/maps';
import { showTalk } from '../ui/talkView';
import { transition } from '../ui/loading';
import { FieldState, type FieldEvent } from '../field/logic';
import type { Vec2 } from '../field/types';
import { FieldHud } from '../fieldView/fieldHud';
import { FieldView } from '../fieldView/fieldView';

// 拠点 → 忍び込む（歩く場所）／材料の戦い → ごほうび → 育てる → 前に負けたボスに勝つ、をくり返す。
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
    onPersuade: () => ctrl?.tapPersuade(),
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
    onPause: () => showPause(),
  });

  /** 一時停止：続ける／撤退する（撤退は負けに数えない） */
  function showPause(): void {
    const c = ctrl;
    if (!c || c.isPaused) return;
    c.setPaused(true);
    const p = hud.overlay(
      `<h1 style="text-align:center">一時停止</h1>
       <div class="choices" style="margin-top:10px">
         <button class="choice" data-act="resume"><b>続ける</b><span>戦いにもどる</span></button>
         <button class="choice" data-act="retreat"><b>撤退する</b><span>拠点へもどる（負けには数えない）</span></button>
       </div>`,
    );
    p.querySelector('[data-act="resume"]')?.addEventListener('click', () => {
      hud.closeOverlay();
      c.setPaused(false);
    });
    p.querySelector('[data-act="retreat"]')?.addEventListener('click', () => {
      hud.closeOverlay();
      c.setPaused(false);
      c.stop();
    });
  }

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
  /** キャラごとの VRM（見本の VRM は主人公たち4人ぶん読む。協力者は仮の形） */
  const vrmOf = (id: string): VRM | null => {
    const i = DEFAULT_PARTY.indexOf(id);
    return i >= 0 ? (vrms?.[i] ?? null) : null;
  };
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
    stage.showParty(save.party.map((id) => CHARACTERS[id]), save.party.map(vrmOf));
    const power = partyPower(save);
    const encs = encounterCards();
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
        <div class="power">${save.day}日目の夜　チーム戦力 ${power}</div></div>
        <button class="btn" data-act="sleep">寝る<small>次の日の昼へ</small></button>
        <button class="btn" data-act="party">編成<small>${save.party.length}人</small></button>
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
      else if (t.dataset.tier) {
        selTier[t.dataset.group!] = Number(t.dataset.tier);
        showHub(note);
      }
      else if (t.dataset.act === 'grow') openGrowth();
      else if (t.dataset.act === 'party') {
        closeHub();
        openFormation(save, (changed) => {
          if (changed) persist();
          showHub(changed ? '編成を変えました' : '');
        });
      }
      else if (t.dataset.act === 'infiltrate') void transition(MANSION.name, '夜の屋敷に忍び込む', startInfiltration);
      else if (t.dataset.act === 'sleep') {
        sleep(save);
        persist();
        closeHub();
        void transition('学校', `${save.day}日目の朝`, () => startSchool());
      }
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

  /** 選んでいる段階（材料の戦いごと）。はじめは挑める一番上 */
  const selTier: Record<string, number> = {};

  function encounterCards(): string {
    const all = Object.values(GAME_DATA.encounters);
    const groups = [...new Set(all.filter((e) => e.group).map((e) => e.group!))];
    const card = (e: EncounterDef, tierBtns = '') => {
      const wins = save.wins[e.id] ?? 0;
      const losses = save.losses[e.id] ?? 0;
      const tag = wins ? `<span class="tag won">勝った ${wins}回</span>` : losses ? `<span class="tag lost">負けた ${losses}回</span>` : '';
      const odds = e.gearOdds ? oddsText(e.gearOdds) : '';
      return `<div class="enc${e.kind === 'boss' ? ' boss' : ''}">
          <div class="grow"><div class="ename2">${esc(e.name)}${tag}</div>
            <div class="edesc">${esc(e.desc)}　おすすめ戦力 ${e.recommend ?? '-'}${odds ? `<br>装備：${odds}` : ''}</div>
            ${tierBtns}</div>
          <button class="btn main" data-fight="${e.id}">戦う</button>
        </div>`;
    };
    const farms = groups.map((g) => {
      const tiers = all.filter((e) => e.group === g).sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0));
      const open = tiers.filter((e) => isUnlocked(save, e));
      const cur = Math.min(selTier[g] ?? open[open.length - 1].tier!, open[open.length - 1].tier!);
      const btns = tiers
        .map((e) => {
          const ok = isUnlocked(save, e);
          return `<button class="tierbtn${e.tier === cur ? ' on' : ''}" data-group="${g}" data-tier="${e.tier}" ${ok ? '' : 'disabled'}>${['I', 'II', 'III', 'IV'][e.tier! - 1]}${ok ? '' : '<small>🔒</small>'}</button>`;
        })
        .join('');
      const locked = tiers.find((e) => !isUnlocked(save, e));
      const hint = locked ? `<span class="muted">　${['I', 'II', 'III', 'IV'][locked.tier! - 2]} に勝つと ${['I', 'II', 'III', 'IV'][locked.tier! - 1]} に挑める</span>` : '';
      return card(tiers.find((e) => e.tier === cur)!, `<div class="tiers">段階 ${btns}${hint}</div>`);
    });
    // 忍び込む（歩く場所）。ボスは、一度扉の前まで行くと拠点からも挑める
    const infiltrate = `<div class="enc boss"><div class="grow"><div class="ename2">${MANSION.name}に忍び込む</div>
        <div class="edesc">見回りとカメラを影でかわし、端末をハッキングして奥へ。最後に「${esc(MANSION.boss.name)}」。10〜20分<br>おすすめ戦力 ${GAME_DATA.encounters[MANSION.boss.encounter].recommend}</div></div>
        <button class="btn gold" data-act="infiltrate">忍び込む</button></div>`;
    const bosses = all.filter((e) => e.kind === 'boss' && save.flags[`${e.id}_reached`]).map((e) => card(e));
    return [infiltrate, ...farms, ...bosses].join('');
  }

  function openGrowth(charId?: string): void {
    closeHub();
    growth = new GrowthView(save, rng, persist, () => showHub(), charId);
  }

  // ---- 戦い ----
  /** 歩く場所からの戦いなら、その見回り（ボスなら null）と始まり方 */
  type FieldCtx = { opening: Opening; patrol: string | null };

  async function runBattle(encId: string, fctx?: FieldCtx): Promise<void> {
    closeHub();
    hud.closeOverlay();
    ctrl?.stop();
    const enc = GAME_DATA.encounters[encId];
    ctrl = new BattleController({ data: GAME_DATA, stage, hud, clock, party: partyFor(save), encounter: encId, vrms: save.party.map(vrmOf), auto, speed, opening: fctx?.opening });
    const res = await ctrl.run();
    ctrl = null;
    if (res.result === 'retreat') {
      if (fctx) endInfiltration();
      showHub('撤退しました');
      return;
    }
    finish(enc, res, false, fctx);
  }

  /** 開発サーバーの確かめ用だけ：自動で一瞬で終わらせる（画面のボタンはない） */
  function skipBattle(encId: string): void {
    const enc = GAME_DATA.encounters[encId];
    const b = new Battle(GAME_DATA, { party: partyFor(save), encounter: encId, seed: Date.now() });
    const phase = runAuto(b);
    finish(enc, { result: phase === 'won' ? 'won' : 'lost', turns: b.turnCount, biggest: 0, synergies: 0, seconds: 0, totalDamage: 0, recruited: [...b.recruited] }, true);
  }

  function finish(enc: EncounterDef, res: RunResult, skipped = false, fctx?: FieldCtx): void {
    closeHub();
    const won = res.result === 'won';
    const beforeLevels = Object.fromEntries(save.party.map((id) => [id, save.chars[id].level]));
    const revenge = won && enc.kind === 'boss' && !(save.wins[enc.id] > 0) && (save.losses[enc.id] ?? 0) > 0;
    let reward: Reward | null = null;
    const recruits: RecruitResult[] = [];
    if (won) {
      reward = rollRewards(enc, rng, save);
      applyRewards(save, reward, enc);
      // 説得で仲間になった敵を、協力者として迎える
      for (const e of res.recruited) {
        const r = recruitAlly(save, e);
        if (r) recruits.push(r);
      }
    } else {
      recordLoss(save, enc);
    }
    persist();
    const ups = save.party
      .filter((id) => save.chars[id].level > beforeLevels[id])
      .map((id) => `${CHARACTERS[id].name} Lv${beforeLevels[id]}→${save.chars[id].level}`)
      .join('　');
    const mmss = `${Math.floor(res.seconds / 60)}:${String(res.seconds % 60).padStart(2, '0')}`;
    const stats = skipped
      ? `自動で一瞬で終わらせた（番の数 ${res.turns}）`
      : `かかった時間 ${mmss}　総ダメージ ${res.totalDamage.toLocaleString('ja-JP')}　いちばん大きな数字 ${res.biggest}　相性 ${res.synergies}回`;
    // ごほうびは1つずつ出す。いい物ほどあとに、光らせて出す
    const STEP = 0.32;
    const entries: string[] = [];
    let best = 0;
    if (reward) {
      entries.push(`<span class="rw">経験値 +${reward.exp}<small>仲間それぞれ</small></span>`);
      for (const [k, n] of Object.entries(reward.items)) {
        const d = ITEMS[k];
        entries.push(`<span class="rw"><i style="background:${d.color}"></i>${d.name} ×${n}</span>`);
      }
      for (const g of [...reward.gear].sort((a, b) => a.rarity - b.rarity)) {
        best = Math.max(best, g.rarity);
        entries.push(`<span class="rw gear r${g.rarity}">${stars(g.rarity)}<small>${slotName(g.slot)}</small></span>`);
      }
      for (const r of recruits) {
        const name = CHARACTERS[r.charId].name;
        if (r.isNew) {
          best = Math.max(best, 5);
          entries.push(`<span class="rw gear r5">協力者<small>${name}（編成で連れて行ける）</small></span>`);
        } else entries.push(`<span class="rw">${name}はもう仲間<small>参考書×1</small></span>`);
      }
    }
    const rewardHtml = reward
      ? `<div class="rewards">${entries.map((x, i) => x.replace('class="rw', `style="animation-delay:${(i * STEP).toFixed(2)}s" class="rw`)).join('')}</div>
         ${ups ? `<p class="levelup" style="animation-delay:${(entries.length * STEP).toFixed(2)}s">レベルアップ！ ${ups}</p>` : ''}`
      : '';
    // ★5 が出たら、出た瞬間に画面を光らせる
    if (best >= 5) window.setTimeout(() => hud.flash(false), (entries.length - 1) * STEP * 1000);
    const advice =
      !won && enc.kind === 'boss'
        ? `<p style="text-align:center">チーム戦力 ${partyPower(save)} / おすすめ ${enc.recommend}。材料の戦いで集めて「育てる」で強くしよう。</p>`
        : !won
          ? '<p style="text-align:center">守りが崩れた敵は1回休み。相性を使うと大きな数字が出る。</p>'
          : '';
    // 歩く場所の戦いなら、終わり方がちがう
    const inField = !!fctx;
    const escaped = inField && won && fctx!.patrol === null; // ボスに勝って脱出
    if (inField && (!won || escaped)) endInfiltration();
    const title = escaped ? '脱出成功！' : inField && !won ? '捕まってしまった…' : won ? '勝った！' : '負けた…';
    const buttons =
      inField && won && !escaped
        ? '<button class="choice" data-act="continue"><b>探索にもどる</b><span>見つからないように奥へ</span></button>'
        : inField
          ? `<button class="choice" data-act="grow"><b>育てる</b><span>材料を使って強くする</span></button>
             <button class="choice" data-act="hub"><b>拠点へ</b><span>${escaped ? '金庫の中身を持ち帰った' : 'もう一度忍び込もう'}</span></button>`
          : `<button class="choice" data-act="again"><b>再挑戦</b><span>${esc(enc.name)}</span></button>
             <button class="choice" data-act="grow"><b>育てる</b><span>材料を使って強くする</span></button>
             <button class="choice" data-act="hub"><b>拠点へ</b><span>ほかの相手を選ぶ</span></button>`;
    const p = hud.overlay(
      `<h1>${title}</h1>
       ${revenge ? '<div class="celebrate">前に負けた番人に、勝った！ 育てた成果だ！</div>' : ''}
       <p style="text-align:center">${stats}</p>
       ${rewardHtml}${advice}
       <div class="choices" style="margin-top:10px">${buttons}</div>`,
      `result ${won ? 'won' : 'lost'}`,
    );
    p.querySelector('[data-act="again"]')?.addEventListener('click', () => (skipped ? skipBattle(enc.id) : void runBattle(enc.id)));
    p.querySelector('[data-act="continue"]')?.addEventListener('click', () => resumeField(fctx!.patrol!));
    p.querySelector('[data-act="grow"]')?.addEventListener('click', () => {
      hud.closeOverlay();
      hud.clearBattle();
      stage.clearEnemies();
      openGrowth();
    });
    p.querySelector('[data-act="hub"]')?.addEventListener('click', () => showHub());
  }

  // ---- 歩く場所（忍び込む） ----
  interface FieldRun {
    state: FieldState;
    view: FieldView;
    fh: FieldHud;
    hackT: number | null; // ハッキング中の時間
    busy: boolean; // 戦いの間は止める
    talking: boolean; // 会話の間は止める（画面は出したまま）
    mapTick: number;
    kind: 'mansion' | 'school';
  }
  let fieldRun: FieldRun | null = null;
  const HACK_TIME = 1.2;

  function startInfiltration(): void {
    closeHub();
    hud.closeOverlay();
    hud.clearBattle();
    stage.clearEnemies();
    const state = new FieldState(MANSION);
    const view = new FieldView(state, { playerLook: CHARACTERS.akari.look, vrm: vrmOf('akari') });
    view.resize(window.innerWidth, window.innerHeight);
    const fh = new FieldHud({ onAttack: fieldAttack, onInteract: fieldInteract, onMenu: fieldMenu });
    fieldRun = { state, view, fh, hackT: null, busy: false, talking: false, mapTick: 0, kind: 'mansion' };
    fh.banner(`${MANSION.name}に忍び込んだ。影の中なら見つからない`, 'info');
  }

  // ---- 昼の学校 ----
  function startSchool(note = ''): void {
    endInfiltration();
    closeHub();
    hud.closeOverlay();
    hud.clearBattle();
    stage.clearEnemies();
    stage.showParty([], null); // VRM を学校の人にわたす
    const state = new FieldState(SCHOOL, slotOf(save.talksToday));
    const npcVrms: Record<string, VRM | null> = {};
    for (const id of DEFAULT_PARTY) npcVrms[id] = vrmOf(id);
    const view = new FieldView(state, { playerLook: CHARACTERS.akari.look, vrm: vrmOf('akari'), day: true, npcVrms });
    view.resize(window.innerWidth, window.innerHeight);
    const fh = new FieldHud({ onAttack: () => {}, onInteract: fieldInteract, onMenu: schoolMenu }, { school: true, menuLabel: '下校' });
    fieldRun = { state, view, fh, hackT: null, busy: false, talking: false, mapTick: 0, kind: 'school' };
    fh.banner(note || `${save.day}日目の昼。仲間に話しかけると絆が深まる（1日${TALKS_PER_DAY}回）`, 'info');
  }

  function leaveSchool(): void {
    goNight(save);
    persist();
    void transition('夜の街', `${save.day}日目の夜。怪盗の時間だ`, () => {
      endInfiltration();
      showHub(`${save.day}日目の夜。怪盗の時間だ`);
    });
  }

  function schoolMenu(): void {
    if (!fieldRun || fieldRun.talking) return;
    if (window.confirm('下校して、夜にしますか？')) leaveSchool();
  }

  async function doTalk(charId: string): Promise<void> {
    const r = fieldRun;
    if (!r) return;
    r.talking = true;
    const name = CHARACTERS[charId].name;
    const res = talk(save, charId);
    if (!res.ok) {
      await showTalk([name, 'きょうはもう帰る時間だよ。また明日ね。'], '昇降口から下校すると夜になる');
    } else {
      persist();
      const next = talksToNext(save, charId);
      const after = res.levelUp
        ? `${name}との絆が <b>Lv${res.level}</b> になった！<br>${res.levelUp.desc}`
        : `${name}との絆が深まった（Lv${res.level}${next ? `・次まであと${next}回` : '・最大'}）`;
      await showTalk(res.lines, after);
      // 仲間と話すと時間が進む（朝 → 昼休み → 放課後）。チャイムが鳴る
      const slot = slotOf(save.talksToday);
      if (slot !== r.state.slot) {
        r.state.setSlot(slot);
        r.fh.banner(`🔔 キーンコーンカーンコーン……　${SLOT_NAMES[slot]}`, 'info');
      } else if (save.talksToday >= TALKS_PER_DAY) {
        r.fh.banner('🔔 下校の時間。昇降口から帰ろう', 'info');
      }
    }
    r.talking = false;
  }

  /** 生徒・先生と話す（ひとこと。話せる回数は減らない） */
  const chatCount: Record<string, number> = {};
  async function doChat(def: NpcDef): Promise<void> {
    const r = fieldRun;
    if (!r || !def.lines?.length) return;
    r.talking = true;
    const n = chatCount[def.id] ?? 0;
    chatCount[def.id] = n + 1;
    await showTalk(def.lines[n % def.lines.length], null);
    r.talking = false;
  }

  function endInfiltration(): void {
    if (!fieldRun) return;
    fieldRun.fh.destroy();
    fieldRun.view.dispose();
    fieldRun = null;
  }

  function fieldBattle(encounter: string, opening: Opening, patrol: string | null): void {
    const r = fieldRun;
    if (!r) return;
    r.busy = true;
    r.hackT = null;
    r.fh.setHack(null);
    r.fh.root.style.display = 'none';
    void runBattle(encounter, { opening, patrol });
  }

  function resumeField(patrol: string): void {
    const r = fieldRun;
    if (!r) return showHub();
    hud.closeOverlay();
    hud.clearBattle();
    stage.clearEnemies();
    stage.showParty([], null); // 戦いの味方を片づけ、VRM を歩く場所にもどす
    r.view.attachVrm(vrmOf('akari'));
    r.state.defeat(patrol);
    r.busy = false;
    r.fh.root.style.display = '';
    r.fh.banner('見回りを倒した。奥へ進もう', 'info');
  }

  function fieldAttack(): void {
    const r = fieldRun;
    if (!r || r.busy || r.hackT !== null) return;
    const ev = r.state.attack();
    if (ev.t === 'battle') fieldBattle(ev.encounter, ev.opening, ev.patrol);
  }

  function fieldInteract(): void {
    const r = fieldRun;
    if (!r || r.busy || r.hackT !== null) return;
    const it = r.state.nearby();
    if (!it) return;
    if (it.kind === 'terminal') {
      r.hackT = 0; // 少し時間がかかる（その間に見つかることもある）
      return;
    }
    if (it.kind === 'npc') {
      if (it.def.charId) void doTalk(it.def.charId);
      else void doChat(it.def);
      return;
    }
    if (it.kind === 'exit') {
      leaveSchool();
      return;
    }
    if (it.kind === 'boss') {
      save.flags[`${MANSION.boss.encounter}_reached`] = 1;
      persist();
      fieldBattle(MANSION.boss.encounter, 'normal', null);
      return;
    }
    handleFieldEvent(r.state.interact());
  }

  function fieldMenu(): void {
    if (!fieldRun || fieldRun.busy) return;
    if (!window.confirm('拠点へもどりますか？（宝箱で手に入れた物はそのまま）')) return;
    endInfiltration();
    showHub();
  }

  /** 歩く場所で起きたことを見せる。戦いになったら true */
  function handleFieldEvent(e: FieldEvent | null): boolean {
    const r = fieldRun;
    if (!r || !e) return false;
    switch (e.t) {
      case 'spotted':
        r.fh.banner('見つかった！ 逃げるか、影に隠れよう', 'bad');
        break;
      case 'alarm':
        r.fh.banner('カメラに見つかった！ 見回りが来る', 'bad');
        break;
      case 'lost':
        r.fh.banner('見失ったようだ…', 'info');
        break;
      case 'chest': {
        for (const [k, n] of Object.entries(e.items)) save.items[k] = (save.items[k] ?? 0) + n;
        persist();
        const list = Object.entries(e.items).map(([k, n]) => `${ITEMS[k].name}×${n}`).join('・');
        r.fh.banner(`宝箱：${list}`, 'good');
        break;
      }
      case 'hacked':
        r.fh.banner('ハッキング成功！ カメラが止まり、扉が開いた', 'good');
        break;
      case 'battle':
        fieldBattle(e.encounter, e.opening, e.patrol);
        return true;
      case 'miss':
      case 'boss':
      case 'talk':
      case 'exit':
        break;
    }
    return false;
  }

  function fieldTick(real: number): void {
    const r = fieldRun!;
    if (r.talking) {
      stage.renderer.render(r.view.scene, r.view.camera);
      return;
    }
    r.view.yaw += r.fh.takeYaw();
    let move: Vec2 = [0, 0];
    if (r.hackT === null) {
      const [sx, sy] = r.fh.stick();
      move = r.view.stickToWorld(sx, sy);
    }
    const evs = r.state.update(real, { move, run: r.fh.running() });
    for (const e of evs) {
      if (e.t === 'spotted' || e.t === 'alarm') {
        // 見つかったらハッキングは途中で止まる
        r.hackT = null;
        r.fh.setHack(null);
      }
      if (handleFieldEvent(e)) return;
    }
    if (r.hackT !== null) {
      r.hackT += real;
      r.fh.setHack(Math.min(1, r.hackT / HACK_TIME));
      if (r.hackT >= HACK_TIME) {
        r.hackT = null;
        r.fh.setHack(null);
        handleFieldEvent(r.state.interact());
      }
    }
    const hidden = r.state.inShadow();
    const speed = Math.min(1, Math.hypot(move[0], move[1]));
    r.view.update(real, speed * (r.fh.running() ? 1 : 0.6), hidden);
    r.fh.setArea(r.state.areaName());
    r.fh.setHidden(hidden);
    const it = r.state.nearby();
    const label = !it
      ? null
      : it.kind === 'chest'
        ? '宝箱を開ける'
        : it.kind === 'terminal'
          ? 'ハッキング'
          : it.kind === 'npc'
            ? it.def.charId
              ? `${CHARACTERS[it.def.charId].name}と話す（絆）`
              : `${it.def.name}と話す`
            : it.kind === 'exit'
              ? it.label
              : '番人に挑む';
    r.fh.setInteract(label);
    if (r.kind === 'school') r.fh.setStatus(`${save.day}日目　${SLOT_NAMES[r.state.slot]}　仲間と話せる回数 あと${TALKS_PER_DAY - save.talksToday}`);
    if (++r.mapTick % 3 === 0) r.fh.drawMap(r.state);
    stage.renderer.render(r.view.scene, r.view.camera);
  }
  window.addEventListener('resize', () => fieldRun?.view.resize(window.innerWidth, window.innerHeight));

  // ---- 毎コマ ----
  const perf = import.meta.env.DEV || params.has('perf') ? new PerfHud(stage.renderer) : null;
  let paused = false;
  watchOrientation((portrait) => (paused = portrait));
  document.addEventListener('visibilitychange', () => (paused = document.hidden));
  const timer = new THREE.Clock();
  stage.renderer.setAnimationLoop(() => {
    const real = Math.min(timer.getDelta(), 0.1);
    if (paused) return;
    if (fieldRun && !fieldRun.busy) {
      fieldTick(real);
      perf?.tick();
      return;
    }
    const dt = clock.update(real);
    stage.update(dt);
    hud.follow(stage);
    stage.render();
    perf?.tick();
  });

  // 開発サーバーだけ：確かめ用に、戦いを一瞬で終わらせる（公開ページには入らない）
  if (import.meta.env.DEV) Object.assign(window, { __kaito: { ctrl: () => ctrl, field: () => fieldRun, skip: skipBattle, save: () => save, invest: () => autoInvest(save, rng), hud } });

  // 昼なら学校から、夜なら拠点から始める
  if (save.phase === 'day') startSchool(loaded.reset ? '保存データが読めなかったので、はじめからにしました' : '');
  else showHub(loaded.reset ? '保存データが読めなかったので、はじめからにしました' : '');
  // 開発サーバーでは見本の VRM を自動で読む（公開ページには置いていないので、無ければ仮の形のまま）
  void (async () => {
    if (params.has('novrm')) return;
    try {
      const res = await fetch('models/sample-a.vrm');
      if (!res.ok || (res.headers.get('content-type') ?? '').includes('text/html')) return;
      await loadVrm(await res.arrayBuffer(), 'models/sample-a.vrm');
      if (hubEl) showHub();
      else if ((fieldRun as FieldRun | null)?.kind === 'school' && !(fieldRun as FieldRun | null)?.talking) startSchool();
    } catch {
      /* 無ければ仮の形 */
    }
  })();
}
