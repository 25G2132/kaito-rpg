// 戦いの計算。画面とは切り離してあり、起きたことを「出来事（BattleEvent）」の並びで返す。
// 画面はその並びを順に見せるだけ。自動テストもこの出来事を見て確かめる。
//
// 流れ：
//   nextTurn()            … 次に番が来る人を決める。敵ならそのまま動く。味方なら phase='command' で止まる
//   command('basic'|'skill', 相手)  … 味方の番の行動
//   ultimate(味方, 相手)   … 必殺技。ゲージが満タンなら、番を待たずにいつでも割り込める

import { HackNet, type HackKind, type HackMode, type HackNode, type HackOpts } from './hack';
import { makeRng, pickWeighted, type Rng } from './rng';
import { actionLength, statsAtLevel } from './stats';
import type {
  CharacterDef,
  ComboDef,
  Effect,
  EffectTo,
  EnemyDef,
  EncounterDef,
  GameData,
  Mods,
  PartyMember,
  Side,
  SkillDef,
  Stats,
  StatusDef,
} from './types';

export const SP_MAX = 5;
export const SP_START = 3;
const ENERGY_BY_KIND = { basic: 20, skill: 30, ult: 5, enemy: 0, combo: 0 } as const;
export const HIDDEN_TOUGH = 0.5; // 弱点を暴く前は、弱点で守りを削る量が半分
export const HACKER_ENERGY_MAX = 100;
export const HACKER_ENERGY_PER_CRACK = 25; // 裏で点を1つ破るごとに、シンのゲージがたまる
export const URA_SEC_PER_TURN = 2.0; // 自動テストで、番1つぶんに進める裏の時間（秒）
const ENERGY_ON_HIT = 10;
const ENERGY_ON_KILL = 10;
const NOT_WEAK_MULT = 0.8; // 弱点でない属性は2割減
const BROKEN_TAKEN = 0.2; // 守りが崩れている間は2割増し
const BREAK_DELAY = 0.25; // 崩れたら番が 1/4 遅れる
const BREAK_DMG = 1.0; // 崩したときの追加ダメージ（攻撃力の倍率）
export const SKILL_STEP = 0.1;
export const ULT_BOOST_MAX = 1.5; // 必殺技のタッチ遊びで、いちばん強くなったとき
export const PERSUADE_HP = 0.3; // 説得できる HP の割合
export const FRONT = 4; // 前に出る人数 // 技レベル1つで技の倍率 +10%

export interface StatusInst {
  id: string;
  turns: number;
  stacks: number;
  source: string; // かけた人
  power: number; // かけた人の攻撃力（継続ダメージに使う）
  fresh: boolean; // 持ち主の番の中でかかった（その番の終わりには減らさない）
}

export interface Unit {
  uid: string;
  side: Side;
  defId: string;
  name: string;
  level: number;
  element: string;
  slot: number;
  stats: Stats;
  maxHp: number;
  hp: number;
  alive: boolean;
  energy: number;
  energyMax: number;
  maxToughness: number;
  toughness: number;
  broken: boolean;
  weaknesses: string[];
  statuses: StatusInst[];
  shield: number;
  shieldTurns: number;
  av: number; // 次の番までの残り
  aggro: number;
  actions: number; // 実際に動いた回数（敵の技の順番に使う）
  enraged: boolean;
  bench: boolean; // 控え（前の4人のうしろ。動かず、ねらわれない）
  power: number; // 技の倍率（技レベルで上がる）
  mods: Mods;
  revealed: boolean; // 敵の弱点が見えているか（裏で暴く）
}

export type Phase = 'between' | 'command' | 'won' | 'lost';

export type BattleEvent =
  | { t: 'turn'; unit: string }
  | { t: 'action'; unit: string; skill: string; name: string; kind: SkillDef['kind']; targets: string[]; element: string }
  | {
      t: 'damage';
      source: string;
      target: string;
      amount: number;
      hp: number;
      shieldAbsorbed: number;
      crit: boolean;
      weak: boolean;
      dot?: string; // 継続ダメージなら状態の id
      breakDmg?: boolean;
      synergy?: { status: string; mult: number; from: string };
    }
  | { t: 'heal'; source: string; target: string; amount: number; hp: number }
  | { t: 'shield'; target: string; amount: number }
  | { t: 'status'; source: string; target: string; status: string; stacks: number; turns: number }
  | { t: 'statusEnd'; target: string; status: string }
  | { t: 'amplify'; source: string; target: string; status: string; from: number; to: number; synergyFrom?: string }
  | { t: 'toughness'; target: string; value: number; max: number }
  | { t: 'break'; source: string; target: string }
  | { t: 'recover'; unit: string }
  | { t: 'defeat'; unit: string }
  | { t: 'sp'; value: number }
  | { t: 'energy'; unit: string; value: number }
  | { t: 'advance'; unit: string }
  | { t: 'wave'; index: number; total: number; enemies: string[] }
  | { t: 'warn'; unit: string; text: string }
  | { t: 'swap'; out: string; in: string }
  | { t: 'persuade'; unit: string; target: string; ok: boolean }
  | { t: 'hack'; node: HackKind; enemy?: string; text: string } // 裏で装置を破った
  | { t: 'reveal'; target: string } // 弱点が見えた
  | { t: 'steal'; source: string; target: string; status?: string; got: boolean } // 盗んだ（got＝盗んだ物を得た）
  | { t: 'stolen'; value: number } // 盗んだ物の数
  | { t: 'combo'; id: string; members: string[] } // 合わせ技
  | { t: 'hackerEnergy'; value: number }
  | { t: 'end'; result: 'won' | 'lost' };

/** 戦いの始まり方。ambush＝こちらが先に叩いた（敵の番が遅れ、守りも少し削れる）、surprised＝見つかってぶつかられた（敵が先に動く） */
export type Opening = 'normal' | 'ambush' | 'surprised';
export const OPENING_DELAY = 0.5; // 遅れる番の長さ（1回ぶんの待ち時間の割合）
export const AMBUSH_TOUGHNESS = 0.25; // 先制で削れる守りの割合

export interface BattleOptions {
  party: PartyMember[];
  encounter: string | EncounterDef;
  seed?: number;
  opening?: Opening;
}

export class Battle {
  readonly data: GameData;
  /** 裏の担当（シン）。表の4人には入らない。いなければ null */
  hacker: Unit | null = null;
  /** 裏の回線図（群れごとに作りなおす） */
  net: HackNet | null = null;
  /** 盗んだ物（表の味方に渡せる） */
  stolen = 0;
  readonly encounter: EncounterDef;
  readonly rng: Rng;
  allies: Unit[] = [];
  enemies: Unit[] = [];
  sp = SP_START;
  wave = 0;
  phase: Phase = 'between';
  opening: Opening = 'normal';
  activeId: string | null = null;
  turnCount = 0;
  private log: BattleEvent[] = [];
  private swapped = false;
  private boost = 1;
  /** 説得で仲間になった敵（敵の id） */
  recruited: string[] = [];
  /** 倒した敵（敵の id。怪盗手帳に使う） */
  defeatedIds: string[] = [];
  private extras = new Map<string, NonNullable<PartyMember['extraEffects']>>();

  constructor(data: GameData, opts: BattleOptions) {
    this.data = data;
    this.encounter = typeof opts.encounter === 'string' ? data.encounters[opts.encounter] : opts.encounter;
    if (!this.encounter) throw new Error(`戦いが見つからない: ${String(opts.encounter)}`);
    this.rng = makeRng(opts.seed ?? Date.now());
    // 裏の担当は表に入らない
    const ura = opts.party.find((m) => data.characters[m.id]?.ura);
    const front = opts.party.filter((m) => m !== ura);
    this.allies = front.map((m, i) => this.makeAlly(m, i));
    if (ura) {
      this.hacker = this.makeAlly(ura, 90);
      this.hacker.uid = 'h';
      this.hacker.bench = true;
      this.hacker.energyMax = HACKER_ENERGY_MAX;
      this.hacker.energy = Math.round(HACKER_ENERGY_MAX * Math.min(1, ura.mods?.startEnergyPct ?? 0));
    }
    this.spawnWave(0);
    this.opening = opts.opening ?? 'normal';
    // 始まり方は、はじめの群れにだけ効く
    if (this.opening === 'ambush') {
      for (const e of this.enemies) {
        e.av += OPENING_DELAY * actionLength(e.stats.spd);
        e.toughness = Math.max(1, Math.round(e.toughness * (1 - AMBUSH_TOUGHNESS)));
      }
    } else if (this.opening === 'surprised') {
      for (const a of this.allies) a.av += OPENING_DELAY * actionLength(a.stats.spd);
    }
  }

  // ---------- 見るための関数 ----------

  get ended(): boolean {
    return this.phase === 'won' || this.phase === 'lost';
  }
  get active(): Unit | undefined {
    return this.activeId ? this.unit(this.activeId) : undefined;
  }
  get units(): Unit[] {
    return [...this.allies, ...this.enemies];
  }
  unit(uid: string): Unit | undefined {
    return this.allies.find((u) => u.uid === uid) ?? this.enemies.find((u) => u.uid === uid);
  }
  /** 前に出ている、倒れていない味方 */
  aliveAllies(): Unit[] {
    return this.allies.filter((u) => u.alive && !u.bench);
  }
  /** 控えで、倒れていない味方 */
  benchAllies(): Unit[] {
    return this.allies.filter((u) => u.alive && u.bench);
  }
  /** 番がまわってくる人（前の味方と敵） */
  fighters(): Unit[] {
    return [...this.aliveAllies(), ...this.aliveEnemies()];
  }
  aliveEnemies(): Unit[] {
    return this.enemies.filter((u) => u.alive);
  }
  foesOf(u: Unit): Unit[] {
    return u.side === 'ally' ? this.aliveEnemies() : this.aliveAllies();
  }
  friendsOf(u: Unit): Unit[] {
    return u.side === 'ally' ? this.aliveAllies() : this.aliveEnemies();
  }
  charDef(u: Unit): CharacterDef | undefined {
    return u.side === 'ally' ? this.data.characters[u.defId] : undefined;
  }
  enemyDef(u: Unit): EnemyDef | undefined {
    return u.side === 'enemy' ? this.data.enemies[u.defId] : undefined;
  }
  hasStatus(u: Unit, id: string): StatusInst | undefined {
    return u.statuses.find((s) => s.id === id);
  }
  /** 状態を足し合わせた、いまの数字 */
  current(u: Unit): { atk: number; def: number; spd: number; dmgTaken: number; dmgDealt: number } {
    let atk = 0, def = 0, spd = 0, taken = 0, dealt = 0;
    for (const s of u.statuses) {
      const d = this.data.statuses[s.id];
      if (!d) continue;
      atk += (d.atkPct ?? 0) * s.stacks;
      def += (d.defPct ?? 0) * s.stacks;
      spd += (d.spdPct ?? 0) * s.stacks;
      taken += (d.dmgTakenPct ?? 0) * s.stacks;
      dealt += (d.dmgDealtPct ?? 0) * s.stacks;
    }
    return {
      atk: u.stats.atk * Math.max(0, 1 + atk),
      def: u.stats.def * Math.max(0, 1 + def),
      spd: u.stats.spd * Math.max(0.2, 1 + spd),
      dmgTaken: 1 + taken + (u.broken ? BROKEN_TAKEN : 0),
      dmgDealt: 1 + dealt + (u.mods.dmgPct ?? 0),
    };
  }
  isWeak(target: Unit, element: string): boolean {
    if (target.side !== 'enemy') return false;
    if (target.weaknesses.includes(element)) return true;
    return target.statuses.some((s) => this.data.statuses[s.id]?.allWeak);
  }
  canSkill(): boolean {
    return this.phase === 'command' && this.sp >= 1;
  }
  canUlt(uid: string): boolean {
    const u = this.unit(uid);
    return !!u && u.side === 'ally' && u.alive && !u.bench && !this.ended && u.energy >= u.energyMax;
  }
  skillsOf(u: Unit): { basic: SkillDef; skill: SkillDef; ult: SkillDef } | undefined {
    const c = this.charDef(u);
    if (!c) return undefined;
    const extra = this.extras.get(u.uid);
    if (!extra) return { basic: c.basic, skill: c.skill, ult: c.ult };
    // 足す効果があれば、技の写しに足して返す（元のデータは変えない）
    const add = (s: SkillDef, k: 'basic' | 'skill' | 'ult') => (extra[k]?.length ? { ...s, effects: [...s.effects, ...extra[k]!] } : s);
    return { basic: add(c.basic, 'basic'), skill: add(c.skill, 'skill'), ult: add(c.ult, 'ult') };
  }

  /** これから番が来る順（n人ぶん）。いま番の人がいれば先頭 */
  turnOrder(n: number): string[] {
    const sim = this.fighters().map((u) => ({ u, av: u.av, len: actionLength(this.current(u).spd) }));
    const out: string[] = [];
    if (this.phase === 'command' && this.activeId) {
      out.push(this.activeId);
      const me = sim.find((s) => s.u.uid === this.activeId);
      if (me) me.av = me.len;
    }
    while (out.length < n && sim.length > 0) {
      const next = this.pickNext(sim.map((s) => ({ u: s.u, av: s.av })));
      const s = sim.find((x) => x.u.uid === next.uid)!;
      const d = s.av;
      for (const x of sim) x.av -= d;
      out.push(s.u.uid);
      s.av = s.len;
    }
    return out;
  }

  // ---------- 動かす関数 ----------

  /** 次に番が来る人を決めて、番のはじめの処理をする。敵なら行動まで済ませる */
  nextTurn(): BattleEvent[] {
    if (this.phase !== 'between') throw new Error(`nextTurn できない状態: ${this.phase}`);
    this.log = [];
    this.swapped = false;
    const alive = this.fighters();
    const actor = this.pickNext(alive.map((u) => ({ u, av: u.av })));
    const d = actor.av;
    for (const u of alive) u.av = Math.max(0, u.av - d);
    this.activeId = actor.uid;
    this.turnCount++;
    this.emit({ t: 'turn', unit: actor.uid });

    // 継続ダメージ（燃焼など）
    for (const s of [...actor.statuses]) {
      const def = this.data.statuses[s.id];
      if (def?.dotMult) this.dotDamage(actor, s, def, 1);
      if (!actor.alive) break;
    }
    if (this.checkEnd() || !actor.alive) {
      this.endTurn(actor);
      return this.flush();
    }

    // 守りが崩れていた敵は、この番は動けず、守りが戻る
    if (actor.broken) {
      actor.broken = false;
      actor.toughness = actor.maxToughness;
      this.emit({ t: 'recover', unit: actor.uid });
      this.emit({ t: 'toughness', target: actor.uid, value: actor.toughness, max: actor.maxToughness });
      this.endTurn(actor);
      return this.flush();
    }

    if (actor.side === 'enemy' && this.hasStatus(actor, 'hijacked')) {
      this.emit({ t: 'warn', unit: actor.uid, text: `${actor.name}はシンに乗っ取られて動けない` });
      this.endTurn(actor);
      return this.flush();
    }

    if (actor.side === 'enemy') {
      this.enemyAct(actor);
      this.endTurn(actor);
    } else {
      this.phase = 'command';
    }
    return this.flush();
  }

  /** 味方の番の行動（通常攻撃かスキル） */
  command(kind: 'basic' | 'skill', target?: string): BattleEvent[] {
    if (this.phase !== 'command') throw new Error('味方の番ではない');
    const actor = this.active!;
    const skills = this.skillsOf(actor)!;
    if (kind === 'skill' && this.sp < 1) throw new Error('スキルの点数が足りない');
    this.log = [];
    this.perform(actor, kind === 'basic' ? skills.basic : skills.skill, target);
    if (!this.ended) this.endTurn(actor);
    return this.flush();
  }

  /** 必殺技。番を待たずに割り込む（いま番の人は変わらない）。boost はタッチ遊びの出来（1〜1.5） */
  ultimate(uid: string, target?: string, boost = 1): BattleEvent[] {
    if (!this.canUlt(uid)) throw new Error('必殺技はまだ使えない');
    const actor = this.unit(uid)!;
    this.log = [];
    actor.energy = 0;
    this.emit({ t: 'energy', unit: actor.uid, value: 0 });
    this.boost = Math.max(1, Math.min(ULT_BOOST_MAX, boost));
    this.perform(actor, this.skillsOf(actor)!.ult, target);
    this.boost = 1;
    return this.flush();
  }

  // ---------- 裏（ハッキング） ----------

  /** 裏の時間を進める（mode＝自動か、手で遊んでいるか）。破った点の効果を表に届ける */
  advanceUra(dt: number, mode: HackMode, opts?: HackOpts): BattleEvent[] {
    if (!this.net || !this.hacker || this.ended) return [];
    const prev = this.log;
    this.log = [];
    const r = this.net.update(dt, mode, opts);
    for (const n of r.relocked) this.relockHack(n);
    for (const n of r.cracked) {
      this.applyHack(n);
      if (this.ended) break;
    }
    const out = this.log;
    this.log = prev;
    return out;
  }

  /** 破った装置の効果 */
  private applyHack(n: HackNode): void {
    const h = this.hacker!;
    const e = n.enemy ? this.unit(n.enemy) : undefined;
    const alive = !!e && e.alive;
    switch (n.kind) {
      case 'weak':
        if (alive) {
          this.revealUnit(e!);
          this.addStatus(h, e!, 'exposed', 99, 1);
        }
        this.emit({ t: 'hack', node: n.kind, enemy: e?.uid, text: alive ? `${e!.name}の弱点データを暴いた` : '弱点データを破った' });
        break;
      case 'wall':
        if (alive) {
          this.addStatus(h, e!, 'defdown', 99, 1);
          if (this.hasStatus(e!, 'firewall')) this.removeStatus(e!, 'firewall');
        }
        this.emit({ t: 'hack', node: n.kind, enemy: e?.uid, text: alive ? `${e!.name}の防壁を破った` : '防壁を破った' });
        break;
      case 'buff': {
        let text = '強化の回線から、力を盗んだ';
        if (alive) {
          const buff = this.pickBuff(e!);
          if (buff) {
            this.removeStatus(e!, buff);
            text = buff === 'charging' ? `${e!.name}のため技を盗んで止めた！` : `${e!.name}の${this.data.statuses[buff]?.name ?? '強化'}を盗んだ`;
          }
          this.addStatus(h, e!, 'drained', 99, 1);
        }
        this.setStolen(this.stolen + 1);
        this.emit({ t: 'hack', node: n.kind, enemy: e?.uid, text });
        break;
      }
      case 'ctrl':
        if (alive) this.addStatus(h, e!, 'hijacked', 1, 1);
        this.emit({ t: 'hack', node: n.kind, enemy: e?.uid, text: alive ? `${e!.name}の制御を乗っ取った` : '制御を乗っ取った' });
        break;
      case 'relay':
        this.emit({ t: 'hack', node: n.kind, text: '中継点を通った' });
        break;
      case 'entry':
        break;
    }
    this.gainHackerEnergy(HACKER_ENERGY_PER_CRACK);
  }

  /** 敵に装置を直された：その装置の効果が切れる */
  private relockHack(n: HackNode): void {
    const e = n.enemy ? this.unit(n.enemy) : undefined;
    const status = n.kind === 'weak' ? 'exposed' : n.kind === 'wall' ? 'defdown' : n.kind === 'buff' ? 'drained' : null;
    if (e && e.alive && status) this.removeStatus(e, status);
    // 防壁の装置を直されると、防壁がもどる
    if (e && e.alive && n.kind === 'wall' && this.data.enemies[e.defId].barrier) this.addStatus(e, e, 'firewall', 999, 1);
    if (e && e.alive && n.kind !== 'relay') this.emit({ t: 'hack', node: n.kind, enemy: e.uid, text: `${e.name}の装置が直された` });
  }

  private pickBuff(u: Unit): string | null {
    const buffs = u.statuses.filter((s) => this.data.statuses[s.id]?.kind === 'buff' && s.id !== 'firewall');
    if (!buffs.length) return null;
    return (buffs.find((s) => s.id === 'charging') ?? buffs[0]).id;
  }

  private revealUnit(u: Unit): void {
    if (u.revealed || u.side !== 'enemy') return;
    u.revealed = true;
    this.emit({ t: 'reveal', target: u.uid });
  }

  private gainHackerEnergy(n: number): void {
    const h = this.hacker;
    if (!h) return;
    const next = Math.min(h.energyMax, h.energy + n * (1 + (h.mods.energyPct ?? 0)));
    if (next !== h.energy) {
      h.energy = next;
      this.emit({ t: 'hackerEnergy', value: next });
    }
  }

  private setStolen(v: number): void {
    this.stolen = Math.max(0, v);
    this.emit({ t: 'stolen', value: this.stolen });
  }

  /** 盗んだ物を表の味方に渡せるか（番を使わない） */
  canUseStolen(uid: string): boolean {
    const u = this.unit(uid);
    return this.stolen > 0 && !this.ended && !!u && u.side === 'ally' && u.alive && !u.bench;
  }
  /** 盗んだ物を渡す：攻撃力+25%（2番）と、必殺技ゲージ +20 */
  useStolen(uid: string): BattleEvent[] {
    if (!this.canUseStolen(uid)) throw new Error('盗んだ物を渡せない');
    this.log = [];
    const u = this.unit(uid)!;
    this.setStolen(this.stolen - 1);
    this.addStatus(u, u, 'stolen_power', 2, 1);
    this.gainEnergy(u, 20);
    return this.flush();
  }

  // ---------- 合わせ技 ----------

  /** 合わせ技の2人のうち、いまいる人（表の前の人か、裏の担当） */
  private comboUnit(charId: string): Unit | undefined {
    if (this.hacker && this.hacker.defId === charId) return this.hacker;
    return this.aliveAllies().find((u) => u.defId === charId);
  }
  /** この戦いで使える合わせ技（2人とも出ている） */
  combosAvailable(): ComboDef[] {
    return Object.values(this.data.combos ?? {}).filter((c) => c.members.every((m) => this.comboUnit(m)));
  }
  canCombo(id: string): boolean {
    const c = this.data.combos?.[id];
    if (!c || this.ended) return false;
    return c.members.every((m) => {
      const u = this.comboUnit(m);
      return !!u && u.energy >= u.energyMax * c.cost - 1e-9;
    });
  }
  /** 合わせ技（番を待たずに割り込む）。2人のゲージを cost ずつ使う */
  combo(id: string, target?: string): BattleEvent[] {
    if (!this.canCombo(id)) throw new Error('合わせ技はまだ使えない');
    const c = this.data.combos[id];
    this.log = [];
    const us = c.members.map((m) => this.comboUnit(m)!);
    for (const u of us) {
      u.energy = Math.max(0, u.energy - u.energyMax * c.cost);
      if (u === this.hacker) this.emit({ t: 'hackerEnergy', value: u.energy });
      else this.emit({ t: 'energy', unit: u.uid, value: u.energy });
    }
    this.emit({ t: 'combo', id, members: us.map((u) => u.uid) });
    // 撃つのは表の人（2人とも表なら1人目）
    const actor = us.find((u) => u !== this.hacker) ?? us[0];
    this.perform(actor, c.skill, target);
    return this.flush();
  }

  /** 入れかえできるか（味方の番に1回だけ。前の人と、倒れていない控え） */
  canSwap(outUid: string, inUid: string): boolean {
    const o = this.unit(outUid);
    const i = this.unit(inUid);
    return this.phase === 'command' && !this.swapped && !!o && !!i && o.side === 'ally' && !o.bench && i.side === 'ally' && i.bench && i.alive;
  }

  /** 前の味方と控えを入れかえる（番は使わない）。番の人を下げたら、入った人がその番を使う */
  swap(outUid: string, inUid: string): BattleEvent[] {
    if (!this.canSwap(outUid, inUid)) throw new Error('入れかえできない');
    this.log = [];
    this.swapped = true;
    this.doSwap(this.unit(outUid)!, this.unit(inUid)!);
    return this.flush();
  }

  /** 説得できるか：前の味方の番に、弱った（HP 3割以下）、説得できる敵 */
  canPersuade(targetUid: string): boolean {
    const t = this.unit(targetUid);
    if (this.phase !== 'command' || !t || t.side !== 'enemy' || !t.alive) return false;
    const def = this.enemyDef(t);
    return !!def?.recruitChance && t.hp / t.maxHp <= PERSUADE_HP;
  }

  /** 説得の成功しやすさ：弱っているほど、守りが崩れているほど高い */
  persuadeChance(targetUid: string): number {
    const t = this.unit(targetUid)!;
    const base = this.enemyDef(t)?.recruitChance ?? 0;
    const weak = 1 + (1 - t.hp / t.maxHp / PERSUADE_HP) * 0.5;
    return Math.min(0.95, base * weak + (t.broken ? 0.2 : 0));
  }

  /** 説得する（番を使う）。成功するとその敵は戦いから抜け、協力者になる */
  persuade(targetUid: string): BattleEvent[] {
    if (!this.canPersuade(targetUid)) throw new Error('説得できない');
    const actor = this.active!;
    const t = this.unit(targetUid)!;
    this.log = [];
    const ok = this.rng() < this.persuadeChance(targetUid);
    this.emit({ t: 'persuade', unit: actor.uid, target: t.uid, ok });
    if (ok) {
      t.alive = false;
      t.statuses = [];
      this.recruited.push(t.defId);
      this.emit({ t: 'defeat', unit: t.uid });
      this.checkEnd();
    }
    this.gainEnergy(actor, 10);
    if (!this.ended) this.endTurn(actor);
    return this.flush();
  }

  // ---------- 中の処理 ----------

  private emit(e: BattleEvent): void {
    this.log.push(e);
  }
  private flush(): BattleEvent[] {
    const out = this.log;
    this.log = [];
    return out;
  }

  private pickNext<T extends { u: Unit; av: number }>(list: T[]): Unit {
    let best = list[0];
    for (const x of list) {
      if (x.av < best.av - 1e-9) best = x;
      else if (Math.abs(x.av - best.av) <= 1e-9) {
        // 同じなら味方が先、そのあと並び順
        const xr = (x.u.side === 'ally' ? 0 : 100) + x.u.slot;
        const br = (best.u.side === 'ally' ? 0 : 100) + best.u.slot;
        if (xr < br) best = x;
      }
    }
    return best.u;
  }

  private makeAlly(m: PartyMember, slot: number): Unit {
    const c = this.data.characters[m.id];
    if (!c) throw new Error(`キャラが見つからない: ${m.id}`);
    const stats = statsAtLevel(c.base, m.level, m.bonus);
    if (m.extraEffects) this.extras.set(`p${slot}`, m.extraEffects);
    return {
      uid: `p${slot}`,
      side: 'ally',
      defId: c.id,
      name: c.name,
      level: m.level,
      element: c.element,
      slot,
      stats,
      maxHp: stats.hp,
      hp: stats.hp,
      alive: true,
      energy: Math.round(c.energyMax * Math.min(1, 0.5 + (m.mods?.startEnergyPct ?? 0))), // 半分たまった状態で始める
      energyMax: c.energyMax,
      maxToughness: 0,
      toughness: 0,
      broken: false,
      weaknesses: [],
      statuses: [],
      shield: 0,
      shieldTurns: 0,
      av: actionLength(stats.spd),
      aggro: c.aggro ?? 100,
      actions: 0,
      enraged: false,
      bench: slot >= FRONT,
      power: 1 + SKILL_STEP * (Math.max(1, m.skillLevel ?? 1) - 1),
      mods: m.mods ?? {},
      revealed: true,
    };
  }

  private spawnWave(index: number): void {
    this.wave = index;
    const ids = this.encounter.waves[index];
    this.enemies = ids.map((id, i) => {
      const e = this.data.enemies[id];
      if (!e) throw new Error(`敵が見つからない: ${id}`);
      const stats = statsAtLevel(e.base, this.encounter.level);
      return {
        uid: `e${index}_${i}`,
        side: 'enemy' as const,
        defId: e.id,
        name: e.name,
        level: this.encounter.level,
        element: e.element,
        slot: i,
        stats,
        maxHp: stats.hp,
        hp: stats.hp,
        alive: true,
        energy: 0,
        energyMax: 0,
        maxToughness: e.toughness,
        toughness: e.toughness,
        broken: false,
        weaknesses: [...e.weaknesses],
        statuses: [],
        shield: 0,
        shieldTurns: 0,
        av: actionLength(stats.spd),
        aggro: 100,
        actions: 0,
        enraged: false,
        bench: false,
        power: 1,
        mods: {},
        revealed: false,
      };
    });
    for (const u of this.enemies) if (this.data.enemies[u.defId].barrier) this.addStatus(u, u, 'firewall', 999, 1);
    if (this.hacker) {
      this.net = new HackNet(
        this.enemies.map((u) => {
          const d = this.data.enemies[u.defId];
          return { uid: u.uid, boss: !!d.boss, machine: d.look.shape === 'robot' || d.look.shape === 'drone' };
        }),
      );
    }
    this.emit({ t: 'wave', index, total: this.encounter.waves.length, enemies: this.enemies.map((u) => u.uid) });
  }

  private doSwap(o: Unit, i: Unit): void {
    const slot = o.slot;
    o.slot = i.slot;
    i.slot = slot;
    o.bench = true;
    i.bench = false;
    // 前に出た人は、少し待ってから番が来る
    i.av = actionLength(this.current(i).spd) * 0.5;
    if (this.activeId === o.uid) this.activeId = i.uid;
    this.emit({ t: 'swap', out: o.uid, in: i.uid });
  }

  /** 勝ち負けと、次の群れ。終わったら true */
  private checkEnd(): boolean {
    if (this.ended) return true;
    // 前の4人が全員倒れても、控えがいれば出てくる
    if (this.aliveAllies().length === 0 && this.benchAllies().length > 0) {
      const down = this.allies.filter((u) => !u.bench && !u.alive).sort((a, b) => a.slot - b.slot);
      for (const o of down) {
        const i = this.benchAllies()[0];
        if (!i) break;
        this.doSwap(o, i);
      }
    }
    if (this.aliveAllies().length === 0) {
      this.phase = 'lost';
      this.activeId = null;
      this.emit({ t: 'end', result: 'lost' });
      return true;
    }
    if (this.aliveEnemies().length === 0) {
      if (this.wave + 1 < this.encounter.waves.length) {
        this.spawnWave(this.wave + 1);
        return false;
      }
      this.phase = 'won';
      this.activeId = null;
      this.emit({ t: 'end', result: 'won' });
      return true;
    }
    return false;
  }

  private endTurn(actor: Unit): void {
    if (this.ended) return;
    for (const s of [...actor.statuses]) {
      if (s.fresh) {
        s.fresh = false;
        continue;
      }
      s.turns--;
      if (s.turns <= 0) this.removeStatus(actor, s.id);
    }
    if (actor.shieldTurns > 0) {
      actor.shieldTurns--;
      if (actor.shieldTurns === 0 && actor.shield > 0) {
        actor.shield = 0;
        this.emit({ t: 'shield', target: actor.uid, amount: 0 });
      }
    }
    actor.av = actionLength(this.current(actor).spd);
    this.activeId = null;
    this.phase = 'between';
  }

  private removeStatus(u: Unit, id: string): void {
    const before = u.statuses.length;
    u.statuses = u.statuses.filter((s) => s.id !== id);
    if (u.statuses.length !== before) this.emit({ t: 'statusEnd', target: u.uid, status: id });
  }

  private enemyAct(e: Unit): void {
    const def = this.enemyDef(e)!;
    let skill: SkillDef | undefined;
    // ため技など「次は必ずこれ」の状態があれば、それを使う（順番は進めない）
    for (const s of e.statuses) {
      const f = this.data.statuses[s.id]?.forcesSkill;
      if (f) skill = def.skills.find((k) => k.id === f);
    }
    if (!skill) {
      if (def.pattern?.length) {
        const id = def.pattern[e.actions % def.pattern.length];
        skill = def.skills.find((k) => k.id === id);
      }
      skill ??= pickWeighted(this.rng, def.skills.filter((k) => (k.weight ?? 1) > 0), (k) => k.weight ?? 1);
      e.actions++;
    }
    this.perform(e, skill, undefined);
    if (skill.warn && e.alive) this.emit({ t: 'warn', unit: e.uid, text: skill.warn });
  }

  /** 相手を決める。main＝ねらった相手、targets＝当たる全員、adjacent＝となり */
  resolveTargets(actor: Unit, skill: SkillDef, mainId?: string): { main?: Unit; targets: Unit[]; adjacent: Unit[] } {
    const foes = this.foesOf(actor);
    const friends = this.friendsOf(actor);
    const given = mainId ? this.unit(mainId) : undefined;
    const pickFoe = (): Unit | undefined => {
      if (given && given.alive && given.side !== actor.side) return given;
      if (actor.side === 'enemy') return foes.length ? pickWeighted(this.rng, foes, (u) => u.aggro) : undefined;
      return foes[Math.floor((foes.length - 1) / 2)];
    };
    switch (skill.target) {
      case 'oneFoe': {
        const m = pickFoe();
        return { main: m, targets: m ? [m] : [], adjacent: [] };
      }
      case 'blastFoes': {
        const m = pickFoe();
        if (!m) return { targets: [], adjacent: [] };
        const sorted = [...foes].sort((a, b) => a.slot - b.slot);
        const i = sorted.indexOf(m);
        const adjacent = [sorted[i - 1], sorted[i + 1]].filter((x): x is Unit => !!x);
        return { main: m, targets: [m, ...adjacent], adjacent };
      }
      case 'allFoes':
        return { main: pickFoe(), targets: foes, adjacent: [] };
      case 'self':
        return { main: actor, targets: [actor], adjacent: [] };
      case 'oneAlly': {
        const m =
          given && given.alive && given.side === actor.side
            ? given
            : [...friends].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
        return { main: m, targets: m ? [m] : [], adjacent: [] };
      }
      case 'allAllies':
        return { main: actor, targets: friends, adjacent: [] };
    }
  }

  private perform(actor: Unit, skill: SkillDef, mainId?: string): void {
    const t = this.resolveTargets(actor, skill, mainId);
    const element = skill.element ?? actor.element;
    this.emit({
      t: 'action',
      unit: actor.uid,
      skill: skill.id,
      name: skill.name,
      kind: skill.kind,
      targets: t.targets.map((u) => u.uid),
      element,
    });
    if (actor.side === 'ally') {
      if (skill.kind === 'basic') this.setSp(this.sp + 1);
      if (skill.kind === 'skill') this.setSp(this.sp - 1);
    }
    const killsBefore = this.foesOf(actor).length;
    const hitsTaken = new Set<string>();

    for (const eff of skill.effects) {
      if (this.ended) break;
      const list = this.effectTargets(actor, eff.to ?? 'targets', t).filter((u) => u.alive);
      for (const u of list) this.applyEffect(actor, skill, element, eff, u, hitsTaken);
      // 群れを倒し切ったら、残りの効果は空振り（次の群れには当たらない）
      if (this.aliveEnemies().length === 0 || this.aliveAllies().length === 0) break;
    }

    if (actor.side === 'ally' && actor.alive) {
      const kills = Math.max(0, killsBefore - this.foesOf(actor).length);
      this.gainEnergy(actor, (skill.energy ?? ENERGY_BY_KIND[skill.kind]) + kills * ENERGY_ON_KILL);
    }
    for (const uid of hitsTaken) {
      const u = this.unit(uid);
      if (u && u.alive && u.side === 'ally') this.gainEnergy(u, ENERGY_ON_HIT);
    }
    // 怒り（HPが減ると強くなる敵）
    for (const e of this.aliveEnemies()) {
      const d = this.enemyDef(e);
      if (d?.enrage && !e.enraged && e.hp / e.maxHp < d.enrage.hpPct) {
        e.enraged = true;
        this.addStatus(e, e, d.enrage.status, 99, 1);
        this.emit({ t: 'warn', unit: e.uid, text: d.enrage.text });
      }
    }
    this.checkEnd();
  }

  private effectTargets(actor: Unit, to: EffectTo, t: { main?: Unit; targets: Unit[]; adjacent: Unit[] }): Unit[] {
    switch (to) {
      case 'targets':
        return t.targets;
      case 'main':
        return t.main ? [t.main] : [];
      case 'adjacent':
        return t.adjacent;
      case 'self':
        return [actor];
      case 'allAllies':
        return this.friendsOf(actor);
      case 'allFoes':
        return this.foesOf(actor);
    }
  }

  private applyEffect(actor: Unit, skill: SkillDef, element: string, eff: Effect, u: Unit, hits: Set<string>): void {
    switch (eff.kind) {
      case 'damage': {
        this.hit(actor, u, element, eff.mult, eff.toughness ?? 0, eff.synergy);
        if (u.side !== actor.side) hits.add(u.uid);
        break;
      }
      case 'status': {
        if (eff.chance !== undefined && this.rng() >= eff.chance) break;
        this.addStatus(actor, u, eff.status, eff.turns, eff.stacks ?? 1);
        break;
      }
      case 'amplify': {
        const s = this.hasStatus(u, eff.status);
        if (!s) break;
        const def = this.data.statuses[eff.status];
        const from = s.stacks;
        s.stacks = Math.min(Math.round(from * eff.factor), (def?.maxStacks ?? 1) * eff.factor);
        const source = this.unit(s.source);
        if (s.stacks <= from) break; // もう上限なら何も起きない
        const synergyFrom = source && source.uid !== actor.uid && source.side === actor.side ? source.uid : undefined;
        this.emit({ t: 'amplify', source: actor.uid, target: u.uid, status: eff.status, from, to: s.stacks, synergyFrom });
        break;
      }
      case 'detonate': {
        const s = this.hasStatus(u, eff.status);
        const def = this.data.statuses[eff.status];
        if (s && def?.dotMult) this.dotDamage(u, s, def, eff.mult);
        break;
      }
      case 'heal': {
        const boost = actor.power * this.boost * (1 + (actor.mods.healPct ?? 0));
        const amount = Math.round(((eff.casterPct ?? 0) * actor.maxHp + (eff.targetPct ?? 0) * u.maxHp) * boost);
        const before = u.hp;
        u.hp = Math.min(u.maxHp, u.hp + amount);
        this.emit({ t: 'heal', source: actor.uid, target: u.uid, amount: u.hp - before, hp: u.hp });
        break;
      }
      case 'shield': {
        const amount = Math.round(eff.casterPct * actor.maxHp * actor.power * (1 + (actor.mods.healPct ?? 0)));
        u.shield = Math.max(u.shield, amount);
        u.shieldTurns = Math.max(u.shieldTurns, eff.turns);
        this.emit({ t: 'shield', target: u.uid, amount: u.shield });
        break;
      }
      case 'energy':
        this.gainEnergy(u, eff.amount);
        break;
      case 'advance': {
        const len = actionLength(this.current(u).spd);
        u.av = Math.max(0, u.av - eff.pct * len);
        this.emit({ t: 'advance', unit: u.uid });
        break;
      }
      case 'cleanse':
        for (const s of [...u.statuses]) {
          if (this.data.statuses[s.id]?.kind === 'debuff') this.removeStatus(u, s.id);
        }
        break;
      case 'steal': {
        if (u.side === actor.side) break;
        const buff = this.pickBuff(u);
        if (buff) {
          this.removeStatus(u, buff);
          this.setStolen(this.stolen + 1);
          this.emit({ t: 'steal', source: actor.uid, target: u.uid, status: buff, got: true });
        } else if (this.rng() < eff.chance) {
          this.setStolen(this.stolen + 1);
          this.emit({ t: 'steal', source: actor.uid, target: u.uid, got: true });
        }
        break;
      }
      case 'reveal':
        this.revealUnit(u);
        break;
    }
    void skill;
  }

  addStatus(source: Unit, u: Unit, id: string, turns: number, stacks: number): void {
    const def = this.data.statuses[id];
    if (!def) throw new Error(`状態が見つからない: ${id}`);
    const power = this.current(source).atk;
    const fresh = this.activeId === u.uid;
    const s = this.hasStatus(u, id);
    if (s) {
      // 倍にした重なりは、あとから足しても減らさない
      s.stacks = Math.max(s.stacks, Math.min(def.maxStacks ?? 1, s.stacks + stacks));
      s.turns = Math.max(s.turns, turns);
      s.power = Math.max(s.power, power);
      s.source = source.uid;
      s.fresh = s.fresh || fresh;
    } else {
      u.statuses.push({ id, turns, stacks: Math.min(def.maxStacks ?? 1, stacks), source: source.uid, power, fresh });
    }
    const now = this.hasStatus(u, id)!;
    this.emit({ t: 'status', source: source.uid, target: u.uid, status: id, stacks: now.stacks, turns: now.turns });
  }

  private setSp(v: number): void {
    const next = Math.max(0, Math.min(SP_MAX, v));
    if (next !== this.sp) {
      this.sp = next;
      this.emit({ t: 'sp', value: next });
    }
  }

  private gainEnergy(u: Unit, amount: number): void {
    if (u.side !== 'ally' || amount <= 0) return;
    const next = Math.min(u.energyMax, u.energy + amount * (1 + (u.mods.energyPct ?? 0)));
    if (next !== u.energy) {
      u.energy = next;
      this.emit({ t: 'energy', unit: u.uid, value: next });
    }
  }

  /** 1回のダメージ（守りの削り・崩れ・相性つき） */
  private hit(
    actor: Unit,
    target: Unit,
    element: string,
    mult: number,
    toughness: number,
    synergy?: { status: string; mult: number },
  ): void {
    const a = this.current(actor);
    const d = this.current(target);
    const weak = this.isWeak(target, element);
    const k = 200 + 10 * actor.level;
    const defMult = k / (k + d.def);
    const resist = target.side === 'enemy' && !weak ? NOT_WEAK_MULT : 1;
    const crit = this.rng() < actor.stats.critRate;
    let syn: { status: string; mult: number; from: string } | undefined;
    let synMult = 1;
    if (synergy) {
      const s = this.hasStatus(target, synergy.status);
      if (s) {
        synMult = synergy.mult * (1 + (actor.mods.synergyPct ?? 0));
        syn = { status: synergy.status, mult: Math.round(synMult * 100) / 100, from: s.source };
      }
    }
    const amount = Math.max(
      1,
      Math.round(a.atk * mult * actor.power * this.boost * a.dmgDealt * d.dmgTaken * resist * defMult * (crit ? 1 + actor.stats.critDmg : 1) * synMult),
    );
    this.applyDamage(actor, target, amount, { crit, weak, synergy: syn });

    // 弱点なら守りを削る。削り切ると崩れる
    if (target.alive && weak && !target.broken && toughness > 0 && target.maxToughness > 0) {
      const k = target.revealed ? 1 : HIDDEN_TOUGH;
      target.toughness = Math.max(0, target.toughness - Math.round(toughness * k));
      this.emit({ t: 'toughness', target: target.uid, value: target.toughness, max: target.maxToughness });
      if (target.toughness === 0) this.breakUnit(actor, target, defMult);
    }
  }

  private breakUnit(actor: Unit, target: Unit, defMult: number): void {
    target.broken = true;
    this.emit({ t: 'break', source: actor.uid, target: target.uid });
    for (const s of [...target.statuses]) {
      if (this.data.statuses[s.id]?.removedOnBreak) this.removeStatus(target, s.id);
    }
    target.av += BREAK_DELAY * actionLength(this.current(target).spd);
    const amount = Math.max(1, Math.round(this.current(actor).atk * BREAK_DMG * defMult));
    this.applyDamage(actor, target, amount, { crit: false, weak: true, breakDmg: true });
  }

  private dotDamage(holder: Unit, s: StatusInst, def: StatusDef, mult: number): void {
    const amount = Math.max(1, Math.round(s.power * (def.dotMult ?? 0) * s.stacks * mult * this.current(holder).dmgTaken));
    this.applyDamage(this.unit(s.source) ?? holder, holder, amount, { crit: false, weak: false, dot: s.id });
  }

  private applyDamage(
    source: Unit,
    target: Unit,
    amount: number,
    info: { crit: boolean; weak: boolean; dot?: string; breakDmg?: boolean; synergy?: { status: string; mult: number; from: string } },
  ): void {
    if (!target.alive) return;
    let rest = amount;
    let absorbed = 0;
    if (target.shield > 0) {
      absorbed = Math.min(target.shield, rest);
      target.shield -= absorbed;
      rest -= absorbed;
    }
    target.hp = Math.max(0, target.hp - rest);
    this.emit({
      t: 'damage',
      source: source.uid,
      target: target.uid,
      amount,
      hp: target.hp,
      shieldAbsorbed: absorbed,
      crit: info.crit,
      weak: info.weak,
      dot: info.dot,
      breakDmg: info.breakDmg,
      synergy: info.synergy,
    });
    if (target.hp <= 0) {
      target.alive = false;
      target.statuses = [];
      target.shield = 0;
      if (target.side === 'enemy') this.defeatedIds.push(target.defId);
      this.emit({ t: 'defeat', unit: target.uid });
    }
  }
}
