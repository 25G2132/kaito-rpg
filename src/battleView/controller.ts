import { Battle, type BattleEvent, type Opening } from '../battle/battle';
import { autoSwap, chooseCommand, readyCombos, readyUltimates, stolenTarget } from '../battle/auto';
import { UraView } from './uraView';
import { playUltGame } from './ultGame';
import type { GameData, PartyMember } from '../battle/types';
import type { GameClock } from './clock';
import type { Hud } from './hud';
import type { Stage } from './stage';
import type { VRM } from '@pixiv/three-vrm';
import { recordError } from '../dev/errlog';

// 戦いの計算（Battle）と画面（Stage・Hud・裏の画面）をつなぐ。
// Battle が返す出来事を、順に動き・数字・演出にして見せる。
// 表（前で戦う）と裏（ハッキング）の2つの画面を行き来できる。見ていない方は自動で動く。裏は時間で進む。

type Input = { kind: 'basic' | 'skill' } | { kind: 'wake' } | { kind: 'swap'; out: string; in: string } | { kind: 'persuade' } | { kind: 'stolen' };

export interface RunResult {
  result: 'won' | 'lost' | 'retreat';
  turns: number;
  biggest: number;
  synergies: number;
  seconds: number; // かかった時間（一時停止の間は数えない）
  recruited: string[]; // 説得で仲間になった敵の id
  defeated: string[]; // 倒した敵の id
  totalDamage: number;
}

export class BattleController {
  readonly battle: Battle;
  private stage: Stage;
  private hud: Hud;
  private clock: GameClock;
  private data: GameData;
  auto = false;
  speed = 1;
  private target: string | null = null;
  private ultQueue: { uid: string; target?: string }[] = [];
  private comboQueue: { id: string; target?: string }[] = [];
  /** いま見ている画面 */
  view: 'omote' | 'ura' = 'omote';
  private ura: UraView | null = null;
  private swapSel: string | null = null;
  private waiting: ((i: Input) => void) | null = null;
  private stopped = false;
  private paused = false;
  private startedAt = performance.now();
  private pausedAt = 0;
  private pausedTotal = 0;
  private biggest = 0;
  private synergies = 0;
  /** 止まっていないかの見張り：最後に戦いが進んだ時刻（実時間） */
  private lastBeat = performance.now();
  private lastFrameAt = performance.now();
  private stallReported = false;
  private inMini = false; // 必殺技のタッチ遊びの間
  private errors = 0;

  constructor(opts: {
    data: GameData;
    stage: Stage;
    hud: Hud;
    clock: GameClock;
    party: PartyMember[];
    encounter: string;
    vrmOf: (charId: string) => VRM | null;
    auto: boolean;
    opening?: Opening;
    speed: number;
  }) {
    this.data = opts.data;
    this.stage = opts.stage;
    this.hud = opts.hud;
    this.clock = opts.clock;
    this.auto = opts.auto;
    this.speed = opts.speed;
    this.battle = new Battle(opts.data, { party: opts.party, encounter: opts.encounter, seed: Date.now(), opening: opts.opening });
    this.stage.setAllies(this.battle, this.battle.allies.map((u) => opts.vrmOf(u.defId)));
    this.stage.setEnemies(this.battle, true);
    this.hud.build(this.battle);
    this.hud.setAuto(this.auto);
    this.hud.setSpeed(this.speed);
    this.clock.speed = this.speed;
    this.pickDefaultTarget();
    if (this.battle.hacker) {
      this.ura = new UraView({
        onBack: () => this.toggleView(),
        onNode: (id) => {
          if (!this.paused) this.battle.net?.choose(id);
        },
        onCombo: (id) => this.tapCombo(id),
      });
    }
  }

  /** 開発用：すぐ勝つ・すぐ負ける */
  devEnd(result: 'won' | 'lost'): void {
    this.battle.phase = result;
    this.battle.activeId = null;
    this.wake();
  }
  /** 開発用：必殺技と合わせ技のゲージを満タンにする */
  devFillEnergy(): void {
    for (const u of this.battle.aliveAllies()) {
      u.energy = u.energyMax;
      this.hud.setEnergy(u.uid, u.energy, u.energyMax);
    }
    if (this.battle.hacker) this.battle.hacker.energy = this.battle.hacker.energyMax;
    this.refreshUlts();
  }
  /** 開発用：敵の体力を1にする */
  devEnemiesToOne(): void {
    for (const u of this.battle.aliveEnemies()) {
      u.hp = 1;
      this.hud.setHp(u.uid, 1, u.maxHp);
    }
  }

  /** 見ていない方は自動：裏を見ている間は、表は自動で戦う */
  private get autoNow(): boolean {
    return this.auto || this.view === 'ura';
  }

  /** 表と裏を切りかえる */
  toggleView(): void {
    if (!this.ura || this.paused || this.battle.ended) return;
    this.view = this.view === 'omote' ? 'ura' : 'omote';
    this.ura.show(this.view === 'ura', this.battle);
    this.hud.setView(this.view === 'ura');
    // 表の入力待ちなら、自動に任せるために起こす
    this.wake();
  }

  /**
   * 毎コマ：裏の時間を進める（倍速に合わせ、一時停止中は止まる）。
   * 裏を見ていれば手で遊ぶ（速い・光は自分でよける）。見ていなければシンが自動で（遅い・安全）
   */
  frame(dt: number): void {
    const b = this.battle;
    if (this.stopped || b.ended) return;
    this.watch();
    if (b.net && dt > 0) {
      const manual = this.view === 'ura';
      const ev = b.advanceUra(dt, manual ? 'manual' : 'auto', manual ? { autoPick: false, careful: false } : undefined);
      for (const e of ev) this.showUra(e);
    }
    const queued = this.comboQueue.map((q) => q.id);
    if (b.hacker) this.hud.setUra(b);
    this.hud.setCombos(b, queued);
    const waitingActor = this.waiting && b.phase === 'command' && !this.autoNow ? b.active ?? null : null;
    this.hud.setStolen(b, b.stolen, waitingActor);
    if (this.ura?.visible) this.ura.draw(b, dt, queued);
  }

  /** 戦いが進んだしるし（見張り用） */
  private beat(): void {
    this.lastBeat = performance.now();
    this.stallReported = false;
  }
  /**
   * 見張り：入力待ち・一時停止・タッチ遊びでもないのに、10秒（実時間）戦いが進まなければ記録する。
   * 画面が裏に回っていた間（コマが来ない間）は数えない
   */
  private watch(): void {
    const now = performance.now();
    const gap = now - this.lastFrameAt;
    this.lastFrameAt = now;
    if (gap > 1000 || this.paused || this.waiting || this.inMini) {
      this.lastBeat = now;
      return;
    }
    if (!this.stallReported && now - this.lastBeat > 10000) {
      this.stallReported = true;
      recordError('stall', new Error('戦いが10秒進まない'), this.debugState());
    }
  }
  /** いまの戦いのようす（記録用） */
  debugState(): Record<string, unknown> {
    const b = this.battle;
    return {
      phase: b.phase,
      active: b.activeId,
      wave: `${b.wave + 1}/${b.encounter.waves.length}`,
      turn: b.turnCount,
      view: this.view,
      auto: this.auto,
      speed: this.speed,
      paused: this.paused,
      waiting: !!this.waiting,
      ults: this.ultQueue.map((q) => q.uid),
      combos: this.comboQueue.map((q) => q.id),
      clock: { speed: this.clock.speed, slow: this.clock.slow },
      net: b.net ? { target: b.net.target, at: b.net.at, trace: +b.net.trace.toFixed(2), lockout: +b.net.lockout.toFixed(1) } : null,
      allies: b.allies.map((u) => `${u.name}${u.bench ? '(控)' : ''} ${u.hp}/${u.maxHp} EN${Math.round(u.energy)}`),
      enemies: b.enemies.map((u) => `${u.name} ${u.hp}/${u.maxHp}`),
    };
  }

  /** 裏の出来事を、表と裏の両方に小さく出す（動きは止めない） */
  private showUra(e: BattleEvent): void {
    const b = this.battle;
    switch (e.t) {
      case 'hack':
        this.ura?.log(e.text);
        if (this.view === 'omote' && e.node !== 'relay') this.hud.hackNote(e.text);
        break;
      case 'reveal': {
        const u = b.unit(e.target);
        if (u) this.hud.setRevealed(b, u);
        break;
      }
      case 'status':
      case 'statusEnd': {
        const u = b.unit(e.target);
        if (u) this.hud.setStatuses(b, u);
        break;
      }
      default:
        break;
    }
  }

  /** 一時停止：時計を止める（動き・待ちがすべて止まる） */
  setPaused(on: boolean): void {
    if (on === this.paused) return;
    this.paused = on;
    if (on) {
      this.pausedAt = performance.now();
      this.clock.speed = 0;
    } else {
      this.pausedTotal += performance.now() - this.pausedAt;
      this.clock.speed = this.speed;
    }
  }
  get isPaused(): boolean {
    return this.paused;
  }

  stop(): void {
    this.stopped = true;
    this.wake();
  }

  // ---------- 入力 ----------

  tapBasic(): void {
    this.answer({ kind: 'basic' });
  }
  /** 盗んだ物を、いま番の味方に渡す */
  tapStolen(): void {
    this.answer({ kind: 'stolen' });
  }
  /** 合わせ技（番を待たずに割り込む） */
  tapCombo(id: string): void {
    if (this.paused || this.auto || !this.battle.canCombo(id) || this.comboQueue.some((q) => q.id === id)) return;
    this.comboQueue.push({ id });
    this.wake();
  }
  tapPersuade(): void {
    if (this.target && this.battle.canPersuade(this.target)) this.answer({ kind: 'persuade' });
  }
  tapSkill(): void {
    if (this.battle.sp >= 1) this.answer({ kind: 'skill' });
  }
  /** カードを押した：控えなら入れかえの選択、選んでいれば入れかえ、それ以外は必殺技 */
  tapUlt(uid: string): void {
    if (this.autoNow || this.paused) return;
    const b = this.battle;
    const u = b.unit(uid);
    if (u?.bench) {
      this.swapSel = this.swapSel === uid || !u.alive ? null : uid;
      this.hud.setSwapSel(this.swapSel);
      return;
    }
    if (this.swapSel) {
      const sel = this.swapSel;
      this.swapSel = null;
      this.hud.setSwapSel(null);
      if (b.canSwap(uid, sel)) this.answer({ kind: 'swap', out: uid, in: sel });
      return;
    }
    if (!this.battle.canUlt(uid) || this.ultQueue.some((q) => q.uid === uid)) return;
    this.ultQueue.push({ uid });
    this.refreshUlts();
    this.wake();
  }
  tapTarget(uid: string): void {
    const u = this.battle.unit(uid);
    if (!u || !u.alive || u.side !== 'enemy') return;
    this.target = uid;
    this.hud.setTarget(uid);
    // 味方の番なら、ねらいに合わせて「説得」のボタンを出しなおす
    if (this.waiting && this.battle.phase === 'command' && !this.auto) this.hud.showCommand(this.battle, this.battle.active ?? null, uid);
  }
  toggleAuto(): void {
    this.auto = !this.auto;
    this.hud.setAuto(this.auto);
    this.wake();
  }
  toggleSpeed(): void {
    this.speed = this.speed >= 3 ? 1 : this.speed + 1; // ×1 → ×2 → ×3
    if (this.paused) {
      this.hud.setSpeed(this.speed);
      return;
    }
    this.clock.speed = this.speed;
    this.hud.setSpeed(this.speed);
  }

  private answer(i: Input): void {
    if (this.paused && i.kind !== 'wake') return;
    const w = this.waiting;
    if (!w) return;
    this.waiting = null;
    w(i);
  }
  private wake(): void {
    this.answer({ kind: 'wake' });
  }

  // ---------- 流れ ----------

  async run(): Promise<RunResult> {
    const b = this.battle;
    if (b.opening === 'ambush') this.hud.banner('先制！ 敵の番が遅れ、守りが削れた', 'wave');
    if (b.opening === 'surprised') this.hud.banner('不意打ち！ 敵が先に動く', 'warn');
    await this.clock.sleep(b.opening === 'normal' ? 0.6 : 1.2);
    while (!b.ended && !this.stopped) {
      this.beat();
      try {
        await this.step();
      } catch (err) {
        // 何かがおかしくなっても、固まらずに続ける（記録は残す）
        recordError('battle', err, this.debugState());
        this.errors++;
        this.comboQueue = [];
        this.ultQueue = [];
        this.waiting = null;
        this.inMini = false;
        this.clock.slow = 1;
        this.hud.showCommand(b, null);
        if (!b.ended && b.phase === 'command' && !b.active) b.phase = 'between';
        if (this.errors > 8) {
          // 直らないときは、拠点へもどす（負けには数えない）
          this.hud.banner('問題が起きたので、戦いを中断しました', 'warn');
          await new Promise((r) => setTimeout(r, 1500));
          this.stopped = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 300));
      }
    }
    this.hud.showCommand(b, null);
    // 結果の画面の後ろに「自動で戦闘中」の帯を残さない
    this.hud.root.classList.remove('auto-on');
    this.ura?.destroy();
    this.ura = null;
    this.view = 'omote';
    this.hud.setView(false);
    const seconds = Math.round((performance.now() - this.startedAt - this.pausedTotal) / 1000);
    const result = this.stopped && !b.ended ? 'retreat' : b.phase === 'won' ? 'won' : 'lost';
    return { result, turns: b.turnCount, biggest: this.biggest, synergies: this.synergies, seconds, totalDamage: this.hud.totalDamage, recruited: [...b.recruited], defeated: [...b.defeatedIds] };
  }

  /** 戦いの流れの1歩（次の番・必殺技・入力待ちのどれか） */
  private async step(): Promise<void> {
    const b = this.battle;
    {
      await this.flushUlts();
      if (b.ended || this.stopped) return;
      if (b.phase === 'between') {
        await this.play(b.nextTurn());
        return;
      }
      // 味方の番
      const actor = b.active!;
      this.hud.setActive(actor.uid);
      this.stage.setActive(actor.uid);
      if (this.autoNow) {
        const s = autoSwap(b);
        if (s) {
          await this.play(b.swap(s.out, s.in));
          return;
        }
        const st = stolenTarget(b);
        if (st) {
          await this.play(b.useStolen(st));
          return;
        }
        for (const c of readyCombos(b)) if (!this.comboQueue.some((q) => q.id === c.id)) this.comboQueue.push(c);
        for (const u of readyUltimates(b)) this.ultQueue.push(u);
        if (this.ultQueue.length || this.comboQueue.length) return;
        const c = chooseCommand(b);
        await this.clock.sleep(0.15);
        await this.play(b.command(c.kind, c.target));
        return;
      }
      this.ensureTarget();
      this.hud.showCommand(b, actor, this.target);
      const input = await new Promise<Input>((resolve) => (this.waiting = resolve));
      this.hud.showCommand(b, null);
      this.swapSel = null;
      this.hud.setSwapSel(null);
      if (input.kind === 'wake') return;
      if (input.kind === 'swap') {
        await this.play(b.swap(input.out, input.in));
        return;
      }
      if (input.kind === 'stolen') {
        if (b.canUseStolen(actor.uid)) await this.play(b.useStolen(actor.uid));
        return;
      }
      if (input.kind === 'persuade') {
        await this.play(b.persuade(this.target!));
        return;
      }
      this.ensureTarget();
      await this.play(b.command(input.kind, this.target ?? undefined));
      return;
    }
  }

  private async flushUlts(): Promise<void> {
    // 合わせ技（組み合わせごとの演出）
    while (this.comboQueue.length && !this.battle.ended && !this.stopped) {
      const q = this.comboQueue.shift()!;
      if (!this.battle.canCombo(q.id)) continue;
      this.ensureTarget();
      const def = this.data.combos[q.id];
      const both = def.members.some((m) => m === this.battle.hacker?.defId);
      this.hud.comboFx(def, both);
      if (both) this.ura?.flash(def.fx.color);
      await this.stage.comboCam(def.fx.camera, this.battle.aliveEnemies().map((u) => u.uid));
      if (!this.battle.canCombo(q.id)) continue;
      await this.play(this.battle.combo(q.id, q.target ?? this.target ?? undefined));
    }
    while (this.ultQueue.length && !this.battle.ended && !this.stopped) {
      const q = this.ultQueue.shift()!;
      if (!this.battle.canUlt(q.uid)) continue;
      this.ensureTarget();
      // 自分で押した必殺技は、タッチ遊びの出来で強くなる（自動のときは遊ばない）
      let boost = 1;
      const u = this.battle.unit(q.uid)!;
      const c = this.battle.charDef(u);
      if (!this.autoNow && c) {
        this.inMini = true;
        try {
          boost = await playUltGame(c.ultGame ?? 'mash', u.name, this.data.elements[u.element]?.color ?? '#fff');
        } finally {
          this.inMini = false;
        }
      }
      if (!this.battle.canUlt(q.uid)) continue;
      await this.play(this.battle.ultimate(q.uid, q.target ?? this.target ?? undefined, boost));
    }
    this.refreshUlts();
  }

  private refreshUlts(): void {
    for (const u of this.battle.allies) {
      this.hud.setUlt(u.uid, this.battle.canUlt(u.uid), this.ultQueue.some((q) => q.uid === u.uid));
    }
  }

  private pickDefaultTarget(): void {
    const alive = this.battle.aliveEnemies();
    const boss = alive.find((u) => this.battle.enemyDef(u)?.boss);
    this.target = (boss ?? alive[Math.floor((alive.length - 1) / 2)])?.uid ?? null;
    this.hud.setTarget(this.target);
  }
  private ensureTarget(): void {
    const t = this.target ? this.battle.unit(this.target) : undefined;
    if (!t || !t.alive || !t.uid.startsWith('e')) this.pickDefaultTarget();
  }

  /** 出来事を順に見せる */
  private async play(events: BattleEvent[]): Promise<void> {
    const b = this.battle;
    const st = this.stage;
    const hud = this.hud;
    let back: (() => Promise<void>) | null = null;
    let hits = 0;
    let lastAction: Extract<BattleEvent, { t: 'action' }> | null = null;

    for (const e of events) {
      if (this.stopped) return;
      this.beat();
      switch (e.t) {
        case 'turn': {
          const u = b.anyUnit(e.unit);
          hud.setActive(u?.side === 'ally' ? e.unit : null);
          st.setActive(e.unit);
          hud.setTurnOrder(b);
          break;
        }
        case 'action': {
          if (back) await back();
          back = null;
          hits = 0;
          lastAction = e;
          const u = b.anyUnit(e.unit);
          if (!u) break;
          const ally = u.side === 'ally';
          const elemColor = this.data.elements[e.element]?.color ?? '#fff';
          if (e.kind === 'ult') {
            hud.ultSplash(u.name, e.name, elemColor);
            st.shake(0.3);
            await st.ultPose(u.uid);
            await this.clock.sleep(0.45);
          } else if (e.kind === 'skill' || !ally) {
            hud.banner(e.name, ally ? '' : 'enemy');
          }
          const main = e.targets[0] ?? null;
          const toFoe = main && b.anyUnit(main)?.side !== u.side;
          if (toFoe) back = await st.lunge(u.uid, main, e.kind === 'combo' ? 'ult' : e.kind);
          else if (e.targets.length && main !== u.uid) await st.cast(u.uid);
          else if (main === u.uid) await st.cast(u.uid);
          break;
        }
        case 'damage': {
          const target = b.anyUnit(e.target);
          const ally = target?.side === 'ally';
          if (e.synergy) {
            this.synergies++;
            const from = b.anyUnit(e.synergy.from)?.name ?? '';
            const status = this.data.statuses[e.synergy.status]?.name ?? '';
            hud.synergy(`${from}の〔${status}〕 × ${lastAction?.name ?? ''}　ダメージ×${e.synergy.mult}`);
            st.shake(0.5);
            st.burst(e.target, '#ffcc33', 70, 1.6);
            await this.clock.slowMo(0.3, 0.45);
          }
          if (!ally) {
            this.biggest = Math.max(this.biggest, e.amount);
            hud.addTotal(e.amount);
          }
          const cls = e.synergy
            ? 'synergy'
            : e.dot
              ? 'dot'
              : ally
                ? 'ally'
                : e.crit
                  ? 'crit'
                  : e.weak
                    ? 'weak'
                    : '';
          const text = e.synergy
            ? `${e.amount}<span class="x">×${e.synergy.mult}</span>`
            : e.dot
              ? `${e.amount} ${this.data.statuses[e.dot]?.name ?? ''}`
              : e.breakDmg
                ? `${e.amount}`
                : String(e.amount);
          hud.number(st, e.target, text, cls, hits * 18);
          if (e.shieldAbsorbed > 0) hud.label(st, e.target, `バリア −${e.shieldAbsorbed}`, '', -60);
          st.hit(e.target, !!e.synergy || e.crit);
          if (e.weak && !e.dot) st.burst(e.target, this.data.elements[lastAction?.element ?? '']?.color ?? '#fff', 18, 0.8);
          if (target) {
            hud.setHp(e.target, e.hp, target.maxHp);
            hud.setShield(e.target, Math.max(0, target.shield), target.maxHp);
          }
          hits++;
          await this.clock.sleep(e.dot ? 0.35 : e.synergy ? 0.5 : 0.12);
          break;
        }
        case 'heal': {
          const t = b.anyUnit(e.target);
          if (!t) break;
          if (e.amount > 0) hud.number(st, e.target, `+${e.amount}`, 'heal');
          hud.setHp(e.target, e.hp, t.maxHp);
          await this.clock.sleep(0.05);
          break;
        }
        case 'shield': {
          const t = b.anyUnit(e.target);
          if (!t) break;
          hud.setShield(e.target, e.amount, t.maxHp);
          if (e.amount > 0) hud.label(st, e.target, 'バリア', '', -50);
          break;
        }
        case 'status': {
          const t = b.anyUnit(e.target);
          if (!t) break;
          const d = this.data.statuses[e.status];
          hud.setStatuses(b, t);
          if (d && t.side === 'enemy') hud.label(st, e.target, d.name, d.kind === 'debuff' ? 'warn' : '', -55);
          if (d && t.side === 'ally' && d.kind === 'buff') hud.label(st, e.target, d.name, '', -55);
          break;
        }
        case 'statusEnd': {
          const t = b.anyUnit(e.target);
          if (t) hud.setStatuses(b, t);
          break;
        }
        case 'amplify': {
          const t = b.anyUnit(e.target);
          if (!t) break;
          const d = this.data.statuses[e.status];
          hud.setStatuses(b, t);
          if (e.synergyFrom) {
            this.synergies++;
            const from = b.anyUnit(e.synergyFrom)?.name ?? '';
            hud.synergy(`${from}の〔${d?.name}〕 ${e.from} → ${e.to}　×2`);
            st.shake(0.35);
            st.burst(e.target, '#ff8a3d', 60, 1.4);
            await this.clock.slowMo(0.35, 0.4);
          } else {
            hud.label(st, e.target, `${d?.name} ${e.from}→${e.to}`, '', -60);
          }
          break;
        }
        case 'toughness': {
          const t = b.anyUnit(e.target);
          hud.setToughness(e.target, e.value, e.max, !!t?.broken && e.value === 0);
          break;
        }
        case 'break': {
          hud.setToughness(e.target, 0, 1, true);
          hud.label(st, e.target, '崩れた！', 'break', -30);
          st.shake(0.25);
          st.burst(e.target, '#ffffff', 50, 1.2);
          await this.clock.sleep(0.35);
          break;
        }
        case 'recover': {
          const t = b.anyUnit(e.unit);
          if (!t) break;
          hud.setToughness(e.unit, t.maxToughness, t.maxToughness, false);
          hud.label(st, e.unit, '立て直した（1回休み）', '', -50);
          await this.clock.sleep(0.6);
          break;
        }
        case 'defeat': {
          st.defeat(e.unit);
          hud.setDead(e.unit, true);
          break;
        }
        case 'sp':
          hud.setSp(e.value);
          break;
        case 'energy': {
          const t = b.anyUnit(e.unit);
          if (!t) break;
          hud.setEnergy(e.unit, e.value, t.energyMax);
          break;
        }
        case 'advance':
          break;
        case 'wave': {
          if (e.index === 0) break;
          if (back) await back();
          back = null;
          await this.clock.sleep(0.5);
          st.setEnemies(b, true);
          hud.buildEnemies(b);
          hud.syncAll(b);
          this.pickDefaultTarget();
          hud.banner(`WAVE ${e.index + 1} / ${e.total}`, 'wave');
          await this.clock.sleep(0.9);
          break;
        }
        case 'warn': {
          hud.banner(e.text, 'warn');
          await this.clock.sleep(1.0);
          break;
        }
        case 'swap': {
          st.swapActors(e.out, e.in);
          hud.arrange(b);
          hud.syncAll(b);
          hud.banner(`交代！ ${b.anyUnit(e.out)?.name} → ${b.anyUnit(e.in)?.name}`);
          await this.clock.sleep(0.5);
          break;
        }
        case 'persuade': {
          const t = b.anyUnit(e.target);
          hud.label(st, e.target, e.ok ? '説得成功！' : '説得に失敗…', e.ok ? 'break' : 'warn', -40);
          if (e.ok) {
            hud.banner(`${t?.name}が協力者になった！`, 'wave');
            st.burst(e.target, '#5ef0a0', 60, 1.3);
          }
          await this.clock.sleep(0.9);
          break;
        }
        case 'end':
          break;
      }
    }
    if (back) await back();
    await this.clock.sleep(0.2);
    this.hud.syncAll(b);
    this.refreshUlts();
    this.ensureTarget();
  }
}
