import { PCT_STATS, STAT_NAMES, type StatKey } from '../data/gear';
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
