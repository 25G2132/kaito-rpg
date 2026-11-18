import { describe, expect, it } from 'vitest';
import { Battle } from '../battle/battle';
import { runAuto } from '../battle/auto';
import { makeRng } from '../battle/rng';
import { GAME_DATA } from '../data';
import { SLOTS } from '../data/gear';
import { WEAPONS } from '../data/weapons';
import { enhanceGear, equipGear, gearMainValue, makeGear } from './gear';
import {
  addExp,
  applyRewards,
  ascend,
  autoInvest,
  canAscend,
  craftWeapon,
  equipWeapon,
  expToNext,
  finalStats,
  levelCap,
  memberFor,
  partyFor,
  powerOf,
  raiseSkill,
  rollRewards,
  useBooks,
} from './growth';
import { defaultSave, loadSave, SAVE_KEY, storeSave, validateSave, type SaveData } from './save';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

function memoryStorage(): { getItem(k: string): string | null; setItem(k: string, v: string): void; data: Record<string, string> } {
  const data: Record<string, string> = {};
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
}

describe('保存', () => {
  it('初期値は正しい形で、保存して読み直すと同じになる', () => {
    const s = defaultSave();
    expect(validateSave(clone(s))).toBeTruthy();
    const st = memoryStorage();
    storeSave(st, s);
    expect(loadSave(st)).toEqual({ save: s, reset: false });
  });

  it('おかしな保存データは初期値に戻す', () => {
    const bad: unknown[] = [
      null,
      { ...defaultSave(), v: 999 },
      { ...defaultSave(), items: { book: -3 } },
      { ...defaultSave(), items: { gold: 5 } },
      { ...defaultSave(), weapons: ['no_such_weapon'] },
      { ...defaultSave(), gear: [{ id: 1, slot: 'hat', level: 0, main: 'hp', subs: [], owner: null }] },
      { ...defaultSave(), chars: { akari: { level: 'x' } } },
    ];
    for (const b of bad) expect(validateSave(b)).toBeNull();
    const st = memoryStorage();
    st.data[SAVE_KEY] = '{これはJSONではない';
    const r = loadSave(st);
    expect(r.reset).toBe(true);
    expect(r.save).toEqual(defaultSave());
  });
});

describe('レベルと突破', () => {
  it('経験値で上がり、上限で止まる。突破すると、ためた経験値でまた上がる', () => {
    const s = defaultSave();
    addExp(s, 'akari', 100000);
    expect(s.chars.akari.level).toBe(levelCap(0));
    expect(canAscend(s, 'akari').ok).toBe(false); // 鍵の欠片がない
    s.items.key = 10;
    expect(ascend(s, 'akari')).toBe(true);
    expect(s.items.key).toBe(6);
    expect(s.chars.akari.level).toBe(levelCap(1));
    // 第1章ではこれ以上突破できない
    s.items.key = 99;
    expect(ascend(s, 'akari')).toBe(false);
  });

  it('参考書で経験値が入り、上限なら使わない', () => {
    const s = defaultSave();
    s.items.book = 5;
    const lv = s.chars.shin.level;
    const r = useBooks(s, 'shin', 1);
    expect(r.used).toBe(1);
    expect(s.chars.shin.level).toBeGreaterThan(lv);
    addExp(s, 'shin', 100000);
    expect(useBooks(s, 'shin', 1).used).toBe(0);
    expect(s.items.book).toBe(4);
    expect(expToNext(10)).toBeGreaterThan(expToNext(5));
  });

  it('レベルが上がると数字と戦力が上がる', () => {
    const s = defaultSave();
    const before = finalStats(s, 'akari');
    const p0 = powerOf(s, 'akari');
    addExp(s, 'akari', 2000);
    expect(finalStats(s, 'akari').atk).toBeGreaterThan(before.atk);
    expect(powerOf(s, 'akari')).toBeGreaterThan(p0);
  });
});

describe('技レベルと武器', () => {
  it('技の手帳で技レベルが上がり、ダメージが増える', () => {
    const s = defaultSave();
    expect(raiseSkill(s, 'akari')).toBe(false);
    s.items.note = 10;
    expect(raiseSkill(s, 'akari')).toBe(true);
    expect(s.chars.akari.skill).toBe(2);
    const hit = (save: SaveData) => {
      const b = new Battle(GAME_DATA, { party: [memberFor(save, 'akari')], encounter: { ...GAME_DATA.encounters.patrol, waves: [['robot']] }, seed: 1 });
      b.allies[0].stats.critRate = 0;
      b.phase = 'command';
      b.activeId = b.allies[0].uid;
      return b.command('basic').find((e) => e.t === 'damage')!;
    };
    const lv1 = hit(defaultSave());
    const lv2 = hit(s);
    expect(lv2.t === 'damage' && lv1.t === 'damage' && lv2.amount > lv1.amount).toBe(true);
  });

  it('専用武器は設計図で作り、持ち主だけに特別な効果がつく', () => {
    const s = defaultSave();
    expect(craftWeapon(s, 'akari_glove')).toBe(false);
    s.items.blueprint = WEAPONS.akari_glove.cost;
    expect(craftWeapon(s, 'akari_glove')).toBe(true);
    equipWeapon(s, 'akari', 'akari_glove');
    expect(memberFor(s, 'akari').mods?.synergyPct).toBe(0.25);
    expect(memberFor(s, 'akari').bonus?.atk).toBe(90);
    // ほかの人に付けかえると、持ち主からははずれ、特別な効果はつかない
    equipWeapon(s, 'shin', 'akari_glove');
    expect(s.chars.akari.weapon).toBeNull();
    expect(memberFor(s, 'shin').mods?.synergyPct).toBeUndefined();
    expect(memberFor(s, 'shin').bonus?.atk).toBe(90);
  });
});

describe('装備', () => {
  it('主な効果は枠で決まり、副ステータスは2〜3つでランダム（主と同じものは出ない）', () => {
    const rng = makeRng(7);
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const g = makeGear(rng, i + 1);
      const slot = SLOTS.find((x) => x.id === g.slot)!;
      expect(g.main).toBe(slot.main);
      expect(g.subs.length).toBeGreaterThanOrEqual(2);
      expect(g.subs.length).toBeLessThanOrEqual(3);
      expect(g.subs.some((x) => x.stat === g.main)).toBe(false);
      seen.add(g.subs.map((x) => x.stat).join());
    }
    expect(seen.size).toBeGreaterThan(10); // 毎回ちがう
  });

  it('強化で主な効果が伸び、3レベルごとに副ステータスが増える／伸びる', () => {
    const s = defaultSave();
    const rng = makeRng(3);
    const g = makeGear(rng, 1, 'gloves');
    g.subs = g.subs.slice(0, 2);
    s.gear.push(g);
    expect(enhanceGear(s, 1, rng).ok).toBe(false); // 部品がない
    s.items.parts = 999;
    const main0 = gearMainValue(g);
    for (let i = 0; i < 3; i++) enhanceGear(s, 1, rng);
    expect(gearMainValue(g)).toBeGreaterThan(main0);
    expect(g.subs.length).toBe(3);
    for (let i = 0; i < 3; i++) enhanceGear(s, 1, rng);
    expect(g.subs.length).toBe(4);
    const total = () => g.subs.reduce((a, x) => a + x.value, 0);
    const t6 = total();
    for (let i = 0; i < 3; i++) enhanceGear(s, 1, rng);
    expect(total()).toBeGreaterThan(t6);
    expect(s.items.parts).toBeLessThan(999);
  });

  it('付けると数字が上がる。同じ枠は付けかわる', () => {
    const s = defaultSave();
    const rng = makeRng(5);
    s.gear.push(makeGear(rng, 1, 'gloves'), makeGear(rng, 2, 'gloves'));
    const atk0 = finalStats(s, 'akari').atk;
    equipGear(s, 1, 'akari');
    expect(finalStats(s, 'akari').atk).toBeGreaterThan(atk0);
    equipGear(s, 2, 'akari');
    expect(s.gear.filter((g) => g.owner === 'akari')).toHaveLength(1);
    expect(s.gear[1].owner).toBe('akari');
  });
});

describe('ごほうび', () => {
  it('勝つと材料と装備がもらえる。はじめての勝ちだけ、おまけがつく', () => {
    const s = defaultSave();
    const rng = makeRng(9);
    const vault = GAME_DATA.encounters.vault;
    const r1 = rollRewards(vault, rng, s);
    expect(r1.items.book).toBe(10);
    applyRewards(s, r1, vault);
    expect(s.wins.vault).toBe(1);
    const r2 = rollRewards(vault, rng, s);
    expect(r2.items.book).toBeUndefined();
    const patrol = GAME_DATA.encounters.patrol;
    const r3 = rollRewards(patrol, rng, s);
    expect(r3.gear).toHaveLength(3);
    const n = s.gear.length;
    applyRewards(s, r3, patrol);
    expect(s.gear).toHaveLength(n + 3);
    expect(new Set(s.gear.map((g) => g.id)).size).toBe(s.gear.length);
  });
});

describe('釣り合い（何百回も戦わせて勝率を出す）', () => {
  function bossRate(save: SaveData, n: number): number {
    let w = 0;
    for (let i = 0; i < n; i++) {
      if (runAuto(new Battle(GAME_DATA, { party: partyFor(save), encounter: 'vault', seed: 5000 + i })) === 'won') w++;
    }
    return w / n;
  }
  /** 材料の戦いを farms 回くり返して、おまかせで育てる */
  function grow(farms: number, seed: number): SaveData {
    const rng = makeRng(seed);
    const s = defaultSave();
    autoInvest(s, rng);
    for (let k = 1; k <= farms; k++) {
      const enc = GAME_DATA.encounters[k % 2 ? 'patrol' : 'archive'];
      const b = new Battle(GAME_DATA, { party: partyFor(s), encounter: enc.id, seed: seed * 1000 + k });
      if (runAuto(b) === 'won') applyRewards(s, rollRewards(enc, rng, s), enc);
      autoInvest(s, rng);
    }
    return s;
  }

  it('育てずにボスへ行くと、まず負ける', () => {
    expect(bossRate(defaultSave(), 100)).toBeLessThanOrEqual(0.05);
  });

  it('はじめから材料の戦いには勝てる', () => {
    const s = defaultSave();
    for (const id of ['patrol', 'archive']) {
      let w = 0;
      for (let i = 0; i < 20; i++) if (runAuto(new Battle(GAME_DATA, { party: partyFor(s), encounter: id, seed: i })) === 'won') w++;
      expect(w, id).toBeGreaterThanOrEqual(18);
    }
  });

  it('少し育てただけでは、まだ勝ちにくい（材料の戦い4回）', () => {
    expect(bossRate(grow(4, 1), 100)).toBeLessThanOrEqual(0.3);
  });

  it('材料の戦いを10回くり返して育てると、ボスにほぼ勝てる', () => {
    for (const seed of [1, 2, 3]) expect(bossRate(grow(10, seed), 100), `seed ${seed}`).toBeGreaterThanOrEqual(0.9);
  });
});
