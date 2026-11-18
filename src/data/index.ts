import type { EncounterDef, GameData } from '../battle/types';
import { CHARACTERS } from './characters';
import { ELEMENTS } from './elements';
import { ENEMIES } from './enemies';
import { STATUSES } from './statuses';

export { DEFAULT_LEVEL, DEFAULT_PARTY } from './characters';

export const ENCOUNTERS: Record<string, EncounterDef> = {
  patrol: {
    id: 'patrol',
    name: '夜の見回り',
    desc: '警備の群れ（2つ）。練習に',
    level: 20,
    waves: [
      ['drone', 'guard', 'drone'],
      ['robot', 'guard', 'robot'],
    ],
  },
  vault: {
    id: 'vault',
    name: '金庫室の番人',
    desc: '群れ2つのあとに、ボス「番人クロガネ」',
    level: 20,
    waves: [
      ['drone', 'guard', 'drone'],
      ['robot', 'drone', 'guard'],
      ['drone', 'boss_kurogane', 'drone'],
    ],
  },
};

export const GAME_DATA: GameData = {
  elements: ELEMENTS,
  statuses: STATUSES,
  characters: CHARACTERS,
  enemies: ENEMIES,
  encounters: ENCOUNTERS,
};
