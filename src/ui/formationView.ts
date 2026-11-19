import { CHARACTERS } from '../data/characters';
import { ELEMENTS } from '../data/elements';
import { FRONT } from '../battle/battle';
import { PARTY_MAX, powerOf, setParty } from '../progress/growth';
import type { SaveData } from '../progress/save';
import { esc, toast } from './fmt';

// 編成の画面。持っているキャラをタップで入れる／はずす。並んだ順に、前の4人が戦い、うしろの2人は控え。

export function openFormation(save: SaveData, onDone: (changed: boolean) => void): void {
  let picked = [...save.party];
  const el = document.createElement('div');
  el.className = 'screen';
  document.body.appendChild(el);

  const render = () => {
    const slots = Array.from({ length: PARTY_MAX }, (_, i) => {
      const id = picked[i];
      const c = id ? CHARACTERS[id] : undefined;
      const label = i < FRONT ? `前${i + 1}` : `控え${i - FRONT + 1}`;
      return `<div class="fslot${i >= FRONT ? ' benchslot' : ''}"><small>${label}</small>${c ? `<b style="color:${ELEMENTS[c.element].color}">${esc(c.name)}</b>` : '<span class="muted">あき</span>'}</div>`;
    }).join('');
    const owned = Object.keys(save.chars).filter((id) => CHARACTERS[id]);
    const cards = owned
      .map((id) => {
        const c = CHARACTERS[id];
        const at = picked.indexOf(id);
        const e = ELEMENTS[c.element];
        return `<button class="gear fchar${at >= 0 ? ' sel' : ''}" data-id="${id}">
          <div class="gname"><span style="color:${e.color}">${e.name}</span> ${esc(c.name)}${at >= 0 ? `　<b>${at < FRONT ? `前${at + 1}` : `控え${at - FRONT + 1}`}</b>` : ''}</div>
          <div class="sub">${esc(c.role)}　Lv${save.chars[id].level}　戦力 ${powerOf(save, id)}</div></button>`;
      })
      .join('');
    el.innerHTML = `
      <div class="row"><button class="btn" data-act="back">もどる</button>
        <div class="grow"><b>編成</b>　<span class="muted">前の4人が戦い、うしろの2人は控え（戦いの最中に入れかえられる）。タップで入れる・はずす</span></div>
        <button class="btn main" data-act="ok">決定</button></div>
      <div class="fslots">${slots}</div>
      <div class="pane"><div class="gearlist">${cards}</div></div>`;
  };

  el.addEventListener('click', (ev) => {
    const t = (ev.target as HTMLElement).closest('button') as HTMLButtonElement | null;
    if (!t) return;
    if (t.dataset.act === 'back') {
      el.remove();
      onDone(false);
      return;
    }
    if (t.dataset.act === 'ok') {
      if (!setParty(save, picked)) return toast('1人以上えらんでください');
      el.remove();
      onDone(true);
      return;
    }
    const id = t.dataset.id;
    if (!id) return;
    if (picked.includes(id)) picked = picked.filter((x) => x !== id);
    else if (picked.length < PARTY_MAX) picked.push(id);
    else toast(`連れて行けるのは${PARTY_MAX}人まで`);
    render();
  });
  render();
}
