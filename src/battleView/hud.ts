import * as THREE from 'three';
import { SP_MAX, type Battle, type Unit } from '../battle/battle';
import type { GameData } from '../battle/types';
import type { Stage } from './stage';

// 画面の上に重ねる表示（順番の表・カード・ボタン・数字の演出）。中身は Battle の状態から作る。

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

export interface HudHandlers {
  onBasic: () => void;
  onSkill: () => void;
  onUlt: (uid: string) => void;
  onTarget: (uid: string) => void;
  onAuto: () => void;
  onSpeed: () => void;
  onPause: () => void;
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
  private speedBtn = el('button', 'tbtn', '×1');
  private party = el('div', 'party');
  private actions = el('div', 'actions hidden');
  private sdesc = el('div', 'sdesc');
  private spBox = el('div', 'sp');
  private basicBtn = el('button', 'abtn basic');
  private skillBtn = el('button', 'abtn skill');
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
    btns.append(this.autoBtn, this.speedBtn, this.pauseBtn);
    top.append(btns, this.totalBox);
    const row = el('div', 'abtns');
    row.append(this.spBox, this.basicBtn, this.skillBtn);
    this.actions.append(this.sdesc, row);
    this.root.append(this.fx, this.turnbar, this.wave, top, this.party, this.actions);
    document.body.appendChild(this.root);

    this.autoBtn.addEventListener('click', () => this.h.onAuto());
    this.speedBtn.addEventListener('click', () => this.h.onSpeed());
    this.pauseBtn.addEventListener('click', () => this.h.onPause());
    this.basicBtn.addEventListener('click', () => this.h.onBasic());
    this.skillBtn.addEventListener('click', () => this.h.onSkill());
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
         <div class="pinfo"><div class="pname">${u.name}</div>
         <div class="bar hp"><b></b><i></i></div><div class="hpnum"></div></div>
         <div class="ultlabel">必殺技</div>`,
      );
      card.title = `${c.ult.name}：${c.ult.desc}`;
      card.addEventListener('click', () => this.h.onUlt(u.uid));
      this.party.appendChild(card);
      this.cards.set(u.uid, card);
    }
    this.buildEnemies(b);
    this.syncAll(b);
  }

  buildEnemies(b: Battle): void {
    for (const t of this.tags.values()) t.remove();
    this.tags.clear();
    for (const u of b.enemies) {
      const d = b.enemyDef(u)!;
      const weak = d.weaknesses
        .map((w) => this.data.elements[w])
        .map((e) => `<span class="chip" style="background:${e.color}">${e.name}</span>`)
        .join('');
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
    if (card) (card.querySelector('.face') as HTMLElement).style.setProperty('--e', `${Math.min(100, (value / max) * 100)}%`);
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
    const order = b.turnOrder(6);
    this.turnbar.innerHTML = '<div class="tb-title">順番</div>';
    order.forEach((uid, i) => {
      const u = b.unit(uid);
      if (!u) return;
      const color = u.side === 'ally' ? this.data.elements[u.element].color : '#3a2030';
      const item = el('div', `tb-item ${u.side}${i === 0 && b.activeId === uid ? ' now' : ''}`, u.name.slice(0, 1));
      item.style.background = color;
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
  showCommand(b: Battle, u: Unit | null): void {
    if (!u) {
      this.actions.classList.add('hidden');
      return;
    }
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
