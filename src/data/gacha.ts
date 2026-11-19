// ガチャ。お金は使わず「月の石」で引く。確率は画面に出し、天井（決まった回数で必ず★5）がある。

export const PULL_COST = 160; // 1回ぶんの月の石
export const START_STONES = 1600; // はじめにもらえる（10回ぶん）

export interface BannerDef {
  id: string;
  name: string;
  desc: string;
  kind: 'char' | 'weapon';
  rate5: number; // ★5 の確率
  rate4: number; // ★4 の確率
  pity5: number; // この回数までに必ず★5
  pity4: number; // この回数までに必ず★4以上
  pick5: string[]; // ★5 で出るもの
  pick4: { kind: 'char' | 'weapon'; id: string }[]; // ★4 で出るもの
  fallback: Record<string, number>; // ★3（はずれ）でもらえる材料
}

export const BANNERS: Record<string, BannerDef> = {
  char: {
    id: 'char',
    name: '夜の訪問者',
    desc: '★5「ツバキ」が出やすい。★4 はミナト・レイと武器',
    kind: 'char',
    rate5: 0.016,
    rate4: 0.13,
    pity5: 60,
    pity4: 10,
    pick5: ['tsubaki'],
    pick4: [
      { kind: 'char', id: 'minato' },
      { kind: 'char', id: 'rei' },
      { kind: 'weapon', id: 'night_glove' },
      { kind: 'weapon', id: 'silver_charm' },
    ],
    fallback: { parts: 10 },
  },
  weapon: {
    id: 'weapon',
    name: '影の刃',
    desc: '★5「月影の刀」（ツバキの専用武器）が出やすい',
    kind: 'weapon',
    rate5: 0.02,
    rate4: 0.15,
    pity5: 50,
    pity4: 10,
    pick5: ['tsubaki_blade'],
    pick4: [
      { kind: 'weapon', id: 'night_glove' },
      { kind: 'weapon', id: 'silver_charm' },
    ],
    fallback: { parts: 10 },
  },
};

/** 同じものが出たとき */
export const DUP_CHAR = { note: 3, stone: 40 };
export const DUP_WEAPON = { parts: 20 };
