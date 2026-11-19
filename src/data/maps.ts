import type { MapDef, WallDef } from '../field/types';

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
    { id: 'm_garden', pos: [0.8, 0.8], kind: 'item', items: { book: 3 }, text: '庭のすみの石の下に、だれかが隠した参考書' },
    { id: 'm_pillar', pos: [6.4, 18.5], kind: 'item', items: { parts: 8 }, text: '柱のかげに落ちていた部品' },
    { id: 'm_archive', pos: [29.4, 27.4], kind: 'item', items: { blueprint: 2 }, text: '資料のすきまに、設計図の切れ端' },
    { id: 'm_shadow', pos: [14.8, 10.8], kind: 'enemy', encounter: 'hidden_guard', text: '暗がりに、強そうな見回りがひそんでいる！' },
  ],
};

// 昼の学校（拠点）。仲間や生徒に話しかける。廊下の西の端の昇降口から下校すると夜。
// 屋上は「階段の先」として、廊下の東の北側に置く（1つの平面にまとめている）。
//
//   z=0 ┌────────┬───────────┬──────────┐
//       │ 教室1-A │   中庭     │   屋上    │
//  z=10 ├──  ────┴──   ──────┴───  ────┤
//    昇降口           廊下                │
//  z=14 ├──  ────┬──  ───┬────  ───────┤
//       │ 図書室  │ 購買   │   体育館     │
//  z=22 │        ├──────┘              │
//  z=26 └────────┘                      │
//  z=30                └──────────────┘
//      x=0     x=14    x=24    x=30     x=44
const desk = (x: number, z: number) => wall(x, z, 1.1, 0.7, 'desk', 0.8);
const S = Math.PI / 2; // 南（+z）を向く

export const SCHOOL: MapDef = {
  id: 'school',
  name: '学校',
  start: [11, 8.6],
  startDir: -Math.PI / 2,
  wallColor: '#efe6d4',
  areas: [
    { name: '教室 1-A', x: 0, z: 0, w: 14, d: 10, floor: '#c9a77a' },
    { name: '中庭', x: 14, z: 0, w: 16, d: 10, floor: '#7cbf6e' },
    { name: '屋上', x: 30, z: 0, w: 14, d: 10, floor: '#aab6c4' },
    { name: '廊下', x: 0, z: 10, w: 44, d: 4, floor: '#ddd8cb' },
    { name: '図書室', x: 0, z: 14, w: 14, d: 12, floor: '#9a7656' },
    { name: '購買', x: 14, z: 14, w: 10, d: 8, floor: '#e7d0a2' },
    { name: '体育館', x: 24, z: 14, w: 20, d: 16, floor: '#d9a865' },
  ],
  walls: [
    // 外の壁
    wall(-T, -T, 44 + 2 * T, T),
    wall(-T, 0, T, 26),
    wall(44, 0, T, 30),
    wall(-T, 26, 14.4 + T, T), // 図書室の南
    wall(14, 22, 10.4, T), // 購買の南
    wall(24, 30, 20.4, T), // 体育館の南
    wall(14, 22, T, 4.4), // 図書室の東（南の部分）
    // 北の列の間仕切り
    wall(14, 0, T, 10),
    wall(30, 0, T, 10),
    // 北の列と廊下の間（教室 10〜12、中庭 20〜23、屋上への階段 36〜38 が出入り口）
    wall(0, 10, 10, T),
    wall(12, 10, 8, T),
    wall(23, 10, 13, T),
    wall(38, 10, 6, T),
    // 廊下と南の列の間（図書室 5〜7、購買 17〜21、体育館 32〜35 が出入り口）
    wall(0, 14 - T, 5, T),
    wall(7, 14 - T, 10, T),
    wall(21, 14 - T, 11, T),
    wall(35, 14 - T, 9, T),
    // 南の列の間仕切り
    wall(14, 14, T, 8),
    wall(24, 14, T, 16),
    // 教室：机（3列×2行）と教卓
    desk(2, 3),
    desk(5, 3),
    desk(8, 3),
    desk(2, 5.5),
    desk(5, 5.5),
    desk(8, 5.5),
    wall(5.5, 0.9, 2, 0.8, 'desk', 1.0),
    // 中庭：花だんとベンチ
    wall(17, 2, 3, 1, 'hedge', 0.7),
    wall(25, 2, 3, 1, 'hedge', 0.7),
    wall(20.5, 6.5, 3, 0.6, 'desk', 0.5),
    // 屋上：ベンチ
    wall(33, 4, 3, 0.6, 'desk', 0.5),
    // 廊下：ロッカー
    wall(8, 13.1, 5, 0.5, 'locker', 1.8),
    wall(25, 13.1, 6, 0.5, 'locker', 1.8),
    // 図書室：本棚と読書机
    wall(1, 16.5, 5, 0.7, 'shelf', 2.2),
    wall(1, 19.5, 5, 0.7, 'shelf', 2.2),
    wall(1, 22.5, 5, 0.7, 'shelf', 2.2),
    wall(8.5, 20, 3.5, 1.6, 'desk', 0.8),
    // 購買：カウンター
    wall(15, 17.6, 8, 0.6, 'desk', 1.0),
    // 体育館：舞台
    wall(30, 28, 10, 2, 'desk', 0.9),
  ],
  doors: [],
  shadows: [],
  terminals: [],
  cameras: [],
  patrols: [],
  chests: [],
  props: [
    { kind: 'board', x: 7, z: 0.05, w: 8, dir: S },
    { kind: 'clock', x: 12.5, z: 0.05, dir: S },
    { kind: 'window', x: 0.05, z: 3, w: 2.2, dir: 0 },
    { kind: 'window', x: 0.05, z: 6.5, w: 2.2, dir: 0 },
    { kind: 'poster', x: 3, z: 10.45, dir: S, color: '#ff8fa3' },
    { kind: 'poster', x: 15.5, z: 10.45, dir: S, color: '#7ab8ff' },
    { kind: 'poster', x: 27, z: 10.45, dir: S, color: '#ffd25a' },
    { kind: 'poster', x: 40, z: 10.45, dir: S, color: '#5ef0a0' },
    { kind: 'plant', x: 13.2, z: 11 },
    { kind: 'plant', x: 43.2, z: 13 },
    { kind: 'plant', x: 29.2, z: 1 },
    { kind: 'fence', x: 30.4, z: 0.2, w: 13.4, dir: S },
    { kind: 'bread', x: 16, z: 17.5, w: 6 },
    { kind: 'hoop', x: 24.8, z: 22 },
    { kind: 'hoop', x: 43.2, z: 22 },
  ],
  npcs: [
    // 仲間（話すと絆が上がる。時間ごとに居場所が変わる）
    { id: 'shin', charId: 'shin', at: { morning: { pos: [2.6, 7.6], dir: 0 }, lunch: { pos: [40, 6], dir: -S }, after: { pos: [10.2, 23], dir: -S } } },
    { id: 'yuki', charId: 'yuki', at: { morning: { pos: [9.5, 1.9], dir: S }, lunch: { pos: [22, 8], dir: -S }, after: { pos: [6.5, 8.3], dir: -S } } },
    { id: 'hayate', charId: 'hayate', at: { morning: { pos: [18, 12], dir: 0 }, lunch: { pos: [18, 16], dir: S }, after: { pos: [34, 20], dir: 0 } } },
    // 生徒と先生（話すとひとこと。話せる回数は減らない）。文は仮
    {
      id: 'teacher',
      name: '担任の先生',
      look: { shape: 'hero', color: '#8a8fa8', scale: 1.08 },
      at: { morning: { pos: [6.5, 2.4], dir: S }, lunch: { pos: [14, 12], dir: 0, route: [[14, 12], [28, 12]] }, after: { pos: [3.5, 24.5], dir: -S } },
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
      at: { morning: { pos: [11, 17], dir: Math.PI }, lunch: { pos: [11, 17], dir: Math.PI }, after: { pos: [11, 17], dir: Math.PI } },
      lines: [
        ['図書委員', '図書室ではお静かに。'],
        ['図書委員', 'いちばん奥の棚に、だれも借りない本があるんです。……ふしぎですよね。'],
      ],
    },
    {
      id: 'shop',
      name: '購買の店員さん',
      look: { shape: 'hero', color: '#f0a050', scale: 1.05 },
      at: { morning: { pos: [19, 18.75], dir: -S }, lunch: { pos: [19, 18.75], dir: -S } },
      lines: [
        ['購買の店員さん', 'いらっしゃい！　メロンパンは早い者勝ちだよ。'],
        ['購買の店員さん', '黒金社長？　うちのパンを買い占めたことがあってねえ……。'],
      ],
    },
    {
      id: 'basket',
      name: 'バスケ部の先輩',
      look: { shape: 'hero', color: '#ff8a3d', scale: 1.12 },
      at: { lunch: { pos: [30, 20], dir: 0 }, after: { pos: [27, 17], dir: 0, route: [[27, 17], [41, 17], [41, 26], [27, 26]] } },
      lines: [
        ['バスケ部の先輩', 'お、アカリ！　入部の話、考えてくれた？'],
        ['バスケ部の先輩', '体育館の裏、夜になると光ってるって知ってた？'],
      ],
    },
    {
      id: 'classmateA',
      name: 'うわさ好きのクラスメイト',
      look: { shape: 'hero', color: '#70c0a0' },
      at: { morning: { pos: [3.6, 4.6], dir: 0 }, lunch: { pos: [16, 5], dir: 0, route: [[16, 5], [28, 5]] }, after: { pos: [40, 12], dir: Math.PI } },
      lines: [
        ['クラスメイト', 'ねえ聞いた？　夜の学校の屋上で、だれかが空を見てるんだって。'],
        ['クラスメイト', '怪盗のうわさ、また増えてるよ。黒金邸がねらわれたとか。'],
      ],
    },
    {
      id: 'classmateB',
      name: 'のんびりしたクラスメイト',
      look: { shape: 'hero', color: '#e080a0', scale: 0.97 },
      at: { morning: { pos: [33, 12], dir: Math.PI }, lunch: { pos: [35, 7], dir: -S } },
      lines: [
        ['クラスメイト', '屋上って、風が気持ちいいよね。'],
        ['クラスメイト', 'シンくん、昼休みはいつも屋上でコーヒー飲んでるよ。'],
      ],
    },
  ],
  exit: { pos: [1.2, 12], label: '昇降口から帰る（街へ・家へ）' },
  hidden: [
    { id: 's_library', pos: [1.4, 25], kind: 'item', items: { note: 2 }, text: 'だれも借りない本に、技の手帳がはさまっていた' },
    { id: 's_roof', pos: [43, 1], kind: 'item', items: { parts: 10 }, text: '屋上のすみに、だれかの工具箱' },
    { id: 's_gym', pos: [43, 29], kind: 'item', items: { key: 1 }, text: '体育館の裏に、光る鍵の欠片' },
    { id: 's_garden', pos: [28.6, 1.2], kind: 'item', items: { book: 2 }, text: '花だんのかげに、参考書' },
  ],
};

// 昼の街（寄り道）。商店街・公園の池・路地裏・駅前。お店・つり・うわさ・隠し要素。
//
//   z=0 ┌─本屋─┬─ジャンク屋─┬──────────┐
//       │   商店街          │  公園（池）  │
//  z=10 ├────────────────┴──────────┤
//       │            大通り             │
//  z=14 ├────────┬────────────────┤
//       │ 路地裏  │      駅前            │
//  z=24 └────────┴────────────────┘
//      x=0     x=12      x=24       x=40
const water = (x: number, z: number, w: number, d: number) => wall(x, z, w, d, 'water', 0.05);

export const TOWN: MapDef = {
  id: 'town',
  name: '街',
  start: [30, 20],
  startDir: -Math.PI / 2,
  wallColor: '#e8dccb',
  areas: [
    { name: '商店街', x: 0, z: 0, w: 24, d: 10, floor: '#c4b8a6' },
    { name: '公園', x: 24, z: 0, w: 16, d: 10, floor: '#82c46f' },
    { name: '大通り', x: 0, z: 10, w: 40, d: 4, floor: '#8d929c' },
    { name: '路地裏', x: 0, z: 14, w: 12, d: 10, floor: '#6f6a78' },
    { name: '駅前', x: 12, z: 14, w: 28, d: 10, floor: '#cfc8bc' },
  ],
  walls: [
    wall(-T, -T, 40 + 2 * T, T),
    wall(-T, 0, T, 24),
    wall(40, 0, T, 24),
    wall(-T, 24, 40 + 2 * T, T),
    // お店の建物（北の壁ぎわ）
    wall(1, 0, 7, 2.2, 'shopfront', 2.6),
    wall(10, 0, 8, 2.2, 'shopfront', 2.6),
    wall(19.5, 0, 4, 2.2, 'shopfront', 2.6),
    // 公園の池と木
    water(28, 2, 8, 4.5),
    wall(25, 7.5, 1.2, 1.2, 'hedge', 2.2),
    wall(38, 1, 1.2, 1.2, 'hedge', 2.2),
    // 路地裏の壁と箱
    wall(12, 14, T, 4),
    wall(12, 20, T, 4),
    wall(2, 17, 1.2, 1.2, 'desk', 1.0),
    wall(8, 21, 1.4, 1.0, 'desk', 1.0),
    wall(5, 22.5, 1.0, 1.0, 'desk', 0.8),
    // 駅前のベンチと花だん
    wall(20, 19, 3, 0.6, 'desk', 0.5),
    wall(32, 16, 4, 1, 'hedge', 0.7),
  ],
  doors: [],
  shadows: [{ x: 0, z: 14, w: 12, d: 10 }], // 路地裏は暗い
  terminals: [],
  cameras: [],
  patrols: [],
  chests: [],
  props: [
    { kind: 'poster', x: 4.5, z: 2.25, dir: S, color: '#7ab8ff' },
    { kind: 'poster', x: 14, z: 2.25, dir: S, color: '#ffb05a' },
    { kind: 'poster', x: 21.5, z: 2.25, dir: S, color: '#ff8fa3' },
    { kind: 'plant', x: 9, z: 2.8 },
    { kind: 'plant', x: 18.7, z: 2.8 },
    { kind: 'fence', x: 24.2, z: 9.6, w: 15.6, dir: S },
    { kind: 'clock', x: 30, z: 23.9, dir: -S },
  ],
  npcs: [
    {
      id: 'bookseller',
      name: '本屋の店主',
      look: { shape: 'hero', color: '#7ab8ff', scale: 1.05 },
      shop: 'bookstore',
      at: { morning: { pos: [4.5, 3.1], dir: S }, lunch: { pos: [4.5, 3.1], dir: S }, after: { pos: [4.5, 3.1], dir: S } },
    },
    {
      id: 'junkdealer',
      name: 'ジャンク屋の店主',
      look: { shape: 'hero', color: '#c08850', scale: 1.1 },
      shop: 'junk',
      at: { morning: { pos: [14, 3.1], dir: S }, lunch: { pos: [14, 3.1], dir: S }, after: { pos: [14, 3.1], dir: S } },
    },
    {
      id: 'oldman',
      name: '公園のおじいさん',
      look: { shape: 'hero', color: '#a0a0a0', scale: 0.95 },
      at: { morning: { pos: [27, 7], dir: -S }, lunch: { pos: [27, 7], dir: -S }, after: { pos: [27, 7], dir: -S } },
      lines: [
        ['公園のおじいさん', '池のコイはな、浮きが沈んだ瞬間に引くんじゃ。'],
        ['公園のおじいさん', '金色のコイがおるという話じゃ。わしはまだ見たことがないがの。'],
      ],
    },
    {
      id: 'cat',
      name: '路地裏のねこ',
      look: { shape: 'drone', color: '#e0a060', scale: 0.6 },
      at: { morning: { pos: [6, 19], dir: 0 }, lunch: { pos: [6, 19], dir: 0 }, after: { pos: [6, 19], dir: 0 } },
      lines: [
        ['路地裏のねこ', 'にゃあ。（この先の箱のかげ、何か光ってたにゃ）'],
        ['路地裏のねこ', 'にゃ。（黒金邸の裏口は、夜でも開いてることがあるらしいにゃ）'],
      ],
    },
  ],
  spots: [{ id: 'pond', pos: [32, 7.2], kind: 'fish', label: 'つりをする' }],
  hidden: [
    { id: 't_alley', pos: [9.4, 22.6], kind: 'item', items: { blueprint: 1, coin: 30 }, text: '箱のかげに、だれかの落とし物' },
    { id: 't_park', pos: [38.6, 3], kind: 'item', items: { coin: 50 }, text: '木の根もとに、うめられたおこづかい' },
    { id: 't_station', pos: [39, 23], kind: 'item', items: { note: 1 }, text: '駅のすみに、技の手帳' },
  ],
  exit: { pos: [38.6, 12], label: '家に帰る（夜へ）' },
};

export const MAPS: Record<string, MapDef> = { mansion: MANSION, school: SCHOOL, town: TOWN };
