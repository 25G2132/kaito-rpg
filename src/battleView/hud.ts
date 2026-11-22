import * as THREE from 'three';
import { SP_MAX, type Battle, type Unit } from '../battle/battle';
import type { ComboDef, GameData } from '../battle/types';
import type { Stage } from './stage';
import './terminal.css';

// 画面の上に重ねる表示（順番・味方・技・数字の演出）。中身は Battle の状態から作る。
// 見た目は「シンが見ているハッキング画面」風：上に横一列の順番、左に端末の一覧、下にコマンドの列。

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

export interface HudHandlers {
  onBasic: () => void;
  onSkill: () => void;
  onPersuade: () => void;
  onUlt: (uid: string) => void;
  onTarget: (uid: string) => void;
  onAuto: () => void;
  onSpeed: () => void;
  onPause: () => void;
  onView: () => void; // 表と裏の切りかえ
  onCombo: (id: string) => void;
  onStolen: () => void; // 盗んだ物を渡す
}

export class Hud {
  readonly root = el('div');
  private data: GameData;
  private turnbar = el('div', 'turnbar');
  private wave = el('div', 'wave');
  private pauseBtn = el('button', 'tbtn', 'Ⅱ');
  private totalBox = el('div', 'total', '<div class="tl">総ダメージ</div><div class="tn">0</div>');
  private total = 0;
  private autoBtn = el('button', 'tbtn', '自動');
  private viewBtn = el('button', 'tbtn viewbtn', '<b>⇄ 裏へ</b><small>ハッキング</small>');
  private uraLine = el('div', 'uraline');
  private comboRow = el('div', 'comborow');
  private comboBtns = new Map<string, HTMLButtonElement>();
  private stolenBtn = el('button', 'abtn stolen');
  private speedBtn = el('button', 'tbtn', '×1');
  private party = el('div', 'party');
  private actions = el('div', 'actions hidden');
  private sdesc = el('div', 'sdesc');
  private spBox = el('div', 'sp');
  private basicBtn = el('button', 'abtn basic');
  private skillBtn = el('button', 'abtn skill');
  private persuadeBtn = el('button', 'abtn persuade');
  private fx = el('div', 'fx');
  private overlayBox: HTMLDivElement | null = null;
  private cards = new Map<string, HTMLButtonElement>();
  private tags = new Map<string, HTMLDivElement>();
  private tmp = new THREE.Vector3();
  private h: HudHandlers;

  constructor(data: GameData, handlers: HudHandlers) {
    this.data = data;
    this.h = handlers;
    this.root.id = 'hud';
    // 右上：自動・倍速・一時停止。その下に総ダメージ。上の中央に群れの数
    const top = el('div', 'topright');
    const btns = el('div', 'tbtns');
    btns.append(this.viewBtn, this.autoBtn, this.speedBtn, this.pauseBtn);
    top.append(btns, this.totalBox);
    const row = el('div', 'abtns');
    row.append(el('span', 'prompt', 'shin@ura:~$'), this.spBox, this.stolenBtn, this.persuadeBtn, this.basicBtn, this.skillBtn);
    this.actions.append(this.sdesc, row);
    this.root.append(this.fx, this.turnbar, this.wave, this.uraLine, top, this.party, this.comboRow, this.actions);
    document.body.appendChild(this.root);

    this.autoBtn.addEventListener('click', () => this.h.onAuto());
    this.speedBtn.addEventListener('click', () => this.h.onSpeed());
    this.pauseBtn.addEventListener('click', () => this.h.onPause());
    this.basicBtn.addEventListener('click', () => this.h.onBasic());
    this.skillBtn.addEventListener('click', () => this.h.onSkill());
    this.persuadeBtn.addEventListener('click', () => this.h.onPersuade());
    this.viewBtn.addEventListener('click', () => this.h.onView());
    this.stolenBtn.addEventListener('click', () => this.h.onStolen());
  }

  destroy(): void {
    this.root.remove();
  }

  setSpeedVar(speed: number): void {
    this.root.style.setProperty('--spd', String(speed));
  }

  /** 戦いの外では、戦いの表示を片づける */
  clearBattle(): void {
    this.party.innerHTML = '';
    this.cards.clear();
    for (const t of this.tags.values()) t.remove();
    this.tags.clear();
    this.turnbar.innerHTML = '';
    this.wave.textContent = '';
    this.uraLine.textContent = '';
    this.comboRow.innerHTML = '';
    this.comboBtns.clear();
    this.root.classList.remove('ura-on', 'has-ura');
    this.resetTotal();
    this.actions.classList.add('hidden');
    this.root.classList.add('idle');
  }

  // ---------- 作る ----------

  build(b: Battle): void {
    this.root.classList.remove('idle');
    this.resetTotal();
    this.party.innerHTML = '';
    this.cards.clear();
    for (const u of b.allies) {
      const c = b.charDef(u)!;
      const elem = this.data.elements[u.element];
      const card = el(
        'button',
        'pcard',
        `<div class="face" style="--c:${elem.color}"><span>${u.name.slice(0, 1)}</span><em>${elem.name}</em></div>
         <div class="pinfo"><div class="pname">${u.name}<span class="en"></span></div>
         <div class="bar hp"><b></b><i></i></div><div class="hpnum"></div></div>
         <div class="ultlabel">必殺技</div>`,
      );
      card.style.setProperty('--c', elem.color);
      card.title = `${c.ult.name}：${c.ult.desc}`;
      card.addEventListener('click', () => this.h.onUlt(u.uid));
      this.party.appendChild(card);
      this.cards.set(u.uid, card);
    }
    this.arrange(b);
    this.buildEnemies(b);
    this.buildCombos(b);
    this.root.classList.toggle('has-ura', !!b.hacker);
    this.syncAll(b);
  }

  /** 合わせ技のボタン（この戦いで2人とも出ているものだけ） */
  buildCombos(b: Battle): void {
    this.comboRow.innerHTML = '<span class="ctitle">合わせ技&gt;</span>';
    this.comboBtns.clear();
    for (const c of b.combosAvailable()) {
      const btn = el('button', 'cbtn', `<b>${c.name}</b><small>${c.fx.sub}</small><i></i>`);
      btn.style.setProperty('--c', c.fx.color);
      btn.style.setProperty('--c2', c.fx.color2);
      btn.title = c.skill.desc;
      btn.addEventListener('click', () => this.h.onCombo(c.id));
      this.comboRow.appendChild(btn);
      this.comboBtns.set(c.id, btn);
    }
    this.comboRow.style.display = this.comboBtns.size ? '' : 'none';
  }

  /** 合わせ技のボタンの光（撃てる・待機中）と、2人のゲージのたまり具合 */
  setCombos(b: Battle, queued: string[]): void {
    for (const [id, btn] of this.comboBtns) {
      const c = b.data.combos[id];
      const ready = b.canCombo(id);
      btn.classList.toggle('ready', ready);
      btn.classList.toggle('queued', queued.includes(id));
      // 2人のうち、たまっていないほうの割合
      let p = 1;
      for (const m of c.members) {
        const u = m === b.hacker?.defId ? b.hacker : b.aliveAllies().find((x) => x.defId === m);
        p = Math.min(p, u ? u.energy / (u.energyMax * c.cost) : 0);
      }
      (btn.querySelector('i') as HTMLElement).style.width = `${Math.min(100, p * 100)}%`;
    }
  }

  /** 表の上の、裏のようす（1行） */
  setUra(b: Battle): void {
    const n = b.net;
    if (!n || !b.hacker) return;
    let doing = '待機';
    if (n.lockout > 0) doing = `しめ出し中 ${n.lockout.toFixed(1)}秒`;
    else if (n.target) {
      const t = n.node(n.target)!;
      const name = { entry: '入口', relay: '中継点', weak: '弱点データ', wall: '防壁', buff: '強化', ctrl: '制御' }[t.kind];
      const who = t.enemy ? b.unit(t.enemy)?.name ?? '' : '';
      doing = `侵入中：${who}${who ? 'の' : ''}${name} ${Math.round((n.progress / t.hard) * 100)}%`;
    }
    const tr = Math.round(n.trace * 10);
    const text = `裏&gt; シン［${doing}］　追跡 ${'▮'.repeat(tr)}${'▯'.repeat(10 - tr)}　ゲージ ${Math.round(b.hacker.energy)}%`;
    if (this.uraLine.innerHTML !== text) this.uraLine.innerHTML = text;
    this.uraLine.classList.toggle('danger', n.trace > 0.6 || n.lockout > 0);
  }

  /** 表と裏のどちらを見ているか */
  setView(ura: boolean): void {
    this.root.classList.toggle('ura-on', ura);
  }

  setStolen(b: Battle, n: number, active: Unit | null): void {
    this.stolenBtn.style.display = n > 0 ? '' : 'none';
    this.stolenBtn.innerHTML = `<div><div class="k">盗んだ物 ×${n}</div><div class="n">渡す</div></div>`;
    this.stolenBtn.disabled = !active || !b.canUseStolen(active.uid);
  }

  /** カードの並び：前の4人（並び順）、そのあとに控え（小さなカード） */
  arrange(b: Battle): void {
    const sorted = [...b.allies].sort((x, y) => Number(x.bench) - Number(y.bench) || x.slot - y.slot);
    for (const u of sorted) {
      const card = this.cards.get(u.uid);
      if (!card) continue;
      card.classList.toggle('bench', u.bench);
      this.party.appendChild(card);
    }
  }

  /** 入れかえ：選んだ控えを光らせ、前のカードに「ここと入れかえ」の印 */
  setSwapSel(uid: string | null): void {
    this.party.classList.toggle('swapping', !!uid);
    for (const [id, c] of this.cards) c.classList.toggle('swapsel', id === uid);
  }

  buildEnemies(b: Battle): void {
    for (const t of this.tags.values()) t.remove();
    this.tags.clear();
    for (const u of b.enemies) {
      const d = b.enemyDef(u)!;
      const weak = this.weakChips(u);
      const tag = el(
        'div',
        `etag${d.boss ? ' boss' : ''}`,
        `<div class="target-mark">▼</div><div class="ename">${u.name}</div>
         <div class="bar hp"><i></i></div><div class="bar tough"><i></i></div>
         <div class="chips"><span class="weak">${weak}</span><span class="st"></span></div>`,
      );
      tag.addEventListener('pointerdown', (ev) => {
        ev.stopPropagation();
        this.h.onTarget(u.uid);
      });
      this.root.insertBefore(tag, this.turnbar);
      this.tags.set(u.uid, tag);
    }
  }

  /** 弱点の札：裏で暴くまでは「？」 */
  private weakChips(u: Unit): string {
    if (!u.revealed) return u.weaknesses.map(() => '<span class="chip unknown">？</span>').join('');
    return u.weaknesses
      .map((w) => this.data.elements[w])
      .map((e) => `<span class="chip" style="background:${e.color}">${e.name}</span>`)
      .join('');
  }
  /** 弱点が見えた（裏で暴いた） */
  setRevealed(_b: Battle, u: Unit): void {
    const tag = this.tags.get(u.uid);
    if (!tag) return;
    const w = tag.querySelector('.weak') as HTMLElement;
    w.innerHTML = this.weakChips(u);
    w.classList.remove('pop');
    void w.offsetWidth;
    w.classList.add('pop');
  }

  // ---------- 状態から表示を合わせる ----------

  syncAll(b: Battle): void {
    for (const u of b.units) {
      this.setHp(u.uid, u.hp, u.maxHp);
      this.setShield(u.uid, u.shield, u.maxHp);
      this.setStatuses(b, u);
      if (u.side === 'ally') this.setEnergy(u.uid, u.energy, u.energyMax);
      else this.setToughness(u.uid, u.toughness, u.maxToughness, u.broken);
      this.setDead(u.uid, !u.alive);
    }
    this.setSp(b.sp);
    this.setTurnOrder(b);
    this.wave.textContent = `WAVE ${b.wave + 1}/${b.encounter.waves.length}`;
  }

  setHp(uid: string, hp: number, max: number): void {
    const card = this.cards.get(uid);
    const tag = this.tags.get(uid);
    const pct = `${Math.max(0, (hp / max) * 100)}%`;
    if (card) {
      (card.querySelector('.bar.hp > i') as HTMLElement).style.width = pct;
      (card.querySelector('.hpnum') as HTMLElement).textContent = `HP ${hp}`;
    }
    if (tag) (tag.querySelector('.bar.hp > i') as HTMLElement).style.width = pct;
  }

  setShield(uid: string, amount: number, max: number): void {
    const card = this.cards.get(uid);
    if (card) (card.querySelector('.bar.hp > b') as HTMLElement).style.width = `${Math.min(100, (amount / max) * 100)}%`;
  }

  setEnergy(uid: string, value: number, max: number): void {
    const card = this.cards.get(uid);
    // 顔のまわりの輪が、必殺技ゲージ
    if (card) {
      (card.querySelector('.face') as HTMLElement).style.setProperty('--e', `${Math.min(100, (value / max) * 100)}%`);
      (card.querySelector('.en') as HTMLElement).textContent = `EN ${Math.min(100, Math.round((value / max) * 100))}%`;
    }
  }

  setUlt(uid: string, ready: boolean, queued: boolean): void {
    const card = this.cards.get(uid);
    if (!card) return;
    card.classList.toggle('ult', ready || queued);
    card.classList.toggle('queued', queued);
  }

  setToughness(uid: string, v: number, max: number, broken: boolean): void {
    const tag = this.tags.get(uid);
    if (!tag) return;
    (tag.querySelector('.bar.tough > i') as HTMLElement).style.width = `${max ? (v / max) * 100 : 0}%`;
    tag.classList.toggle('broken', broken);
  }

  setStatuses(b: Battle, u: Unit): void {
    const html = u.statuses
      .map((s) => {
        const d = this.data.statuses[s.id];
        if (!d) return '';
        const n = s.stacks > 1 ? s.stacks : '';
        return `<span class="chip status ${d.kind} ${d.id}" title="${d.name}">${d.short}${n}</span>`;
      })
      .join('');
    const tag = this.tags.get(u.uid);
    if (tag) {
      (tag.querySelector('.st') as HTMLElement).innerHTML = html;
      // 解析中はすべて弱点になるので、弱点の札を光らせる
      tag.classList.toggle('exposed', u.statuses.some((s) => this.data.statuses[s.id]?.allWeak));
      tag.classList.toggle('firewall', u.statuses.some((s) => s.id === 'firewall'));
    }
    void b;
  }

  setDead(uid: string, dead: boolean): void {
    this.cards.get(uid)?.classList.toggle('dead', dead);
    this.tags.get(uid)?.classList.toggle('dead', dead);
  }

  setSp(v: number): void {
    let html = '';
    for (let i = 0; i < SP_MAX; i++) html += `<i class="${i < v ? 'on' : ''}"></i>`;
    this.spBox.innerHTML = `${html}`;
  }

  setTurnOrder(b: Battle): void {
    const order = b.turnOrder(7);
    this.turnbar.innerHTML = '<div class="tb-title">QUEUE&gt;</div>';
    order.forEach((uid, i) => {
      const u = b.unit(uid);
      if (!u) return;
      const color = u.side === 'ally' ? this.data.elements[u.element].color : '#ff4d6d';
      const item = el('div', `tb-item ${u.side}${i === 0 && b.activeId === uid ? ' now' : ''}`, u.name.slice(0, 3));
      item.style.setProperty('--c', color);
      this.turnbar.appendChild(item);
    });
  }

  setActive(uid: string | null): void {
    for (const [id, c] of this.cards) c.classList.toggle('now', id === uid);
  }

  setTarget(uid: string | null): void {
    for (const [id, t] of this.tags) t.classList.toggle('target', id === uid);
  }

  setAuto(on: boolean): void {
    this.autoBtn.classList.toggle('on', on);
  }
  setSpeed(n: number): void {
    this.speedBtn.textContent = `×${n}`;
    this.speedBtn.classList.toggle('on', n > 1);
    this.setSpeedVar(n);
  }

  /** 味方の番：技のボタンを出す（null で隠す） */
  showCommand(b: Battle, u: Unit | null, target?: string | null): void {
    if (!u) {
      this.actions.classList.add('hidden');
      return;
    }
    // 弱った敵をねらっていれば「説得」
    const can = !!target && b.canPersuade(target);
    this.persuadeBtn.style.display = can ? '' : 'none';
    if (can) this.persuadeBtn.innerHTML = `<div><div class="n">説得</div><div class="k">${Math.round(b.persuadeChance(target!) * 100)}%</div></div>`;
    const s = b.skillsOf(u)!;
    this.basicBtn.innerHTML = `<div><div class="k">通常攻撃</div><div class="n">${s.basic.name}</div></div><span class="c">+1</span>`;
    this.skillBtn.innerHTML = `<div><div class="k">スキル</div><div class="n">${s.skill.name}</div></div><span class="c">−1</span>`;
    this.skillBtn.disabled = b.sp < 1;
    this.sdesc.innerHTML = `<span class="turnname">${u.name}の番</span>　<b>${s.skill.name}</b>：${s.skill.desc}`;
    this.actions.classList.remove('hidden');
  }

  /** 敵の頭の上の表示を、3D の位置に合わせる（毎コマ） */
  follow(stage: Stage): void {
    for (const [uid, tag] of this.tags) {
      const a = stage.actor(uid);
      if (!a) continue;
      const p = stage.toScreen(a.topPoint(this.tmp));
      if (!p) continue;
      tag.style.left = `${Math.min(window.innerWidth - 62, Math.max(62, p.x))}px`;
      tag.style.top = `${Math.max(96, p.y)}px`;
    }
  }

  // ---------- 演出 ----------

  private at(stage: Stage, uid: string): { x: number; y: number } {
    const a = stage.actor(uid);
    if (!a) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    return stage.toScreen(a.chestPoint(this.tmp)) ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  }

  private spawn(node: HTMLElement, life = 1.8): void {
    this.fx.appendChild(node);
    window.setTimeout(() => node.remove(), life * 1000);
  }

  number(stage: Stage, uid: string, text: string, cls: string, jitter = 0): void {
    const p = this.at(stage, uid);
    const n = el('div', `num ${cls}`, text);
    n.style.left = `${p.x + (Math.random() - 0.5) * 40 + jitter}px`;
    n.style.top = `${p.y - 10 + (Math.random() - 0.5) * 20}px`;
    this.spawn(n);
  }

  label(stage: Stage, uid: string, text: string, cls = '', dy = -40): void {
    const p = this.at(stage, uid);
    const n = el('div', `label ${cls}`, text);
    n.style.left = `${p.x}px`;
    n.style.top = `${p.y + dy}px`;
    this.spawn(n);
  }

  banner(text: string, cls = ''): void {
    this.spawn(el('div', `banner ${cls}`, text), 2.4);
  }

  /** 総ダメージ（敵に与えた分）を積み上げる */
  addTotal(n: number): void {
    this.total += n;
    const tn = this.totalBox.querySelector('.tn') as HTMLElement;
    tn.textContent = this.total.toLocaleString('ja-JP');
    tn.classList.remove('bump');
    void tn.offsetWidth;
    tn.classList.add('bump');
  }
  resetTotal(): void {
    this.total = 0;
    (this.totalBox.querySelector('.tn') as HTMLElement).textContent = '0';
  }
  get totalDamage(): number {
    return this.total;
  }

  /** 必殺技：画面いっぱいの切り替え（1枚絵ができるまでは、頭文字の仮の絵） */
  ultSplash(who: string, what: string, color: string): void {
    const s = el('div', 'ultsplash', `<div class="stripes"></div><div class="portrait">${who.slice(0, 1)}</div><div class="words"><div class="who">${who}</div><div class="what">${what}</div></div>`);
    s.style.setProperty('--c', color);
    // ボタンや名札より上に出す
    this.root.appendChild(s);
    window.setTimeout(() => s.remove(), 1600 / Math.max(1, Number(this.root.style.getPropertyValue('--spd')) || 1));
  }

  cutin(who: string, what: string, color: string): void {
    const c = el('div', 'cutin', `<div class="who">${who}　必殺技</div><div class="what">${what}</div>`);
    c.style.setProperty('--c', color);
    this.spawn(el('div', 'dim'), 1.3);
    this.spawn(c, 1.2);
  }

  /**
   * 合わせ技の演出。組み合わせごとに色・効果・決めの文字が変わる。
   * 表＋裏の合わせ技（both）は、裏の回線図も重ねて出す（2つの画面の両方に出る）
   */
  comboFx(c: ComboDef, both: boolean): void {
    const spd = Math.max(1, Number(this.root.style.getPropertyValue('--spd')) || 1);
    const s = el(
      'div',
      `combofx fx-${c.fx.effect} cam-${c.fx.camera}${both ? ' both' : ''}`,
      `<div class="cf-bg"></div><div class="cf-fx"></div>${both ? '<div class="cf-net"></div>' : ''}
       <div class="cf-words"><div class="cf-call">${c.fx.callout}</div><div class="cf-sub">${c.fx.sub}　合わせ技「${c.name}」</div></div>`,
    );
    s.style.setProperty('--c', c.fx.color);
    s.style.setProperty('--c2', c.fx.color2);
    // 裏の画面より上に出す
    s.style.setProperty('--spd', String(spd));
    document.body.appendChild(s);
    window.setTimeout(() => s.remove(), 1900 / spd);
  }

  /** 裏の出来事を、表の上に小さく流す */
  hackNote(text: string): void {
    this.spawn(el('div', 'hacknote', `<span>裏&gt;</span> ${text}`), 2.6);
  }

  synergy(detail: string): void {
    this.spawn(el('div', 'flash'), 0.8);
    this.spawn(el('div', 'synergy', `<div class="t">相性！</div><div class="d">${detail}</div>`), 1.8);
  }

  flash(white = true): void {
    this.spawn(el('div', `flash${white ? ' white' : ''}`), 0.8);
  }

  // ---------- はじめ・終わり ----------

  overlay(html: string, cls = ''): HTMLDivElement {
    this.closeOverlay();
    const o = el('div', 'overlay');
    const p = el('div', `panel ${cls}`, html);
    o.appendChild(p);
    this.root.appendChild(o);
    this.overlayBox = o;
    return p;
  }
  closeOverlay(): void {
    this.overlayBox?.remove();
    this.overlayBox = null;
  }
}
