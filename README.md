# ポケットあそび場

友だちとそれぞれのスマホで遊べるミニゲーム集です。部屋をつくって招待リンク（またはQRコード）を送るだけで、同じ部屋で一緒に遊べます。

- じゃんけん（2〜8人）
- 反射神経（1〜8人）
- 連打バトル（1〜8人）
- ○×ゲーム（2人対戦＋観戦）
- やみ鍋（2人対戦＋観戦。1人ならコンピュータと対戦。効果音つき）
- おべんとう はんぶんこ（2人対戦＋観戦。1人ならコンピュータと対戦。おかずを分けて弁当箱に詰めるパズル。[説明](docs/OBENTO.md)）
- 山分けの掟（2人対戦＋観戦。1人ならコンピュータと対戦。うそOKの海賊の山分け。[説明](docs/YAMAWAKE.md)）

ビルドは不要です。HTML / CSS / JavaScript のファイルをそのまま配信します。

## しくみ

| 役割 | 使っているもの |
| --- | --- |
| ページを置く | Vercel（静的サイト） |
| スマホ同士をリアルタイムにつなぐ | Supabase Realtime の Presence（データベースは使いません） |

部屋に最初に入った人のスマホが「ホスト」になってゲームを進行し、ほかの人は状態を受け取って表示します。ホストが抜けると、残った人の中から自動で次のホストが決まります。

## 公開の手順

### 1. Supabase の準備（無料）

1. https://supabase.com にログインして **New project** をつくる（Region は Tokyo がおすすめ）。
2. **Project Settings → API**（または **API Keys**）を開いて次の2つをコピーする。
   - **Project URL**（`https://xxxx.supabase.co`）
   - **anon key**（legacy）または **publishable key**（`sb_publishable_...`）
3. `config.js` に貼る。

```js
window.PA_CONFIG = {
  supabaseUrl: "https://xxxx.supabase.co",
  supabaseKey: "eyJhbGciOi...（または sb_publishable_...）"
};
```

> anon / publishable key はブラウザに載せる前提で作られた公開用のキーなので、公開しても大丈夫です。**service_role / secret key は絶対に書かないでください。**

### 2. Vercel で公開

1. このリポジトリを GitHub に置く。
2. https://vercel.com/new で GitHub のリポジトリを **Import**。
3. Framework Preset は **Other**。Build Command と Output Directory は空のまま **Deploy**。
4. 出てきた `https://〜.vercel.app` を友だちに送れば完成です。

以降は GitHub に push するたびに自動で更新されます。

### 3.（任意）共有したときのプレビュー画像

共有プレビュー画像は `index.html` の `og:image` / `og:url` に完全なURLで設定済みです（https://pocket-asobiba.vercel.app）。ドメインを変えたらここも書き換えてください。

## 手元で試す

```sh
npx serve .        # または python3 -m http.server
```

`config.js` が空のときは**練習モード**になり、同じ端末の別タブ同士だけでつながります（ゲームの動作確認用）。

## ミニゲームを追加する

`js/games/` にファイルを1つ追加して、`index.html` に `<script>` を1行足すだけです。書き方は [docs/ADDING_GAMES.md](docs/ADDING_GAMES.md) を見てください。

## うまくつながらないとき

- **右上が「練習モード」のまま**：`config.js` の値が空、または通信ライブラリを読み込めていません。
- **「再接続中…」のまま**：Supabase の URL / key が間違っているか、プロジェクトが一時停止しています。無料プランは**7日間使わないと一時停止**するので、Supabase のダッシュボードで **Restore** してください。
- **Realtime の設定**：Supabase の **Realtime → Settings** で「Allow public access」（公開チャンネル）がオンになっていることを確認してください（初期設定でオン）。
- 無料プランの目安は同時接続200人まで。1部屋8人までを想定しています。
