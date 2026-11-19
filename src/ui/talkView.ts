import { CHARACTERS } from '../data/characters';

// 会話の画面（下に名前と文の箱）。タップで次へ。最後に「絆が上がった」などを出す。
// lines は [名前, 文, 名前, 文, …] の並び。

const colorOf = (name: string): string => Object.values(CHARACTERS).find((c) => c.name === name)?.look.color ?? '#ffffff';

export function showTalk(lines: string[], after: string | null): Promise<void> {
  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.className = 'talk';
    root.innerHTML = '<div class="talk-box"><div class="talk-name"></div><div class="talk-text"></div><div class="talk-next">▼ タップ</div></div>';
    document.body.appendChild(root);
    const name = root.querySelector('.talk-name') as HTMLElement;
    const text = root.querySelector('.talk-text') as HTMLElement;
    let i = 0;
    const show = () => {
      if (i < lines.length) {
        name.textContent = lines[i];
        name.style.background = colorOf(lines[i]);
        text.textContent = lines[i + 1] ?? '';
        i += 2;
        return;
      }
      if (after) {
        name.textContent = '絆';
        name.style.background = '#ffd25a';
        text.innerHTML = after;
        after = null;
        return;
      }
      root.remove();
      resolve();
    };
    root.addEventListener('click', show);
    show();
  });
}
