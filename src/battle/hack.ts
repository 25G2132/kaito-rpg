// 裏の画面：敵の警備システムの回線図（点＝装置、線＝回線）。時間で進む。
// シン（裏の担当）が、入口から点を1つずつ破って奥へ進む。破った点の効果は、表の戦いに届く。
// 線の上を「検知の光」が巡回していて、破っている途中の線に光が来ると「追跡ゲージ」が上がる。
// 満タンになると回線を切られ、しばらくしめ出されて入口にもどる（破った点はそのまま）。
//
// 手で遊ぶ（manual）と、破る速さが上がる。自動（auto）は遅く、光が来そうなら待つ安全な遊び方。
// 画面とは切り離してあり、自動テストで確かめる。

export type HackKind = 'entry' | 'relay' | 'weak' | 'wall' | 'buff' | 'ctrl';

export interface HackNode {
  id: string;
  kind: HackKind;
  enemy?: string; // その装置の持ち主（敵の uid）
  x: number; // 画面の位置（0〜1）
  y: number;
  hard: number; // 破るのにかかる秒数（速さ 1 のとき）
  cracked: boolean;
  relock: number; // 敵に直されるまでの残り秒（中継点は直されない）
}

export interface HackEdge {
  a: string;
  b: string;
}

/** 検知の光。path の点を順にめぐる（最後から最初へもどる） */
export interface HackLight {
  path: string[];
  pos: number; // path の何番目の線の上か（小数）
  speed: number; // 1秒に進む線の数
}

export type HackMode = 'auto' | 'manual';

export const AUTO_RATE = 0.62; // 自動で破る速さ
export const MANUAL_RATE = 1.15; // 手で破る速さ
export const TRACE_RATE = 0.55; // 光が来ている間、1秒に上がる追跡ゲージ
export const TRACE_COOL = 0.12; // 光が来ていない間、1秒に下がる追跡ゲージ
export const LOCKOUT_SEC = 4; // しめ出される秒数
export const RELOCK_SEC = 16; // 破った装置は、この秒数で敵が直す（効果が切れ、また破る必要がある）

/** 敵1体ぶんの情報（回線図を作るのに使う） */
export interface HackEnemy {
  uid: string;
  boss: boolean;
  machine: boolean; // ロボやドローン（乗っ取れる）
}

export interface HackUpdate {
  cracked: HackNode[]; // 破った点
  relocked: HackNode[]; // 敵に直された点（効果が切れる）
}

/** 進め方。autoPick＝ねらう点を自分で選ぶ、careful＝光が来そうなら待つ */
export interface HackOpts {
  autoPick: boolean;
  careful: boolean;
}

export class HackNet {
  nodes: HackNode[] = [];
  edges: HackEdge[] = [];
  lights: HackLight[] = [];
  at = 'entry'; // シンがいま居る点
  target: string | null = null; // 破っている点
  progress = 0; // 破っている点の進み（秒）
  trace = 0; // 追跡ゲージ（0〜1）
  lockout = 0; // しめ出されている残り秒
  time = 0;
  /** 手で選んだ行き先（自動のときは使わない） */
  order: string | null = null;

  constructor(enemies: HackEnemy[]) {
    this.build(enemies);
  }

  node(id: string): HackNode | undefined {
    return this.nodes.find((n) => n.id === id);
  }
  neighbors(id: string): string[] {
    const out: string[] = [];
    for (const e of this.edges) {
      if (e.a === id) out.push(e.b);
      else if (e.b === id) out.push(e.a);
    }
    return out;
  }
  /** 入口から、破った点だけを通って行ける点 */
  reachable(): Set<string> {
    const seen = new Set<string>(['entry']);
    const q = ['entry'];
    while (q.length) {
      const id = q.pop()!;
      for (const n of this.neighbors(id)) {
        if (seen.has(n) || !this.node(n)?.cracked) continue;
        seen.add(n);
        q.push(n);
      }
    }
    return seen;
  }
  /** いま破りにかかれる点（行ける点のとなりで、まだ破っていない） */
  frontier(): HackNode[] {
    const r = this.reachable();
    const out = new Set<string>();
    for (const id of r) for (const n of this.neighbors(id)) if (!this.node(n)!.cracked) out.add(n);
    return [...out].map((id) => this.node(id)!);
  }
  /** 破りにかかるとき、どの点から線をつなぐか（行ける点のうち、となりのもの） */
  private from(id: string): string | null {
    const r = this.reachable();
    if (r.has(this.at) && this.neighbors(this.at).includes(id)) return this.at;
    return this.neighbors(id).find((n) => r.has(n)) ?? null;
  }

  /** いま光が乗っている線（a-b、向きは問わない）の一覧 */
  litEdges(): [string, string][] {
    return this.lights.map((l) => {
      const n = l.path.length;
      const i = Math.floor(l.pos) % n;
      return [l.path[i], l.path[(i + 1) % n]];
    });
  }
  /** a-b の線に、いま（または secs 秒以内に）光が来るか */
  lightOn(a: string, b: string, secs = 0): boolean {
    for (const l of this.lights) {
      const n = l.path.length;
      for (let s = 0; s <= secs + 1e-9; s += 0.25) {
        const p = (l.pos + l.speed * s) % n;
        const i = Math.floor(p);
        const x = l.path[i];
        const y = l.path[(i + 1) % n];
        if ((x === a && y === b) || (x === b && y === a)) return true;
      }
    }
    return false;
  }

  /** 手で点を選ぶ（画面で点を押した） */
  choose(id: string): boolean {
    const n = this.node(id);
    if (!n || this.lockout > 0) return false;
    if (n.cracked) {
      // 行ける点なら、そこへ移る
      if (this.reachable().has(id)) {
        this.at = id;
        this.order = null;
        if (this.target && !this.from(this.target)) this.target = null;
        return true;
      }
      return false;
    }
    if (!this.from(id)) return false;
    if (this.target !== id) {
      this.target = id;
      this.progress = 0;
    }
    this.order = id;
    return true;
  }

  /**
   * 時間を進める。mode＝いまどちらが動かしているか（手で遊ぶと速い）。
   * opts を省くと、自動なら「自分で選ぶ・光を待つ」、手なら「押した点だけ・光は自分でよける」
   */
  update(dt: number, mode: HackMode, opts?: HackOpts): HackUpdate {
    const o = opts ?? { autoPick: mode === 'auto', careful: mode === 'auto' };
    const out: HackUpdate = { cracked: [], relocked: [] };
    const step = 0.05;
    for (let t = 0; t < dt - 1e-9; t += step) {
      const d = Math.min(step, dt - t);
      const c = this.tick(d, mode, o, out);
      if (c) out.cracked.push(c);
    }
    return out;
  }

  private tick(dt: number, mode: HackMode, o: HackOpts, out: HackUpdate): HackNode | null {
    this.time += dt;
    for (const l of this.lights) l.pos = (l.pos + l.speed * dt) % l.path.length;
    // 破った装置は、しばらくすると敵に直される
    for (const n of this.nodes) {
      if (!n.cracked || n.kind === 'entry' || n.kind === 'relay') continue;
      n.relock -= dt;
      if (n.relock <= 0) {
        n.cracked = false;
        out.relocked.push(n);
        if (!this.reachable().has(this.at)) this.at = 'entry';
      }
    }
    if (this.lockout > 0) {
      this.lockout = Math.max(0, this.lockout - dt);
      if (this.lockout === 0) this.trace = 0;
      return null;
    }
    if (o.autoPick && !this.target) this.target = this.autoPick();
    if (!this.target) {
      this.trace = Math.max(0, this.trace - TRACE_COOL * dt);
      return null;
    }
    const from = this.from(this.target);
    if (!from) {
      this.target = null;
      return null;
    }
    const lit = this.lightOn(from, this.target);
    // 気をつける遊び方（自動）は、光が来ている・来そうな間は手を止めて回線を離す（安全だが遅い）
    const wait = o.careful && (lit || this.lightOn(from, this.target, 0.6));
    if (lit && !wait) this.trace = Math.min(1, this.trace + TRACE_RATE * dt);
    else this.trace = Math.max(0, this.trace - TRACE_COOL * dt);
    if (this.trace >= 1) {
      // 回線を切られた：しめ出されて入口へ
      this.lockout = LOCKOUT_SEC;
      this.at = 'entry';
      this.target = null;
      this.order = null;
      this.progress = 0;
      return null;
    }
    if (wait) return null;
    this.progress += dt * (mode === 'manual' ? MANUAL_RATE : AUTO_RATE);
    const n = this.node(this.target)!;
    if (this.progress < n.hard) return null;
    n.cracked = true;
    n.relock = RELOCK_SEC;
    this.at = n.id;
    this.target = null;
    this.order = null;
    this.progress = 0;
    return n;
  }

  /** 自動で次にねらう点：効果のある点を先に（ボスの弱点 → 強化を盗む → 防壁 → 乗っ取り）、なければ近道の中継点 */
  private autoPick(): string | null {
    const f = this.frontier();
    if (!f.length) return null;
    const score = (n: HackNode) => {
      const boss = this.bossOf(n) ? 1 : 0;
      switch (n.kind) {
        case 'weak':
          return 50 + boss * 20;
        case 'buff':
          return 40 + boss * 20;
        case 'wall':
          return 30 + boss * 20;
        case 'ctrl':
          return 35;
        case 'relay':
          return 10;
        default:
          return 0;
      }
    };
    return [...f].sort((a, b) => score(b) - score(a) || a.hard - b.hard)[0].id;
  }
  private bossIds = new Set<string>();
  private bossOf(n: HackNode): boolean {
    return !!n.enemy && this.bossIds.has(n.enemy);
  }

  /** 群れごとの回線図を作る。入口 → 中継点 → 敵ごとの装置（弱点 → 防壁 → 強化、機械なら乗っ取り） */
  private build(enemies: HackEnemy[]): void {
    for (const e of enemies) if (e.boss) this.bossIds.add(e.uid);
    const add = (n: Omit<HackNode, 'cracked' | 'relock'>) => this.nodes.push({ ...n, cracked: n.kind === 'entry', relock: 0 });
    const link = (a: string, b: string) => this.edges.push({ a, b });
    add({ id: 'entry', kind: 'entry', x: 0.06, y: 0.5, hard: 0 });
    const relays = enemies.length > 2 ? 3 : 2;
    for (let i = 0; i < relays; i++) {
      add({ id: `r${i}`, kind: 'relay', x: 0.27, y: (i + 1) / (relays + 1), hard: 1.2 });
      link('entry', `r${i}`);
      if (i > 0) link(`r${i - 1}`, `r${i}`);
    }
    const lightPath: string[] = ['entry', 'r0'];
    enemies.forEach((e, i) => {
      const y = (i + 1) / (enemies.length + 1);
      const k = e.boss ? 1.7 : 1;
      const p = `n${i}`;
      add({ id: `${p}w`, kind: 'weak', enemy: e.uid, x: 0.47, y, hard: 2.0 * k });
      add({ id: `${p}f`, kind: 'wall', enemy: e.uid, x: 0.67, y: y - 0.06, hard: 2.6 * k });
      add({ id: `${p}b`, kind: 'buff', enemy: e.uid, x: 0.88, y, hard: 3.2 * k });
      const r = `r${Math.min(relays - 1, Math.round((i / Math.max(1, enemies.length - 1)) * (relays - 1)))}`;
      link(r, `${p}w`);
      link(`${p}w`, `${p}f`);
      link(`${p}f`, `${p}b`);
      if (e.machine) {
        add({ id: `${p}c`, kind: 'ctrl', enemy: e.uid, x: 0.67, y: y + 0.1, hard: 2.8 });
        link(`${p}w`, `${p}c`);
      }
      if (i === 0) lightPath.push(`${p}w`, `${p}f`, `${p}b`, `${p}f`, `${p}w`, 'r0');
    });
    // 光1：入口から最初の敵の奥まで往復。光2：中継点の間と、最後の敵（ボス）の装置をめぐる
    this.lights.push({ path: lightPath, pos: 0, speed: 0.55 });
    const last = enemies.length - 1;
    if (last >= 0) {
      const p = `n${last}`;
      const r = `r${relays - 1}`;
      const path = [r, `${p}w`, `${p}f`, `${p}b`, `${p}f`, `${p}w`];
      if (relays > 1) path.push(r, `r${relays - 2}`);
      this.lights.push({ path: path.length > 1 ? path : [r, `${p}w`], pos: 1.5, speed: 0.45 });
    }
  }
}
