import { describe, expect, it } from 'vitest';
import md from '../../docs/check-list.md?raw';
import { CHECK_ITEMS, CHECKLIST, checklistMarkdown } from './checklist';
import { GAME_DATA } from '.';
import { MAPS } from './maps';

describe('確かめることの一覧', () => {
  it('docs/check-list.md は、ゲームの中の一覧と同じ中身', () => {
    expect(md.replace(/\r\n/g, '\n').trim()).toBe(checklistMarkdown().trim());
  });

  it('id は重ならず、どれも「やり方」と「こうなれば正しい」がある。「行く」の先がある', () => {
    expect(new Set(CHECK_ITEMS.map((i) => i.id)).size).toBe(CHECK_ITEMS.length);
    for (const g of CHECKLIST) expect(g.items.length, g.name).toBeGreaterThan(0);
    for (const it of CHECK_ITEMS) {
      expect(it.how.length, it.id).toBeGreaterThan(0);
      expect(it.ok.length, it.id).toBeGreaterThan(0);
      if (!it.go) continue;
      const [kind, a] = it.go.split(':');
      expect(['battle', 'zone', 'hub', 'gacha', 'mansion'], it.id).toContain(kind);
      if (kind === 'battle') expect(GAME_DATA.encounters[a], it.id).toBeTruthy();
      if (kind === 'zone') expect(MAPS[a], it.id).toBeTruthy();
    }
  });
});
