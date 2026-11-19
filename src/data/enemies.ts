import type { EnemyDef } from '../battle/types';

// 敵（すべて仮）。weaknesses の属性で攻撃すると守りが削れ、削り切ると崩れて1回休みになる。

export const ENEMIES: Record<string, EnemyDef> = {
  drone: {
    id: 'drone',
    note: '屋敷の空を見張る小さなドローン。素早いが打たれ弱い。',
    recruitChance: 0.45,
    ally: 'ally_drone',
    name: '警備ドローン',
    element: 'thunder',
    base: { hp: 800, atk: 230, def: 40, spd: 96, critRate: 0, critDmg: 0 },
    toughness: 30,
    weaknesses: ['fire', 'wind'],
    look: { shape: 'drone', color: '#8fa3c8' },
    skills: [
      { id: 'drone_shot', name: '光線', kind: 'enemy', target: 'oneFoe', desc: '', weight: 2, effects: [{ kind: 'damage', mult: 1.0 }] },
      {
        id: 'drone_jam',
        name: '妨害電波',
        kind: 'enemy',
        target: 'oneFoe',
        desc: '',
        weight: 1,
        effects: [
          { kind: 'damage', mult: 0.5 },
          { kind: 'status', status: 'defdown', turns: 2 },
        ],
      },
    ],
  },

  guard: {
    id: 'guard',
    note: '黒服の警備員。仕事熱心だが、給料には不満があるらしい。',
    recruitChance: 0.35,
    ally: 'ally_guard',
    name: '黒服の警備員',
    element: 'shadow',
    base: { hp: 1000, atk: 250, def: 50, spd: 100, critRate: 0, critDmg: 0 },
    toughness: 45,
    weaknesses: ['fire', 'ice'],
    look: { shape: 'guard', color: '#3a3f52' },
    skills: [
      { id: 'guard_baton', name: '警棒', kind: 'enemy', target: 'oneFoe', desc: '', weight: 2, effects: [{ kind: 'damage', mult: 1.1 }] },
      {
        id: 'guard_tackle',
        name: '体当たり',
        kind: 'enemy',
        target: 'blastFoes',
        desc: '',
        weight: 1,
        effects: [
          { kind: 'damage', mult: 0.8, to: 'main' },
          { kind: 'damage', mult: 0.4, to: 'adjacent' },
        ],
      },
    ],
  },

  robot: {
    id: 'robot',
    note: '重くて遅い警備ロボ。まとめて腕を振り回す。',
    recruitChance: 0.3,
    ally: 'ally_robot',
    name: '警備ロボ',
    element: 'ice',
    base: { hp: 1500, atk: 240, def: 75, spd: 88, critRate: 0, critDmg: 0 },
    toughness: 60,
    weaknesses: ['thunder', 'wind'],
    look: { shape: 'robot', color: '#6f7a8f' },
    skills: [
      { id: 'robot_arm', name: '鉄の腕', kind: 'enemy', target: 'oneFoe', desc: '', weight: 2, effects: [{ kind: 'damage', mult: 1.2 }] },
      { id: 'robot_spin', name: '回転攻撃', kind: 'enemy', target: 'allFoes', desc: '', weight: 1, effects: [{ kind: 'damage', mult: 0.6 }] },
    ],
  },

  boss_kurogane: {
    id: 'boss_kurogane',
    note: '黒金邸の金庫室を守る番人。力をためた大技に気をつけろ。',
    name: '番人クロガネ',
    element: 'shadow',
    base: { hp: 13000, atk: 290, def: 80, spd: 104, critRate: 0.05, critDmg: 0.5 },
    toughness: 240,
    weaknesses: ['fire', 'thunder'],
    boss: true,
    look: { shape: 'boss', color: '#4a3550', scale: 1.5 },
    pattern: ['boss_slam', 'boss_sweep', 'boss_charge'],
    enrage: { hpPct: 0.5, status: 'rage', text: '番人が怒った！ 攻撃力が上がる' },
    skills: [
      { id: 'boss_slam', name: '鉄拳', kind: 'enemy', target: 'oneFoe', desc: '', effects: [{ kind: 'damage', mult: 1.8 }] },
      { id: 'boss_sweep', name: '薙ぎ払い', kind: 'enemy', target: 'allFoes', desc: '', effects: [{ kind: 'damage', mult: 0.9 }] },
      {
        id: 'boss_charge',
        name: '力をためる',
        kind: 'enemy',
        target: 'self',
        desc: '',
        warn: '番人が力をためている！ 守りを崩すと止められる',
        effects: [{ kind: 'status', status: 'charging', turns: 1 }],
      },
      { id: 'boss_hammer', name: '鉄槌', kind: 'enemy', target: 'allFoes', desc: '', weight: 0, effects: [{ kind: 'damage', mult: 2.0 }] },
    ],
  },
};
