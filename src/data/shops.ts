// 街のお店とつり。どれも1日に買える数・つれる回数が決まっていて、材料が一気に集まらないようにする。

export interface Goods {
  item: string;
  count: number; // 1回で手に入る数
  price: number; // おこづかい
  perDay: number; // 1日に買える回数
}

export interface ShopDef {
  id: string;
  name: string;
  greet: string;
  goods: Goods[];
}

export const SHOPS: Record<string, ShopDef> = {
  bookstore: {
    id: 'bookstore',
    name: '本屋',
    greet: 'いらっしゃい。勉強熱心だねえ。',
    goods: [
      { item: 'book', count: 1, price: 60, perDay: 2 },
      { item: 'note', count: 1, price: 120, perDay: 1 },
    ],
  },
  junk: {
    id: 'junk',
    name: 'ジャンク屋',
    greet: '使えそうな部品なら、だいたいあるよ。',
    goods: [
      { item: 'parts', count: 5, price: 50, perDay: 2 },
      { item: 'blueprint', count: 1, price: 150, perDay: 1 },
      { item: 'key', count: 1, price: 180, perDay: 1 },
    ],
  },
};

/** つり：1日にできる回数と、つれるもの（重み） */
export const FISH_PER_DAY = 3;
export const FISH_TABLE: { name: string; weight: number; items: Record<string, number> }[] = [
  { name: '小ぶりのフナ', weight: 50, items: { coin: 15 } },
  { name: '元気なコイ', weight: 30, items: { coin: 35 } },
  { name: '空き缶（中に部品）', weight: 14, items: { parts: 4 } },
  { name: '金色のコイ', weight: 6, items: { coin: 120 } },
];
