# 1枚絵のAIのためし方（NovelAI と Gemini）

2026-11-20。[image-ai-comparison.md](image-ai-comparison.md) のおすすめ2つを、同じ指示文でためして選ぶための手引き。
絵を描かせる作業はユーザー。指示文と、できた絵をゲームに入れるのは Claude。

## 1. 先に知っておくこと（規約を原文で確かめた結果）

### NovelAI（規約：2025年12月8日から有効、https://novelai.net/terms ）
- **18歳以上でないと使えない**（5.2）。
- 作った絵は「あなたのもの」で、運営は持ち主だと言わない（1.3・1.4）。
- ただし、**ゲームに使ってよいか（商用）は、規約にははっきり書いていない**。
- 有料の月払いが要るサービスがある（1.5）。無料でためせるかは規約に書いていない。
- 見本に読ませた絵は、しばらく暗号化して置かれ、あとで自動で消える（6.10）。

### Gemini の画像（Nano Banana）
- Google は、作った絵の持ち主だと言わない（Google 利用規約、2026年7月30日から有効）。
- ただし、**公開してよいとはっきり書いた文はない**。「使う前に自分で判断して」「他人の権利をおかさない」とある。
- **絵を作るのは13歳以上、絵を直す（見本の絵を読ませて描き直す）のは18歳以上**（Gemini のヘルプ）。
- 目に見える透かしが入る。設定の「Media Watermark」で消せる地域が多い（インド・韓国・ベトナムは AI Ultra のみ）。目に見えない透かし（SynthID）は消せない。
- 会話の一部は人が見ることがある。設定によっては AI の学習に使われる（読ませた画像もふくむ）。
  - → ためす前に、Gemini の「アクティビティ（学習に使う設定）」を切っておく。

### まとめ
- **2つとも、見本の絵を読ませて描かせるには18歳以上が要る。** 18歳未満なら、家の人に相談する。または、Gemini で文だけで描かせる（見本なし）にとどめる。
- 2つとも「ゲームに使ってよい」とまでは書いていない。だから、無料で公開するゲームに入れる前に、もう一度だけ規約を見直す。
- 見本に使うのは、自分たちで作った絵だけ。ほかの作品のキャラや、配布されている VRoid の見本キャラ（いま入れている sample-a など）は使わない。

## 2. ためし方

まだ自分で作った VRoid のキャラがないので、**まず文だけで「設定画」を1枚描かせ、それを見本にして続きを描かせる**。

1. **設定画**：下の「設定画の指示文」で、ツバキの全身の正面を描かせる。いちばん気に入った1枚を選ぶ。
2. **1枚絵を3枚**：その設定画を見本にして、「ガチャで当たったときの1枚絵の指示文」で3枚描かせる。
3. 同じことを、もう一方のAIでもする（指示文は同じ）。
4. 下の表で点をつけて、使うAIを決める。
5. いちばんよい1枚を Claude にわたす（ファイルを送るだけでよい）。Claude が大きさをそろえて、ゲームに入れる。

### 点のつけ方（1〜3点）

| 見るところ | NovelAI | Gemini |
|---|---|---|
| 3枚とも同じ人に見えるか（顔・髪・目の色） | | |
| 服と刀が設定どおりか | | |
| ゲームの雰囲気（夜・怪盗・学園）に合うか | | |
| 横長で、左下に名前を置ける余白があるか | | |
| 手や指がこわれていないか | | |
| 描き直しの手間（少ないほど高い） | | |

## 3. 指示文（ツバキ：★5・影のアタッカー）

ツバキの見た目（このゲームのために決めたもの）：
17歳くらい。長い黒髪で、内側だけ深い紫。低い位置のひとつ結びに、赤い椿の髪かざり。紫の目。落ち着いた、少し冷たい表情。
紺色の短いコートの下に、学校の制服ふうの服。黒い手袋。片刃の細い刀（刃が月の光のように青白く光る）。足もとから黒い影がゆらめく。

### Gemini（文で書く）

**設定画**
```
Original anime-style character design sheet, full body, front view, plain light gray background.
A 17-year-old girl named Tsubaki, a phantom thief. Long straight black hair with a deep violet inner layer,
tied in a low ponytail with a red camellia hair ornament. Violet eyes, calm and slightly cool expression.
Short dark navy coat over a modern school-uniform-style outfit, black gloves, black tights, short boots.
She holds a slim single-edged katana whose blade glows pale moonlight blue. Faint black shadow wisps at her feet.
Clean line art, soft cel shading, game character concept art. No text, no logo, no watermark.
```

**ガチャで当たったときの1枚絵**（設定画を読ませてから）
```
Use the attached image as the character reference. Keep her face, hairstyle, hair colors, eye color and outfit exactly the same.
Landscape 16:9 key art for a mobile RPG gacha reveal. Night, a rooftop of a western-style mansion under a large full moon.
Tsubaki leaps forward drawing her glowing katana, black shadows spreading behind her like wings, camellia petals in the wind.
Place her in the right two-thirds of the frame and keep the lower-left corner darker and calm (space for the name text).
Dramatic rim light from the moon, purple and deep blue palette with a little red from the camellia.
High-quality anime illustration. No text, no logo, no watermark.
```

### NovelAI（言葉を並べる書き方）

**設定画**（大きさは「縦長」）
```
1girl, solo, original, full body, standing, front view, simple background, light gray background,
long hair, straight hair, black hair, inner hair violet, low ponytail, red camellia hair ornament,
violet eyes, calm, expressionless, short dark navy coat, school uniform, black gloves, black pantyhose, short boots,
holding katana, single-edged sword, glowing blade, pale blue light, black shadow aura at feet,
character design, clean lineart, cel shading
```
**入れたくないもの（Undesired Content）**
```
text, logo, watermark, signature, extra fingers, bad hands, multiple girls
```

**ガチャで当たったときの1枚絵**（大きさは **Landscape（1216×832）** に変える。最初は縦長 832×1216 になっているので注意。設定画を Character Reference に入れる）
```
1girl, solo, original, dynamic pose, leaping, drawing sword, glowing katana, pale blue light,
long black hair, inner hair violet, low ponytail, red camellia hair ornament, violet eyes, serious,
short dark navy coat, black gloves,
night, rooftop, western mansion, huge full moon, moonlight, rim lighting, black shadows spreading like wings,
camellia petals, wind, purple and dark blue theme, from side, cinematic, key visual,
character on right side, dark empty space bottom left
```

## 3.5 1回目をためした結果（2026-11-20）

- **Gemini**：設定画と1枚絵で顔・髪・服がよくそろった。横長（1024×572）で出る。ただ、人物がまん中で、左下に家が描かれて名前の余白はなかった。
- **NovelAI**：設定画の絵はとてもきれい。1枚絵は縦長のまま出た（大きさの切りかえ忘れ）。「影が翼のように」を本物の黒い羽にし、目が髪の影でかくれた。
- 次は：NovelAI は横長＋設定画を Character Reference に入れてもう一度。Gemini は「人物を右に、左下は暗い空だけ」と言い直す。
- 文の直し：NovelAI は `black shadows spreading like wings` をやめて `black smoke, shadow tendrils` にし、`looking at viewer, visible eyes` を足す。

## 4. ゲームに入れるときの決まり（Claude がする）

- 置き場所：`public/art/gacha/<キャラのid>.webp`（ツバキなら `tsubaki.webp`）。
- 大きさ：横1280×縦720。WebP で、1枚300KBくらいまで（S26 で軽く出すため）。
- ファイルがあれば、★5 が出たときに画面いっぱいに出し、名前を左下に置く。なければ、いままでの頭文字のまま。
- 入れた絵は、どのAIで、いつ作ったかを `docs/credits.md`（段階8で作る素材の一覧）に書く。

## 5. あとで同じ形で作るもの

- ミナト・レイ（★4）の1枚絵（★4 はカードだけなので、急がない）。
- 主人公2人の設定画。題名・名前・能力（段階7）が決まってから。VRoid でキャラを作るときの見本にもなる。
