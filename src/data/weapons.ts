import type { Mods, Stats } from '../battle/types';

// 武器。各キャラに「専用武器」がある（設計図の切れ端で作る）。ほかの武器も付けられる。
// 段階6で武器ガチャから出るようにする予定。

export interface WeaponDef {
  id: string;
  name: string;
  owner?: string; // 専用武器なら持ち主（ほかの人も付けられるが、効果は持ち主だけ）
  desc: string;
  stats: Partial<Stats>;
  mods?: Mods;
  cost: number; // 作るのに要る設計図の切れ端
  rarity?: number; // ガチャの武器なら ★4・★5
  gachaOnly?: boolean; // ガチャでしか手に入らない（作れない）
}

export const WEAPONS: Record<string, WeaponDef> = {
  akari_glove: {
    id: 'akari_glove',
    name: '紅蓮のグローブ',
    owner: 'akari',
    desc: '攻撃+90、会心率+10%。相性の倍率がさらに+25%（紅蓮一閃が2倍→2.5倍）',
    stats: { atk: 90, critRate: 0.1 },
    mods: { synergyPct: 0.25 },
    cost: 4,
  },
  shin_device: {
    id: 'shin_device',
    name: '自作ハッキング端末',
    owner: 'shin',
    desc: '攻撃+40、素早さ+8。必殺技ゲージが30%たまりやすい',
    stats: { atk: 40, spd: 8 },
    mods: { energyPct: 0.3 },
    cost: 4,
  },
  yuki_pendant: {
    id: 'yuki_pendant',
    name: '雪結晶のペンダント',
    owner: 'yuki',
    desc: 'HP+500。回復とバリアが30%多い',
    stats: { hp: 500 },
    mods: { healPct: 0.3 },
    cost: 4,
  },
  hayate_fan: {
    id: 'hayate_fan',
    name: '情報屋の鉄扇',
    owner: 'hayate',
    desc: '攻撃+70。与えるダメージ+15%。はじめから必殺技ゲージ+20%',
    stats: { atk: 70 },
    mods: { dmgPct: 0.15, startEnergyPct: 0.2 },
    cost: 4,
  },
  tsubaki_blade: {
    id: 'tsubaki_blade',
    name: '月影の刀',
    owner: 'tsubaki',
    desc: '攻撃+110、会心ダメージ+40%。与えるダメージ+15%（ガチャ★5）',
    stats: { atk: 110, critDmg: 0.4 },
    mods: { dmgPct: 0.15 },
    cost: 0,
    rarity: 5,
    gachaOnly: true,
  },
  night_glove: {
    id: 'night_glove',
    name: '夜鳴きの手袋',
    desc: '攻撃+70、会心率+8%（だれでも・ガチャ★4）',
    stats: { atk: 70, critRate: 0.08 },
    cost: 0,
    rarity: 4,
    gachaOnly: true,
  },
  silver_charm: {
    id: 'silver_charm',
    name: '銀の鈴',
    desc: 'HP+500。回復とバリアが15%多い（だれでも・ガチャ★4）',
    stats: { hp: 500 },
    mods: { healPct: 0.15 },
    cost: 0,
    rarity: 4,
    gachaOnly: true,
  },
  baton: {
    id: 'baton',
    name: '改造警棒',
    desc: '攻撃+50（だれでも）',
    stats: { atk: 50 },
    cost: 2,
  },
  charm: {
    id: 'charm',
    name: '学校のお守り',
    desc: 'HP+350、防御+30（だれでも）',
    stats: { hp: 350, def: 30 },
    cost: 2,
  },
};
