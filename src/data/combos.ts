import type { ComboDef } from '../battle/types';

// 合わせ技：決まった2人の組み合わせで撃つ合体技。主人公2人だけでなく、ほかの組み合わせもある。
// 2人とも戦いに出ていて（裏の担当も含む）、2人のゲージが cost の割合ずつたまっていれば撃てる。
// 演出（カメラ・色・効果・決めの文字）は組み合わせごとに変える。名前と文字は仮。
// キャラを足すときは、ここに組み合わせを書き足す。

export const COMBOS: Record<string, ComboDef> = {
  // 表＋裏：主人公2人
  zero_day: {
    id: 'zero_day',
    name: 'ゼロデイ・ブレイク',
    members: ['akari', 'shin'],
    cost: 0.5,
    skill: {
      id: 'combo_zero_day',
      name: 'ゼロデイ・ブレイク',
      kind: 'combo',
      target: 'blastFoes',
      desc: 'シンが全員の守りの穴を開け、アカリが駆け抜ける。敵全員の弱点を暴いて〔解析〕。ねらった敵に大ダメージ、となりにもダメージ',
      effects: [
        { kind: 'reveal', to: 'allFoes' },
        { kind: 'status', status: 'exposed', turns: 2, to: 'allFoes' },
        { kind: 'damage', mult: 2.8, toughness: 40, to: 'main' },
        { kind: 'damage', mult: 1.4, toughness: 20, to: 'adjacent' },
      ],
    },
    fx: { color: '#ff4a3d', color2: '#5ef0ff', camera: 'zoom', effect: 'grid', callout: 'ZERO-DAY BREAK', sub: 'アカリ × シン' },
  },
  // 表＋表：炎と風
  guren_senpu: {
    id: 'guren_senpu',
    name: '紅蓮旋風',
    members: ['akari', 'hayate'],
    cost: 0.5,
    skill: {
      id: 'combo_guren_senpu',
      name: '紅蓮旋風',
      kind: 'combo',
      target: 'blastFoes',
      element: 'fire',
      desc: 'アカリの炎をハヤテの風が巻き上げる。ねらった敵ととなりに大ダメージ。〔燃焼〕を3つ重ねて、すぐ燃やす',
      effects: [
        { kind: 'damage', mult: 2.4, toughness: 30, to: 'main' },
        { kind: 'damage', mult: 1.3, toughness: 15, to: 'adjacent' },
        { kind: 'status', status: 'burn', turns: 3, stacks: 3 },
        { kind: 'detonate', status: 'burn', mult: 1.0 },
      ],
    },
    fx: { color: '#ff8a3d', color2: '#5ef0a0', camera: 'orbit', effect: 'flame', callout: '紅蓮旋風', sub: 'アカリ × ハヤテ' },
  },
  // 表＋表：氷と風
  hyoran: {
    id: 'hyoran',
    name: '氷嵐',
    members: ['yuki', 'hayate'],
    cost: 0.5,
    skill: {
      id: 'combo_hyoran',
      name: '氷嵐',
      kind: 'combo',
      target: 'allFoes',
      element: 'ice',
      desc: 'ユキの冷気をハヤテが吹き荒らす。敵全員にダメージと〔凍え〕、味方の番を早める',
      effects: [
        { kind: 'damage', mult: 1.3, toughness: 20, to: 'allFoes' },
        { kind: 'status', status: 'chill', turns: 2, to: 'allFoes' },
        { kind: 'advance', pct: 0.25, to: 'allAllies' },
      ],
    },
    fx: { color: '#6ad8ff', color2: '#ffffff', camera: 'pull', effect: 'frost', callout: '氷嵐', sub: 'ユキ × ハヤテ' },
  },
  // 表＋裏：守りの合わせ技
  ice_wall: {
    id: 'ice_wall',
    name: 'アイスウォール・プロトコル',
    members: ['yuki', 'shin'],
    cost: 0.5,
    skill: {
      id: 'combo_ice_wall',
      name: 'アイスウォール・プロトコル',
      kind: 'combo',
      target: 'allAllies',
      desc: 'シンが組んだ防御の手順で、ユキの氷の壁が味方全員を包む。大きなバリアと回復、悪い状態を消す',
      effects: [
        { kind: 'shield', casterPct: 0.3, turns: 2, to: 'allAllies' },
        { kind: 'heal', targetPct: 0.2, to: 'allAllies' },
        { kind: 'cleanse', to: 'allAllies' },
      ],
    },
    fx: { color: '#5ef0ff', color2: '#b8f4ff', camera: 'shake', effect: 'grid', callout: 'ICE WALL PROTOCOL', sub: 'ユキ × シン' },
  },
};
