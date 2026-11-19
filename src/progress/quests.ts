// 頼みごとの進み具合。保存には questState（1＝受けた、2＝解決）と questBase（受けたときの数）を置く。

import { QUESTS, type QuestDef } from '../data/quests';
import { notebookProgress } from './growth';
import type { SaveData } from './save';

export type QuestState = 'none' | 'active' | 'ready' | 'done';

/** いまの数と、要る数 */
export function questProgress(save: SaveData, q: QuestDef): { now: number; need: number } {
  const g = q.goal;
  switch (g.kind) {
    case 'defeat':
      return { now: Math.min(g.count, (save.seen[g.enemy] ?? 0) - (save.questBase[q.id] ?? 0)), need: g.count };
    case 'find':
      return { now: save.flags[`hidden_${g.hidden}`] ? 1 : 0, need: 1 };
    case 'win':
      return { now: (save.wins[g.encounter] ?? 0) - (save.questBase[q.id] ?? 0) > 0 ? 1 : 0, need: 1 };
    case 'notebook':
      return { now: Math.min(g.count, notebookProgress(save).found), need: g.count };
  }
}

export function questState(save: SaveData, q: QuestDef): QuestState {
  const s = save.questState[q.id] ?? 0;
  if (s >= 2) return 'done';
  if (s === 0) return 'none';
  const p = questProgress(save, q);
  return p.now >= p.need ? 'ready' : 'active';
}

/** その人の頼みごと（まだ解決していないもの、なければ最後のもの） */
export function questOf(save: SaveData, giver: string): QuestDef | undefined {
  const list = QUESTS.filter((q) => q.giver === giver);
  return list.find((q) => questState(save, q) !== 'done') ?? undefined;
}

/** 受ける：数えはじめの数を覚える */
export function acceptQuest(save: SaveData, q: QuestDef): void {
  if ((save.questState[q.id] ?? 0) !== 0) return;
  save.questState[q.id] = 1;
  const g = q.goal;
  if (g.kind === 'defeat') save.questBase[q.id] = save.seen[g.enemy] ?? 0;
  if (g.kind === 'win') save.questBase[q.id] = save.wins[g.encounter] ?? 0;
}

/** 解決する：ごほうびをもらう */
export function completeQuest(save: SaveData, q: QuestDef): Record<string, number> | null {
  if (questState(save, q) !== 'ready') return null;
  save.questState[q.id] = 2;
  for (const [k, n] of Object.entries(q.reward)) save.items[k] = (save.items[k] ?? 0) + n;
  return { ...q.reward };
}

/** 頭の上の印：！＝新しい頼みごと、？＝解決できる */
export function questMark(save: SaveData, giver: string): '!' | '?' | null {
  const q = questOf(save, giver);
  if (!q) return null;
  const s = questState(save, q);
  return s === 'none' ? '!' : s === 'ready' ? '?' : null;
}
