import { describe, expect, it } from 'vitest';
import { QUESTS } from '../data/quests';
import { SCHOOL_ZONES } from '../data/maps';
import { GAME_DATA } from '../data';
import { ITEMS } from '../data/items';
import { recordSeen, recruitAlly } from './growth';
import { acceptQuest, completeQuest, questMark, questOf, questProgress, questState } from './quests';
import { defaultSave, validateSave } from './save';

const q = (id: string) => QUESTS.find((x) => x.id === id)!;

describe('頼みごと', () => {
  it('データ：頼む人は学校にいて、目標とごほうびの名前がそろっている', () => {
    for (const x of QUESTS) {
      expect(SCHOOL_ZONES.some((z) => z.npcs?.some((n) => n.id === x.giver)), x.id).toBe(true);
      for (const k of Object.keys(x.reward)) expect(ITEMS[k], x.id).toBeTruthy();
      const g = x.goal;
      if (g.kind === 'defeat') expect(GAME_DATA.enemies[g.enemy]).toBeTruthy();
      if (g.kind === 'win') expect(GAME_DATA.encounters[g.encounter]).toBeTruthy();
      if (g.kind === 'find') expect(SCHOOL_ZONES.some((z) => z.hidden?.some((h) => h.id === g.hidden)), x.id).toBe(true);
    }
  });

  it('受ける前は「！」、受けてから倒した数だけ進み、そろうと「？」、解決でごほうび', () => {
    const s = defaultSave();
    const d = q('q_rumor_drone');
    recordSeen(s, ['drone', 'drone']); // 受ける前に倒したぶんは数えない
    expect(questMark(s, d.giver)).toBe('!');
    acceptQuest(s, d);
    expect(questState(s, d)).toBe('active');
    expect(questMark(s, d.giver)).toBeNull();
    recordSeen(s, ['drone', 'drone']);
    expect(questProgress(s, d)).toEqual({ now: 2, need: 3 });
    recordSeen(s, ['drone']);
    expect(questMark(s, d.giver)).toBe('?');
    const book = s.items.book ?? 0;
    expect(completeQuest(s, d)).toEqual(d.reward);
    expect(s.items.book).toBe(book + 3);
    expect(questState(s, d)).toBe('done');
    expect(completeQuest(s, d)).toBeNull(); // 2回はもらえない
    expect(questOf(s, d.giver)).toBeUndefined();
  });

  it('見つける・勝つ・手帳の頼みごとも進む', () => {
    const s = defaultSave();
    const f = q('q_library_book');
    acceptQuest(s, f);
    expect(questState(s, f)).toBe('active');
    s.flags.hidden_s_library = 1;
    expect(questState(s, f)).toBe('ready');

    const w = q('q_vault');
    s.wins.vault = 2;
    acceptQuest(s, w);
    expect(questState(s, w)).toBe('active'); // 受ける前の勝ちは数えない
    s.wins.vault = 3;
    expect(questState(s, w)).toBe('ready');

    const n = q('q_notebook');
    acceptQuest(s, n);
    recordSeen(s, ['drone', 'guard', 'robot']);
    recruitAlly(s, 'drone');
    recruitAlly(s, 'guard');
    expect(questState(s, n)).toBe('ready');
  });

  it('頼みごとの記録は保存され、古いデータも読める', () => {
    const s = defaultSave();
    acceptQuest(s, q('q_gym_light'));
    expect(validateSave(JSON.parse(JSON.stringify(s)))?.questState).toEqual({ q_gym_light: 1 });
    const raw = JSON.parse(JSON.stringify(defaultSave()));
    delete raw.questState;
    delete raw.questBase;
    expect(validateSave(raw)?.questState).toEqual({});
  });
});
