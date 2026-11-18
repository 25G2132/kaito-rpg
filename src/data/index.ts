import type { EncounterDef, GameData } from '../battle/types';
import { CHARACTERS } from './characters';
import { ELEMENTS } from './elements';
import { ENEMIES } from './enemies';
import { STATUSES } from './statuses';

export { DEFAULT_LEVEL, DEFAULT_PARTY } from './characters';

// 戦う相手。farm＝材料を集める戦い（何度でも）、boss＝第1章のボス。
export const ENCOUNTERS: Record<string, EncounterDef> = {
  patrol: {
    id: 'patrol',
    name: '夜の見回り',
    desc: '参考書・部品・装備が出る',
    kind: 'farm',
    recommend: 4000,
    level: 14,
    waves: [
      ['drone', 'guard', 'drone'],
      ['robot', 'guard', 'robot'],
    ],
    rewards: { exp: 300, items: { book: [2, 4], parts: [16, 24], blueprint: [0, 1] }, gear: 3 },
  },
  archive: {
    id: 'archive',
    name: '資料室の警備',
    desc: '技の手帳・鍵の欠片・設計図が出る',
    kind: 'farm',
    recommend: 4500,
    level: 16,
    waves: [
      ['guard', 'drone', 'guard'],
      ['robot', 'guard', 'robot'],
    ],
    rewards: { exp: 300, items: { note: [5, 7], key: [4, 6], blueprint: [2, 3], parts: [6, 10] }, gear: 1 },
  },
  vault: {
    id: 'vault',
    name: '金庫室の番人',
    desc: '第1章のボス。群れ2つのあとに「番人クロガネ」',
    kind: 'boss',
    recommend: 11000,
    // 育てずに挑むとまず負け、材料の戦いを8回ほどして育てると勝てる強さ（自動テストで確かめる）
    level: 35,
    waves: [
      ['drone', 'guard', 'drone'],
      ['robot', 'drone', 'guard'],
      ['drone', 'boss_kurogane', 'drone'],
    ],
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
