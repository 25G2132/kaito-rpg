import type { CharacterDef } from '../battle/types';
import { ALLIES } from './allies';
import { GACHA_CHARS } from './gachaChars';

// 味方のキャラ。名前はすべて仮（本当の名前は段階7で決める）。
// キャラを足すときは、ここに1人ぶん書き足すだけでよい（自動戦闘もデータを見て動く）。
//
// 相性の組み合わせ：
//   シン（裏）が弱点の装置を破ると〔解析〕 → アカリの「紅蓮一閃」が2倍
//   アカリの攻撃で〔燃焼〕       → ハヤテの「煽り風」が燃焼を2倍にして、すぐ燃やす

const MAIN_CHARACTERS: Record<string, CharacterDef> = {
  akari: {
    id: 'akari',
    name: 'アカリ',
    role: 'アタッカー',
    profile: '主人公（女の子）。怪盗の実行役。運動神経ばつぐん',
    element: 'fire',
    base: { hp: 900, atk: 140, def: 60, spd: 104, critRate: 0.15, critDmg: 0.8 },
    energyMax: 120,
    ultGame: 'mash',
    look: { shape: 'hero', color: '#ff6a3d' },
    basic: {
      id: 'akari_basic',
      name: '回し蹴り',
      kind: 'basic',
      target: 'oneFoe',
      desc: '敵1体にダメージ。〔燃焼〕をつける。ときどき盗む（敵の強化を奪う）',
      effects: [
        { kind: 'damage', mult: 1.0, toughness: 10 },
        { kind: 'status', status: 'burn', turns: 2 },
        { kind: 'steal', chance: 0.3, to: 'main' },
      ],
    },
    skill: {
      id: 'akari_skill',
      name: '紅蓮一閃',
      kind: 'skill',
      target: 'oneFoe',
      desc: '敵1体に大ダメージ。〔解析〕中の敵には2倍',
      effects: [
        { kind: 'damage', mult: 2.2, toughness: 20, synergy: { status: 'exposed', mult: 2 } },
        { kind: 'status', status: 'burn', turns: 2 },
      ],
    },
    ult: {
      id: 'akari_ult',
      name: '怪盗乱舞',
      kind: 'ult',
      target: 'blastFoes',
      desc: 'ねらった敵ととなりに大ダメージ。〔解析〕中なら1.5倍。〔燃焼〕2つ',
      effects: [
        { kind: 'damage', mult: 3.0, toughness: 30, to: 'main', synergy: { status: 'exposed', mult: 1.5 } },
        { kind: 'damage', mult: 1.5, toughness: 15, to: 'adjacent' },
        { kind: 'status', status: 'burn', turns: 3, stacks: 2 },
      ],
    },
  },

  shin: {
    id: 'shin',
    name: 'シン',
    role: '裏の担当（ハッカー）',
    profile: '主人公（男の子）。表には出ず、離れた所から敵の警備システムに侵入する。弱点を暴き、守りを下げ、強化を盗む',
    ura: true,
    element: 'thunder',
    base: { hp: 800, atk: 90, def: 55, spd: 115, critRate: 0.05, critDmg: 0.5 },
    energyMax: 100,
    ultGame: 'timing',
    look: { shape: 'hero', color: '#ffd84a', scale: 0.95 },
    basic: {
      id: 'shin_basic',
      name: 'スタンガン',
      kind: 'basic',
      target: 'oneFoe',
      desc: '敵1体にダメージ',
      effects: [{ kind: 'damage', mult: 1.0, toughness: 10 }],
    },
    skill: {
      id: 'shin_skill',
      name: '侵入ハック',
      kind: 'skill',
      target: 'oneFoe',
      desc: '敵1体に〔解析〕：どの属性でも弱点になり、受けるダメージ+15%',
      effects: [
        { kind: 'damage', mult: 0.5, toughness: 10 },
        { kind: 'status', status: 'exposed', turns: 2 },
      ],
    },
    ult: {
      id: 'shin_ult',
      name: 'オーバークロック',
      kind: 'ult',
      target: 'allAllies',
      desc: '味方全員の攻撃力+30%、番を30%早める',
      effects: [
        { kind: 'status', status: 'overclock', turns: 2 },
        { kind: 'advance', pct: 0.3 },
      ],
    },
  },

  yuki: {
    id: 'yuki',
    name: 'ユキ',
    role: '守り・回復',
    profile: '仲間（仮）。クラスの委員長。表の顔はまじめ、裏の顔は…',
    element: 'ice',
    base: { hp: 1100, atk: 80, def: 85, spd: 98, critRate: 0.05, critDmg: 0.5 },
    energyMax: 100,
    ultGame: 'timing',
    aggro: 150,
    look: { shape: 'hero', color: '#6ad8ff' },
    basic: {
      id: 'yuki_basic',
      name: '氷つぶて',
      kind: 'basic',
      target: 'oneFoe',
      desc: '敵1体にダメージ',
      effects: [{ kind: 'damage', mult: 1.0, toughness: 10 }],
    },
    skill: {
      id: 'yuki_skill',
      name: '氷の盾',
      kind: 'skill',
      target: 'allAllies',
      desc: '味方全員にバリア（ユキの最大HPの20%）と小さな回復',
      effects: [
        { kind: 'shield', casterPct: 0.2, turns: 2 },
        { kind: 'heal', targetPct: 0.08 },
      ],
    },
    ult: {
      id: 'yuki_ult',
      name: '雪どけの歌',
      kind: 'ult',
      target: 'allAllies',
      desc: '味方全員を回復（30%）して悪い状態を消す。敵全員に〔凍え〕',
      effects: [
        { kind: 'heal', targetPct: 0.3 },
        { kind: 'cleanse' },
        { kind: 'status', status: 'chill', turns: 2, to: 'allFoes' },
      ],
    },
  },

  hayate: {
    id: 'hayate',
    name: 'ハヤテ',
    role: '範囲アタッカー',
    profile: '仲間（仮）。街の情報屋。昼は人なつこい後輩',
    element: 'wind',
    base: { hp: 850, atk: 120, def: 55, spd: 108, critRate: 0.1, critDmg: 0.6 },
    energyMax: 110,
    ultGame: 'mash',
    look: { shape: 'hero', color: '#5ef0a0', scale: 1.05 },
    basic: {
      id: 'hayate_basic',
      name: 'つむじ風',
      kind: 'basic',
      target: 'oneFoe',
      desc: '敵1体にダメージ',
      effects: [{ kind: 'damage', mult: 1.0, toughness: 10 }],
    },
    skill: {
      id: 'hayate_skill',
      name: '煽り風',
      kind: 'skill',
      target: 'blastFoes',
      desc: 'ねらった敵ととなりにダメージ。〔燃焼〕を2倍にして、すぐ燃やす',
      effects: [
        { kind: 'damage', mult: 1.2, toughness: 20, to: 'main' },
        { kind: 'damage', mult: 0.6, toughness: 10, to: 'adjacent' },
        { kind: 'amplify', status: 'burn', factor: 2 },
        { kind: 'detonate', status: 'burn', mult: 1 },
      ],
    },
    ult: {
      id: 'hayate_ult',
      name: '嵐の情報網',
      kind: 'ult',
      target: 'allFoes',
      desc: '敵全員にダメージ。〔燃焼〕を2倍にする',
      effects: [
        { kind: 'damage', mult: 1.5, toughness: 20 },
        { kind: 'amplify', status: 'burn', factor: 2 },
      ],
    },
  },
};

/** 主人公たち＋協力者（説得で仲間になった敵） */
export const CHARACTERS: Record<string, CharacterDef> = { ...MAIN_CHARACTERS, ...ALLIES, ...GACHA_CHARS };

/** 最初の4人の並び */
export const DEFAULT_PARTY = ['akari', 'shin', 'yuki', 'hayate'];
export const DEFAULT_LEVEL = 20;
