import { makeRng } from '../battle/rng';
import { CHARACTERS } from '../data/characters';
import { BANNERS } from '../data/gacha';
import { CHECKLIST, CHECK_ITEMS } from '../data/checklist';
import { SLOTS } from '../data/gear';
import { ITEMS } from '../data/items';
import { MAPS } from '../data/maps';
import { QUESTS } from '../data/quests';
import { WEAPONS } from '../data/weapons';
import { GAME_DATA } from '../data';
import { clearErrors, readErrors } from '../dev/errlog';
import { simBoss, type SimStats } from '../dev/bossSim';
import { partyPower } from '../progress/growth';
import { makeGear } from '../progress/gear';
import { pityLeft } from '../progress/gacha';
import { LEVEL_CAPS } from '../progress/growth';
import { DEV_SAVE_KEY, SAVE_KEY, defaultSave, validateSave, type SaveData } from '../progress/save';
import { esc, toast } from './fmt';
import './devPanel.css';

// 開発用の「なんでもできるモード」。URL に ?dev を付けたときだけ出る（ふつうに遊ぶ人には見えない）。
// 保存はふつうのものと別（DEV_SAVE_KEY）。ふつうの進み具合はこわさない。
// 画面の左下の小さな「開発」ボタンで一覧を開く。どの操作も、ひとつ前にもどせる。
// 「確かめること」：まだスマホで確かめていないものの一覧（中身は src/data/checklist.ts、docs/check-list.md と同じ）。

/** URL に ?dev が付いているか */
export const isDevMode = (): boolean => typeof location !== 'undefined' && new URLSearchParams(location.search).has('dev');

/** 開発用の一覧から、ゲームの中を動かすための入り口 */
export interface DevApi {
  save: () => SaveData;
  setSave: (s: SaveData) => void;
  persist: () => void;
  /** いまの画面を作りなおす（拠点なら拠点、学校・街ならその場所） */
  refresh: () => void;
  // 戦い
  inBattle: () => boolean;
  battleEnd: (result: 'won' | 'lost') => void;
  enemiesToOne: () => void;
  setNoTrace: (on: boolean) => void;
  fillEnergy: () => void;
  /** 「確かめること」の「行く」（checklist.ts の go） */
  go: (where: string) => void;
  // 場所と時間
  goPlace: (mapId: string) => void;
  setTime: (t: 'morning' | 'lunch' | 'after' | 'night') => void;
}

const UNDO_MAX = 20;
const OPT_KEY = 'kaito-rpg-dev-options';
/** 「確かめること」の結果（開発用の保存。ふつうの保存とは別） */
const CHECK_KEY = 'kaito-rpg-dev-checks';
type CheckResult = { state: 'ok' | 'ng'; memo: string; at: string };

interface DevOptions {
  infiniteStone: boolean;
  infiniteItems: boolean;
  noTrace: boolean;
}

export function mountDevPanel(api: DevApi): void {
  const undo: string[] = [];
  let opts: DevOptions = { infiniteStone: false, infiniteItems: false, noTrace: false };
  try {
    opts = { ...opts, ...JSON.parse(localStorage.getItem(OPT_KEY) ?? '{}') };
  } catch {
    /* 読めなければ初期のまま */
  }
  const saveOpts = () => {
    try {
      localStorage.setItem(OPT_KEY, JSON.stringify(opts));
    } catch {
      /* 保存できなくても使える */
    }
  };
  const rng = makeRng(Date.now());
  let tab: 'tools' | 'checks' = 'checks';
  let checks: Record<string, CheckResult> = {};
  try {
    checks = JSON.parse(localStorage.getItem(CHECK_KEY) ?? '{}');
  } catch {
    /* 読めなければ空 */
  }
  const saveChecks = () => {
    try {
      localStorage.setItem(CHECK_KEY, JSON.stringify(checks));
    } catch {
      /* 保存できなくても使える */
    }
  };
  const remaining = () => CHECK_ITEMS.filter((it) => checks[it.id]?.state !== 'ok').length;
  let openId: string | null = null;
  let sim: { running: boolean; stop: boolean; done: number; total: number; stats: SimStats[]; team: string } = { running: false, stop: false, done: 0, total: 0, stats: [], team: '' };

  // 画面の端の「開発中」と、開くボタン
  const badge = document.createElement('div');
  badge.className = 'devbadge';
  badge.innerHTML = '<span>開発中</span><button>開発</button><em></em>';
  document.body.appendChild(badge);
  const badgeCount = () => {
    const n = remaining();
    (badge.querySelector('em') as HTMLElement).textContent = n ? `確かめること ${n}` : '';
  };
  badgeCount();
  const panel = document.createElement('div');
  panel.className = 'devpanel';
  document.body.appendChild(panel);
  badge.querySelector('button')!.addEventListener('click', () => {
    panel.classList.toggle('on');
    if (panel.classList.contains('on')) render();
  });

  /** 操作のまえに、いまの保存を写しておく（ひとつ前にもどす用） */
  const snap = () => {
    undo.push(JSON.stringify(api.save()));
    if (undo.length > UNDO_MAX) undo.shift();
  };
  const done = (msg: string) => {
    api.persist();
    api.refresh();
    toast(msg);
    render();
  };
  const fillItems = (s: SaveData, n: number) => {
    for (const k of Object.keys(ITEMS)) if (k !== 'stone') s.items[k] = Math.max(s.items[k] ?? 0, n);
  };

  // 「無限」：少なくなったら足しなおす
  window.setInterval(() => {
    const s = api.save();
    let changed = false;
    if (opts.infiniteStone && (s.items.stone ?? 0) < 50000) {
      s.items.stone = 99999;
      changed = true;
    }
    if (opts.infiniteItems && Object.keys(ITEMS).some((k) => k !== 'stone' && (s.items[k] ?? 0) < 500)) {
      fillItems(s, 9999);
      changed = true;
    }
    if (changed) api.persist();
    api.setNoTrace(opts.noTrace);
  }, 700);

  const actions: Record<string, () => void> = {
    stone: () => {
      snap();
      const s = api.save();
      s.items.stone = (s.items.stone ?? 0) + 10000;
      done('月の石 +10000');
    },
    items: () => {
      snap();
      const s = api.save();
      for (const k of Object.keys(ITEMS)) if (k !== 'stone') s.items[k] = (s.items[k] ?? 0) + (k === 'coin' ? 99999 : 999);
      done('材料とおこづかいを足した');
    },
    infStone: () => {
      opts.infiniteStone = !opts.infiniteStone;
      saveOpts();
      render();
    },
    infItems: () => {
      opts.infiniteItems = !opts.infiniteItems;
      saveOpts();
      render();
    },
    allChars: () => {
      snap();
      const s = api.save();
      let n = 0;
      for (const id of Object.keys(CHARACTERS)) {
        if (s.chars[id]) continue;
        s.chars[id] = { level: 5, exp: 0, asc: 0, skill: 1, weapon: null };
        n++;
      }
      done(`キャラを${n}人手に入れた`);
    },
    maxChars: () => {
      snap();
      const s = api.save();
      for (const c of Object.values(s.chars)) {
        c.asc = LEVEL_CAPS.length - 1;
        c.level = LEVEL_CAPS[LEVEL_CAPS.length - 1];
        c.exp = 0;
        c.skill = 10;
      }
      done('持っているキャラを最大にした（章の上限は無視）');
    },
    allWeapons: () => {
      snap();
      const s = api.save();
      for (const id of Object.keys(WEAPONS)) if (!s.weapons.includes(id)) s.weapons.push(id);
      done('武器を全部手に入れた');
    },
    gear5: () => {
      snap();
      const s = api.save();
      for (const slot of SLOTS) s.gear.push(makeGear(rng, s.nextGearId++, slot.id, 5));
      done('★5の装備を4つ足した');
    },
    unlockAll: () => {
      snap();
      const s = api.save();
      for (const id of Object.keys(GAME_DATA.encounters)) s.wins[id] = Math.max(1, s.wins[id] ?? 0);
      done('すべての戦いを解放した（勝った印をつけた）');
    },
    questsAccept: () => {
      snap();
      const s = api.save();
      for (const q of QUESTS) if (!s.questState[q.id]) s.questState[q.id] = 1;
      done('頼みごとを全部受けた');
    },
    questsReset: () => {
      snap();
      const s = api.save();
      s.questState = {};
      s.questBase = {};
      done('頼みごとを、まだ受けていない状態にした');
    },
    hiddenReset: () => {
      snap();
      const s = api.save();
      for (const k of Object.keys(s.flags)) if (k.startsWith('hidden_')) delete s.flags[k];
      done('隠し要素を、まだ見つけていない状態にした');
    },
    daily: () => {
      snap();
      const s = api.save();
      s.daily = {};
      s.talksToday = 0;
      done('きょうの回数（話す・買う・つり）をもどした');
    },
    win: () => (api.inBattle() ? api.battleEnd('won') : toast('戦いの中で使う')),
    lose: () => (api.inBattle() ? api.battleEnd('lost') : toast('戦いの中で使う')),
    hp1: () => (api.inBattle() ? api.enemiesToOne() : toast('戦いの中で使う')),
    energy: () => (api.inBattle() ? api.fillEnergy() : toast('戦いの中で使う')),
    noTrace: () => {
      opts.noTrace = !opts.noTrace;
      saveOpts();
      api.setNoTrace(opts.noTrace);
      render();
    },
    sim100: () => {
      if (sim.running) return;
      const save = api.save();
      sim = { running: true, stop: false, done: 0, total: 200, stats: [], team: teamText(save) };
      render(true);
      void simBoss(
        save,
        100,
        (done, total, stats) => {
          sim.done = done;
          sim.total = total;
          sim.stats = stats;
          const box = panel.querySelector('.dv-sim');
          if (box) box.innerHTML = simBody();
        },
        () => sim.stop,
      ).then((stats) => {
        sim.stats = stats;
        sim.running = false;
        const box = panel.querySelector('.dv-sim');
        if (box) box.innerHTML = simBody();
        else render(true);
      });
    },
    simStop: () => {
      sim.stop = true;
    },
    clearErr: () => {
      clearErrors();
      render(true);
    },
    undo: () => {
      const prev = undo.pop();
      if (!prev) return toast('もどせる操作がない');
      const s = validateSave(JSON.parse(prev));
      if (!s) return toast('もどせなかった');
      api.setSave(s);
      done('ひとつ前にもどした');
    },
    copyNormal: () => {
      let text: string | null = null;
      try {
        text = localStorage.getItem(SAVE_KEY);
      } catch {
        /* 読めない */
      }
      const s = text ? validateSave(JSON.parse(text)) : null;
      if (!s) return toast('ふつうの保存データがない');
      snap();
      api.setSave(s);
      done('ふつうのデータを写して始めた（ふつうのデータはそのまま）');
    },
    clearDev: () => {
      snap();
      try {
        localStorage.removeItem(DEV_SAVE_KEY);
      } catch {
        /* 消せなくても続ける */
      }
      api.setSave(defaultSave());
      done('開発用データを消して、はじめからにした');
    },
  };

  const place = (id: string) => {
    api.goPlace(id);
    panel.classList.remove('on');
  };
  const time = (t: 'morning' | 'lunch' | 'after' | 'night') => {
    snap();
    api.setTime(t);
    panel.classList.remove('on');
  };

  panel.addEventListener('click', (ev) => {
    const t = (ev.target as HTMLElement).closest('button') as HTMLButtonElement | null;
    if (!t) return;
    if (t.dataset.tab) {
      tab = t.dataset.tab as 'tools' | 'checks';
      render();
      return;
    }
    if (t.dataset.open) {
      openId = openId === t.dataset.open ? null : t.dataset.open;
      render(true);
      return;
    }
    if (t.dataset.go) {
      panel.classList.remove('on');
      api.go(t.dataset.go);
      return;
    }
    if (t.dataset.check) {
      const [id, state] = t.dataset.check.split(':');
      if (state === 'clear') delete checks[id];
      else {
        const memo = (panel.querySelector(`textarea[data-memo="${id}"]`) as HTMLTextAreaElement | null)?.value ?? checks[id]?.memo ?? '';
        checks[id] = { state: state as 'ok' | 'ng', memo: state === 'ng' ? memo : '', at: new Date().toISOString().slice(0, 16).replace('T', ' ') };
      }
      saveChecks();
      badgeCount();
      // 押した場所にとどまり、次のまだ確かめていない項目を開く
      if (state !== 'clear') {
        const i = CHECK_ITEMS.findIndex((x) => x.id === id);
        const next = [...CHECK_ITEMS.slice(i + 1), ...CHECK_ITEMS.slice(0, i)].find((x) => !checks[x.id]);
        openId = next?.id ?? null;
      }
      render(true);
      return;
    }
    if (t.dataset.dev) actions[t.dataset.dev]?.();
    else if (t.dataset.place) place(t.dataset.place);
    else if (t.dataset.time) time(t.dataset.time as 'morning' | 'lunch' | 'after' | 'night');
    else if (t.dataset.close) panel.classList.remove('on');
  });

  panel.addEventListener('input', (ev) => {
    const t = ev.target as HTMLTextAreaElement;
    const id = t.dataset.memo;
    if (!id || !checks[id]) return;
    checks[id].memo = t.value;
    saveChecks();
  });

  /** 「確かめること」の一覧 */
  function renderChecks(): string {
    const n = remaining();
    const groups = CHECKLIST.map((g) => {
      const rows = g.items
        .map((it) => {
          const r = checks[it.id];
          const mark = r?.state === 'ok' ? '<span class="ck ok">できた</span>' : r?.state === 'ng' ? '<span class="ck ng">おかしい</span>' : '<span class="ck">まだ</span>';
          const open = openId === it.id;
          const body = open
            ? `<div class="ck-body">
                <div class="ck-l">やり方</div><ol>${it.how.map((h) => `<li>${esc(h)}</li>`).join('')}</ol>
                <div class="ck-l">こうなれば正しい</div><div class="ck-ok">${esc(it.ok)}</div>
                <div class="ck-btns">${it.go ? `<button data-go="${it.go}">行く：${esc(it.goLabel ?? '')}</button>` : ''}
                  <button data-check="${it.id}:ok" class="okb">できた</button><button data-check="${it.id}:ng" class="ngb">おかしい</button>
                  ${r ? `<button data-check="${it.id}:clear">まだにもどす</button>` : ''}</div>
                <textarea data-memo="${it.id}" placeholder="おかしいときは、ひとことメモ（どこで・どうなった）">${esc(r?.memo ?? '')}</textarea>
                ${r ? `<div class="dv-note">記録：${r.at}</div>` : ''}
              </div>`
            : '';
          return `<div class="ck-item${open ? ' open' : ''}"><button class="ck-title" data-open="${it.id}">${mark}${esc(it.title)}</button>${body}</div>`;
        })
        .join('');
      return `<section class="ck-group"><h3>${esc(g.name)}</h3>${rows}</section>`;
    }).join('');
    return `<div class="dv-note">まだ確かめていない（できた以外）：<b>${n}</b> / ${CHECK_ITEMS.length}　項目を押すと、やり方が開く。結果は開発用の保存に残る。</div>${groups}`;
  }

  /** 作りなおす。keep＝いまのスクロールの位置にとどまり、開いた項目が見えるようにする */
  function render(keep = false): void {
    const body = panel.querySelector('.dv-body') as HTMLElement | null;
    const top = body?.scrollTop ?? 0;
    draw();
    if (!keep) return;
    const nb = panel.querySelector('.dv-body') as HTMLElement | null;
    if (nb) nb.scrollTop = top;
    const open = panel.querySelector('.ck-item.open') as HTMLElement | null;
    open?.scrollIntoView({ block: 'nearest' });
  }

  /** ボス戦の試し（端末の上で、少しずつ回す） */
  function teamText(save: SaveData): string {
    const ids = [...save.party, ...Object.keys(save.chars).filter((id) => CHARACTERS[id]?.ura && !save.party.includes(id))];
    const names = ids.map((id) => `${CHARACTERS[id]?.name ?? id} Lv${save.chars[id]?.level ?? '?'}`).join('・');
    return `${names}（チーム戦力 ${partyPower(save)}）`;
  }
  function simBody(): string {
    const pct = (x: number) => `${Math.round(x * 100)}%`;
    const head = sim.running
      ? `<div class="dv-note">回しています… ${sim.done}/${sim.total}　<button data-dev="simStop">やめる</button></div>`
      : `<button data-dev="sim100">黒金（金庫室の番人）と100回ずつ戦う</button>`;
    const team = sim.team ? `<div class="dv-note">チーム：${esc(sim.team)}</div>` : '<div class="dv-note">今の編成・レベル・突破・技・武器・装備・絆のまま、自動で戦う。裏が自動のときと、裏を手で遊んだのに近いとき（自分でねらい・光をよける）の2通り。</div>';
    const rows = sim.stats
      .filter((st) => st.runs > 0)
      .map((st: SimStats) => {
        const losses = st.runs - st.wins;
        const name = st.ura === 'auto' ? '裏も自動' : '裏を手で遊んだ近さ';
        const lossText = losses
          ? `負け ${losses}回：平均 ${Math.round(st.lossTurns)}ターン、ボスまで行けた ${pct(st.lossReachedBoss)}${st.lossReachedBoss > 0 ? `、そのときボスの残りHP 平均 ${pct(st.lossBossHp)}` : ''}。負けた群れ ${st.lossWave.map((n, i) => `${i + 1}つめ:${n}`).join(' ')}`
          : '負けなし';
        return `<div class="dv-row"><b>${name}：勝率 ${pct(st.wins / st.runs)}</b>（${st.wins}/${st.runs}）　1回の平均 ${Math.round(st.avgTurns)}ターン<br>${lossText}</div>`;
      })
      .join('');
    return head + team + rows;
  }

  /** 不具合の記録（新しい順に5件）。固まったときの手がかり */
  function errSection(): string {
    const all = readErrors();
    const list = all.slice(-5).reverse();
    const rows = list
      .map(
        (e) =>
          `<div class="dv-err"><b>${esc(e.at)}［${esc(e.where)}］</b> ${esc(e.msg)}${e.state ? `<pre>${esc(JSON.stringify(e.state))}</pre>` : ''}${e.stack ? `<pre>${esc(e.stack)}</pre>` : ''}</div>`,
      )
      .join('');
    return `<section style="grid-column:1/-1"><h3>不具合の記録（${all.length}件・端末の中だけ）</h3>${rows || '<div class="dv-note">記録はありません</div>'}${list.length ? '<button data-dev="clearErr">記録を消す</button>' : ''}</section>`;
  }

  function draw(): void {
    const s = api.save();
    const b = (id: string, label: string, on?: boolean) => `<button data-dev="${id}" class="${on ? 'on' : ''}">${label}</button>`;
    const gacha = Object.values(BANNERS)
      .map((x) => `<div class="dv-row">「${esc(x.name)}」：★5 ${(x.rate5 * 100).toFixed(1)}%（あと<b>${pityLeft(s, x.id)}</b>回で確定／${x.pity5}回）　★4 ${(x.rate4 * 100).toFixed(1)}%（${x.pity4}回ごと）</div>`)
      .join('');
    const zones = Object.values(MAPS)
      .map((m) => `<button data-place="${m.id}">${esc(m.id === 'mansion' ? '黒金邸（夜）' : m.name)}</button>`)
      .join('');
    const tabs = `<button data-tab="checks" class="${tab === 'checks' ? 'on' : ''}">確かめること ${remaining()}</button><button data-tab="tools" class="${tab === 'tools' ? 'on' : ''}">道具</button>`;
    if (tab === 'checks') {
      panel.innerHTML = `
        <div class="dv-head"><b>開発用</b>${tabs}<span></span><button data-close="1">閉じる</button></div>
        <div class="dv-body checks">${renderChecks()}</div>`;
      return;
    }
    panel.innerHTML = `
      <div class="dv-head"><b>開発用</b>${tabs}<span>保存は「開発用データ」（ふつうのデータとは別）</span><button data-close="1">閉じる</button></div>
      <div class="dv-body">
        ${errSection()}
        <section style="grid-column:1/-1"><h3>ボス戦の勝率（今のチームのまま、自動で100回ずつ）</h3><div class="dv-sim">${simBody()}</div></section>
        <section><h3>もどす・データ</h3>
          ${b('undo', `ひとつ前にもどす（${undo.length}）`)}${b('copyNormal', 'ふつうのデータを写して始める')}${b('clearDev', '開発用データを消す')}
        </section>
        <section><h3>ガチャ</h3>
          ${b('stone', '月の石 +10000')}${b('infStone', `月の石を無限：${opts.infiniteStone ? 'オン' : 'オフ'}`, opts.infiniteStone)}
          <div class="dv-note">月の石 ${s.items.stone ?? 0}</div>${gacha}
        </section>
        <section><h3>育成</h3>
          ${b('items', '材料・おこづかいを大量に足す')}${b('infItems', `材料を無限：${opts.infiniteItems ? 'オン' : 'オフ'}`, opts.infiniteItems)}
          ${b('allChars', 'キャラを全員手に入れる')}${b('maxChars', 'レベル・技・突破を最大に')}
          ${b('allWeapons', '武器を全部')}${b('gear5', '★5の装備を足す')}
        </section>
        <section><h3>戦い（戦いの中で）</h3>
          ${b('win', 'すぐ勝つ')}${b('lose', 'すぐ負ける')}${b('hp1', '敵の体力を1に')}${b('energy', 'ゲージを満タンに')}${b('noTrace', `裏の追跡ゲージを止める：${opts.noTrace ? 'オン' : 'オフ'}`, opts.noTrace)}
        </section>
        <section><h3>解放</h3>
          ${b('unlockAll', '戦いを全部解放')}${b('questsAccept', '頼みごとを全部受ける')}${b('questsReset', '頼みごとを元にもどす')}${b('hiddenReset', '隠し要素を元にもどす')}${b('daily', 'きょうの回数をもどす')}
        </section>
        <section><h3>時間帯</h3>
          <button data-time="morning">朝</button><button data-time="lunch">昼休み</button><button data-time="after">放課後</button><button data-time="night">夜（拠点）</button>
        </section>
        <section><h3>好きな場所へ飛ぶ</h3>${zones}</section>
      </div>`;
  }
}
