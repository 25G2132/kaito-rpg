// 材料。戦いで手に入り、育成に使う。
export interface ItemDef {
  id: string;
  name: string;
  desc: string;
  color: string;
}

export const ITEMS: Record<string, ItemDef> = {
  book: { id: 'book', name: '参考書', desc: '使うと経験値 +500（レベルが上がる）', color: '#7ab8ff' },
  key: { id: 'key', name: '鍵の欠片', desc: 'レベルの上限を上げる「突破」に使う', color: '#ffd84a' },
  note: { id: 'note', name: '技の手帳', desc: '技レベルを上げる', color: '#5ef0a0' },
  parts: { id: 'parts', name: '部品', desc: '装備を強くする', color: '#c9cfe0' },
  blueprint: { id: 'blueprint', name: '設計図の切れ端', desc: '武器を作る', color: '#ff9a6a' },
};

export const BOOK_EXP = 500;
