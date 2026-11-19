// 頼みごと（クエスト）。学校の生徒や先生から受けて、解決するとごほうび。文は仮（段階7で直す）。

export type QuestGoal =
  | { kind: 'defeat'; enemy: string; count: number } // 受けてから、その敵を何体倒すか
  | { kind: 'find'; hidden: string } // 解析レンズで見つける
  | { kind: 'win'; encounter: string } // その戦いに勝つ
  | { kind: 'notebook'; count: number }; // 怪盗手帳をいくつ埋めるか

export interface QuestDef {
  id: string;
  giver: string; // 頼む人（学校の NpcDef の id）
  title: string;
  desc: string;
  goal: QuestGoal;
  reward: Record<string, number>;
  ask: string[][]; // 頼まれるときの会話（[名前, 文, …]）
  thanks: string[]; // 解決したときの会話
}

export const QUESTS: QuestDef[] = [
  {
    id: 'q_rumor_drone',
    giver: 'classmateA',
    title: 'うわさのドローン',
    desc: '夜の屋敷のドローンを3体倒す',
    goal: { kind: 'defeat', enemy: 'drone', count: 3 },
    reward: { book: 3 },
    ask: [['クラスメイト', 'ねえ、夜の屋敷のドローン、3体やっつけたら真相がわかるらしいよ。', 'アカリ', '……なんでそんなうわさが。']],
    thanks: ['クラスメイト', 'ほんとにやったの！？　お礼に、この参考書あげる！'],
  },
  {
    id: 'q_library_book',
    giver: 'librarian',
    title: 'だれも借りない本',
    desc: '図書室のいちばん奥の棚で、レンズを使って探す',
    goal: { kind: 'find', hidden: 's_library' },
    reward: { note: 2, parts: 5 },
    ask: [['図書委員', 'いちばん奥の棚の本、ずっと気になっていて……。探してもらえませんか？']],
    thanks: ['図書委員', '本当にあったんですね。……ありがとうございます。'],
  },
  {
    id: 'q_gym_light',
    giver: 'basket',
    title: '体育館の裏の光',
    desc: '体育館の奥で、光る何かを解析レンズで探す',
    goal: { kind: 'find', hidden: 's_gym' },
    reward: { parts: 12 },
    ask: [['バスケ部の先輩', '体育館の裏で光ってるやつ、見つけたら教えてくれよ！']],
    thanks: ['バスケ部の先輩', 'それだったのか！　お礼にこれやるよ。'],
  },
  {
    id: 'q_vault',
    giver: 'shop',
    title: '買い占められたパン',
    desc: '黒金邸の「金庫室の番人」に勝つ',
    goal: { kind: 'win', encounter: 'vault' },
    reward: { blueprint: 4 },
    ask: [['購買の店員さん', '黒金社長の屋敷の金庫……あそこにうちのパン代も眠ってる気がするのよねえ。', 'アカリ', '（……怪盗の出番かも）']],
    thanks: ['購買の店員さん', 'なんだか今日は、気分が晴れやかでねえ。これ、おまけよ。'],
  },
  {
    id: 'q_notebook',
    giver: 'teacher',
    title: '先生の宿題',
    desc: '怪盗手帳を5つ以上うめる',
    goal: { kind: 'notebook', count: 5 },
    reward: { key: 3 },
    ask: [['担任の先生', '生き物図鑑みたいな手帳？　5ページ以上うまったら見せてくれ。宿題だ。']],
    thanks: ['担任の先生', 'よく調べたな。……夜ふかしはほどほどにな。'],
  },
];
