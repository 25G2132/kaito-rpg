// 不具合の記録。画面が固まったときの手がかりを残す。
// 記録は端末の中（localStorage）だけ。どこにも送らない。開発用モード（?dev）の「道具」で見られる。

export const ERR_KEY = 'kaito-rpg-errors';
const MAX = 20;

export interface ErrEntry {
  at: string; // いつ（端末の時刻）
  where: string; // どこで（frame＝毎コマ、battle＝戦いの流れ、stall＝止まった、window＝そのほか）
  msg: string;
  stack?: string;
  state?: Record<string, unknown>; // そのときの戦いのようす
}

const listeners: ((e: ErrEntry) => void)[] = [];

export function readErrors(): ErrEntry[] {
  try {
    const v = JSON.parse(localStorage.getItem(ERR_KEY) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function clearErrors(): void {
  try {
    localStorage.removeItem(ERR_KEY);
  } catch {
    /* 消せなくても進める */
  }
}

/** 記録が増えたときに知らせてほしい（画面の小さな知らせ用） */
export function onError(fn: (e: ErrEntry) => void): void {
  listeners.push(fn);
}

let lastMsg = '';
let lastAt = 0;

export function recordError(where: string, err: unknown, state?: Record<string, unknown>): void {
  const e = err instanceof Error ? err : new Error(String(err));
  const msg = e.message || String(err);
  // 同じものが毎コマ続くときは、2秒に1回だけ残す
  const now = Date.now();
  if (msg === lastMsg && now - lastAt < 2000) return;
  lastMsg = msg;
  lastAt = now;
  const entry: ErrEntry = {
    at: new Date().toLocaleString('ja-JP'),
    where,
    msg,
    stack: e.stack?.split('\n').slice(0, 6).join('\n'),
    state,
  };
  console.error(`[${where}]`, err, state ?? '');
  try {
    const list = readErrors();
    list.push(entry);
    while (list.length > MAX) list.shift();
    localStorage.setItem(ERR_KEY, JSON.stringify(list));
  } catch {
    /* 保存できなくても進める */
  }
  for (const fn of listeners) {
    try {
      fn(entry);
    } catch {
      /* 知らせの失敗は無視 */
    }
  }
}

let installed = false;
/** 拾われなかったエラーも記録する */
export function installErrorHooks(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', (ev) => recordError('window', ev.error ?? ev.message));
  window.addEventListener('unhandledrejection', (ev) => recordError('promise', ev.reason));
}
