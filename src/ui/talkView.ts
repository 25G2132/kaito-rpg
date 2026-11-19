import { CHARACTERS } from '../data/characters';

// 会話の画面（下に名前と文の箱）。文字は1文字ずつ出る。
// タップ：文字が出ている途中なら全部出す、出し終わっていれば次へ。最後に「絆が上がった」などを出す。
// lines は [名前, 文, 名前, 文, …] の並び。

const CHAR_MS = 38; // 1文字にかける時間
const PUNCT_MS = 180; // 「。」「、」「…」のあとは少し間をあける

const colorOf = (name: string): string => Object.values(CHARACTERS).find((c) => c.name === name)?.look.color ?? '#cfd5ea';

export function showTalk(lines: string[], after: string | null): Promise<void> {
  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.className = 'talk';
    root.innerHTML = '<div class="talk-box"><div class="talk-name"></div><div class="talk-text"></div><div class="talk-next">▼</div></div>';
    document.body.appendChild(root);
    const name = root.querySelector('.talk-name') as HTMLElement;
    const text = root.querySelector('.talk-text') as HTMLElement;
    const next = root.querySelector('.talk-next') as HTMLElement;
    let i = 0;
    let timer = 0;
    let full = '';
    let shown = 0;
    let typing = false;

    const finishLine = () => {
      window.clearTimeout(timer);
      typing = false;
      text.innerHTML = full;
      next.style.visibility = 'visible';
    };
    const type = () => {
      // HTML のしるし（<b> など）は1文字ずつにしない
      if (full[shown] === '<') shown = full.indexOf('>', shown) + 1;
      else shown++;
      text.innerHTML = full.slice(0, shown);
      if (shown >= full.length) return finishLine();
      const ch = full[shown - 1];
      timer = window.setTimeout(type, '。、！？…'.includes(ch) ? PUNCT_MS : CHAR_MS);
    };
    const start = (who: string, body: string, color: string) => {
      name.textContent = who;
      name.style.background = color;
      full = body;
      shown = 0;
      typing = true;
      text.innerHTML = '';
      next.style.visibility = 'hidden';
      type();
    };
    const advance = () => {
      if (typing) return finishLine();
      if (i < lines.length) {
        start(lines[i], lines[i + 1] ?? '', colorOf(lines[i]));
        i += 2;
        return;
      }
      if (after) {
        start('絆', after, '#ffd25a');
        after = null;
        return;
      }
      root.remove();
      resolve();
    };
    root.addEventListener('click', advance);
    advance();
  });
}
