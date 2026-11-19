import type { CharacterDef } from '../battle/types';

// 協力者：説得で仲間になった敵。編成で戦いに連れて行ける。数字は主人公たちより少し低め。名前は仮。

export const ALLIES: Record<string, CharacterDef> = {
  ally_drone: {
    id: 'ally_drone',
    name: 'ドローン',
    role: '妨害（協力者）',
    profile: '説得で仲間になった警備ドローン。素早く、敵の守りを下げる',
    element: 'thunder',
    base: { hp: 700, atk: 95, def: 50, spd: 118, critRate: 0.05, critDmg: 0.5 },
    energyMax: 100,
    ultGame: 'timing',
    look: { shape: 'drone', color: '#8fd0ff' },
    basic: { id: 'ally_drone_basic', name: '光線', kind: 'basic', target: 'oneFoe', desc: '敵1体にダメージ', effects: [{ kind: 'damage', mult: 1.0, toughness: 10 }] },
    skill: {
      id: 'ally_drone_skill',
      name: '妨害電波',
      kind: 'skill',
      target: 'oneFoe',
      desc: '敵1体にダメージと〔防御ダウン〕',
      effects: [
        { kind: 'damage', mult: 0.6, toughness: 15 },
        { kind: 'status', status: 'defdown', turns: 2 },
      ],
    },
    ult: {
      id: 'ally_drone_ult',
      name: '一斉スキャン',
      kind: 'ult',
      target: 'allFoes',
      desc: '敵全員にダメージと〔解析〕（1回の番）',
      effects: [
        { kind: 'damage', mult: 1.0, toughness: 15 },
        { kind: 'status', status: 'exposed', turns: 1 },
      ],
    },
  },
  ally_guard: {
    id: 'ally_guard',
    name: '元警備員',
    role: '守り（協力者）',
    profile: '説得で仲間になった黒服の警備員。ねらわれやすく、自分にバリアを張る',
    element: 'shadow',
    base: { hp: 1100, atk: 100, def: 80, spd: 96, critRate: 0.05, critDmg: 0.5 },
    energyMax: 110,
    ultGame: 'mash',
    aggro: 160,
    look: { shape: 'guard', color: '#5a6078' },
    basic: { id: 'ally_guard_basic', name: '警棒', kind: 'basic', target: 'oneFoe', desc: '敵1体にダメージ', effects: [{ kind: 'damage', mult: 1.0, toughness: 10 }] },
    skill: {
      id: 'ally_guard_skill',
      name: 'かばう構え',
      kind: 'skill',
      target: 'oneFoe',
      desc: '敵1体にダメージ。自分にバリア（最大HPの30%）',
      effects: [
        { kind: 'damage', mult: 0.8, toughness: 15 },
        { kind: 'shield', casterPct: 0.3, turns: 2, to: 'self' },
      ],
    },
    ult: {
      id: 'ally_guard_ult',
      name: '体当たり',
      kind: 'ult',
      target: 'blastFoes',
      desc: 'ねらった敵ととなりに大ダメージ',
      effects: [
        { kind: 'damage', mult: 2.4, toughness: 30, to: 'main' },
        { kind: 'damage', mult: 1.2, toughness: 15, to: 'adjacent' },
      ],
    },
  },
  ally_robot: {
    id: 'ally_robot',
    name: 'ロボ',
    role: '範囲（協力者）',
    profile: '説得で仲間になった警備ロボ。遅いが、まとめて攻撃する',
    element: 'ice',
    base: { hp: 950, atk: 110, def: 75, spd: 88, critRate: 0.05, critDmg: 0.5 },
    energyMax: 120,
    ultGame: 'mash',
    look: { shape: 'robot', color: '#7fa0c0' },
    basic: { id: 'ally_robot_basic', name: '鉄の腕', kind: 'basic', target: 'oneFoe', desc: '敵1体にダメージ', effects: [{ kind: 'damage', mult: 1.1, toughness: 10 }] },
    skill: { id: 'ally_robot_skill', name: '回転攻撃', kind: 'skill', target: 'allFoes', desc: '敵全員にダメージ', effects: [{ kind: 'damage', mult: 0.8, toughness: 10 }] },
    ult: {
      id: 'ally_robot_ult',
      name: '冷却ビーム',
      kind: 'ult',
      target: 'oneFoe',
      desc: '敵1体に大ダメージ。敵全員に〔凍え〕',
      effects: [
        { kind: 'damage', mult: 3.2, toughness: 40 },
        { kind: 'status', status: 'chill', turns: 2, to: 'allFoes' },
      ],
    },
  },
};
