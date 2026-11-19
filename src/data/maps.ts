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

export const MANSION: MapDef = {
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
};

export const MAPS: Record<string, MapDef> = { mansion: MANSION };
