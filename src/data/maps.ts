import type { MapDef, NpcDef, NpcPlace, Slot, WallDef } from '../field/types';

// 忍び込む建物。第1章は「黒金邸」（名前は仮）。
// 庭 → 玄関ホール → 資料室 → 金庫室の前 → 番人（ボス）。
// 影の中を通って見回りとカメラをかわし、端末をハッキングして扉を開ける（端末は影の中にあり、隠れたままハッキングできる）。
//
//   z=0 ┌──────────┐
//       │   庭      │
//  z=12 ├──  ──────┤
//       │ 玄関ホール │──────────┬──────────┐ z=16
//       │           D1  資料室  D2 金庫室の前 │
//  z=28 └──────────┴──────────┴──────────┘
//      x=0        x=16       x=30       x=40

const T = 0.4; // 壁の厚さ
const wall = (x: number, z: number, w: number, d: number, kind: WallDef['kind'] = 'wall', h = 3): WallDef => ({ x, z, w, d, kind, h });

export const MANSION: MapDef & { boss: NonNullable<MapDef['boss']> } = {
  id: 'mansion',
  name: '黒金邸',
  start: [8, 1.6],
  startDir: Math.PI / 2,
  areas: [
    { name: '庭', x: 0, z: 0, w: 16, d: 12, floor: '#24332a' },
    { name: '玄関ホール', x: 0, z: 12, w: 16, d: 16, floor: '#3a3040' },
    { name: '資料室', x: 16, z: 16, w: 14, d: 12, floor: '#2e3346' },
    { name: '金庫室の前', x: 30, z: 16, w: 10, d: 12, floor: '#3b2f2a' },
  ],
  walls: [
    // 外の壁
    wall(-T, -T, 16 + 2 * T, T), // 庭の南
    wall(-T, 0, T, 28), // 西
    wall(-T, 28, 40 + 2 * T, T), // 北
    wall(16, -T, T, 12.4), // 庭の東
    wall(16, 16 - T, 24 + T, T), // 資料室・金庫室の南
    wall(40, 16, T, 12), // 東
    // 庭とホールの間（真ん中が入口）
    wall(0, 12, 7, T),
    wall(9, 12, 7.4, T),
    // ホールと資料室の間（z 20〜22 が扉 D1）
    wall(16, 12, T, 8),
    wall(16, 22, T, 6),
    // 資料室と金庫室の前の間（z 24〜26 が扉 D2）
    wall(30, 16, T, 8),
    wall(30, 26, T, 2),
    // 庭の生け垣
    wall(3, 4, 4, 0.8, 'hedge', 1.2),
    wall(9.5, 7, 4, 0.8, 'hedge', 1.2),
    // ホールの柱
    wall(5, 18, 1, 1, 'wall', 3),
    wall(10, 18, 1, 1, 'wall', 3),
    // 資料室の本棚
    wall(19, 19, 7, 0.8, 'shelf', 2.2),
    wall(19, 23.2, 7, 0.8, 'shelf', 2.2),
  ],
  doors: [
    { id: 'd1', name: '資料室の扉', x: 16, z: 20, w: T, d: 2 },
    { id: 'd2', name: '金庫室の扉', x: 30, z: 24, w: T, d: 2 },
  ],
  shadows: [
    // 庭：生け垣の陰
    { x: 3, z: 4.8, w: 4, d: 1.6 },
    { x: 9.5, z: 7.8, w: 4, d: 1.6 },
    { x: 0, z: 9.5, w: 2.5, d: 2.5 },
    // ホール：壁ぎわの暗がり
    { x: 0, z: 12.4, w: 2.6, d: 5 },
    { x: 0, z: 21, w: 2.6, d: 7 },
    { x: 13.4, z: 22.5, w: 2.6, d: 5.5 },
    // 資料室：本棚の陰
    { x: 19, z: 19.8, w: 7, d: 1.4 },
    { x: 19, z: 24, w: 7, d: 1.4 },
    { x: 16.4, z: 25.6, w: 2.8, d: 2.4 }, // 端末の前の暗がり
    // 金庫室の前
    { x: 30.4, z: 26, w: 3, d: 2 },
  ],
  terminals: [
    { id: 't1', pos: [0.8, 23], targets: ['c1', 'd1'], hint: 'ホールのカメラを止めて、資料室の扉を開ける' },
    { id: 't2', pos: [16.9, 27.2], targets: ['c2', 'd2'], hint: '資料室のカメラを止めて、金庫室の扉を開ける' },
  ],
  cameras: [
    { id: 'c1', pos: [15.4, 12.6], dir: (3 * Math.PI) / 4, sweep: 0.6, period: 6, fov: 0.9, range: 10 },
    { id: 'c2', pos: [29.4, 16.6], dir: (3 * Math.PI) / 4, sweep: 0.5, period: 5, fov: 0.9, range: 9 },
  ],
  patrols: [
    { id: 'p_garden', encounter: 'field_garden', look: 'guard', route: [[3, 9.5], [13, 9.5], [13, 2.5], [8.5, 2.5]], speed: 1.5, fov: 1.6, range: 6 },
    { id: 'p_hall', encounter: 'field_hall', look: 'drone', route: [[4, 15], [12, 15], [12, 25], [4, 25]], speed: 1.7, fov: 1.5, range: 6.5 },
    { id: 'p_archive', encounter: 'field_archive', look: 'robot', route: [[18, 17.5], [28, 17.5], [28, 26.8], [20.2, 26.8], [20.2, 25.1], [18, 25.1]], speed: 1.6, fov: 1.5, range: 6.5 },
    { id: 'p_vault', encounter: 'field_vault', look: 'guard', route: [[32, 18], [38.5, 18], [38.5, 21]], speed: 1.8, fov: 1.6, range: 7 },
  ],
  chests: [
    { id: 'ch1', pos: [14.6, 1.4], items: { book: 2, parts: 6 } },
    { id: 'ch2', pos: [1.2, 26.8], items: { note: 2, key: 1 } },
    { id: 'ch3', pos: [24, 21.5], items: { blueprint: 2, parts: 8 } },
    { id: 'ch4', pos: [31, 27], items: { book: 2, key: 1 } },
  ],
  boss: { pos: [37.5, 25], encounter: 'vault', name: '金庫室の番人' },
  hidden: [
    { id: 'm_garden', pos: [0.8, 0.8], kind: 'item', items: { book: 3, stone: 80 }, text: '庭のすみの石の下に、だれかが隠した参考書' },
    { id: 'm_pillar', pos: [6.4, 18.5], kind: 'item', items: { parts: 8, stone: 80 }, text: '柱のかげに落ちていた部品' },
    { id: 'm_archive', pos: [29.4, 27.4], kind: 'item', items: { blueprint: 2, stone: 80 }, text: '資料のすきまに、設計図の切れ端' },
    { id: 'm_shadow', pos: [14.8, 10.8], kind: 'enemy', encounter: 'hidden_guard', text: '暗がりに、強そうな見回りがひそんでいる！' },
  ],
};

// ---------- 昼の学校と街：いくつかの「場所」に分け、階段や出入り口で行き来する ----------
// 場所ごとに別の地図。出入り口（links）に歩いて入ると、短い切りかえ画面のあと、つながった場所に出る。

const desk = (x: number, z: number) => wall(x, z, 1.1, 0.7, 'desk', 0.8);
const S = Math.PI / 2; // 南（+z）を向く
const N = -Math.PI / 2; // 北（-z）を向く
const E = 0; // 東（+x）を向く
const W = Math.PI; // 西（-x）を向く
/** 四角い部屋の外の壁 */
const box = (w: number, d: number): WallDef[] => [wall(-T, -T, w + 2 * T, T), wall(-T, 0, T, d), wall(w, 0, T, d), wall(-T, d, w + 2 * T, T)];
const empty = { doors: [], shadows: [], terminals: [], cameras: [], patrols: [], chests: [] };

/** 時間ごとの居場所に「どの場所（地図）にいるか」をつけたもの */
type ZonePlace = NpcPlace & { zone: string };
type ZoneNpc = Omit<NpcDef, 'at'> & { at: Partial<Record<Slot, ZonePlace>> };
/** その場所にいる時間だけを残した人の一覧 */
const npcsIn = (list: ZoneNpc[], zone: string): NpcDef[] =>
  list
    .map((n) => {
      const at: Partial<Record<Slot, NpcPlace>> = {};
      for (const [slot, p] of Object.entries(n.at) as [Slot, ZonePlace][]) if (p.zone === zone) at[slot] = { pos: p.pos, dir: p.dir, route: p.route };
      return { ...n, at };
    })
    .filter((n) => Object.keys(n.at).length > 0);

// 学校の人。文は仮
const SCHOOL_NPCS: ZoneNpc[] = [
  // 仲間（話すと絆が上がる。時間ごとに居場所が変わる）
  { id: 'shin', charId: 'shin', at: { morning: { zone: 'school_2f', pos: [2.6, 7.6], dir: E }, lunch: { zone: 'school_roof', pos: [10, 6], dir: N }, after: { zone: 'school_1f', pos: [9.2, 13], dir: N } } },
  { id: 'yuki', charId: 'yuki', at: { morning: { zone: 'school_2f', pos: [9.5, 1.9], dir: S }, lunch: { zone: 'school_garden', pos: [12, 7.5], dir: N }, after: { zone: 'school_2f', pos: [6.5, 8.3], dir: N } } },
  { id: 'hayate', charId: 'hayate', at: { morning: { zone: 'school_2f', pos: [18, 12], dir: E }, lunch: { zone: 'school_1f', pos: [17, 6], dir: S }, after: { zone: 'school_gym', pos: [10, 6], dir: E } } },
  // 生徒と先生（話すとひとこと。話せる回数は減らない）
  {
    id: 'teacher',
    name: '担任の先生',
    look: { shape: 'hero', color: '#8a8fa8', scale: 1.08 },
    at: {
      morning: { zone: 'school_2f', pos: [6.5, 2.4], dir: S },
      lunch: { zone: 'school_2f', pos: [4, 12], dir: E, route: [[4, 12], [20, 12]] },
      after: { zone: 'school_1f', pos: [3.5, 14.5], dir: N },
    },
    lines: [
      ['担任の先生', 'おはよう。今日も遅刻ギリギリだな。'],
      ['担任の先生', '弱点をつくと守りが崩れる……って、なんの話だ？　ゲームか？'],
      ['担任の先生', '最近、夜の街で怪盗のうわさがあるらしい。気をつけて帰れよ。'],
    ],
  },
  {
    id: 'librarian',
    name: '図書委員',
    look: { shape: 'hero', color: '#b48ad8', scale: 0.95 },
    at: { morning: { zone: 'school_1f', pos: [11, 7], dir: W }, lunch: { zone: 'school_1f', pos: [11, 7], dir: W }, after: { zone: 'school_1f', pos: [11, 7], dir: W } },
    lines: [
      ['図書委員', '図書室ではお静かに。'],
      ['図書委員', 'いちばん奥の棚に、だれも借りない本があるんです。……ふしぎですよね。'],
    ],
  },
  {
    id: 'shop',
    name: '購買の店員さん',
    look: { shape: 'hero', color: '#f0a050', scale: 1.05 },
    at: { morning: { zone: 'school_1f', pos: [17, 9.75], dir: N }, lunch: { zone: 'school_1f', pos: [17, 9.75], dir: N } },
    lines: [
      ['購買の店員さん', 'いらっしゃい！　メロンパンは早い者勝ちだよ。'],
      ['購買の店員さん', '黒金社長？　うちのパンを買い占めたことがあってねえ……。'],
    ],
  },
  {
    id: 'basket',
    name: 'バスケ部の先輩',
    look: { shape: 'hero', color: '#ff8a3d', scale: 1.12 },
    at: {
      lunch: { zone: 'school_gym', pos: [6, 8], dir: E },
      after: { zone: 'school_gym', pos: [3, 3], dir: E, route: [[3, 3], [17, 3], [17, 12], [3, 12]] },
    },
    lines: [
      ['バスケ部の先輩', 'お、アカリ！　入部の話、考えてくれた？'],
      ['バスケ部の先輩', '体育館の裏、夜になると光ってるって知ってた？'],
    ],
  },
  {
    id: 'classmateA',
    name: 'うわさ好きのクラスメイト',
    look: { shape: 'hero', color: '#70c0a0' },
    at: {
      morning: { zone: 'school_2f', pos: [3.6, 4.6], dir: E },
      lunch: { zone: 'school_garden', pos: [2, 5], dir: E, route: [[2, 5], [14, 5]] },
      after: { zone: 'school_1f', pos: [26, 2], dir: W },
    },
    lines: [
      ['クラスメイト', 'ねえ聞いた？　夜の学校の屋上で、だれかが空を見てるんだって。'],
      ['クラスメイト', '怪盗のうわさ、また増えてるよ。黒金邸がねらわれたとか。'],
    ],
  },
  {
    id: 'classmateB',
    name: 'のんびりしたクラスメイト',
    look: { shape: 'hero', color: '#e080a0', scale: 0.97 },
    at: { morning: { zone: 'school_2f', pos: [22, 12], dir: W }, lunch: { zone: 'school_roof', pos: [7, 7.5], dir: N } },
    lines: [
      ['クラスメイト', '屋上って、風が気持ちいいよね。'],
      ['クラスメイト', 'シンくん、昼休みはいつも屋上でコーヒー飲んでるよ。'],
    ],
  },
];

// 2階：教室 1-A（はじめの場所）・教室 1-B・廊下。西の階段で1階、東の階段で屋上
//
//   z=0 ┌─────────┬─────────┐
//       │ 教室1-A  │ 教室1-B  │
//  z=10 ├──── ──┴── ──────┤
//   階段↓        廊下        階段↑（屋上）
//  z=14 └─────────────────┘
//      x=0      x=14      x=26
const SCHOOL_2F: MapDef = {
  id: 'school_2f',
  name: '2階',
  start: [11, 8.6],
  startDir: N,
  wallColor: '#efe6d4',
  areas: [
    { name: '教室 1-A', x: 0, z: 0, w: 14, d: 10, floor: '#c9a77a' },
    { name: '教室 1-B', x: 14, z: 0, w: 12, d: 10, floor: '#c2a27a' },
    { name: '2階の廊下', x: 0, z: 10, w: 26, d: 4, floor: '#ddd8cb' },
  ],
  walls: [
    ...box(26, 14),
    wall(14, 0, T, 10),
    // 教室と廊下の間（1-A は 10〜12、1-B は 16〜18 が戸）
    wall(0, 10, 10, T),
    wall(12, 10, 4, T),
    wall(18, 10, 8, T),
    desk(2, 3),
    desk(5, 3),
    desk(8, 3),
    desk(2, 5.5),
    desk(5, 5.5),
    desk(8, 5.5),
    wall(5.5, 0.9, 2, 0.8, 'desk', 1.0),
    desk(17, 3),
    desk(20, 3),
    desk(23, 3),
    desk(17, 5.5),
    desk(20, 5.5),
    desk(23, 5.5),
    wall(4, 13.1, 4, 0.5, 'locker', 1.8),
  ],
  ...empty,
  props: [
    { kind: 'board', x: 7, z: 0.05, w: 8, dir: S },
    { kind: 'clock', x: 12.5, z: 0.05, dir: S },
    { kind: 'board', x: 20, z: 0.05, w: 7, dir: S },
    { kind: 'window', x: 0.05, z: 3, w: 2.2, dir: E },
    { kind: 'window', x: 0.05, z: 6.5, w: 2.2, dir: E },
    { kind: 'window', x: 25.95, z: 4.5, w: 2.2, dir: W },
    { kind: 'poster', x: 6, z: 10.45, dir: S, color: '#ff8fa3' },
    { kind: 'poster', x: 21, z: 10.45, dir: S, color: '#7ab8ff' },
    { kind: 'plant', x: 9.5, z: 13.4 },
  ],
  npcs: npcsIn(SCHOOL_NPCS, 'school_2f'),
  links: [
    { pos: [1.2, 12], to: 'school_1f', at: [27.2, 2], dir: W, label: '1階へ' },
    { pos: [24.8, 12], to: 'school_roof', at: [2.6, 8], dir: N, label: '屋上へ' },
  ],
};

// 1階：廊下・図書室・購買・保健室。西の端が昇降口（下校）。北に中庭と体育館への出入り口、東の階段で2階
//
//   z=0 ┌──中庭へ────体育館へ──┐
//  昇降口         廊下          階段↑
//  z=4 ├── ──┬── ──┬── ─┤
//       │図書室 │ 購買  │保健室│
//  z=12 │      ├─────┴─────┘
//  z=16 └─────┘
//      x=0   x=12  x=22  x=30
const SCHOOL_1F: MapDef = {
  id: 'school_1f',
  name: '1階',
  start: [27.2, 2],
  startDir: W,
  wallColor: '#efe6d4',
  areas: [
    { name: '1階の廊下', x: 0, z: 0, w: 30, d: 4, floor: '#ddd8cb' },
    { name: '図書室', x: 0, z: 4, w: 12, d: 12, floor: '#9a7656' },
    { name: '購買', x: 12, z: 4, w: 10, d: 8, floor: '#e7d0a2' },
    { name: '保健室', x: 22, z: 4, w: 8, d: 8, floor: '#e8eef2' },
  ],
  walls: [
    wall(-T, -T, 30 + 2 * T, T),
    wall(-T, 0, T, 16),
    wall(30, 0, T, 12),
    wall(-T, 16, 12 + 2 * T, T),
    wall(12, 12, 18.4, T),
    // 廊下と部屋の間（図書室 5〜7、購買 15〜19、保健室 24〜26 が戸）
    wall(0, 4, 5, T),
    wall(7, 4, 8, T),
    wall(19, 4, 5, T),
    wall(26, 4, 4, T),
    wall(12, 4, T, 12.4),
    wall(22, 4, T, 8),
    // 図書室：本棚と読書机
    wall(1, 6.5, 5, 0.7, 'shelf', 2.2),
    wall(1, 9.5, 5, 0.7, 'shelf', 2.2),
    wall(1, 12.5, 5, 0.7, 'shelf', 2.2),
    wall(7.5, 10, 3.5, 1.6, 'desk', 0.8),
    // 購買：カウンター
    wall(13, 8.6, 8, 0.6, 'desk', 1.0),
    // 保健室：ベッド
    wall(23, 9.6, 2.2, 1.6, 'desk', 0.6),
    wall(26.6, 9.6, 2.2, 1.6, 'desk', 0.6),
  ],
  ...empty,
  props: [
    { kind: 'poster', x: 3, z: 0.05, dir: S, color: '#ffd25a' },
    { kind: 'poster', x: 16, z: 0.05, dir: S, color: '#5ef0a0' },
    { kind: 'board', x: 26, z: 0.05, w: 3, dir: S },
    { kind: 'bread', x: 14, z: 8.5, w: 6 },
    { kind: 'plant', x: 29.4, z: 3.4 },
    { kind: 'plant', x: 11.4, z: 15.4 },
  ],
  npcs: npcsIn(SCHOOL_NPCS, 'school_1f'),
  links: [
    { pos: [28.8, 2], to: 'school_2f', at: [2.8, 12], dir: E, label: '2階へ' },
    { pos: [10, 0.8], to: 'school_garden', at: [8, 7.6], dir: N, label: '中庭へ' },
    { pos: [22, 0.8], to: 'school_gym', at: [2.8, 3], dir: E, label: '体育館へ' },
  ],
  exit: { pos: [1.2, 2], label: '昇降口から帰る（街へ・家へ）' },
  hidden: [{ id: 's_library', pos: [1.4, 15], kind: 'item', items: { note: 2, stone: 80 }, text: 'だれも借りない本に、技の手帳がはさまっていた' }],
};

const SCHOOL_GARDEN: MapDef = {
  id: 'school_garden',
  name: '中庭',
  start: [8, 7.6],
  startDir: N,
  wallColor: '#efe6d4',
  areas: [{ name: '中庭', x: 0, z: 0, w: 16, d: 10, floor: '#7cbf6e' }],
  walls: [...box(16, 10), wall(3, 2, 3, 1, 'hedge', 0.7), wall(11, 2, 3, 1, 'hedge', 0.7), wall(6.5, 6.5, 3, 0.6, 'desk', 0.5)],
  ...empty,
  props: [
    { kind: 'plant', x: 0.8, z: 0.8 },
    { kind: 'plant', x: 15.2, z: 9.2 },
  ],
  npcs: npcsIn(SCHOOL_NPCS, 'school_garden'),
  links: [{ pos: [8, 9.2], to: 'school_1f', at: [10, 2.4], dir: S, label: '1階へ' }],
  hidden: [{ id: 's_garden', pos: [14.6, 1.2], kind: 'item', items: { book: 2, stone: 80 }, text: '花だんのかげに、参考書' }],
};

const SCHOOL_ROOF: MapDef = {
  id: 'school_roof',
  name: '屋上',
  start: [2.6, 8],
  startDir: N,
  wallColor: '#d8dde4',
  areas: [{ name: '屋上', x: 0, z: 0, w: 14, d: 10, floor: '#aab6c4' }],
  walls: [...box(14, 10), wall(3, 4, 3, 0.6, 'desk', 0.5)],
  ...empty,
  props: [{ kind: 'fence', x: 0.4, z: 0.2, w: 13.4, dir: S }],
  npcs: npcsIn(SCHOOL_NPCS, 'school_roof'),
  links: [{ pos: [1.2, 9], to: 'school_2f', at: [23.2, 12], dir: W, label: '2階へ' }],
  hidden: [{ id: 's_roof', pos: [13, 1], kind: 'item', items: { parts: 10, stone: 80 }, text: '屋上のすみに、だれかの工具箱' }],
};

const SCHOOL_GYM: MapDef = {
  id: 'school_gym',
  name: '体育館',
  start: [2.8, 3],
  startDir: E,
  wallColor: '#efe0c8',
  areas: [{ name: '体育館', x: 0, z: 0, w: 20, d: 16, floor: '#d9a865' }],
  walls: [...box(20, 16), wall(6, 14, 10, 2, 'desk', 0.9)],
  ...empty,
  props: [
    { kind: 'hoop', x: 0.8, z: 8 },
    { kind: 'hoop', x: 19.2, z: 8 },
  ],
  npcs: npcsIn(SCHOOL_NPCS, 'school_gym'),
  links: [{ pos: [1.2, 3], to: 'school_1f', at: [22, 2.4], dir: S, label: '1階へ' }],
  hidden: [{ id: 's_gym', pos: [19, 15], kind: 'item', items: { key: 1, stone: 80 }, text: '体育館の裏に、光る鍵の欠片' }],
};

/** 学校の場所。はじめは2階の教室 */
export const SCHOOL_ZONES: MapDef[] = [SCHOOL_2F, SCHOOL_1F, SCHOOL_GARDEN, SCHOOL_ROOF, SCHOOL_GYM];
export const SCHOOL_START = 'school_2f';
/** はじめの場所（2階）。古いテストや道具のため */
export const SCHOOL = SCHOOL_2F;

// 街（寄り道）。駅前（はじめ・家に帰る）から、商店街・路地裏へ。商店街の先に公園
const water = (x: number, z: number, w: number, d: number) => wall(x, z, w, d, 'water', 0.05);
const always = (zone: string, pos: [number, number], dir: number) => ({ morning: { zone, pos, dir }, lunch: { zone, pos, dir }, after: { zone, pos, dir } });

const TOWN_NPCS: ZoneNpc[] = [
  { id: 'bookseller', name: '本屋の店主', look: { shape: 'hero', color: '#7ab8ff', scale: 1.05 }, shop: 'bookstore', at: always('town_street', [4.5, 3.1], S) },
  { id: 'junkdealer', name: 'ジャンク屋の店主', look: { shape: 'hero', color: '#c08850', scale: 1.1 }, shop: 'junk', at: always('town_street', [14, 3.1], S) },
  {
    id: 'oldman',
    name: '公園のおじいさん',
    look: { shape: 'hero', color: '#a0a0a0', scale: 0.95 },
    at: always('town_park', [3, 7], N),
    lines: [
      ['公園のおじいさん', '池のコイはな、浮きが沈んだ瞬間に引くんじゃ。'],
      ['公園のおじいさん', '金色のコイがおるという話じゃ。わしはまだ見たことがないがの。'],
    ],
  },
  {
    id: 'cat',
    name: '路地裏のねこ',
    look: { shape: 'drone', color: '#e0a060', scale: 0.6 },
    at: always('town_alley', [6, 5], E),
    lines: [
      ['路地裏のねこ', 'にゃあ。（この先の箱のかげ、何か光ってたにゃ）'],
      ['路地裏のねこ', 'にゃ。（黒金邸の裏口は、夜でも開いてることがあるらしいにゃ）'],
    ],
  },
];

const TOWN_STATION: MapDef = {
  id: 'town_station',
  name: '駅前',
  start: [10, 8],
  startDir: N,
  wallColor: '#e8dccb',
  areas: [{ name: '駅前', x: 0, z: 0, w: 20, d: 12, floor: '#cfc8bc' }],
  walls: [...box(20, 12), wall(8, 4, 3, 0.6, 'desk', 0.5), wall(13, 9, 4, 1, 'hedge', 0.7)],
  ...empty,
  props: [{ kind: 'clock', x: 10, z: 11.9, dir: N }],
  npcs: npcsIn(TOWN_NPCS, 'town_station'),
  links: [
    { pos: [1.2, 3], to: 'town_street', at: [21.2, 8], dir: W, label: '商店街へ' },
    { pos: [1.2, 9], to: 'town_alley', at: [9.2, 2], dir: W, label: '路地裏へ' },
  ],
  exit: { pos: [18.6, 6], label: '家に帰る（夜へ）' },
  hidden: [{ id: 't_station', pos: [19, 11], kind: 'item', items: { note: 1, stone: 80 }, text: '駅のすみに、技の手帳' }],
};

const TOWN_STREET: MapDef = {
  id: 'town_street',
  name: '商店街',
  start: [21.2, 8],
  startDir: W,
  wallColor: '#e8dccb',
  areas: [{ name: '商店街', x: 0, z: 0, w: 24, d: 10, floor: '#c4b8a6' }],
  walls: [...box(24, 10), wall(1, 0, 7, 2.2, 'shopfront', 2.6), wall(10, 0, 8, 2.2, 'shopfront', 2.6), wall(19.5, 0, 4, 2.2, 'shopfront', 2.6)],
  ...empty,
  props: [
    { kind: 'poster', x: 4.5, z: 2.25, dir: S, color: '#7ab8ff' },
    { kind: 'poster', x: 14, z: 2.25, dir: S, color: '#ffb05a' },
    { kind: 'poster', x: 21.5, z: 2.25, dir: S, color: '#ff8fa3' },
    { kind: 'plant', x: 9, z: 2.8 },
    { kind: 'plant', x: 18.7, z: 2.8 },
  ],
  npcs: npcsIn(TOWN_NPCS, 'town_street'),
  links: [
    { pos: [22.8, 8], to: 'town_station', at: [2.8, 3], dir: E, label: '駅前へ' },
    { pos: [1.2, 7], to: 'town_park', at: [13.2, 8], dir: W, label: '公園へ' },
  ],
};

const TOWN_PARK: MapDef = {
  id: 'town_park',
  name: '公園',
  start: [13.2, 8],
  startDir: W,
  wallColor: '#e8dccb',
  areas: [{ name: '公園', x: 0, z: 0, w: 16, d: 10, floor: '#82c46f' }],
  walls: [...box(16, 10), water(4, 2, 8, 4.5), wall(1, 7.5, 1.2, 1.2, 'hedge', 2.2), wall(14, 1, 1.2, 1.2, 'hedge', 2.2)],
  ...empty,
  props: [{ kind: 'fence', x: 0.2, z: 9.6, w: 15.6, dir: N }],
  npcs: npcsIn(TOWN_NPCS, 'town_park'),
  spots: [{ id: 'pond', pos: [8, 7.2], kind: 'fish', label: 'つりをする' }],
  links: [{ pos: [14.8, 8], to: 'town_street', at: [2.8, 7], dir: E, label: '商店街へ' }],
  hidden: [{ id: 't_park', pos: [14.6, 3], kind: 'item', items: { coin: 50, stone: 80 }, text: '木の根もとに、うめられたおこづかい' }],
};

const TOWN_ALLEY: MapDef = {
  id: 'town_alley',
  name: '路地裏',
  start: [9.2, 2],
  startDir: W,
  wallColor: '#b8b0bc',
  areas: [{ name: '路地裏', x: 0, z: 0, w: 12, d: 10, floor: '#6f6a78' }],
  walls: [...box(12, 10), wall(2, 3, 1.2, 1.2, 'desk', 1.0), wall(8, 7, 1.4, 1.0, 'desk', 1.0), wall(5, 8.5, 1.0, 1.0, 'desk', 0.8)],
  ...empty,
  shadows: [{ x: 0, z: 0, w: 12, d: 10 }], // 路地裏は暗い
  props: [],
  npcs: npcsIn(TOWN_NPCS, 'town_alley'),
  links: [{ pos: [10.8, 2], to: 'town_station', at: [2.8, 9], dir: E, label: '駅前へ' }],
  hidden: [{ id: 't_alley', pos: [9.4, 8.6], kind: 'item', items: { blueprint: 1, coin: 30, stone: 80 }, text: '箱のかげに、だれかの落とし物' }],
};

export const TOWN_ZONES: MapDef[] = [TOWN_STATION, TOWN_STREET, TOWN_PARK, TOWN_ALLEY];
export const TOWN_START = 'town_station';
export const TOWN = TOWN_STATION;

export const MAPS: Record<string, MapDef> = Object.fromEntries([MANSION, ...SCHOOL_ZONES, ...TOWN_ZONES].map((m) => [m.id, m]));
