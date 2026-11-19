// 歩く場所（忍び込む建物）のデータの形。中身は src/data/maps.ts に書く。
// 床は x と z の平面（メートル）。高さは見た目だけ。

import type { LookDef } from '../battle/types';

export type Vec2 = [number, number];

/** 四角（x, z が小さいほうの角、w, d が幅と奥行き） */
export interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
}

export interface WallDef extends Rect {
  h?: number; // 高さ（見た目。生け垣は低い）
  kind?: 'wall' | 'hedge' | 'shelf' | 'desk' | 'locker';
}

export interface DoorDef extends Rect {
  id: string;
  name: string;
}

/** 調べるとハッキングでき、カメラを止めたり扉を開けたりする */
export interface TerminalDef {
  id: string;
  pos: Vec2;
  targets: string[]; // 止めるカメラ・開ける扉の id
  hint: string;
}

/** 監視カメラ。首を振りながら扇の形に見張る */
export interface CameraDef {
  id: string;
  pos: Vec2;
  dir: number; // 向き（ラジアン。0 が +x）
  sweep: number; // 首を振る幅（片側、ラジアン）
  period: number; // 首を振る周期（秒）
  fov: number; // 見える角度（全体、ラジアン）
  range: number;
}

/** 見回り。決まった道を歩き、見つけると追いかけてくる。触れると戦い */
export interface PatrolDef {
  id: string;
  encounter: string;
  look: string; // 見た目に使う敵の id
  route: Vec2[];
  speed: number;
  fov: number;
  range: number;
}

export interface ChestDef {
  id: string;
  pos: Vec2;
  items: Record<string, number>;
}

export interface AreaDef extends Rect {
  name: string;
  floor: string; // 床の色
}

export interface MapDef {
  id: string;
  name: string;
  start: Vec2;
  startDir: number;
  areas: AreaDef[];
  walls: WallDef[];
  doors: DoorDef[]; // はじめは閉まっている（ハッキングで開く）
  shadows: Rect[]; // 影の中にいると見つからない
  terminals: TerminalDef[];
  cameras: CameraDef[];
  patrols: PatrolDef[];
  chests: ChestDef[];
  boss?: { pos: Vec2; encounter: string; name: string };
  npcs?: NpcDef[]; // 話しかけられる人（学校）
  props?: PropDef[]; // 見た目だけの小物（ぶつからない）
  wallColor?: string; // 壁の色（学校は明るく）
  exit?: { pos: Vec2; label: string }; // 出口（学校なら「下校する」）
}

/** 見た目だけの小物。dir は向き（壁にはる物の表の向き、ラジアン） */
export interface PropDef {
  kind: 'board' | 'poster' | 'plant' | 'hoop' | 'fence' | 'bread' | 'window' | 'clock';
  x: number;
  z: number;
  w?: number;
  dir?: number;
  color?: string;
}

/** 学校の時間（朝・昼休み・放課後） */
export type Slot = 'morning' | 'lunch' | 'after';
export const SLOT_NAMES: Record<Slot, string> = { morning: '朝', lunch: '昼休み', after: '放課後' };

/** 時間ごとの居場所。route があれば、そこを歩きまわる */
export interface NpcPlace {
  pos: Vec2;
  dir: number;
  route?: Vec2[];
}

/** 話しかけられる人。charId があれば仲間（絆の会話）、なければ生徒・先生（ひとこと） */
export interface NpcDef {
  id: string;
  charId?: string;
  name?: string;
  look?: LookDef;
  lines?: string[][]; // [名前, 文, …] の組を、話すたびに順に
  at: Partial<Record<Slot, NpcPlace>>; // その時間にいなければ、いない
}
