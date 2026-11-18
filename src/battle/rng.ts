// 種（seed）から同じ並びを出す乱数。自動テストで同じ戦いをくり返せるようにする。
export type Rng = () => number;

export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 重みつきで1つ選ぶ */
export function pickWeighted<T>(rng: Rng, items: T[], weight: (x: T) => number): T {
  const total = items.reduce((s, x) => s + Math.max(0, weight(x)), 0);
  let r = rng() * total;
  for (const x of items) {
    r -= Math.max(0, weight(x));
    if (r < 0) return x;
  }
  return items[items.length - 1];
}
