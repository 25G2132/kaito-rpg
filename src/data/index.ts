import type { EncounterDef, GameData } from '../battle/types';
import { CHARACTERS } from './characters';
import { ELEMENTS } from './elements';
import { ENEMIES } from './enemies';
import { STATUSES } from './statuses';

export { DEFAULT_LEVEL, DEFAULT_PARTY } from './characters';

// 戦う相手。farm＝材料を集める戦い（段階 I〜III。前の段階に勝つと次に挑める）、boss＝第1章のボス。
// 一瞬で回す仕組みはない（自分で戦う。自動・倍速は使える）。

type TierDef = Pick<EncounterDef, 'level' | 'recommend' | 'rewards' | 'gearOdds'>;

/** 材料の戦いを、段階ごとの戦いに分けて作る（id は patrol1, patrol2 …） */
function farm(group: string, name: string, desc: string, waves: string[][], tiers: TierDef[]): Record<string, EncounterDef> {
  const out: Record<string, EncounterDef> = {};
  tiers.forEach((t, i) => {
    const id = `${group}${i + 1}`;
    out[id] = {
      id,
      name: `${name} ${['I', 'II', 'III', 'IV'][i]}`,
      desc,
      kind: 'farm',
      group,
      tier: i + 1,
      unlock: i > 0 ? `${group}${i}` : undefined,
      waves,
      ...t,
    };
  });
  return out;
}

const WAVES_PATROL = [
  ['drone', 'guard', 'drone'],
  ['robot', 'guard', 'robot'],
];
const WAVES_ARCHIVE = [
  ['guard', 'drone', 'guard'],
  ['robot', 'guard', 'robot'],
];

export const ENCOUNTERS: Record<string, EncounterDef> = {
  ...farm('patrol', '夜の見回り', '参考書・部品・装備が出る', WAVES_PATROL, [
    { level: 12, recommend: 3500, gearOdds: { 2: 60, 3: 35, 4: 5 }, rewards: { exp: 150, items: { book: [1, 1], parts: [5, 8] }, gear: 1 } },
    { level: 27, recommend: 6500, gearOdds: { 2: 20, 3: 50, 4: 26, 5: 4 }, rewards: { exp: 220, items: { book: [1, 2], parts: [8, 12] }, gear: 1 } },
    { level: 35, recommend: 9500, gearOdds: { 3: 40, 4: 46, 5: 14 }, rewards: { exp: 300, items: { book: [2, 3], parts: [12, 16], blueprint: [0, 1] }, gear: 2 } },
  ]),
  ...farm('archive', '資料室の警備', '技の手帳・鍵の欠片・設計図が出る', WAVES_ARCHIVE, [
    { level: 13, recommend: 4000, rewards: { exp: 150, items: { note: [1, 1], key: [1, 1], blueprint: [0, 1], parts: [2, 4] }, gear: 0 } },
    { level: 28, recommend: 7000, rewards: { exp: 220, items: { note: [1, 2], key: [1, 2], blueprint: [1, 1], parts: [3, 5] }, gear: 0 } },
    { level: 36, recommend: 10000, rewards: { exp: 300, items: { note: [2, 3], key: [2, 3], blueprint: [1, 2], parts: [4, 6] }, gear: 0 } },
  ]),
  vault: {
    id: 'vault',
    name: '金庫室の番人',
    desc: '第1章のボス。群れ2つのあとに「番人クロガネ」',
    kind: 'boss',
    recommend: 11000,
    // 育てずに挑むとまず負け、材料の戦いを15〜20回ほどして育てると勝てる強さ（自動テストで確かめる）
    level: 35,
    waves: [
      ['drone', 'guard', 'drone'],
      ['robot', 'drone', 'guard'],
      ['drone', 'boss_kurogane', 'drone'],
    ],
    gearOdds: { 4: 70, 5: 30 },
    rewards: { exp: 600, items: { parts: [25, 35], key: [2, 3] }, gear: 2 },
    firstClear: { exp: 0, items: { book: [10, 10], blueprint: [4, 4] }, gear: 0 },
  },
};

export const GAME_DATA: GameData = {
  elements: ELEMENTS,
  statuses: STATUSES,
  characters: CHARACTERS,
  enemies: ENEMIES,
  encounters: ENCOUNTERS,
};
