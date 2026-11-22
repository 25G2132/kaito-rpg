import { describe, expect, it } from 'vitest';
import { Battle } from '../battle/battle';
import { runAuto } from '../battle/auto';
import { GAME_DATA } from '../data';
import { ALLIES } from '../data/allies';
import { ENEMIES } from '../data/enemies';
import { partyFor, recruitAlly, setParty } from './growth';
import { defaultSave, validateSave } from './save';

describe('協力者と編成', () => {
  it('説得できる敵には、協力者のキャラがある', () => {
    for (const e of Object.values(ENEMIES)) {
      if (!e.recruitChance) continue;
      expect(e.ally, e.id).toBeTruthy();
      expect(GAME_DATA.characters[e.ally!], e.id).toBeTruthy();
    }
    for (const a of Object.values(ALLIES)) expect(GAME_DATA.characters[a.id]).toBe(a);
  });

  it('説得した敵が協力者になる。2回目は参考書になる', () => {
    const s = defaultSave();
    const r1 = recruitAlly(s, 'drone');
    expect(r1).toEqual({ charId: 'ally_drone', isNew: true });
    expect(s.chars.ally_drone.level).toBe(Math.min(...s.party.map((id) => s.chars[id].level)));
    const book = s.items.book ?? 0;
    const r2 = recruitAlly(s, 'drone');
    expect(r2?.isNew).toBe(false);
    expect(s.items.book).toBe(book + 1);
    expect(recruitAlly(s, 'boss_kurogane')).toBeNull();
  });

  it('編成は1〜6人、持っているキャラだけ。保存して読み直せる', () => {
    const s = defaultSave();
    recruitAlly(s, 'robot');
    expect(setParty(s, ['akari', 'shin', 'yuki', 'hayate', 'ally_robot'])).toBe(true);
    expect(setParty(s, ['akari', 'ally_drone'])).toBe(false); // 持っていない
    expect(setParty(s, ['akari', 'akari'])).toBe(false);
    expect(setParty(s, [])).toBe(false);
    expect(validateSave(JSON.parse(JSON.stringify(s)))?.party).toHaveLength(5);
  });

  it('協力者を入れた編成で戦える（シンは裏、表は4人）', () => {
    const s = defaultSave();
    recruitAlly(s, 'guard');
    setParty(s, ['ally_guard', 'shin', 'yuki', 'hayate', 'akari']);
    const b = new Battle(GAME_DATA, { party: partyFor(s), encounter: 'patrol1', seed: 4 });
    expect(b.hacker?.defId).toBe('shin');
    expect(b.allies.map((u) => u.defId)).toEqual(['ally_guard', 'yuki', 'hayate', 'akari']);
    expect(['won', 'lost']).toContain(runAuto(b));
  });
});

describe('怪盗手帳', () => {
  it('倒した敵と協力者で、手帳が埋まっていく', async () => {
    const { recordSeen, notebookProgress } = await import('./growth');
    const s = defaultSave();
    const p0 = notebookProgress(s);
    expect(p0.found).toBe(0);
    recordSeen(s, ['drone', 'drone', 'guard', 'no_such_enemy']);
    expect(s.seen).toEqual({ drone: 2, guard: 1 });
    recruitAlly(s, 'drone');
    expect(notebookProgress(s).found).toBe(3);
    expect(notebookProgress(s).total).toBe(p0.total);
  });

  it('戦いで倒した敵が数えられる', () => {
    const b = new Battle(GAME_DATA, { party: partyFor(defaultSave()), encounter: { ...GAME_DATA.encounters.patrol1, level: 1 }, seed: 1 });
    runAuto(b);
    expect(b.defeatedIds.length).toBeGreaterThan(0);
  });
});
