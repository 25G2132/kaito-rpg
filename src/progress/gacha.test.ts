import { describe, expect, it } from 'vitest';
import { makeRng } from '../battle/rng';
import { BANNERS, PULL_COST, START_STONES } from '../data/gacha';
import { CHARACTERS } from '../data/characters';
import { WEAPONS } from '../data/weapons';
import { GAME_DATA } from '../data';
import { Battle } from '../battle/battle';
import { runAuto } from '../battle/auto';
import { canPull, pityLeft, pull } from './gacha';
import { partyFor, setParty } from './growth';
import { defaultSave } from './save';

const rich = () => {
  const s = defaultSave();
  s.items.stone = 1e7;
  return s;
};

describe('ガチャ', () => {
  it('はじめに10回ぶんの月の石がある。足りなければ引けない', () => {
    const s = defaultSave();
    expect(s.items.stone).toBe(START_STONES);
    expect(canPull(s, 10)).toBe(true);
    expect(pull(s, 'char', 10, makeRng(1))).toHaveLength(10);
    expect(s.items.stone).toBe(START_STONES - PULL_COST * 10);
    expect(pull(s, 'char', 1, makeRng(1))).toBeNull();
  });

  it('データ：出るキャラと武器がすべてある', () => {
    for (const b of Object.values(BANNERS)) {
      for (const id of b.pick5) expect(b.kind === 'char' ? CHARACTERS[id] : WEAPONS[id], id).toBeTruthy();
      for (const p of b.pick4) expect(p.kind === 'char' ? CHARACTERS[p.id] : WEAPONS[p.id], p.id).toBeTruthy();
    }
  });

  it('天井：★5 は決まった回数までに必ず出る。★4以上は10回ごとに必ず出る', () => {
    for (const bid of ['char', 'weapon']) {
      const b = BANNERS[bid];
      for (let seed = 1; seed <= 30; seed++) {
        const s = rich();
        const res = pull(s, bid, b.pity5, makeRng(seed))!;
        expect(res.some((r) => r.stars === 5), `${bid} seed ${seed}`).toBe(true);
        for (let i = 0; i + 10 <= res.length; i += 10) {
          // 10回つづけて★3だけ、ということはない
          let run = 0;
          for (const r of res) {
            run = r.stars >= 4 ? 0 : run + 1;
            expect(run).toBeLessThan(b.pity4);
          }
        }
      }
    }
  });

  it('確率：たくさん引くと、だいたい表のとおり（天井ぶん少し多い）', () => {
    const s = rich();
    const res = pull(s, 'char', 20000, makeRng(7))!;
    const r5 = res.filter((r) => r.stars === 5).length / res.length;
    const r4 = res.filter((r) => r.stars === 4).length / res.length;
    expect(r5).toBeGreaterThan(BANNERS.char.rate5);
    expect(r5).toBeLessThan(BANNERS.char.rate5 * 1.8);
    expect(r4).toBeGreaterThan(BANNERS.char.rate4);
    expect(r4).toBeLessThan(BANNERS.char.rate4 * 1.4);
  });

  it('★5 のキャラが仲間になり、編成して戦える。重なると材料になる', () => {
    const s = rich();
    pull(s, 'char', BANNERS.char.pity5, makeRng(3));
    expect(s.chars.tsubaki).toBeTruthy();
    expect(pityLeft(s, 'char')).toBeGreaterThan(0);
    expect(setParty(s, ['tsubaki', 'shin', 'yuki', 'hayate'])).toBe(true);
    const b = new Battle(GAME_DATA, { party: partyFor(s), encounter: 'patrol1', seed: 1 });
    expect(['won', 'lost']).toContain(runAuto(b));
    const notes = s.items.note ?? 0;
    const res = pull(s, 'char', BANNERS.char.pity5, makeRng(4))!;
    const dup = res.find((r) => r.stars === 5)!;
    expect(dup.isNew).toBe(false);
    expect((s.items.note ?? 0) >= notes + 3).toBe(true);
  });
});
