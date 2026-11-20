# 1枚絵を描くAIの比べ（段階6の前）

2026-11-20。ガチャで当たったときと、物語の大事な場面の1枚絵に使う。決めるのはユーザー。

## 比べる点

1. **同じキャラを同じ顔で描き続けられるか**（VRoid の3Dキャラの画面写真を、見本として読ませられるか）
2. **公開するゲームに使ってよい条件か**（有料プランが要るか、ほかの人の作ったモデルの条件がつかないか）
3. アニメ・ゲームの絵が得意か

## 候補

| AI | 同じ顔で描き続ける | 公開ゲームに使う条件 | アニメの絵 | ひとこと |
|---|---|---|---|---|
| **NovelAI** | ◎ 「Character Reference」「Precise Reference」でキャラを固定できる（公式の説明あり）。ただし Vibe Transfer とは同時に使えない、1枚に見本は1つ | △ 運営は生成画像の著作権を主張しない、という紹介はあるが、規約の原文は未確認 | ◎ アニメ専門 | アニメ絵でキャラを固定するなら第一候補 |
| **Gemini の画像（Nano Banana）** | ◎ 見本を何枚も読ませられ（最大14枚という紹介）、顔が安定しているという比べが多い | △ 規約の確認が要る | ○ なんでも描ける | VRoid の画面写真を何枚も見本にするのに向く |
| **Leonardo AI** | ○ キャラを固定するしくみ、ポーズの指定 | ○ 商用は有料プランのみ | ○ アニメ向けのモデルあり | ほどほどにそろっている |
| **PixAI** | ○ 「Reference Pro」で顔を保ったまま描き直せる | △ ほかの人のモデル（LoRA）には別の条件がつくことがある | ◎ アニメ専門 | モデル選びに注意 |
| **ChatGPT の画像（GPT Image）** | △〜○ 比べによって評価が分かれる（顔の形が変わりやすいという声も） | △ 規約の確認が要る | ○ | 文字入りの絵に強い |
| **Midjourney（Niji 7）** | △ キャラを固定する方法が版ごとに変わり、苦手という声が多い | ○ 有料プランから商用可（無料の試しは不可） | ◎ アニメ向けの Niji | 絵はきれいだが、同じ顔が続きにくい |

※ ほとんどが紹介記事の情報で、記事どうしで食いちがうところもある。**使う前に、そのAIの今の規約を必ず原文で確かめる。**
※ 見本に使う絵は、自分たちで作ったもの（VRoid のキャラ）だけにする。ほかの作品のキャラを見本にしない。

## 決めたこと（2026-11-20）

**Gemini（Nano Banana）を使う。** 2つでためして、顔・髪・服がよくそろい、いまの Plus のまま横長で描けたため。NovelAI は無料が30回までで、続けるには有料が要る。

## おすすめ

**NovelAI と Gemini（Nano Banana）の2つで、同じ見本・同じ指示文をためして、ユーザーが選ぶ。**

- NovelAI：アニメ絵が得意で、キャラを固定するしくみが公式にある。
- Gemini：VRoid の画面写真を何枚も見本にでき、顔が安定しやすい。
- **ためし方と指示文は [image-ai-trial.md](image-ai-trial.md)**（2026-11-20、規約を原文で確かめた。2つとも見本を読ませるには18歳以上が要る）。
- ためし方（はじめの案）：主人公（女の子）の VRoid 画面写真（正面・横・ななめ）を見本にして、「ガチャで当たったときの1枚絵」を3枚ずつ描かせ、顔がそろうか・ゲームに合うかを見る。指示文は Claude が書く。

## 出典

- [The Best AI Image Generators for Anime Characters in 2026（OpenArt）](https://openart.ai/blog/best-ai-image-generators-for-anime/)
- [Best AI Anime Generators for Consistent Characters (2026)（Neolemon）](https://www.neolemon.com/blog/best-ai-image-generator-for-anime/)
- [Best AI Image Generator for Anime (2026)（Nesyona）](https://nesyona.com/articles/best-ai-image-generator-for-anime)
- [Mage Blog：consistent anime characters 2026](https://blog.mage.space/article/best-ai-tools-consistent-anime-characters-2026/06d84613-d377-459c-81ce-2db6c4943735)
- [NovelAI 公式：Character Reference](https://docs.novelai.net/en/image/characterreference)
- [NovelAI 公式：Precise Reference](https://docs.novelai.net/en/image/precisereference)
- [NovelAI 公式：Vibe Transfer](https://docs.novelai.net/en/image/vibetransfer)
- [NovelAI の著作権と商用利用（Yoom）](https://lp.yoom.fun/blog-posts/novelai-copyright-guide-and-commercial-use-rules)
- [Midjourney complete guide 2026](https://ai-video-bootcamp.pages.dev/blog/midjourney-complete-guide-2026)
- [Midjourney Commercial Use Rights 2026（terms.law）](https://terms.law/2026/01/15/midjourney-commercial-use-rights-complete-2026-guide/)
- [Leonardo AI：商用は有料プラン（ConductAtlas）](https://conductatlas.com/platform/leonardo-ai/leonardo-ai-terms-of-service/commercial-use-rights-tied-to-subscription-tier/)
- [Nano Banana 2 vs GPT Image 2（OpenArt）](https://openart.ai/blog/gpt-image-2-vs-nano-banana-2/)
- [Nano Banana 2 vs ChatGPT Images 2.0（Morphic）](https://morphic.com/resources/how-to/nano-banana-2-vs-chatgpt-images-2-0-comparison)
- [ChatGPT Images vs Nano Banana（Tom's Guide）](https://www.tomsguide.com/ai/ai-image-video/i-tested-the-new-chatgpt-images-vs-googles-nano-banana-the-winner-surprised-me)
- [Best AI character consistency tools in 2026（Ropewalk）](https://ropewalk.ai/blog/best-ai-tools-for-character-consistency-2026)
