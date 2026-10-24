# ミニゲームの追加のしかた

## 手順

1. `js/games/新しいゲーム.js` をつくって、中で `addGame({...})` を呼ぶ。
2. `index.html` のゲーム一覧に `<script src="/js/games/新しいゲーム.js"></script>` を1行足す（並び順＝表示順）。

## しくみ

- **ホスト**のスマホだけが `init()` と `step()` を実行して、ゲームの状態 `data` を進めます。
- 全員のスマホが `view()` で `data` を画面に描きます。
- プレイヤーの操作は `tap()` で受け取り、`c.set({...})` で「自分の入力」として送ります。ホストは `step()` の `inputs` でそれを読みます。

`data` と入力は通信で送られるので、**JSONにできる値だけ**にしてください（関数や Date は不可）。大きさは数KBまでにします。

## addGame に渡すもの

```js
addGame({
  id: "mygame",          // 英数字。ほかと重ならないID
  name: "ゲーム名",
  icon: "🎲",            // カードに出る絵文字
  tone: "grape",         // カードの色：tomato / mustard / teal / grape / sky
  min: 2, max: 8,        // 遊べる人数
  blurb: "カードに出る説明文",
  rules: `<ul><li>ルール…</li></ul>`,   // （任意）HTML。カードとゲーム中に「ルールを見る」ボタンが出る

  // ゲーム開始時（ホストだけ）。players = [{peer, name, emoji, color}, ...]
  // prev = 同じゲームを「もう一回」したときの前回の data（なければ null）
  init(players, now, prev) {
    return { phase: "play", t: now, players: players.map(p => p.peer), roster: roster(players), score: {} };
  },

  // 0.1秒ごと（ホストだけ）。変化がないときは同じ d をそのまま返す。
  // inputs = { peer: そのプレイヤーが c.set() した値 }
  // present = 部屋にいる peer の Set（抜けた人の判定に使う）
  // 終わるときは { ...d, phase: "end", winners: [peer, ...] } を返す
  step(d, { now, inputs, present }) {
    return d;
  },

  // 画面を描く（全員）。phase が "end" のときは共通の結果画面が出るので呼ばれません。
  view(el, c) {
    shell(el, "play", `<p class="prompt" data-r="msg"></p><button class="btn" data-tap="push">押す</button>`);
    patch(R$(el, "msg"), c.my ? "押しました" : "ボタンを押してね");
  },

  // data-tap が付いた要素が押されたとき（押した人のスマホで）
  tap(kind, dataset, c) {
    if (kind === "push" && c.isPlayer) c.set({ pushed: true });
  },

  // 結果画面の順位表：[{ peer, text }]
  scoreRows: d => rank(d.players, p => d.score[p] || 0).map(p => ({ peer: p, text: `${d.score[p] || 0}点` })),

  // （任意）結果画面に追加で出すHTML
  endView(d, c) { return ""; }
});
```

## view / tap の `c` で使えるもの

| 名前 | 中身 |
| --- | --- |
| `c.d` | いまのゲームの状態（ホストが配ったもの） |
| `c.me` | 自分の peer ID |
| `c.isPlayer` | 自分が参加者か（途中から入った人は観戦） |
| `c.my` | 自分が最後に `c.set()` した値 |
| `c.inp(peer)` | その人の入力 |
| `c.nm(peer)` | その人の `{name, emoji, color}`（抜けた人も表示できる） |
| `c.elapsed` | いまの場面（phase / round）になってからの経過ミリ秒 |
| `c.set(obj)` | 自分の入力を送る。毎回「いまの値全体」を送る（差分ではなく） |

## 画面づくりの道具（js/core.js）

- `shell(el, key, html)`：`key` が変わったときだけ枠を作り直す。
- `patch(el, html)`：中身が変わったときだけ書き換える（毎フレーム呼んでOK）。
- `R$(el, "名前")`：`data-r="名前"` の要素をさがす。
- `avatar(人, "sm" | "lg")`、`esc(文字列)`（名前は必ず `esc` してから表示）、`rank()`、`scoreChips()`。
- CSS のクラス：`btn`、`btn go`、`prompt`、`banner`、`chips`、`eyebrow`、`between` など（`style.css`）。

## 気をつけること

- 通信は人数に応じて**0.15〜0.8秒に1回**にまとめて送られます。早押しのような「速さ」は各自のスマホで `c.elapsed` を測って送ると公平です（反射神経ゲームを参照）。
- 連打のように何度も送る値は、回数などの**合計値**を送ります（途中が抜けても最後の値が届けば正しい）。
- 他人から届く値は信用せず、`step()` で範囲チェックをします。
- 練習モード（`config.js` が空）なら、同じブラウザでタブを2つ開くだけで2人プレイを試せます。
