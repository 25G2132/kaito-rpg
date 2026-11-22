import { describe, expect, it } from 'vitest';
import { Battle } from '../battle/battle';
import { GAME_DATA } from '../data';
import { BOND_MAX, BOND_NEED, BONDS } from '../data/bonds';
import { bondOf, finalStats, goNight, memberFor, partyFor, powerOf, sleep, talk, TALKS_PER_DAY, talksToNext } from './growth';
import { defaultSave, validateSave } from './save';

describe('絆', () => {
  it('はじめは1日目の昼。話せるのは1日3回まで、寝ると次の日', () => {
    const s = defaultSave();
    expect(s.day).toBe(1);
    expect(s.phase).toBe('day');
    for (let i = 0; i < TALKS_PER_DAY; i++) expect(talk(s, 'shin').ok).toBe(true);
    const no = talk(s, 'yuki');
    expect(no.ok).toBe(false);
    goNight(s);
    expect(talk(s, 'yuki').ok).toBe(false); // 夜は話せない
    sleep(s);
    expect(s.day).toBe(2);
    expect(s.talksToday).toBe(0);
    expect(talk(s, 'yuki').ok).toBe(true);
  });

  it('話すと絆が上がり、上がったときに開いたものが分かる', () => {
    const s = defaultSave();
    const r = talk(s, 'shin');
    expect(r.ok && r.level).toBe(2);
    expect(r.ok && r.levelUp?.level).toBe(2);
    expect(talksToNext(s, 'shin')).toBe(BOND_NEED[3] - 1);
    const r2 = talk(s, 'shin');
    expect(r2.ok && r2.levelUp).toBeUndefined(); // まだ Lv3 にならない
  });

  it('絆が上がると数字と戦力が上がる', () => {
    const s = defaultSave();
    const atk0 = finalStats(s, 'yuki').atk;
    const p0 = powerOf(s, 'yuki');
    s.bonds.yuki = BOND_NEED[BOND_MAX];
    expect(bondOf(s, 'yuki')).toBe(BOND_MAX);
    expect(finalStats(s, 'yuki').atk).toBeGreaterThan(atk0);
    expect(powerOf(s, 'yuki')).toBeGreaterThan(p0);
    expect(memberFor(s, 'yuki').mods?.healPct).toBeCloseTo(0.15);
  });

  it('シンの絆 Lv3 で、裏で装置を破るごとに合わせ技のゲージが多くたまる（育成が裏に効く）', () => {
    const run = (bond: number) => {
      const s = defaultSave();
      s.bonds.shin = bond;
      const b = new Battle(GAME_DATA, { party: partyFor(s), encounter: { ...GAME_DATA.encounters.patrol1, waves: [['robot']] }, seed: 1 });
      const e0 = b.hacker!.energy;
      for (let i = 0; i < 40 && b.hacker!.energy === e0; i++) b.advanceUra(0.5, 'manual', { autoPick: true, careful: true });
      return b.hacker!.energy - e0;
    };
    expect(run(BOND_NEED[3])).toBeGreaterThan(run(0));
  });

  it('どの仲間の絆も、会話とごほうびがそろっている', () => {
    for (const b of Object.values(BONDS)) {
      expect(GAME_DATA.characters[b.charId], b.charId).toBeTruthy();
      expect(b.talks.length).toBeGreaterThan(0);
      for (const t of b.talks) expect(t.length % 2, b.charId).toBe(0); // 名前と文の組
      for (let lv = 2; lv <= BOND_MAX; lv++) expect(b.rewards.some((r) => r.level === lv), `${b.charId} Lv${lv}`).toBe(true);
    }
  });

  it('絆と日にちがない古い保存データは、1日目の夜として読む', () => {
    const raw = JSON.parse(JSON.stringify(defaultSave()));
    delete raw.bonds;
    delete raw.day;
    delete raw.phase;
    delete raw.talksToday;
    const s = validateSave(raw)!;
    expect(s.phase).toBe('night');
    expect(s.day).toBe(1);
    expect(s.bonds).toEqual({});
  });
});
