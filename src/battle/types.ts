// 戦いで使う「データの形」。中身（キャラや敵の数字）は src/data/ に書く。
// ここを変えずに、データを足すだけでキャラや敵を増やせるようにしている。

export type Side = 'ally' | 'enemy';

export interface Stats {
  hp: number;
  atk: number;
  def: number;
  spd: number; // 素早さ。高いほど番が早く・多く来る
  critRate: number; // 会心の確率（0〜1）
  critDmg: number; // 会心のときに足す倍率（0.5 なら 1.5倍）
}

/** 技の当たる相手 */
export type TargetType =
  | 'oneFoe' // 相手1人
  | 'blastFoes' // 相手1人＋となり
  | 'allFoes' // 相手全員
  | 'self'
  | 'oneAlly' // 味方1人（自動で一番弱っている人）
  | 'allAllies';

/** 効果がかかる相手（技の相手からの見方） */
export type EffectTo = 'targets' | 'main' | 'adjacent' | 'self' | 'allAllies' | 'allFoes';

/** 相性：相手が status の状態なら、ダメージを mult 倍にする */
export interface SynergyBonus {
  status: string;
  mult: number;
}

export type Effect =
  | { kind: 'damage'; mult: number; toughness?: number; to?: EffectTo; synergy?: SynergyBonus }
  | { kind: 'status'; status: string; turns: number; stacks?: number; chance?: number; to?: EffectTo }
  /** 状態の重なりを factor 倍にする（「Aがかけた状態をBが倍にする」） */
  | { kind: 'amplify'; status: string; factor: number; to?: EffectTo }
  /** 継続ダメージの状態を、いますぐ mult 倍で起こす */
  | { kind: 'detonate'; status: string; mult: number; to?: EffectTo }
  /** 回復。casterPct＝使う人の最大HPの割合、targetPct＝受ける人の最大HPの割合 */
  | { kind: 'heal'; casterPct?: number; targetPct?: number; to?: EffectTo }
  /** バリア。使う人の最大HPの割合ぶん */
  | { kind: 'shield'; casterPct: number; turns: number; to?: EffectTo }
  | { kind: 'energy'; amount: number; to?: EffectTo }
  /** 番を早める（pct＝1回ぶんの待ち時間の割合） */
  | { kind: 'advance'; pct: number; to?: EffectTo }
  /** 悪い状態を消す */
  | { kind: 'cleanse'; to?: EffectTo };

export type SkillKind = 'basic' | 'skill' | 'ult' | 'enemy';

export interface SkillDef {
  id: string;
  name: string;
  kind: SkillKind;
  target: TargetType;
  element?: string; // 省くと使う人の属性
  desc: string;
  effects: Effect[];
  energy?: number; // 使ったときにたまる必殺技ゲージ（省くと種類ごとの決まった量）
  weight?: number; // 敵がこの技を選ぶ重み
  warn?: string; // 使ったときに出す注意（敵のため技など）
}

export interface StatusDef {
  id: string;
  name: string;
  short: string; // 画面の小さな札に出す1文字
  kind: 'buff' | 'debuff';
  desc: string;
  maxStacks?: number;
  // 1重なりあたりの変化（0.2 なら +20%）
  atkPct?: number;
  defPct?: number;
  spdPct?: number;
  dmgTakenPct?: number;
  dmgDealtPct?: number;
  /** 持ち主の番のはじめに、かけた人の攻撃力 × この値 × 重なり のダメージ */
  dotMult?: number;
  /** どの属性の攻撃でも弱点になる */
  allWeak?: boolean;
  /** 守りが崩れると消える */
  removedOnBreak?: boolean;
  /** この状態の敵は、次の番で必ずこの技を使う */
  forcesSkill?: string;
}

export interface ElementDef {
  id: string;
  name: string; // 1文字（炎・氷 など）
  color: string; // 画面の色
}

/** 仮の見た目（VRM が無いときの形） */
export interface LookDef {
  shape: 'hero' | 'drone' | 'robot' | 'guard' | 'boss';
  color: string;
  scale?: number;
}

export interface CharacterDef {
  id: string;
  name: string;
  role: string; // アタッカー・支援 など（画面の説明用）
  profile: string;
  element: string;
  base: Stats; // レベル1の数字
  energyMax: number;
  aggro?: number; // 敵からのねらわれやすさ（ふつう 100）
  basic: SkillDef;
  skill: SkillDef;
  ult: SkillDef;
  look: LookDef;
}

export interface EnemyDef {
  id: string;
  name: string;
  element: string;
  base: Stats;
  toughness: number; // 守りの固さ。弱点で削り切ると崩れる
  weaknesses: string[];
  skills: SkillDef[];
  /** 技を使う順番（省くと重みで選ぶ） */
  pattern?: string[];
  /** HP がこの割合を下回ったら、自分に状態をかける（怒りなど） */
  enrage?: { hpPct: number; status: string; text: string };
  boss?: boolean;
  look: LookDef;
}

export interface EncounterDef {
  id: string;
  name: string;
  desc: string;
  level: number; // 敵のレベル
  waves: string[][]; // 敵の id の並び（群れごと）
}

export interface GameData {
  elements: Record<string, ElementDef>;
  statuses: Record<string, StatusDef>;
  characters: Record<string, CharacterDef>;
  enemies: Record<string, EnemyDef>;
  encounters: Record<string, EncounterDef>;
}

/** 戦いに出る味方1人。bonus は段階3の装備・武器で足す数字 */
export interface PartyMember {
  id: string;
  level: number;
  bonus?: Partial<Stats>;
}
