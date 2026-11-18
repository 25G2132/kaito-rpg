import type { Rng } from '../battle/rng';
import type { Stats } from '../battle/types';
import { CHARACTERS } from '../data/characters';
import { ELEMENTS } from '../data/elements';
import { enhanceCost, GEAR_MAX_LEVEL, SLOTS, type SlotId, type StatKey } from '../data/gear';
import { WEAPONS } from '../data/weapons';
import { SKILL_STEP } from '../battle/battle';
import { enhanceGear, equipGear, gearMainValue, gearScore } from '../progress/gear';
import {
  ascend,
  booksFor,
  canAscend,
  canRaiseSkill,
  craftWeapon,
  equipWeapon,
  expToNext,
  finalStats,
  levelCap,
  powerOf,
  raiseSkill,
  useBooks,
} from '../progress/growth';
import type { GearPiece, SaveData } from '../progress/save';
import { esc, fmtStat, matsHtml, toast } from './fmt';

// 育成の画面。どのボタンにも「押すと何がどれだけ上がるか」を数字で出す。

type Sub = 'level' | 'skill' | 'weapon' | 'gear';
const SHOWN: (keyof Stats)[] = ['hp', 'atk', 'def', 'spd', 'critRate', 'critDmg'];

export class GrowthView {
  readonly el = document.createElement('div');
  private save: SaveData;
  private rng: Rng;
  private onSave: () => void;
  private onClose: () => void;
  private charId: string;
  private sub: Sub = 'level';
  private slot: SlotId = 'mask';
  private actions = new Map<string, () => void>();

  constructor(save: SaveData, rng: Rng, onSave: () => void, onClose: () => void, charId?: string) {
    this.save = save;
    this.rng = rng;
    this.onSave = onSave;
    this.onClose = onClose;
    this.charId = charId ?? save.party[0];
    this.el.className = 'screen';
    this.el.addEventListener('click', (ev) => {
      const t = (ev.target as HTMLElement).closest('[data-a]') as HTMLElement | null;
      if (!t || (t as HTMLButtonElement).disabled) return;
      this.actions.get(t.dataset.a!)?.();
    });
    document.body.appendChild(this.el);
    this.render();
  }

  close(): void {
    this.el.remove();
  }

  private act(fn: () => void): string {
    const id = `a${this.actions.size}`;
    this.actions.set(id, fn);
    return id;
  }

  /** 押す前に「何がどれだけ上がるか」を計算する（保存データの写しで試す） */
  private gain(fn: (s: SaveData) => unknown, charId = this.charId): string {
    const copy: SaveData = JSON.parse(JSON.stringify(this.save));
    fn(copy);
    const a = finalStats(this.save, charId);
    const b = finalStats(copy, charId);
    const parts: string[] = [];
    for (const k of SHOWN) {
      const d = b[k] - a[k];
      if (Math.abs(d) > 1e-6) parts.push(`${statName(k)} ${d > 0 ? '+' : ''}${fmtStat(k as StatKey, d)}`);
    }
    const p = powerOf(copy, charId) - powerOf(this.save, charId);
    if (p !== 0) parts.push(`戦力 ${p > 0 ? '+' : ''}${p}`);
    return parts.length ? `<span class="gain">${parts.join('　')}</span>` : '';
  }

  private changed(msg: string): void {
    this.onSave();
    toast(msg);
    this.render();
  }

  render(): void {
    // 押したあとも、同じところを見ていられるように
    const scroll = this.el.querySelector('.pane')?.scrollTop ?? 0;
    this.actions.clear();
    const s = this.save;
    const tabs = s.party
      .map((id) => {
        const c = CHARACTERS[id];
        return `<button class="tab${id === this.charId ? ' on' : ''}" data-a="${this.act(() => {
          this.charId = id;
          this.render();
        })}">${c.name}<span class="lv">Lv${s.chars[id].level}</span></button>`;
      })
      .join('');
    const subs: [Sub, string][] = [
      ['level', 'レベル'],
      ['skill', '技'],
      ['weapon', '武器'],
      ['gear', '装備'],
    ];
    const subTabs = subs
      .map(([k, n]) => `<button class="tab${k === this.sub ? ' on' : ''}" data-a="${this.act(() => {
        this.sub = k;
        this.render();
        this.el.querySelector('.pane')!.scrollTop = 0;
      })}">${n}</button>`)
      .join('');
    const pane = this.sub === 'level' ? this.levelPane() : this.sub === 'skill' ? this.skillPane() : this.sub === 'weapon' ? this.weaponPane() : this.gearPane();
    this.el.innerHTML = `
      <div class="row">
        <button class="btn" data-a="${this.act(() => this.onClose())}">もどる</button>
        <div class="tabs grow">${tabs}</div>
      </div>
      <div class="mats">${matsHtml(s.items)}</div>
      <div class="grow-body">
        ${this.statCard()}
        <div class="panel2"><div class="subtabs">${subTabs}</div><div class="pane">${pane}</div></div>
      </div>`;
    const p = this.el.querySelector('.pane');
    if (p) p.scrollTop = scroll;
  }

  private statCard(): string {
    const id = this.charId;
    const c = CHARACTERS[id];
    const p = this.save.chars[id];
    const st = finalStats(this.save, id);
    const e = ELEMENTS[c.element];
    const cap = levelCap(p.asc);
    const expPct = p.level >= cap ? 100 : Math.min(100, (p.exp / expToNext(p.level)) * 100);
    const rows = SHOWN.map((k) => `<tr><td>${statName(k)}</td><td>${fmtStat(k as StatKey, st[k])}</td></tr>`).join('');
    return `<div class="statcard">
      <div class="cname"><span style="color:${e.color}">${e.name}</span> ${c.name}</div>
      <div class="role">${c.role}</div>
      <div>Lv <b>${p.level}</b> / ${cap}　技Lv ${p.skill}</div>
      <div class="expbar"><i style="width:${expPct}%"></i></div>
      <div class="muted">戦力</div><div class="bigpower">${powerOf(this.save, id)}</div>
      <table>${rows}</table>
      <div class="muted" style="margin-top:4px">武器：${p.weapon ? WEAPONS[p.weapon].name : 'なし'}</div>
    </div>`;
  }

  private levelPane(): string {
    const id = this.charId;
    const s = this.save;
    const p = s.chars[id];
    const cap = levelCap(p.asc);
    const books = s.items.book ?? 0;
    const atCap = p.level >= cap;
    const n1 = booksFor(s, id, false);
    const nAll = booksFor(s, id, true);
    const asc = canAscend(s, id);
    const one = this.act(() => {
      const r = useBooks(s, id, n1);
      this.changed(r.gained ? `レベルが ${r.gained} 上がった！` : `経験値が入った`);
    });
    const all = this.act(() => {
      const r = useBooks(s, id, nAll);
      this.changed(r.gained ? `レベルが ${r.gained} 上がった！` : `経験値が入った`);
    });
    const ascA = this.act(() => {
      if (ascend(s, id)) this.changed(`突破！ レベルの上限が ${levelCap(s.chars[id].asc)} になった`);
    });
    return `
      <div class="card"><b class="t">レベル ${p.level} / ${cap}</b>　経験値 ${atCap ? '上限' : `${Math.floor(p.exp)} / ${expToNext(p.level)}`}<br>
        <span class="muted">参考書1冊で経験値 +500。戦いに勝っても経験値が入る。</span></div>
      <div class="card row">
        <div class="grow">次のレベルまで（参考書 ${n1}冊）<br>${atCap ? '<span class="why">上限です。突破すると上がる</span>' : books < n1 ? `<span class="why">参考書が足りない（${books}冊）</span>` : this.gain((c) => useBooks(c, id, n1))}</div>
        <button class="btn main" data-a="${one}" ${atCap || books < 1 ? 'disabled' : ''}>使う</button>
      </div>
      <div class="card row">
        <div class="grow">上限まで上げる（${nAll}冊${books < nAll ? `、いま${books}冊` : ''}）<br>${atCap ? '' : this.gain((c) => useBooks(c, id, nAll))}</div>
        <button class="btn" data-a="${all}" ${atCap || books < 1 ? 'disabled' : ''}>まとめて</button>
      </div>
      <div class="card row">
        <div class="grow"><b>突破</b>：レベルの上限 ${cap} → ${levelCap(p.asc + 1)}（鍵の欠片 ${asc.cost}個）<br>
          ${asc.ok ? '<span class="gain">上限が上がり、ためた経験値でレベルも上がる</span>' : `<span class="why">${asc.reason}</span>`}</div>
        <button class="btn gold" data-a="${ascA}" ${asc.ok ? '' : 'disabled'}>突破</button>
      </div>`;
  }

  private skillPane(): string {
    const id = this.charId;
    const s = this.save;
    const c = CHARACTERS[id];
    const p = s.chars[id];
    const chk = canRaiseSkill(s, id);
    const pct = (lv: number) => Math.round((1 + SKILL_STEP * (lv - 1)) * 100);
    const up = this.act(() => {
      if (raiseSkill(s, id)) this.changed(`技レベル ${s.chars[id].skill}！ 技の倍率 ${pct(s.chars[id].skill)}%`);
    });
    const skills = [c.basic, c.skill, c.ult]
      .map((k) => `<div class="card"><b>${k.kind === 'basic' ? '通常攻撃' : k.kind === 'skill' ? 'スキル' : '必殺技'}「${esc(k.name)}」</b><br>${esc(k.desc)}</div>`)
      .join('');
    return `
      <div class="card row">
        <div class="grow"><b class="t">技レベル ${p.skill}</b>　技の倍率 ${pct(p.skill)}%（ダメージ・回復・バリア）<br>
          ${chk.ok ? `${pct(p.skill)}% → ${pct(p.skill + 1)}%　${this.gain((x) => raiseSkill(x, id))}` : `<span class="why">${chk.reason}</span>`}</div>
        <button class="btn main" data-a="${up}" ${chk.ok ? '' : 'disabled'}>上げる<small>手帳 ${chk.cost}</small></button>
      </div>
      ${skills}`;
  }

  private weaponPane(): string {
    const id = this.charId;
    const s = this.save;
    const p = s.chars[id];
    const cards: string[] = [];
    const list = Object.values(WEAPONS).sort((a, b) => Number(b.owner === id) - Number(a.owner === id));
    for (const w of list) {
      const owned = s.weapons.includes(w.id);
      const holder = Object.entries(s.chars).find(([, c]) => c.weapon === w.id)?.[0];
      const mine = w.owner === id;
      const label = w.owner ? (mine ? '専用武器' : `${CHARACTERS[w.owner]?.name}の専用`) : 'だれでも';
      let btn = '';
      let note = '';
      if (!owned) {
        const ok = (s.items.blueprint ?? 0) >= w.cost;
        btn = `<button class="btn ${mine ? 'gold' : ''}" data-a="${this.act(() => {
          if (craftWeapon(s, w.id)) {
            equipWeapon(s, id, w.id);
            this.changed(`${w.name}を作って付けた！`);
          }
        })}" ${ok ? '' : 'disabled'}>作る<small>設計図 ${w.cost}</small></button>`;
        note = ok ? this.gain((x) => { craftWeapon(x, w.id); equipWeapon(x, id, w.id); }) : `<span class="why">設計図の切れ端が${w.cost}個いる</span>`;
      } else if (p.weapon === w.id) {
        btn = `<button class="btn" data-a="${this.act(() => {
          equipWeapon(s, id, null);
          this.changed('武器をはずした');
        })}">はずす</button>`;
        note = '<span class="gain">付けている</span>';
      } else {
        btn = `<button class="btn main" data-a="${this.act(() => {
          equipWeapon(s, id, w.id);
          this.changed(`${w.name}を付けた`);
        })}">付ける</button>`;
        note = `${holder ? `<span class="why">${CHARACTERS[holder].name}が使っている</span>　` : ''}${this.gain((x) => equipWeapon(x, id, w.id))}`;
      }
      if (w.owner && !mine && !owned) continue; // ほかの人の専用武器は、その人の画面で作る
      cards.push(`<div class="card row"><div class="grow"><b>${w.name}</b> <span class="muted">${label}</span><br>${esc(w.desc)}<br>${note}</div>${btn}</div>`);
    }
    return cards.join('');
  }

  private gearPane(): string {
    const id = this.charId;
    const s = this.save;
    const worn = (slot: SlotId) => s.gear.find((g) => g.owner === id && g.slot === slot);
    const best = this.act(() => {
      for (const slot of SLOTS) {
        const cands = s.gear.filter((g) => g.slot === slot.id && (g.owner === null || g.owner === id)).sort((a, b) => gearScore(b) - gearScore(a));
        if (cands[0]) equipGear(s, cands[0].id, id);
      }
      this.changed('いちばん良い装備を付けた');
    });
    const slots = SLOTS.map((sl) => {
      const g = worn(sl.id);
      return `<button class="gear${sl.id === this.slot ? ' sel' : ''}" data-a="${this.act(() => {
        this.slot = sl.id;
        this.render();
      })}"><div class="gname">${sl.name}${g ? ` +${g.level}` : ''}</div>${g ? gearLines(g) : '<span class="muted">なし（タップで選ぶ）</span>'}</button>`;
    }).join('');

    const cur = worn(this.slot);
    let detail = '';
    if (cur) {
      const cost = enhanceCost(cur.level);
      const max = cur.level >= GEAR_MAX_LEVEL;
      const ok = !max && (s.items.parts ?? 0) >= cost;
      const enh = this.act(() => {
        const r = enhanceGear(s, cur.id, this.rng);
        if (r.ok) this.changed(r.newSub ? `+${cur.level}！ 副ステータス「${statName(r.newSub)}」が増えた` : r.grew ? `+${cur.level}！ 「${statName(r.grew)}」が伸びた` : `+${cur.level}！`);
      });
      const next = 3 - (cur.level % 3);
      detail = `<div class="card row"><div class="grow"><b>${slotName(cur.slot)} +${cur.level}</b> を強化（部品 ${cost}）<br>
        ${max ? '<span class="why">これ以上強くできない</span>' : ok ? `${this.gainEnhanceMain(cur)}　<span class="muted">あと${next}回で副ステータスが増える／伸びる</span>` : `<span class="why">部品が${cost}個いる（いま${s.items.parts ?? 0}）</span>`}</div>
        <button class="btn main" data-a="${enh}" ${ok ? '' : 'disabled'}>強化</button></div>`;
    }
    const others = s.gear
      .filter((g) => g.slot === this.slot && g !== cur)
      .sort((a, b) => gearScore(b) - gearScore(a))
      .slice(0, 12)
      .map((g) => {
        const holder = g.owner ? CHARACTERS[g.owner]?.name : '';
        return `<div class="gear"><div class="gname">${slotName(g.slot)} +${g.level}${holder ? ` <span class="why">${holder}が使用中</span>` : ''}</div>${gearLines(g)}
          <div>${this.gain((x) => equipGear(x, g.id, id))}</div>
          <button class="btn" style="margin-top:4px;width:100%" data-a="${this.act(() => {
            equipGear(s, g.id, id);
            this.changed('付けかえた');
          })}">付ける</button></div>`;
      })
      .join('');
    return `
      <div class="row"><div class="grow muted">枠ごとに主な効果は決まっていて、副ステータスはランダム。強化すると伸びる。</div>
        <button class="btn" data-a="${best}" ${s.gear.length ? '' : 'disabled'}>いちばん良いのを付ける</button></div>
      <div class="gearslots">${slots}</div>
      ${detail}
      <div class="muted">${slotName(this.slot)}の装備（${s.gear.filter((g) => g.slot === this.slot).length}個）${s.gear.length ? '' : '：「夜の見回り」で手に入る'}</div>
      <div class="gearlist">${others}</div>`;
  }

  private gainEnhanceMain(g: GearPiece): string {
    const before = gearMainValue(g);
    const after = gearMainValue({ ...g, level: g.level + 1 });
    return `<span class="gain">${statName(g.main)} ${fmtStat(g.main, before)} → ${fmtStat(g.main, after)}</span>`;
  }
}

function statName(k: string): string {
  const n: Record<string, string> = { hp: 'HP', atk: '攻撃', def: '防御', spd: '素早さ', critRate: '会心率', critDmg: '会心ダメージ', atkPct: '攻撃%', hpPct: 'HP%' };
  return n[k] ?? k;
}
const slotName = (id: SlotId) => SLOTS.find((s) => s.id === id)!.name;

function gearLines(g: GearPiece): string {
  const main = `<div><b>${statName(g.main)} +${fmtStat(g.main, gearMainValue(g))}</b></div>`;
  const subs = g.subs.map((x) => `<div class="sub">${statName(x.stat)} +${fmtStat(x.stat, x.value)}</div>`).join('');
  return main + subs;
}
