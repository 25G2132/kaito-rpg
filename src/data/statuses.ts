import type { StatusDef } from '../battle/types';

// 状態（よい状態・わるい状態）。turns は「持ち主の番が何回終わるまで続くか」。
export const STATUSES: Record<string, StatusDef> = {
  burn: {
    id: 'burn',
    name: '燃焼',
    short: '燃',
    kind: 'debuff',
    desc: '番のはじめに炎のダメージ。重なるほど強い（5まで。風で倍にできる）',
    maxStacks: 5,
    dotMult: 0.25,
  },
  exposed: {
    id: 'exposed',
    name: '解析',
    short: '析',
    kind: 'debuff',
    desc: '守りの穴を暴かれた。どの属性でも弱点になり、受けるダメージ+15%',
    allWeak: true,
    dmgTakenPct: 0.15,
  },
  chill: {
    id: 'chill',
    name: '凍え',
    short: '凍',
    kind: 'debuff',
    desc: '素早さ-20%',
    spdPct: -0.2,
  },
  defdown: {
    id: 'defdown',
    name: '防御ダウン',
    short: '防',
    kind: 'debuff',
    desc: '防御-25%',
    defPct: -0.25,
  },
  overclock: {
    id: 'overclock',
    name: 'オーバークロック',
    short: '強',
    kind: 'buff',
    desc: '攻撃力+30%',
    atkPct: 0.3,
  },
  rage: {
    id: 'rage',
    name: '怒り',
    short: '怒',
    kind: 'buff',
    desc: '攻撃力+30%',
    atkPct: 0.3,
  },
  charging: {
    id: 'charging',
    name: '力をためている',
    short: '溜',
    kind: 'buff',
    desc: '次の番で大技。守りを崩すと止められる',
    forcesSkill: 'boss_hammer',
    removedOnBreak: true,
  },
};
