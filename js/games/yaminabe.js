/* やみ鍋：伏せた具の名前を言って鍋に入れる、うそOKの2人用カードゲーム（ルール第6版）。
   2人ならそれぞれのスマホで対戦、1人ならコンピュータと対戦、3人目からは観戦（もう一回で交代）。
   - ホストのスマホだけがルール（Yami）とコンピュータの手を動かし、全員が自分の席から見た画面を描く。
   - 効果音はそれぞれのスマホで、届いた出来事（d.ev）に合わせて鳴らす。 */
(() => {
"use strict";
  // ===== やみ鍋 ルールとCPU（第6版で固定。どの画面の案でも同じものを使う。基準案 v0 から画面の部分を取り除いたもの） =====
  const Yami = (() => {
    "use strict";
    const INGR = [["肉",4,4,"🥩"],["えび",3,5,"🦐"],["きのこ",2,7,"🍄"],["はくさい",1,6,"🥬"],["とうがらし",-3,8,"🌶️"],["しめの雑炊",5,2,"🍚"]];
    const PEEKS = 2, POT_MAX = 4, MIN_EAT = 2, HAND = 3;
    const NAME = {}, ICON = {};
    INGR.forEach(([n, v, , i]) => { NAME[v] = n; ICON[v] = i; });
    const DECL = [4, 3, 2, 1, -3];
    const LIE_GOOD = [4, 3, 2, 1];
    const rnd = n => Math.floor(Math.random() * n);
    const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const sum = a => a.reduce((s, x) => s + x, 0);
    const vs = v => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v);   // 0 は「0」（基準案の「−0」を直す）

    function create(mode, first) {
      let deck = [];
      INGR.forEach(([, v, n]) => { if (v !== 5) for (let k = 0; k < n; k++) deck.push(v); });
      deck.splice(deck.indexOf(2), 1);            // お通しのきのこ
      shuffle(deck);
      const hands = [[], []];
      for (let k = 0; k < HAND; k++) { hands[0].push(deck.pop()); hands[1].push(deck.pop()); }
      deck = [5, 5].concat(deck);                  // 雑炊は山札のいちばん下（pop は末尾から）
      const plates = [[], []]; plates[first].push(2);
      return { mode, first, deck, hands, pot: [], plates, peeks: [PEEKS, PEEKS], turn: first, last: null,
               honesty: [[0, 0], [0, 0]], log: [], phase: "play", over: false };
    }
    const potFull = S => S.pot.length >= POT_MAX;
    function legal(S, p) {
      const h = S.hands[p], ops = [];
      if (potFull(S)) return ["eat"];
      if (h.length) ops.push("add");
      if (S.pot.length >= MIN_EAT || (!h.length && S.pot.length)) ops.push("eat");
      if (S.peeks[p] > 0 && S.pot.some(x => x.o !== p && !x.seen[p])) ops.push("peek");
      if (!h.length) ops.push("pass");
      return ops.length ? ops : ["pass"];
    }
    function add(S, p, idx, decl) {
      const c = S.hands[p].splice(idx, 1)[0];
      const d = c === 5 ? 5 : decl;
      const x = { c, o: p, d, seen: [p === 0, p === 1] };
      if (c === 5) x.seen = [true, true];
      S.pot.push(x); S.last = p;
      let drew = null;
      if (S.deck.length) { drew = S.deck.pop(); S.hands[p].push(drew); }
      return { type: "add", p, c, d, drew, n: S.pot.length };
    }
    function eat(S, p) {
      const got = S.pot; S.pot = [];
      got.forEach(x => { if (x.o !== p && x.o !== -1) S.honesty[p][x.c === x.d ? 0 : 1]++; });
      S.plates[p].push(...got.map(x => x.c));
      return { type: "eat", p, got, gain: sum(got.map(x => x.c)) };
    }
    function peek(S, p, i) {
      S.peeks[p]--;
      const x = S.pot[i]; x.seen[p] = true;
      const lie = x.c !== x.d;
      if (lie) S.honesty[p][1]++;
      return { type: "peek", p, i, x: { ...x }, lie };
    }
    function catchLie(S, p, i, toSelf) {
      const x = S.pot.splice(i, 1)[0];
      const to = toSelf ? p : x.o;
      S.plates[to].push(x.c);
      return { type: "catch", p, x, to };
    }
    function result(S) {
      const s0 = sum(S.plates[0]), s1 = sum(S.plates[1]);
      const t0 = S.plates[0].filter(v => v < 0).length, t1 = S.plates[1].filter(v => v < 0).length;
      const winner = s0 > s1 ? 0 : s1 > s0 ? 1 : (t0 < t1 ? 0 : t1 < t0 ? 1 : -1);
      return { s: [s0, s1], t: [t0, t1], winner };
    }
    // 番の終わり：2人とも手札がなければ終わり（残りの鍋は、それぞれ自分の具を自分で食べる）
    function endTurn(S) {
      if (!S.hands[0].length && !S.hands[1].length) {
        const left = S.pot; left.forEach(x => S.plates[x.o].push(x.c)); S.pot = []; S.over = true;
        return { type: "end", left, ...result(S) };
      }
      S.turn = 1 - S.turn;
      return { type: "turn", turn: S.turn };
    }
    // ---- CPU（シミュレーションの「上手なAI」と同じ考え方） ----
    function unseen(S, me) {
      const full = {}; INGR.forEach(([, v, n]) => full[v] = (full[v] || 0) + n);
      const take = v => { full[v] = (full[v] || 0) - 1; };
      S.hands[me].forEach(take); S.plates[0].forEach(take); S.plates[1].forEach(take);
      S.pot.forEach(x => { if (x.o === me || x.seen[me]) take(x.c); });
      S.hands[1 - me].forEach(v => { if (v === 5) take(v); });
      const vals = []; Object.entries(full).forEach(([v, n]) => { for (let k = 0; k < n; k++) vals.push(+v); });
      return vals;
    }
    const mean = a => a.length ? sum(a) / a.length : 0;
    function min3(vals) {
      const v = [...vals].sort((a, b) => a - b), n = v.length;
      if (n < 3) return mean(v);
      const comb2 = m => m < 2 ? 0 : m * (m - 1) / 2, tot = n * (n - 1) * (n - 2) / 6;
      return v.reduce((s, x, i) => s + x * comb2(n - 1 - i) / tot, 0);
    }
    function estCard(S, me, x) {
      if (x.seen[me]) return x.c;
      const rest = unseen(S, me), [t, l] = S.honesty[me], p = (t + 1) / (t + l + 2);
      const lie = x.d < 0 ? mean(rest.filter(v => v > 0)) : min3(rest);
      return p * x.d + (1 - p) * lie;
    }
    const potEst = (S, me) => sum(S.pot.map(x => x.o === me ? x.c : estCard(S, me, x)));
    function cpuDeclare(c) {
      if (c === 5) return 5;
      if (c < 0) return Math.random() < 0.7 ? LIE_GOOD[rnd(4)] : c;
      return Math.random() < 0.3 ? -3 : c;
    }
    // CPU の手を決める（状態は変えない）
    function cpuChoose(S, me = 1) {
      const ops = legal(S, me), e = potEst(S, me), h = S.hands[me];
      const unknown = S.pot.filter(x => x.o !== me && !x.seen[me]);
      if (ops.includes("peek") && unknown.length >= 2 && Math.abs(e) < 3) {
        let bi = -1, bd = -99;
        S.pot.forEach((x, i) => { if (x.o !== me && !x.seen[me] && x.d > bd) { bd = x.d; bi = i; } });
        return { kind: "peek", i: bi };
      }
      if (ops.includes("eat") && e >= 0) return { kind: "eat" };
      if (ops.includes("add")) {
        let lo = 0; h.forEach((v, i) => { if (v < h[lo]) lo = i; });
        return { kind: "add", idx: lo, decl: cpuDeclare(h[lo]) };
      }
      if (ops.includes("eat") && (e >= 0 || !ops.includes("pass"))) return { kind: "eat" };
      return { kind: "pass" };
    }
    return { INGR, PEEKS, POT_MAX, MIN_EAT, HAND, NAME, ICON, DECL, sum, vs, create, legal, add, eat, peek, catchLie, endTurn, result, cpuChoose, potFull };
  })();

  // ===== 効果音（すべてその場で合成。音声ファイルは使わない） =====
  // ブラウザは画面を触る前に音を出せないので、触ったときに音の準備をする。
  // スマホでは pointerdown では許可されないことがあるので、pointerup / touchend / click でも準備する。
  const Sfx = (() => {
    let ctx = null, master = null, on = true, level = 2;   // level: 1=小 2=中 3=大
    const LEVELS = [0, 0.12, 0.22, 0.36];
    try { const v = localStorage.getItem("yami-sound"); if (v) { const o = JSON.parse(v); on = !!o.on; level = [1, 2, 3].includes(o.level) ? o.level : 2; } } catch (e) {}
    const save = () => { try { localStorage.setItem("yami-sound", JSON.stringify({ on, level })); } catch (e) {} };
    function ensure() {
      try {
        if (ctx) { if (ctx.state === "suspended") ctx.resume().catch(() => {}); return ctx; }
        const C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
        ctx = new C(); master = ctx.createGain(); master.gain.value = on ? LEVELS[level] : 0; master.connect(ctx.destination);
        if (ctx.state === "suspended") ctx.resume().catch(() => {});
      } catch (e) {}
      return ctx;
    }
    ["pointerdown", "pointerup", "touchend", "click", "keydown"].forEach(t => addEventListener(t, ensure, { capture: true, passive: true }));
    const ready = () => ctx && ctx.state === "running" && on;
    function tone(f0, f1, dur, type = "sine", vol = 1, delay = 0) {
      const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
    }
    function noise(dur, fType, freq, vol = 1, delay = 0, q = 1) {
      const t = ctx.currentTime + delay, n = Math.floor(ctx.sampleRate * dur), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = b; f.type = fType; f.frequency.value = freq; f.Q.value = q; g.gain.value = vol;
      s.connect(f); f.connect(g); g.connect(master); s.start(t);
    }
    // 音の一覧（名前：いつ鳴るか）
    const LIB = {
      tap:    () => tone(900, 700, 0.05, "triangle", 0.35),                                 // カードを選ぶ
      put:    (n = 1) => { noise(0.09, "bandpass", 1800, 0.5, 0, 0.8);                      // 伏せて鍋に入れる「ぽちゃ」
                           tone(520 + 60 * n, 160, 0.18, "sine", 0.7, 0.03);
                           for (let k = 0; k < n; k++) tone(300 + 90 * k, 520 + 90 * k, 0.06, "sine", 0.25, 0.16 + 0.07 * k); }, // 鍋の枚数だけ泡（コトコト→ぐつぐつ）
      turn:   () => tone(660, 660, 0.07, "square", 0.08),                                   // 自分の番になった
      peek:   () => { tone(1200, 1500, 0.08, "sine", 0.3); tone(1500, 1200, 0.08, "sine", 0.25, 0.09); },  // おたまで味見
      honest: () => tone(880, 880, 0.25, "sine", 0.35),                                     // 言ったとおりだった
      lie:    () => { tone(220, 110, 0.35, "sawtooth", 0.35); noise(0.25, "lowpass", 500, 0.6); }, // 「うそだ！」
      flip:   (k = 0) => noise(0.04, "highpass", 3000, 0.35, 0.09 * k),                     // 食べた具を1枚ずつ表に
      eat:    () => { tone(523, 523, 0.12, "sine", 0.45); tone(784, 784, 0.18, "sine", 0.4, 0.11); },  // いただきます
      good:   () => tone(988, 1318, 0.18, "triangle", 0.3),                                 // おいしい点が入った
      hot:    () => { noise(0.4, "highpass", 2500, 0.45); tone(300, 180, 0.25, "square", 0.08); },     // とうがらし（ジュッ）
      win:    () => [523, 659, 784, 1046].forEach((f, k) => tone(f, f, 0.22, "triangle", 0.4, 0.12 * k)),
      lose:   () => [392, 349, 311].forEach((f, k) => tone(f, f * 0.98, 0.28, "triangle", 0.35, 0.16 * k)),
      pass:   () => tone(400, 380, 0.08, "triangle", 0.2),
    };
    function play(kind, arg) {
      try { window.__yamiSfx && window.__yamiSfx(kind); } catch (e) {}   // 動作確認用のフック（ふだんは何もしない）
      if (!ready() || !LIB[kind]) return;
      try { LIB[kind](arg); } catch (e) {}
    }
    // 0=切 1=小 2=中 3=大
    function setLevel(n) { on = n > 0; if (n > 0) level = n; ensure(); if (master) master.gain.value = on ? LEVELS[level] : 0; save(); }
    return { play, setLevel, get n() { return on ? level : 0; } };
  })();

  // ===== ゲーム =====
  const CPU = "cpu";
  const N = Yami.NAME, I = Yami.ICON, vs = Yami.vs, sum = Yami.sum;
  const clone = o => JSON.parse(JSON.stringify(o));
  const HEAT = ["からっぽ", "コトコト", "コトコト", "ぐつぐつ", "ふきこぼれる！"];
  const LV = ["切", "小", "中", "大"];
  const EV_MAX = 24;          // 会話に残す出来事の数（通信の大きさを数KBに収める）
  const CPU_DELAY = 1100;     // コンピュータが考える時間
  const ACK_MAX = 12000;      // 結果の画面を閉じるのを待つ最長の時間
  const LAST_MIN = 2500, LAST_MAX = 9000;   // 終わってから結果画面に移るまで

  // ---- ホスト：手を当てはめる（ルールは Yami のまま。通らない手は null） ----
  function apply(d, seat, a, now) {
    const S = clone(d.S), ops = Yami.legal(S, seat), out = [];
    let phase = "play", pend = null, wait = d.wait, seq = d.seq, winners = null;
    const push = e => { e.k = ++seq; out.push(e); return e.k; };
    const human = k => d.seats[k] !== CPU;
    if (d.phase === "catch") {
      if (!a || a.a !== "catch" || (a.to !== "self" && a.to !== "opp")) return null;
      const e = Yami.catchLie(S, seat, d.pend.i, a.to === "self");
      const k = push({ t: "catch", p: seat, c: e.x.c, d: e.x.d, to: e.to });
      if (human(1 - seat)) wait = k;                                  // うそを見やぶられた人に知らせる
    } else if (a.a === "add") {
      const h = S.hands[seat], i = a.i;
      if (!ops.includes("add") || !Number.isInteger(i) || i < 0 || i >= h.length) return null;
      if (h[i] !== 5 && !Yami.DECL.includes(a.v)) return null;
      const e = Yami.add(S, seat, i, h[i] === 5 ? 5 : a.v);
      push({ t: "add", p: seat, d: e.d, z: e.c === 5 ? 1 : 0, n: e.n });
    } else if (a.a === "eat") {
      if (!ops.includes("eat")) return null;
      const e = Yami.eat(S, seat);
      wait = push({ t: "eat", p: seat, got: e.got.map(x => ({ c: x.c, d: x.d, o: x.o })), g: e.gain });
    } else if (a.a === "peek") {
      const i = a.i, x = S.pot[i];
      if (!ops.includes("peek") || !Number.isInteger(i) || !x || x.o === seat || x.seen[seat]) return null;
      const e = Yami.peek(S, seat, i);
      const k = push({ t: "peek", p: seat, i, d: x.d, lie: e.lie ? 1 : 0 });
      if (e.lie) { phase = "catch"; pend = { p: seat, i }; }            // 行き先を選んでから番が終わる
      else if (human(seat)) wait = k;
    } else if (a.a === "pass") {
      if (!ops.includes("pass")) return null;
      push({ t: "pass", p: seat });
    } else return null;
    if (phase === "play") {
      const e = Yami.endTurn(S);
      if (e.type === "end") {
        push({ t: "end", left: e.left.map(x => ({ c: x.c, o: x.o })), s: e.s, h: e.t, w: e.winner });
        phase = "last"; winners = e.winner < 0 ? [] : [d.seats[e.winner]];
      }
    }
    const nd = { ...d, S, phase, pend, wait, seq, n: d.n + 1, t: now, ev: d.ev.concat(out).slice(-EV_MAX) };
    if (winners) nd.winners = winners;
    return nd;
  }
  function cpuAct(d) {
    if (d.phase === "catch") return { a: "catch", to: d.S.pot[d.pend.i].c > 0 ? "self" : "opp" };
    const m = Yami.cpuChoose(d.S, 1);
    if (m.kind === "peek") return { a: "peek", i: m.i };
    if (m.kind === "add") return { a: "add", i: m.idx, v: m.decl };
    return { a: m.kind };
  }

  // ---- それぞれのスマホ：画面の中だけの状態 ----
  let L = { gid: null };
  function syncLocal(c) {
    const d = c.d;
    if (L.gid !== c.gid) L = { gid: c.gid, seq: d.seq || 0, n: d.n, sel: null, peek: false, q: [], ack: d.wait || 0, turnN: d.n, ovH: null };
    if (L.n !== d.n) { L.n = d.n; L.sel = null; L.peek = false; }
  }
  const seatOf = (d, me) => d.seats.indexOf(me);
  function send(c, o) { c.set({ ...o, n: c.d.n, ack: L.ack }); }
  function ack(c, k) { L.ack = Math.max(L.ack, k || 0); c.set({ ...(c.my || {}), ack: L.ack }); }

  // 演出だけの泡（ゲームの乱数は使わない）
  const bubbles = [];
  let fx = 12345; const frand = () => (fx = (fx * 1103515245 + 12345) % 2147483648) / 2147483648;
  const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  function drawBubbles(cv, level) {
    if (!cv) return; const g = cv.getContext("2d"); if (!g) return;
    g.clearRect(0, 0, 300, 160);
    if (reduce()) return;
    const want = [1, 4, 8, 14, 26][level] || 1;
    if (bubbles.length < want && frand() < 0.3) bubbles.push({ x: 30 + frand() * 240, y: 20 + frand() * 120, r: 0, m: 3 + frand() * (3 + level * 1.6), s: .07 + level * .05 });
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i]; b.r += b.s * 2; const al = Math.max(0, 1 - b.r / b.m);
      g.beginPath(); g.arc(b.x, b.y, b.r, 0, 6.283); g.strokeStyle = `rgba(255,224,170,${.5 * al})`; g.lineWidth = 1.4; g.stroke();
      if (b.r >= b.m) bubbles.splice(i, 1);
    }
  }

  // ---- 描く道具 ----
  function card(v, o = {}) {
    const cls = "ycard" + (o.s ? " s" : "") + (o.cls ? " " + o.cls : "");
    if (o.back) return `<div class="${cls} back" aria-label="伏せた具"><span class="i">🍲</span></div>`;
    return `<div class="${cls}${v < 0 ? " bad" : ""}${v === 5 ? " zou" : ""}" aria-label="${N[v]} ${vs(v)}点"${o.style ? ` style="${o.style}"` : ""}><span class="v">${vs(v)}</span><span class="i">${I[v]}</span><span class="nm">${v === 5 ? "雑炊" : N[v]}</span></div>`;
  }
  const cardInner = v => `<span class="v">${vs(v)}</span><span class="i">${I[v]}</span><span class="nm">${v === 5 ? "雑炊" : N[v]}</span>`;
  const mini = x => `<span class="ymini">${card(x.c, { s: 1 })}<span class="t ${x.c === x.d ? "ok" : "ng"}">${x.c === x.d ? "⭕本当" : "❌うそ"}</span></span>`;
  const btn = (label, tap, o = {}) => `<button class="${o.pri ? "pri" : ""}${o.cls ? " " + o.cls : ""}" data-tap="${tap}"${o.data || ""}${o.dis ? " disabled" : ""}${o.aria ? ` aria-label="${o.aria}"` : ""}>${label}</button>`;
  const RULES = `<ul>
    <li>番には3つのうち1つ。<b>入れる</b>：手札1枚を伏せて鍋へ、具の名前を言う（うそOK）。<b>いただきます</b>：鍋が2枚以上なら（手札がない人は1枚でも）全部を表にして取り皿へ。<b>味見</b>：おたまで相手の具を1枚見る（1人2回）。</li>
    <li>味見でうそを見つけたら「うそだ！」。その具は見つけた人が、自分か相手の取り皿を選んで入れる。</li>
    <li>鍋が4枚なら次の人は必ずいただきます。パスは手札がない人だけ。</li>
    <li>しめの雑炊（+5）は山札の底。引いたら表で持ち、表で入れる。</li>
    <li>2人とも手札がなくなったら終わり。残りの鍋は、それぞれ自分の具を自分で食べる。先手はお通しのきのこ（+2）から。とうがらしは1枚−3点。点が同じならとうがらしが少ない人の勝ち。</li></ul>
    <table class="ruletable"><tr><th>具</th><th>点</th><th>枚数</th></tr>
    <tr><td>🥩 肉</td><td>+4</td><td>4</td></tr><tr><td>🦐 えび</td><td>+3</td><td>5</td></tr><tr><td>🍄 きのこ</td><td>+2</td><td>7（1枚はお通し）</td></tr>
    <tr><td>🥬 はくさい</td><td>+1</td><td>6</td></tr><tr><td>🌶️ とうがらし</td><td>−3</td><td>8</td></tr><tr><td>🍚 しめの雑炊</td><td>+5</td><td>2（山札の底）</td></tr></table>
    <p class="note">2人ならそれぞれのスマホで対戦、1人ならコンピュータと対戦、3人目からは観戦。音の大きさは、ゲーム中の 🔊 ボタンで 切・小・中・大 と変わる。</p>`;

  // 席から見た名前など
  function names(d, c) {
    const me = seatOf(d, c.me), spec = me < 0, vp = spec ? 0 : me;
    const isCpu = k => d.seats[k] === CPU;
    const raw = k => isCpu(k) ? "コンピュータ" : c.nm(d.seats[k]).name;
    const who = k => !spec && k === vp ? "あなた" : esc(raw(k));                       // 短い呼び名
    const whoS = k => !spec && k === vp ? "あなた" : isCpu(k) ? "コンピュータ" : esc(raw(k)) + "さん";   // 文の中
    const side = k => (k === vp ? "m" : "o");
    return { me, spec, vp, op: 1 - vp, isCpu, raw, who, whoS, side };
  }

  function chatHTML(d, c, w) {
    const av = k => avatar(c.nm(d.seats[k]), "sm");
    const bub = (k, html) => `<div class="ymsg ${w.side(k)}">${av(k)}<div class="b"><small class="sp">${w.who(k)}</small>${html}</div></div>`;
    const sys = (html, lie) => `<div class="ysys${lie ? " lie" : ""}">${html}</div>`;
    return d.ev.map(e => {
      if (e.t === "start") return sys(`― はじまり ―<br>${w.whoS(e.f)}が先手。お通しのきのこ（+2）を先手の取り皿に置いた`);
      if (e.t === "add") return bub(e.p, e.z ? `🍚 しめの雑炊を表で入れたよ<small>鍋${e.n}枚目</small>` : `${N[e.d]}を入れたよ<small>鍋${e.n}枚目（伏せて）</small>`);
      if (e.t === "eat") return sys(`<b>${w.who(e.p)}</b>の「いただきます」 ${vs(e.g)}点<div class="yrow">${e.got.map(mini).join("")}</div>`);
      if (e.t === "peek") return bub(e.p, `🥄 ${e.i + 1}枚目を味見した…<small>${e.lie ? "言った名前とちがう！" : "言ったとおりだった"}</small>`);
      if (e.t === "catch") return sys(`<b>うそだ！</b> ${w.who(e.p)}が見やぶった：「${N[e.d]}」は本当は${I[e.c]}${N[e.c]}（${vs(e.c)}）→ ${w.who(e.to)}の取り皿へ`, true);
      if (e.t === "pass") return bub(e.p, "パス（手札がない）");
      if (e.t === "end") return sys(`ごちそうさま。${e.left.length ? "残りの鍋はそれぞれ自分の具を食べた。" : ""}<br>${w.who(0)} ${vs(e.s[0])}／${w.who(1)} ${vs(e.s[1])}`);
      return "";
    }).join("");
  }

  function lieText(e, w) {
    const oth = e.got.filter(x => x.o !== e.p && x.c !== x.d).length, own = e.got.filter(x => x.o === e.p && x.c !== x.d).length;
    if (!oth && !own) return "うそはひとつもありませんでした。";
    const parts = [];
    if (oth) parts.push(`${w.who(1 - e.p)}のうそが${oth}枚`);
    if (own) parts.push(`${w.who(e.p)}自身のうそが${own}枚`);
    return parts.join("、") + "まじっていました。";
  }
  function sheetHTML(o) {
    return `<div class="yov"><div class="ysheet${o.shake ? " shake" : ""}" role="dialog" aria-modal="true" aria-labelledby="ysh-t">
      <h3 id="ysh-t">${o.title}</h3>${o.body || ""}<div class="ybtns">${o.buttons}</div></div></div>`;
  }
  function eventSheet(e, d, w) {
    if (e.t === "eat") {
      const cards = e.got.map((x, k) => { const t = x.c === x.d;
        return `<div class="yslotc"><span class="claim ${w.side(x.o)}">${x.o === e.p ? "自分の具" : "相手の具"}「${N[x.d]}」</span>${card(x.c, { cls: "flipin", style: `animation-delay:${k * 110}ms` })}<span class="ytag ${t ? "ok" : "ng"}">${t ? "⭕ 本当" : "❌ うそ"}</span></div>`; }).join("");
      return sheetHTML({ title: `${w.who(e.p)}の「いただきます」`, body: `<div class="yrow">${cards}</div><p>${w.whoS(e.p)}の取り皿に <b>${vs(e.g)}点</b>。${lieText(e, w)}</p>`,
        buttons: btn("つづける", "ok", { pri: 1 }) });
    }
    if (e.t === "catch") return sheetHTML({ title: "見やぶられた！", shake: 1,
      body: `<div class="yrow"><div class="yslotc"><span class="claim o">「${N[e.d]}」と言っていた</span>${card(e.c, { cls: "flipin" })}<span class="ystamp">うそ！</span></div></div>
        <p>あなたが「${N[e.d]}」と言って入れた${N[e.c]}を、${w.whoS(e.p)}がおたまで味見しました。${e.to === e.p ? `${w.whoS(e.p)}が自分の取り皿にもらいました。` : "あなたの取り皿に戻されました。"}</p>`,
      buttons: btn("つづける", "ok", { pri: 1 }) });
    if (e.t === "peek") return sheetHTML({ title: `味見：${e.i + 1}枚目は言ったとおり`,
      body: `<div class="yrow"><div class="yslotc"><span class="claim o">「${N[e.d]}」と言っていた</span>${card(e.d, { cls: "flipin" })}<span class="ytag ok">⭕ 言ったとおり</span></div></div>
        <p>「${N[e.d]}」は本当でした。だまって鍋に戻しました。これで番は終わり。</p>`,
      buttons: btn("つづける", "ok", { pri: 1 }) });
    return "";
  }

  // 届いた出来事：音を鳴らし、自分に関係のある結果は画面を重ねて見せる
  function onEvent(e, d, w) {
    if (e.t === "add") { Sfx.play("put", e.n); if (!reduce()) for (let k = 0; k < 8; k++) bubbles.push({ x: 150 + (frand() - .5) * 120, y: 80 + (frand() - .5) * 60, r: 0, m: 8 + frand() * 10, s: .5 }); }
    else if (e.t === "eat") {
      Sfx.play("eat"); e.got.forEach((_, k) => Sfx.play("flip", k));
      setTimeout(() => Sfx.play(e.got.some(x => x.c < 0) ? "hot" : "good"), 90 * e.got.length + 120);
      if (!w.spec) L.q.push(e);
    } else if (e.t === "peek") {
      Sfx.play("peek");
      if (!w.spec && e.p === w.vp) { setTimeout(() => Sfx.play(e.lie ? "lie" : "honest"), 200); if (!e.lie) L.q.push(e); }
    } else if (e.t === "catch") {
      if (w.spec || e.p !== w.vp) Sfx.play("lie");
      if (!w.spec && e.p !== w.vp) L.q.push(e);
    } else if (e.t === "pass") Sfx.play("pass");
    else if (e.t === "end") Sfx.play(w.spec || e.w === w.vp ? "win" : e.w < 0 ? "good" : "lose");
  }

  addGame({
    id: "yaminabe", name: "やみ鍋", icon: "🍲", tone: "grape", min: 1, max: 2,
    blurb: "伏せた具の名前を言って鍋へ。うそOKの読み合い。2人で対戦、1人ならコンピュータと。約15分。",
    rules: RULES,

    init(pl, now, prev) {
      const ids = pl.map(p => p.peer);
      let seats;
      if (ids.length === 1) seats = [ids[0], CPU];
      else {
        seats = ids.slice(0, 2);
        const ps = prev && Array.isArray(prev.seats) ? prev.seats.filter(s => s !== CPU) : [];
        const queue = ids.filter(p => !ps.includes(p)), w = (prev?.winners || [])[0];
        if (ids.length > 2 && ps.length) {                       // 3人目からは、負けた人と次の人が交代
          if (queue.length && w && ids.includes(w)) seats = [queue[0], w];
          else if (queue.length >= 2) seats = queue.slice(0, 2);
          else if (queue.length === 1) seats = [queue[0], ps.find(p => ids.includes(p)) || ids.find(p => p !== queue[0])];
        }
        seats = seats.filter((p, i, a) => ids.includes(p) && a.indexOf(p) === i);
        if (seats.length < 2) seats = ids.slice(0, 2);
      }
      const first = prev && (prev.first === 0 || prev.first === 1) ? 1 - prev.first : seats[1] === CPU ? 0 : Math.floor(Math.random() * 2);
      const S = Yami.create("net", first); delete S.log;
      const ro = roster(pl); ro[CPU] = ["コンピュータ", "🦊", "grape"];
      return { phase: "play", t: now, seats, players: seats.filter(s => s !== CPU), roster: ro, first, S, n: 0, seq: 1,
               ev: [{ k: 1, t: "start", f: first }], wait: 0, pend: null };
    },

    step(d, { now, inputs, present }) {
      if (d.phase === "end") return d;
      const humans = d.seats.filter(s => s !== CPU);
      if (humans.some(s => !present.has(s))) return { ...d, phase: "end", t: now, quit: true, winners: humans.filter(s => present.has(s)) };
      const acked = s => (+(inputs[s] && inputs[s].ack) || 0) >= d.wait;
      if (d.phase === "last") {
        const el = now - d.t;
        return el > LAST_MIN && (humans.every(acked) || el > LAST_MAX) ? { ...d, phase: "end", t: now } : d;
      }
      const seat = d.phase === "catch" ? d.pend.p : d.S.turn, peer = d.seats[seat];
      let a;
      if (peer === CPU) {
        const el = now - d.t;
        if (el < CPU_DELAY || (!humans.every(acked) && el < ACK_MAX)) return d;
        a = cpuAct(d);
      } else {
        a = inputs[peer];
        if (!a || a.n !== d.n || typeof a.a !== "string") return d;
      }
      return apply(d, seat, a, now) || d;
    },

    view(el, c) {
      const d = c.d, S = d.S;
      syncLocal(c);
      const w = names(d, c), { vp, op, spec } = w;
      for (const e of d.ev) if (e.k > L.seq) onEvent(e, d, w);
      L.seq = Math.max(L.seq, d.seq);
      if (!spec && (c.my?.ack || 0) < L.ack) c.set({ ...(c.my || {}), ack: L.ack });   // 読み込み直したときなど
      const pending = !!(c.my && c.my.n === d.n && c.my.a);
      const myTurn = !spec && d.phase === "play" && S.turn === vp && !pending && !L.q.length;
      if (!spec && d.phase === "play" && S.turn === vp && L.turnN !== d.n) { Sfx.play("turn"); }
      L.turnN = d.n;

      shell(el, "yami", `<div class="yami">
        <div class="ytop" data-r="top"></div>
        <div class="yturnrow"><span data-r="snd"></span><div class="yturn" data-r="turn" role="status"></div><span aria-hidden="true"></span></div>
        <div class="ypot lv0" data-r="potbar"><div class="ysteam" aria-hidden="true"><b></b><b></b><b></b><b></b></div><canvas data-r="bub" width="300" height="160" aria-hidden="true"></canvas>
          <div class="yh" data-r="heat"></div><div class="yslots" data-r="pot"></div></div>
        <div class="ychat" data-r="chat" aria-live="polite"></div>
        <div class="ycomp"><div class="ymine" data-r="info"></div><div class="yhand" data-r="hand"></div><p class="yprompt" data-r="prompt"></p><div class="yreplies" data-r="names"></div><div class="yacts" data-r="acts"></div></div>
        <div data-r="ov"></div>
      </div>`);

      if (L.scrolled !== c.gid) {   // 始まったら、やみ鍋の枠を画面の上に寄せる（鍋から手札まで1画面に収める）
        L.scrolled = c.gid;
        setTimeout(() => { const y = el.querySelector(".yami"); if (y && y.getBoundingClientRect().top > 8) y.scrollIntoView({ block: "start" }); }, 80);
      }

      // 上：点と音
      const sn = Sfx.n;
      patch(R$(el, "top"), `<span class="ypts o"><span class="nm">${w.who(op)}</span><b>${vs(sum(S.plates[op]))}</b></span><span class="ypts m"><span class="nm">${w.who(vp)}</span><b>${vs(sum(S.plates[vp]))}</b></span>`);
      patch(R$(el, "snd"), btn(`${sn ? "🔊" : "🔇"}${LV[sn]}`, "snd", { cls: "yicon", aria: `音の大きさ：${LV[sn]}（押すと変わる）` }));

      // 番の表示
      let tc, tt;
      if (d.phase === "last") { tc = "end"; tt = "ごちそうさま"; }
      else if (d.phase === "catch") { const mine = !spec && d.pend.p === vp; tc = mine ? "m" : "o"; tt = mine ? "うそだ！ 行き先をえらぶ" : `${w.whoS(d.pend.p)}が味見で「うそだ！」`; }
      else if (!spec && S.turn === vp) { tc = "m"; tt = "あなたの番"; }
      else { tc = "o"; tt = w.isCpu(S.turn) ? "コンピュータが考え中…" : `${w.whoS(S.turn)}の番`; }
      if (spec) tt = "観戦中 · " + tt;
      const tb = R$(el, "turn"); tb.className = "yturn " + tc; patch(tb, tt);

      // 鍋
      const n = S.pot.length, full = Yami.potFull(S);
      R$(el, "potbar").className = "ypot lv" + n;
      patch(R$(el, "heat"), `<b>🍲 鍋</b><span>${HEAT[n]}</span><span class="ymeter${full ? " full" : ""}" aria-hidden="true">${[0, 1, 2, 3].map(k => `<i class="${k < n ? "on" : ""}"></i>`).join("")}</span>`);
      let pot = "";
      for (let i = 0; i < Yami.POT_MAX; i++) {
        const x = S.pot[i];
        if (!x) { pot += `<div class="yfree">空き</div>`; continue; }
        const mine = !spec && x.o === vp, seen = !spec && x.seen[vp], show = x.c === 5 || seen || (d.phase === "catch" && !spec && d.pend.p === vp && d.pend.i === i);
        const pick = L.peek && myTurn && !mine && !x.seen[vp];
        const cd = pick ? `<button class="ycard s back pick" data-tap="pot" data-i="${i}" aria-label="${i + 1}枚目を味見する"><span class="i">🍲</span></button>`
          : show ? card(x.c, { s: 1 }) : card(0, { back: 1, s: 1 });
        const owner = spec ? esc(w.raw(x.o).slice(0, 4)) : mine ? "自分" : "相手";
        pot += `<div class="yslot ${w.side(x.o)}">${cd}<div class="lab"><span class="who">${i + 1}・${owner}</span><span class="who claim">「${N[x.d]}」</span>${!mine && seen && x.c !== 5 ? `<span class="who">🥄味見ずみ</span>` : ""}</div></div>`;
      }
      patch(R$(el, "pot"), pot);
      drawBubbles(R$(el, "bub"), n);

      // 会話
      const ch = R$(el, "chat"), before = ch.__h;
      patch(ch, chatHTML(d, c, w));
      if (ch.__h !== before) { const last = ch.lastElementChild; if (last) last.classList.add("new"); ch.scrollTop = ch.scrollHeight; }

      // 下：おたま・手札・案内・操作
      const ot = k => Array.from({ length: Yami.PEEKS }, (_, j) => j >= S.peeks[k] ? "▫" : "🥄").join("");
      patch(R$(el, "info"), `<span class="nw">${spec ? w.who(vp) + "の" : ""}おたま ${ot(vp)}</span> <span class="nw">${w.who(op)}のおたま ${ot(op)}</span> <span class="nw">山札${S.deck.length}枚${S.deck.length && S.deck.length <= 2 ? "（次は雑炊）" : ""}</span>`
        + [vp, op].filter(k => S.hands[k].includes(5) && (spec || k === op)).map(k => ` <span class="nw">${w.who(k)}は雑炊を持っている</span>`).join(""));
      const legal = myTurn ? Yami.legal(S, vp) : [];
      const canAdd = legal.includes("add") && !L.peek;
      let hand;
      if (spec) hand = `<span class="yprompt">観戦中：手札は見えません</span>`;
      else if (!S.hands[vp].length) hand = `<span class="yprompt">手札はもうない</span>`;
      else hand = S.hands[vp].map((v, i) => canAdd
        ? `<button class="ycard pick${L.sel === i ? " sel" : ""}${v < 0 ? " bad" : ""}${v === 5 ? " zou" : ""}" data-tap="card" data-i="${i}" aria-label="${N[v]} ${vs(v)}点を選ぶ" aria-pressed="${L.sel === i}">${cardInner(v)}</button>`
        : card(v)).join("");
      patch(R$(el, "hand"), hand);

      let p = "", acts = "", rep = "";
      const sel = myTurn && L.sel !== null && L.sel < S.hands[vp].length ? S.hands[vp][L.sel] : null;
      if (d.phase === "last") p = "ごちそうさま。まもなく結果が出ます";
      else if (spec) p = "";
      else if (pending) p = "送っています…";
      else if (d.phase === "catch") p = d.pend.p === vp ? "" : `${w.whoS(d.pend.p)}が、あなたの具の行き先を選んでいます…`;
      else if (!myTurn) p = S.turn === vp ? "" : w.isCpu(S.turn) ? "コンピュータが考えています…" : `${w.whoS(S.turn)}が考えています…`;
      else if (L.peek) { p = "🥄 鍋の中から、味見する相手の具（光っている札）を押す"; acts = btn("やめる", "cancel"); }
      else if (sel !== null) {
        if (sel === 5) { p = "雑炊はにおいでばれるので表で入れる"; rep = btn("雑炊を表で入れる", "decl", { pri: 1, data: ` data-v="5" style="grid-column:1/-1"` }); }
        else { p = `「${N[sel]}」を入れる。なんて言う？（枠つきが本当）`; rep = Yami.DECL.map(v => btn(`${N[v]}だよ`, "decl", { cls: v === sel ? "truth" : "", data: ` data-v="${v}"` })).join(""); }
        rep += btn("やめる", "cancel");
      } else {
        const can = [];
        if (legal.includes("add")) can.push("手札を押して鍋に入れる");
        if (legal.includes("eat")) can.push("いただきます");
        if (legal.includes("peek")) can.push("味見");
        if (legal.includes("pass")) can.push("パス");
        p = full ? "鍋が4枚でふきこぼれる！必ず「いただきます」" : (!S.hands[vp].length ? "手札なし：" : "") + can.join("／");
        if (n === 3 && !full) p += "。※4枚目を入れると、次の人は必ず食べる";
        if (legal.includes("eat")) acts += btn("いただきます", "eat", { pri: full || !legal.includes("add") });
        if (legal.includes("peek")) acts += btn("🥄 味見", "peek");
        if (legal.includes("pass")) acts += btn("パス", "pass");
      }
      patch(R$(el, "prompt"), esc(p));
      const nm = R$(el, "names"); nm.hidden = !rep; patch(nm, rep);
      const ac = R$(el, "acts"); ac.hidden = !acts; patch(ac, acts);

      // 重ねて出す画面（行き先の選択 → ルール → 届いた結果の順）
      let ov = "";
      if (d.phase === "catch" && !spec && d.pend.p === vp && S.pot[d.pend.i]) {
        const x = S.pot[d.pend.i];
        ov = sheetHTML({ title: "うそだ！", shake: 1,
          body: `<div class="yrow"><div class="yslotc"><span class="claim o">「${N[x.d]}」と言っていた</span>${card(x.c, { cls: "flipin" })}<span class="ystamp">うそ！</span></div></div>
            <p>「${N[x.d]}」と言っていたのに、本当は${N[x.c]}（${vs(x.c)}）。この具をどちらの取り皿に入れますか？</p>`,
          buttons: btn("自分の取り皿へ", "to", { pri: x.c > 0, data: ` data-to="self"`, dis: pending }) + btn(`${w.who(op)}の取り皿へ`, "to", { pri: x.c < 0, data: ` data-to="opp"`, dis: pending }) });
      } else if (L.q.length) ov = eventSheet(L.q[0], d, w);
      const ovEl = R$(el, "ov");
      patch(ovEl, ov);
      const key = ov ? ov.length + ":" + (L.q[0]?.k || "") + d.phase : "";
      if (key !== L.ovH) { L.ovH = key; const f = ovEl.querySelector(".ybtns .pri") || ovEl.querySelector(".ybtns button"); if (f) f.focus({ preventScroll: true }); }
    },

    tap(kind, ds, c) {
      const d = c.d, S = d.S;
      syncLocal(c);
      if (kind === "snd") { Sfx.setLevel((Sfx.n + 1) % 4); Sfx.play("tap"); return; }
      if (kind === "ok") { const e = L.q.shift(); if (e) ack(c, e.k); return; }
      const seat = seatOf(d, c.me);
      if (seat < 0 || (c.my && c.my.n === d.n && c.my.a)) return;
      if (kind === "to") { if (d.phase === "catch" && d.pend.p === seat && (ds.to === "self" || ds.to === "opp")) send(c, { a: "catch", to: ds.to }); return; }
      if (d.phase !== "play" || S.turn !== seat || L.q.length) return;
      const legal = Yami.legal(S, seat);
      if (kind === "card") {
        const i = +ds.i; if (!legal.includes("add") || !(i >= 0 && i < S.hands[seat].length)) return;
        if (L.sel === i) L.sel = null; else { L.sel = i; L.peek = false; Sfx.play("tap"); }
      } else if (kind === "decl") {
        if (L.sel === null) return;
        send(c, { a: "add", i: L.sel, v: +ds.v }); L.sel = null;
      } else if (kind === "cancel") { L.sel = null; L.peek = false; }
      else if (kind === "eat" && legal.includes("eat")) send(c, { a: "eat" });
      else if (kind === "peek" && legal.includes("peek")) { L.peek = true; L.sel = null; Sfx.play("tap"); }
      else if (kind === "pot" && L.peek) { send(c, { a: "peek", i: +ds.i }); L.peek = false; }
      else if (kind === "pass" && legal.includes("pass")) send(c, { a: "pass" });
    },

    scoreRows: () => [],

    endView(d, c) {
      const S = d.S, r = Yami.result(S), w = names(d, c);
      const row = k => { const pl = S.plates[k], good = sum(pl.filter(x => x > 0)), hot = pl.filter(x => x < 0).length;
        return `<tr class="${r.winner === k && !d.quit ? "win" : ""}"><th>${avatar(c.nm(d.seats[k]), "sm")}<span class="nm">${w.who(k)}</span></th><td>${good}</td><td>${hot}枚 −${hot * 3}</td><td><b>${vs(good - hot * 3)}</b></td><td>${S.honesty[k][1]}回</td></tr>`; };
      const df = Math.abs(r.s[0] - r.s[1]), hd = Math.abs(r.t[0] - r.t[1]);
      const key = d.quit ? "相手が部屋を出たので、ここで終わりにしました。" : r.winner < 0 ? "まったくの同点。" : `${df}点差。決め手は${hd ? `とうがらしの差（${hd}枚＝${hd * 3}点）` : "おいしい具の差"}。`;
      return `<div class="yend"><table class="yscore"><tr><th></th><th>おいしい</th><th>とうがらし</th><th>合計</th><th>見つけたうそ</th></tr>${row(0)}${row(1)}</table>
        <p class="note">見つけたうそ＝相手のうそを、食べて表にしたときと味見で見つけた数</p><p class="ykey">${key}</p></div>`;
    }
  });
})();
