import type { Effect, Mods } from '../battle/types';

// 絆。昼の学校で話しかけると上がる（1日3回まで）。上がるごとに強さが開く。
// 会話の文は仮（本当の台詞は段階7の物語で直す）。

export const BOND_MAX = 5;
/** そのレベルになるのに要る、話した回数（合計） */
export const BOND_NEED = [0, 0, 1, 3, 5, 8];

export interface BondReward {
  level: number;
  desc: string;
  statPct?: { atk?: number; hp?: number; def?: number }; // 基本の数字に対する割合
  mods?: Mods;
  extraEffects?: Partial<Record<'basic' | 'skill' | 'ult', Effect[]>>;
}

export interface BondDef {
  charId: string;
  title: string; // 学校での顔
  rewards: BondReward[];
  /** 話しかけたときの会話。回数ごとに次へ進み、最後まで行くと最後をくり返す */
  talks: string[][];
}

const STATS_2: BondReward['statPct'] = { atk: 0.05, hp: 0.05 };
const STATS_4: BondReward['statPct'] = { atk: 0.05, hp: 0.05, def: 0.05 };

export const BONDS: Record<string, BondDef> = {
  shin: {
    charId: 'shin',
    title: '幼なじみ・同じクラス',
    rewards: [
      { level: 2, desc: '攻撃・HP +5%', statPct: STATS_2 },
      { level: 3, desc: '裏：装置を1つ破るごとに、合わせ技のゲージが +40% 多くたまる', mods: { energyPct: 0.4 } },
      { level: 4, desc: '攻撃・HP・防御 +5%', statPct: STATS_4 },
      { level: 5, desc: '裏：合わせ技のゲージが、はじめから半分たまっている', mods: { startEnergyPct: 0.5 } },
    ],
    talks: [
      ['シン', '……コーヒー、いる？　ブラックしかないけど。', 'アカリ', '砂糖もらっていい？　三つ。', 'シン', '……それはもうコーヒーじゃない。'],
      ['シン', '昨日の金庫の配線、もう少し短く入れる方法を見つけた。', 'アカリ', 'さすが！　じゃあ私は、もっと速く走ればいいね。', 'シン', '……走る前に、影を見て。'],
      ['アカリ', 'ねえ、お弁当のたまご焼き、ひとつちょうだい。', 'シン', '……二つ作ってある。', 'アカリ', 'えっ、私のぶん！？'],
      ['シン', 'アカリが前にいると、画面の向こうでも安心する。', 'アカリ', 'なにそれ、急にどうしたの。', 'シン', '……なんでもない。'],
      ['シン', '次の仕事も、二人でやろう。', 'アカリ', 'もちろん。相棒でしょ。'],
    ],
  },
  yuki: {
    charId: 'yuki',
    title: 'クラスの委員長',
    rewards: [
      { level: 2, desc: '攻撃・HP +5%', statPct: STATS_2 },
      { level: 3, desc: '相性：回復とバリアが15%多い', mods: { healPct: 0.15 } },
      { level: 4, desc: '攻撃・HP・防御 +5%', statPct: STATS_4 },
      { level: 5, desc: '新しい効果：必殺技で味方全員にバリア（ユキの最大HPの15%）', extraEffects: { ult: [{ kind: 'shield', casterPct: 0.15, turns: 2, to: 'allAllies' }] } },
    ],
    talks: [
      ['ユキ', 'アカリさん、提出物まだですよね？　今日までです。', 'アカリ', 'あっ……昼休みに書く！'],
      ['ユキ', '夜、またどこかへ出かけていましたね。', 'アカリ', 'え、えっと……コンビニ？', 'ユキ', '……ふふ。そういうことにしておきます。'],
      ['ユキ', '委員長って、みんなの顔を見ているのが仕事なんです。', 'アカリ', 'ユキちゃんの顔は、だれが見てるの？', 'ユキ', '……考えたこと、なかったです。'],
      ['ユキ', '本当のことを言うと、わたしも夜の街を知っています。', 'アカリ', 'えっ。', 'ユキ', 'いつか、ちゃんと話しますね。'],
      ['ユキ', 'あなたたちの「正義」、近くで見ていてもいいですか。'],
    ],
  },
  hayate: {
    charId: 'hayate',
    title: '人なつこい後輩',
    rewards: [
      { level: 2, desc: '攻撃・HP +5%', statPct: STATS_2 },
      { level: 3, desc: '相性：「煽り風」で燃やす火がもう半分強くなる', extraEffects: { skill: [{ kind: 'detonate', status: 'burn', mult: 0.5 }] } },
      { level: 4, desc: '攻撃・HP・防御 +5%', statPct: STATS_4 },
      { level: 5, desc: '新しい効果：必殺技で〔燃焼〕をすぐ燃やす', extraEffects: { ult: [{ kind: 'detonate', status: 'burn', mult: 1 }] } },
    ],
    talks: [
      ['ハヤテ', 'センパーイ！　購買のメロンパン、最後の一個とっときました！', 'アカリ', 'ハヤテくん、天才！'],
      ['ハヤテ', 'そういえば、黒金社長の屋敷、夜は見回りが四人っすよ。', 'アカリ', '……なんで知ってるの？', 'ハヤテ', '情報屋なんで。へへ。'],
      ['ハヤテ', '街のうわさって、だいたい本当で、ちょっとだけ嘘なんすよ。', 'アカリ', 'その「ちょっと」が大事なんだね。'],
      ['ハヤテ', 'オレ、センパイたちの役に立ちたいんす。', 'アカリ', 'もう十分立ってるよ。', 'ハヤテ', '……もっと、っす。'],
      ['ハヤテ', '次のうわさ、一番にセンパイに持ってきますね！'],
    ],
  },
};

/** 話した回数から、絆のレベル */
export function bondLevel(talks: number): number {
  let lv = 1;
  for (let l = 2; l <= BOND_MAX; l++) if (talks >= BOND_NEED[l]) lv = l;
  return lv;
}
