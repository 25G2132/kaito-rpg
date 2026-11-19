import { CHARACTERS } from '../data/characters';
import { ELEMENTS } from '../data/elements';
import { ENEMIES } from '../data/enemies';
import { notebookProgress } from '../progress/growth';
import type { SaveData } from '../progress/save';
import { esc } from './fmt';

// 怪盗手帳（図鑑）。出会った敵（倒した数・弱点・説得できるか）と、仲間にした協力者。
// まだ出会っていないものは「？？？」。

export function openNotebook(save: SaveData, onClose: () => void): void {
  const el = document.createElement('div');
  el.className = 'screen';
  document.body.appendChild(el);
  const { found, total } = notebookProgress(save);
  const cards = Object.values(ENEMIES)
    .map((e) => {
      const n = save.seen[e.id] ?? 0;
      if (!n) return `<div class="gear nb unknown"><div class="gname">？？？</div><div class="sub">まだ出会っていない</div></div>`;
      const weak = e.weaknesses.map((w) => `<span class="chip" style="background:${ELEMENTS[w].color}">${ELEMENTS[w].name}</span>`).join('');
      const ally = e.ally ? CHARACTERS[e.ally] : undefined;
      const allyLine = !e.recruitChance
        ? '<span class="muted">説得できない</span>'
        : save.chars[e.ally!]
          ? `<span class="gain">協力者「${esc(ally?.name ?? '')}」が仲間</span>`
          : '<span class="why">弱らせて説得すると、仲間になるかも</span>';
      return `<div class="gear nb${e.boss ? ' r5' : ''}"><div class="gname">${esc(e.name)}${e.boss ? ' <b>ボス</b>' : ''}</div>
        <div class="sub">${esc(e.note ?? '')}</div>
        <div class="sub">弱点 ${weak}　倒した数 ${n}</div>
        <div class="sub">${allyLine}</div></div>`;
    })
    .join('');
  el.innerHTML = `
    <div class="row"><button class="btn" data-act="back">もどる</button>
      <div class="grow"><b>怪盗手帳</b>　<span class="muted">出会った敵と、仲間にした協力者の記録</span></div>
      <div class="power">${found} / ${total}</div></div>
    <div class="pane"><div class="gearlist">${cards}</div></div>`;
  el.querySelector('[data-act="back"]')!.addEventListener('click', () => {
    el.remove();
    onClose();
  });
}
