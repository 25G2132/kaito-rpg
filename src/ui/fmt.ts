import { PCT_STATS, RARITIES, SLOTS, STAT_NAMES, type StatKey } from '../data/gear';
import { ITEMS } from '../data/items';

// 画面に出す数字の書き方をそろえる。

export function fmtStat(key: StatKey, v: number): string {
  if (PCT_STATS.includes(key)) return `${Math.round(v * 1000) / 10}%`;
  return String(Math.round(v));
}

export function statLine(key: StatKey, v: number): string {
  return `${STAT_NAMES[key]} +${fmtStat(key, v)}`;
}

export function matsHtml(items: Record<string, number>, onlyNonZero = false): string {
  return Object.values(ITEMS)
    .filter((d) => !onlyNonZero || (items[d.id] ?? 0) > 0)
    .map((d) => `<span class="mat" title="${d.desc}"><i style="background:${d.color}"></i>${d.name} ${items[d.id] ?? 0}</span>`)
    .join('');
}

export function toast(text: string): void {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = text;
  document.body.appendChild(t);
  window.setTimeout(() => t.remove(), 1700);
}

export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** 装備の★の出かた（例 ★2 60%・★3 35%・★4 5%） */
export function oddsText(odds: Record<number, number>): string {
  const total = Object.values(odds).reduce((a, b) => a + b, 0);
  return Object.entries(odds)
    .map(([r, w]) => `<span style="color:${RARITIES[Number(r)].color}">★${r} ${Math.round((w / total) * 100)}%</span>`)
    .join('・');
}

export function stars(r: number): string {
  return `<span style="color:${RARITIES[r].color}">${'★'.repeat(r)}</span>`;
}

export function slotName(id: string): string {
  return SLOTS.find((s) => s.id === id)?.name ?? id;
}
