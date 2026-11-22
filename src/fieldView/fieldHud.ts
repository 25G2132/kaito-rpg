import type { FieldState } from '../field/logic';

// 歩く場所の操作と表示。
//   左半分：指を置いたところにスティックが出る（歩く）
//   右半分：なぞるとカメラが回る
//   右下：攻撃・調べる・走る　　右上：小さな地図・拠点へもどる
//   パソコン：WASD／矢印で歩く、Shift で走る、Space で攻撃、E で調べる、ドラッグでカメラ

export interface FieldHudHandlers {
  onAttack: () => void;
  onInteract: () => void;
  onMenu: () => void;
  onLens: () => void;
}

const STICK_R = 56;

/** 解析レンズの丸の半径（画面の点） */
export const LENS_R = 64;

export class FieldHud {
  readonly root = document.createElement('div');
  run = false;
  private touch = document.createElement('div');
  private stickBase = document.createElement('div');
  private stickKnob = document.createElement('div');
  private interactBtn = document.createElement('button');
  private runBtn = document.createElement('button');
  private lensBtn = document.createElement('button');
  private area = document.createElement('div');
  private hidden = document.createElement('div');
  private hack = document.createElement('div');
  private status = document.createElement('div');
  private lensEl = document.createElement('div');
  private lensMode = false;
  private lensXY: [number, number] = [0, 0];
  private lensDragId: number | null = null;
  private lensLast: [number, number] = [0, 0];
  private lensMoved = 0; // 開いてからレンズを動かした長さ
  private mini = document.createElement('canvas');
  private stickId: number | null = null;
  private stickOrigin: [number, number] = [0, 0];
  private stickVec: [number, number] = [0, 0];
  private lookId: number | null = null;
  private lookLast = 0;
  private yawDelta = 0;
  private keys = new Set<string>();
  private h: FieldHudHandlers;
  private onKeyDown = (e: KeyboardEvent) => {
    this.keys.add(e.code);
    if (e.code === 'Space') this.h.onAttack();
    if (e.code === 'KeyE' || e.code === 'Enter') this.h.onInteract();
    if (e.code === 'KeyQ') this.h.onLens();
  };
  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);

  constructor(h: FieldHudHandlers, opts: { school?: boolean; menuLabel?: string } = {}) {
    this.h = h;
    this.root.className = opts.school ? 'fhud school' : 'fhud';
    this.status.className = 'fstatus';
    this.touch.className = 'fhud-touch';
    this.stickBase.className = 'stick';
    this.stickKnob.className = 'knob';
    this.stickBase.appendChild(this.stickKnob);
    this.area.className = 'farea';
    this.hidden.className = 'fhidden';
    this.hidden.textContent = '影の中：見つからない';
    this.hack.className = 'fhack';
    this.mini.className = 'fmini';
    this.lensEl.className = 'flensview';
    this.lensEl.innerHTML = '<i class="gauge"></i><i class="cross"></i><span>指でレンズを動かす</span>';
    this.mini.width = 300;
    this.mini.height = 210;

    const menu = document.createElement('button');
    menu.className = 'fbtn fmenu';
    menu.textContent = opts.menuLabel ?? '拠点へ';
    press(menu, () => h.onMenu());

    const atk = document.createElement('button');
    atk.className = 'fbtn fatk';
    atk.innerHTML = '<b>攻撃</b><small>先に叩くと有利</small>';
    press(atk, () => h.onAttack());
    this.interactBtn.className = 'fbtn fint';
    press(this.interactBtn, () => h.onInteract());
    this.runBtn.className = 'fbtn frun';
    this.runBtn.textContent = '走る';
    this.lensBtn.className = 'fbtn flens';
    this.lensBtn.innerHTML = '<b>レンズ</b><small>解析</small>';
    press(this.lensBtn, () => h.onLens());
    // 走る・歩くの設定は、場所を移っても（出入り口・ワープ）、読み込みなおしても続く
    this.run = loadRunPref();
    this.runBtn.classList.toggle('on', this.run);
    press(this.runBtn, () => {
      this.run = !this.run;
      this.runBtn.classList.toggle('on', this.run);
      saveRunPref(this.run);
    });

    this.root.append(this.lensEl, this.touch, this.stickBase, this.area, this.status, this.hidden, this.hack, this.mini, menu, atk, this.interactBtn, this.runBtn, this.lensBtn);
    document.body.appendChild(this.root);
    this.setInteract(null);
    this.setHack(null);

    this.touch.addEventListener('pointerdown', (e) => this.down(e));
    this.touch.addEventListener('pointermove', (e) => this.move(e));
    this.touch.addEventListener('pointerup', (e) => this.up(e));
    this.touch.addEventListener('pointercancel', (e) => this.up(e));
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  private rects: DOMRect[] = [];
  private rectsAt = -1e9;
  /** 画面の上のほうに重なる表示の場所（0.5秒ごとに測り直す） */
  blockers(): DOMRect[] {
    const now = performance.now();
    if (now - this.rectsAt > 500) {
      this.rectsAt = now;
      this.rects = [this.area, this.status, this.mini, this.root.querySelector<HTMLElement>('.fmenu')]
        .filter((e): e is HTMLElement => !!e)
        .map((e) => e.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0);
    }
    return this.rects;
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.root.remove();
  }

  private down(e: PointerEvent): void {
    this.touch.setPointerCapture(e.pointerId);
    // レンズの間は、どこを触っても、指の動きでレンズが動く
    if (this.lensMode) {
      if (this.lensDragId === null) {
        this.lensDragId = e.pointerId;
        this.lensLast = [e.clientX, e.clientY];
      }
      return;
    }
    if (e.clientX < window.innerWidth * 0.45 && this.stickId === null) {
      this.stickId = e.pointerId;
      this.stickOrigin = [e.clientX, e.clientY];
      this.stickVec = [0, 0];
      this.stickBase.style.left = `${e.clientX}px`;
      this.stickBase.style.top = `${e.clientY}px`;
      this.stickBase.classList.add('on');
      this.stickKnob.style.transform = 'translate(-50%, -50%)';
    } else if (this.lookId === null) {
      this.lookId = e.pointerId;
      this.lookLast = e.clientX;
    }
  }
  private move(e: PointerEvent): void {
    if (e.pointerId === this.lensDragId) {
      this.moveLens((e.clientX - this.lensLast[0]) * 1.3, (e.clientY - this.lensLast[1]) * 1.3);
      this.lensLast = [e.clientX, e.clientY];
      return;
    }
    if (e.pointerId === this.stickId) {
      let dx = e.clientX - this.stickOrigin[0];
      let dy = e.clientY - this.stickOrigin[1];
      const l = Math.hypot(dx, dy);
      if (l > STICK_R) {
        dx = (dx / l) * STICK_R;
        dy = (dy / l) * STICK_R;
      }
      this.stickVec = [dx / STICK_R, -dy / STICK_R];
      this.stickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    } else if (e.pointerId === this.lookId) {
      this.yawDelta += (e.clientX - this.lookLast) * 0.008;
      this.lookLast = e.clientX;
    }
  }
  private up(e: PointerEvent): void {
    if (e.pointerId === this.lensDragId) {
      this.lensDragId = null;
      return;
    }
    if (e.pointerId === this.stickId) {
      this.stickId = null;
      this.stickVec = [0, 0];
      this.stickBase.classList.remove('on');
    } else if (e.pointerId === this.lookId) {
      this.lookId = null;
    }
  }

  /** スティック（右・上）。キーボードもまとめる */
  stick(): [number, number] {
    let [x, y] = this.stickVec;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    const l = Math.hypot(x, y);
    return l > 1 ? [x / l, y / l] : [x, y];
  }
  running(): boolean {
    return this.run || this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
  }
  takeYaw(): number {
    const d = this.yawDelta;
    this.yawDelta = 0;
    return d;
  }

  setInteract(label: string | null): void {
    this.interactBtn.style.display = label ? '' : 'none';
    this.interactBtn.innerHTML = label ? `<b>調べる</b><small>${label}</small>` : '';
  }
  setArea(name: string): void {
    if (this.area.textContent !== name) this.area.textContent = name;
  }
  setStatus(text: string): void {
    if (this.status.textContent !== text) this.status.textContent = text;
  }
  private moveLens(dx: number, dy: number): void {
    this.lensMoved += Math.hypot(dx, dy);
    const m = LENS_R * 0.6;
    this.lensXY = [Math.max(m, Math.min(window.innerWidth - m, this.lensXY[0] + dx)), Math.max(m, Math.min(window.innerHeight - m, this.lensXY[1] + dy))];
    this.lensEl.style.left = `${this.lensXY[0]}px`;
    this.lensEl.style.top = `${this.lensXY[1]}px`;
  }
  /** 開いたところから、レンズを少し動かしたか（動かすまでは探せない） */
  lensSearching(): boolean {
    return this.lensMoved >= LENS_R;
  }
  /** レンズの中心（画面の点） */
  lensPos(): [number, number] {
    return this.lensXY;
  }
  /** キーボード（WASD・矢印）でもレンズを動かす */
  lensStep(dt: number): void {
    const k = this.keys;
    let x = 0;
    let y = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) y -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y += 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (x || y) this.moveLens(x * 420 * dt, y * 420 * dt);
  }
  /** レンズのようす：progress＝重ね続けたぶん（0〜1）、near＝近くにあるほど 1（ゆれが強くなる） */
  setLensView(progress: number, near: number): void {
    this.lensEl.style.setProperty('--p', progress.toFixed(3));
    this.lensEl.style.setProperty('--n', near.toFixed(3));
    this.lensEl.classList.toggle('near', near > 0.55);
    this.lensEl.classList.toggle('hit', progress > 0);
  }
  /** レンズ：つけている間は、丸いレンズの外が暗くなる。近くに何かあればボタンが知らせる */
  setLens(on: boolean, hint: boolean): void {
    if (on && !this.lensMode) {
      // 開いたときは画面のまんなか。スティックや見回しの指は放す
      this.lensXY = [window.innerWidth / 2, window.innerHeight * 0.45];
      this.moveLens(0, 0);
      this.lensMoved = 0;
      this.stickId = null;
      this.stickVec = [0, 0];
      this.stickBase.classList.remove('on');
      this.lookId = null;
      this.setLensView(0, 0);
    }
    if (!on) this.lensDragId = null;
    this.lensMode = on;
    this.root.classList.toggle('lens', on);
    this.lensBtn.classList.toggle('on', on);
    this.lensBtn.classList.toggle('hint', hint && !on);
  }
  setHidden(on: boolean): void {
    this.hidden.classList.toggle('on', on);
  }
  setHack(progress: number | null): void {
    this.hack.style.display = progress === null ? 'none' : '';
    if (progress !== null) this.hack.innerHTML = `シンがハッキング中…<div class="bar"><i style="width:${Math.round(progress * 100)}%"></i></div>`;
  }

  banner(text: string, cls = ''): void {
    const b = document.createElement('div');
    b.className = `fbanner ${cls}`;
    b.innerHTML = text;
    this.root.appendChild(b);
    window.setTimeout(() => b.remove(), 2200);
  }

  /** 小さな地図（上が z の小さいほう） */
  drawMap(st: FieldState): void {
    const g = this.mini.getContext('2d')!;
    const W = this.mini.width;
    const H = this.mini.height;
    // 地図の広さは、場所（エリア）から決める
    const minX = Math.min(...st.map.areas.map((a) => a.x)) - 0.5;
    const maxX = Math.max(...st.map.areas.map((a) => a.x + a.w)) + 0.5;
    const minZ = Math.min(...st.map.areas.map((a) => a.z)) - 0.5;
    const maxZ = Math.max(...st.map.areas.map((a) => a.z + a.d)) + 0.5;
    const s = Math.min(W / (maxX - minX), H / (maxZ - minZ));
    const X = (x: number) => (x - minX) * s;
    const Z = (z: number) => (z - minZ) * s;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(10,12,20,0.75)';
    g.fillRect(0, 0, W, H);
    for (const a of st.map.areas) {
      g.fillStyle = a.floor;
      g.fillRect(X(a.x), Z(a.z), a.w * s, a.d * s);
    }
    g.fillStyle = 'rgba(120,80,220,0.45)';
    for (const r of st.map.shadows) g.fillRect(X(r.x), Z(r.z), r.w * s, r.d * s);
    g.fillStyle = '#8a86a0';
    for (const w of st.map.walls) g.fillRect(X(w.x), Z(w.z), Math.max(1.5, w.w * s), Math.max(1.5, w.d * s));
    for (const d of st.map.doors) {
      if (st.openDoors.has(d.id)) continue;
      g.fillStyle = '#ff3050';
      g.fillRect(X(d.x) - 1, Z(d.z), Math.max(3, d.w * s), d.d * s);
    }
    const cone = (x: number, z: number, dir: number, fov: number, range: number, color: string) => {
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(X(x), Z(z));
      g.arc(X(x), Z(z), range * s, dir - fov / 2, dir + fov / 2);
      g.closePath();
      g.fill();
    };
    for (const c of st.cameras) if (!c.disabled) cone(c.def.pos[0], c.def.pos[1], c.dir, c.def.fov, c.def.range, 'rgba(255,48,80,0.3)');
    for (const t of st.map.terminals) {
      g.fillStyle = st.hacked.has(t.id) ? '#30ff80' : '#1ec8ff';
      g.fillRect(X(t.pos[0]) - 3, Z(t.pos[1]) - 3, 6, 6);
    }
    for (const c of st.map.chests) {
      if (st.opened.has(c.id)) continue;
      g.fillStyle = '#ffc93d';
      g.fillRect(X(c.pos[0]) - 3, Z(c.pos[1]) - 3, 6, 6);
    }
    if (st.map.boss) {
      g.fillStyle = '#b070ff';
      g.beginPath();
      g.arc(X(st.map.boss.pos[0]), Z(st.map.boss.pos[1]), 6, 0, Math.PI * 2);
      g.fill();
    }
    for (const n of st.npcs) {
      if (!n.present) continue;
      g.fillStyle = n.def.charId ? '#5ef0a0' : '#9ad0ff';
      g.beginPath();
      g.arc(X(n.pos[0]), Z(n.pos[1]), n.def.charId ? 5 : 3.5, 0, Math.PI * 2);
      g.fill();
    }
    if (st.map.exit) {
      g.fillStyle = '#ffd25a';
      g.fillRect(X(st.map.exit.pos[0]) - 4, Z(st.map.exit.pos[1]) - 4, 8, 8);
    }
    for (const p of st.patrols) {
      if (p.defeated) continue;
      cone(p.pos[0], p.pos[1], p.dir, p.def.fov, p.def.range, p.alerted ? 'rgba(255,60,60,0.35)' : 'rgba(255,210,64,0.25)');
      g.fillStyle = p.alerted ? '#ff3050' : '#ffd040';
      g.beginPath();
      g.arc(X(p.pos[0]), Z(p.pos[1]), 4, 0, Math.PI * 2);
      g.fill();
    }
    // 自分（向きの分かる三角）
    const [px, pz] = st.pos;
    g.save();
    g.translate(X(px), Z(pz));
    g.rotate(st.dir);
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo(8, 0);
    g.lineTo(-5, 5);
    g.lineTo(-5, -5);
    g.closePath();
    g.fill();
    g.restore();
  }
}

/**
 * 指が触れた瞬間に押したことにする。
 * スマホでは、ほかの指（動かすスティック）が画面に触れているあいだ click が起きないので、click では押せない。
 */
function press(el: HTMLButtonElement, fn: () => void): void {
  el.addEventListener('pointerdown', (e) => {
    if (el.disabled || e.button > 0) return;
    e.preventDefault();
    e.stopPropagation();
    el.classList.add('pressed');
    fn();
  });
  const up = () => el.classList.remove('pressed');
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('pointerleave', up);
}

const RUN_KEY = 'kaito-rpg-run';
let runPref: boolean | null = null;
/** 走る・歩くの設定（画面を作りなおしても同じにする） */
function loadRunPref(): boolean {
  if (runPref !== null) return runPref;
  try {
    runPref = localStorage.getItem(RUN_KEY) === '1';
  } catch {
    runPref = false;
  }
  return runPref;
}
function saveRunPref(on: boolean): void {
  runPref = on;
  try {
    localStorage.setItem(RUN_KEY, on ? '1' : '0');
  } catch {
    /* 保存できなくても、この間は続く */
  }
}
