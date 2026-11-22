import type { Battle } from '../battle/battle';
import { RELOCK_SEC, type HackNode } from '../battle/hack';

// 裏の画面：敵の警備システムの回線図。点（装置）を指で押して、入口から順に破って奥へ進む。
// 線を巡回する「検知の光」が、破っている途中の線に来ると追跡ゲージが上がる（満タンでしめ出し）。
// 裏を見ている間、表の4人は自動で戦う。右に表のようす（HP）と、合わせ技・盗んだ物。

export interface UraHandlers {
  onBack: () => void;
  onNode: (id: string) => void;
  onCombo: (id: string) => void;
}

const KIND_NAME: Record<HackNode['kind'], string> = { entry: '入口', relay: '中継', weak: '弱点', wall: '防壁', buff: '強化', ctrl: '制御' };
const KIND_COLOR: Record<HackNode['kind'], string> = {
  entry: '#9dffb0',
  relay: '#5ef0ff',
  weak: '#ffd25a',
  wall: '#ffb12b',
  buff: '#c58bff',
  ctrl: '#5ee08a',
};

export class UraView {
  readonly root = document.createElement('div');
  private canvas = document.createElement('canvas');
  private traceBar: HTMLElement;
  private title: HTMLElement;
  private front: HTMLElement;
  private info: HTMLElement;
  private combos: HTMLElement;
  private logBox: HTMLElement;
  private comboBtns = new Map<string, HTMLButtonElement>();
  private lines: string[] = [];
  private h: UraHandlers;
  private battle: Battle | null = null;
  private time = 0;
  private flashUntil = 0;
  private flashColor = '#fff';

  constructor(h: UraHandlers) {
    this.h = h;
    this.root.className = 'ura';
    this.root.innerHTML = `
      <div class="u-top"><span class="u-title">裏&gt; 警備システム</span><span>追跡</span><div class="u-trace"><i></i></div></div>
      <div class="u-lock">回線を切られた…しめ出し中</div>
      <div class="u-side">
        <button class="u-back"><b>⇄ 表へ</b><small>表は自動で戦闘中</small></button>
        <div class="u-front"></div>
        <div class="u-info"></div>
        <div class="u-combos"></div>
      </div>
      <div class="u-log"></div>
      <div class="u-help">光っている点を押すと侵入。検知の光（赤）が来ている線は追跡される</div>`;
    this.root.prepend(this.canvas);
    this.traceBar = this.root.querySelector('.u-trace i') as HTMLElement;
    this.title = this.root.querySelector('.u-title') as HTMLElement;
    this.front = this.root.querySelector('.u-front') as HTMLElement;
    this.info = this.root.querySelector('.u-info') as HTMLElement;
    this.combos = this.root.querySelector('.u-combos') as HTMLElement;
    this.logBox = this.root.querySelector('.u-log') as HTMLElement;
    (this.root.querySelector('.u-back') as HTMLElement).addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.h.onBack();
    });
    this.canvas.addEventListener('pointerdown', (e) => this.tap(e.clientX, e.clientY));
    document.body.appendChild(this.root);
  }

  destroy(): void {
    this.root.remove();
  }

  get visible(): boolean {
    return this.root.classList.contains('on');
  }
  show(on: boolean, b: Battle): void {
    this.battle = b;
    this.root.classList.toggle('on', on);
    if (on) this.buildCombos(b);
  }

  /** 合わせ技のボタン（表と同じもの。裏からも撃てる） */
  private buildCombos(b: Battle): void {
    this.combos.innerHTML = '';
    this.comboBtns.clear();
    for (const c of b.combosAvailable()) {
      const btn = document.createElement('button');
      btn.className = 'cbtn';
      btn.innerHTML = `<b>${c.name}</b><small>${c.fx.sub}</small><i></i>`;
      btn.style.setProperty('--c', c.fx.color);
      btn.style.setProperty('--c2', c.fx.color2);
      btn.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        this.h.onCombo(c.id);
      });
      this.combos.appendChild(btn);
      this.comboBtns.set(c.id, btn);
    }
  }

  log(text: string): void {
    this.lines.push(`&gt; ${text}`);
    if (this.lines.length > 5) this.lines.shift();
    this.logBox.innerHTML = this.lines.map((l) => `<div>${l}</div>`).join('');
  }

  /** 表＋裏の合わせ技：回線図も光らせる */
  flash(color: string): void {
    this.flashUntil = this.time + 1.2;
    this.flashColor = color;
  }

  // ---------- 描く ----------

  private layout(): { x: (n: HackNode) => number; y: (n: HackNode) => number; r: number } {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    // 右の欄（200px）と上下の文字をよけた範囲に置く
    const left = 24;
    const right = w - 236;
    const top = 40;
    const bottom = h - 54;
    return { x: (n) => left + n.x * (right - left), y: (n) => top + n.y * (bottom - top), r: Math.max(13, Math.min(20, h / 26)) };
  }

  private tap(cx: number, cy: number): void {
    const b = this.battle;
    if (!b?.net) return;
    const rect = this.canvas.getBoundingClientRect();
    const L = this.layout();
    let best: HackNode | null = null;
    let bd = Infinity;
    for (const n of b.net.nodes) {
      const d = Math.hypot(L.x(n) - (cx - rect.left), L.y(n) - (cy - rect.top));
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    if (best && bd <= L.r * 2.2) this.h.onNode(best.id);
  }

  /** 毎コマ（見えているときだけ） */
  draw(b: Battle, dt: number, queued: string[]): void {
    this.time += dt;
    this.battle = b;
    const net = b.net;
    const cv = this.canvas;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = cv.clientWidth;
    const H = cv.clientHeight;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
    }
    const g = cv.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    if (!net) return;
    const L = this.layout();
    const reach = net.reachable();
    const frontier = new Set(net.frontier().map((n) => n.id));

    // 線
    for (const e of net.edges) {
      const a = net.node(e.a)!;
      const c = net.node(e.b)!;
      const open = reach.has(a.id) && reach.has(c.id);
      g.strokeStyle = open ? 'rgba(157,255,176,0.7)' : 'rgba(94,240,255,0.25)';
      g.lineWidth = open ? 2.5 : 1.5;
      g.beginPath();
      g.moveTo(L.x(a), L.y(a));
      g.lineTo(L.x(c), L.y(c));
      g.stroke();
    }
    // 破っている線（進み具合）
    if (net.target) {
      const t = net.node(net.target)!;
      const from = net.neighbors(t.id).map((id) => net.node(id)!).find((n) => reach.has(n.id));
      if (from) {
        const p = Math.min(1, net.progress / t.hard);
        g.strokeStyle = '#9dffb0';
        g.lineWidth = 4;
        g.setLineDash([6, 4]);
        g.lineDashOffset = -this.time * 30;
        g.beginPath();
        g.moveTo(L.x(from), L.y(from));
        g.lineTo(L.x(from) + (L.x(t) - L.x(from)) * p, L.y(from) + (L.y(t) - L.y(from)) * p);
        g.stroke();
        g.setLineDash([]);
      }
    }
    // 検知の光
    for (const l of net.lights) {
      const n = l.path.length;
      const i = Math.floor(l.pos) % n;
      const f = l.pos - Math.floor(l.pos);
      const a = net.node(l.path[i])!;
      const c = net.node(l.path[(i + 1) % n])!;
      const x = L.x(a) + (L.x(c) - L.x(a)) * f;
      const y = L.y(a) + (L.y(c) - L.y(a)) * f;
      const grd = g.createRadialGradient(x, y, 0, x, y, 22);
      grd.addColorStop(0, 'rgba(255,77,109,0.95)');
      grd.addColorStop(1, 'rgba(255,77,109,0)');
      g.fillStyle = grd;
      g.beginPath();
      g.arc(x, y, 22, 0, Math.PI * 2);
      g.fill();
      // 光が乗っている線を赤く
      g.strokeStyle = 'rgba(255,77,109,0.55)';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(L.x(a), L.y(a));
      g.lineTo(L.x(c), L.y(c));
      g.stroke();
    }
    // 点
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const n of net.nodes) {
      const x = L.x(n);
      const y = L.y(n);
      const color = KIND_COLOR[n.kind];
      const can = frontier.has(n.id);
      g.beginPath();
      g.arc(x, y, L.r, 0, Math.PI * 2);
      g.fillStyle = n.cracked ? color : can ? 'rgba(10,30,40,0.95)' : 'rgba(10,16,24,0.9)';
      g.fill();
      g.lineWidth = can ? 3 : 1.5;
      g.strokeStyle = can ? color : n.cracked ? '#fff' : 'rgba(94,240,255,0.35)';
      if (can) g.shadowColor = color;
      g.shadowBlur = can ? 10 + Math.sin(this.time * 5) * 6 : 0;
      g.stroke();
      g.shadowBlur = 0;
      // 直されるまでの残り
      if (n.cracked && n.kind !== 'entry' && n.kind !== 'relay') {
        g.strokeStyle = 'rgba(255,255,255,0.85)';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(x, y, L.r + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, n.relock / RELOCK_SEC));
        g.stroke();
      }
      g.fillStyle = n.cracked ? '#07121a' : can ? color : 'rgba(223,249,255,0.55)';
      g.font = `700 ${Math.round(L.r * 0.62)}px ui-monospace, monospace`;
      g.fillText(KIND_NAME[n.kind], x, y);
      // 持ち主の名前（敵ごとの最初の点の上）
      if (n.kind === 'weak' && n.enemy) {
        const u = b.unit(n.enemy);
        g.fillStyle = u?.alive ? '#ffc2cf' : 'rgba(255,194,207,0.35)';
        g.font = '600 11px ui-monospace, monospace';
        g.fillText(u ? u.name + (u.alive ? '' : '（倒した）') : '', x, y - L.r - 9);
      }
    }
    // シンの居場所
    const at = net.node(net.at)!;
    g.strokeStyle = '#9dffb0';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(L.x(at), L.y(at), L.r + 9 + Math.sin(this.time * 6) * 2, 0, Math.PI * 2);
    g.stroke();
    // 合わせ技で光る
    if (this.time < this.flashUntil) {
      g.fillStyle = this.flashColor;
      g.globalAlpha = Math.max(0, (this.flashUntil - this.time) / 1.2) * 0.35;
      g.fillRect(0, 0, W, H);
      g.globalAlpha = 1;
    }

    // 文字の欄
    this.traceBar.style.width = `${Math.round(net.trace * 100)}%`;
    this.root.classList.toggle('locked', net.lockout > 0);
    this.title.textContent = `裏> 警備システム（群れ ${b.wave + 1}/${b.encounter.waves.length}）`;
    const rows = b.allies
      .filter((u) => !u.bench)
      .map((u) => `<div class="r"><span>${u.name}</span><div class="bar hp"><i style="width:${Math.max(0, (u.hp / u.maxHp) * 100)}%"></i></div></div>`)
      .join('');
    const fhtml = `<div class="t">表：自動で戦闘中</div>${rows}`;
    if (this.front.innerHTML !== fhtml) this.front.innerHTML = fhtml;
    const ihtml = `シンのゲージ ${Math.round(b.hacker?.energy ?? 0)}%　盗んだ物 ×${b.stolen}`;
    if (this.info.innerHTML !== ihtml) this.info.innerHTML = ihtml;
    for (const [id, btn] of this.comboBtns) {
      btn.classList.toggle('ready', b.canCombo(id));
      btn.classList.toggle('queued', queued.includes(id));
    }
  }
}
