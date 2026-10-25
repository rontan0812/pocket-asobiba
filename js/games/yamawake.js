/* 山分けの掟：ひとりが分けて、ひとりが選ぶ。宝箱の中身を知っているのは分けた人だけ（2人用、約10分）。
   2人ならそれぞれのスマホで対戦、1人ならコンピュータと対戦、3人目からは観戦（もう一回で交代）。
   - ホストのスマホだけがルール（Y）とコンピュータの手を動かし、全員が自分の席から見た画面を描く。
   - 秘密（宝箱の中身・注文の色）は画面では本人にしか出さない（状態そのものは部屋の全員に届く。やみ鍋と同じ）。 */
(() => {
"use strict";
  // ===== ルールとCPU（設計ループ第8版：首飾り3／注文+2／相場+1／ドクロ−1、分け手の順は 後先先後後先） =====
  const Y = (() => {
    const NC = 5, MAJ = 3, ORDER = 2, MARKET = 1, CURSE = 1, ROUNDS = 6, DRAW = 5;
    const SEQ = [1, 0, 0, 1, 1, 0];                     // 0=先手 1=後手 がその回の分け手
    const NAME = ["赤", "青", "緑", "黄", "白", "ドクロ"];
    const rnd = n => Math.floor(Math.random() * n);
    const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const zero = () => [0, 0, 0, 0, 0, 0];

    function create(first) {
      const bag = [];
      for (let c = 0; c < NC; c++) for (let i = 0; i < 5; i++) bag.push(c);
      for (let i = 0; i < 5; i++) bag.push(5);
      shuffle(bag);
      const o = shuffle([0, 1, 2, 3, 4]);
      const S = { first, bag, r: 0, draw: [], hid: -1, side: [], ph: "split", q: null, ans: null,
                  hold: [zero(), zero()], seen: [zero(), zero()], chests: [[], []], orders: [o[0], o[1]], market: o[2] };
      deal(S);
      return S;
    }
    const splitter = (S, r = S.r) => SEQ[r] === 0 ? S.first : 1 - S.first;
    function deal(S) { S.draw = S.bag.splice(0, DRAW); S.hid = -1; S.side = []; S.ph = "split"; S.q = null; S.ans = null; }
    function piles(S, hid = S.hid, side = S.side) {
      const P = [{ ix: [], open: [], n: 0 }, { ix: [], open: [], n: 0 }];
      S.draw.forEach((s, j) => { const p = P[side[j]]; if (!p) return; p.ix.push(j); if (j === hid) p.n++; else p.open.push(s); });
      return P;
    }
    const validSplit = (S, hid, side) => Number.isInteger(hid) && hid >= 0 && hid < S.draw.length && Array.isArray(side)
      && side.length === S.draw.length && side.every(x => x === 0 || x === 1) && side.includes(0) && side.includes(1);
    function take(S, k) {
      const sp = splitter(S), ch = 1 - sp, P = piles(S);
      for (const [who, p] of [[ch, P[k]], [sp, P[1 - k]]]) for (const j of p.ix) {
        const s = S.draw[j]; S.hold[who][s]++;
        if (j === S.hid) S.chests[who].push({ r: S.r, s, by: sp }); else S.seen[who][s]++;
      }
      S.r++;
      if (S.r < ROUNDS) deal(S); else { S.draw = []; S.ph = "done"; }
    }
    function score(S, k) {
      const h = S.hold[k], o = S.hold[1 - k], necks = [];
      let od = 0, mk = 0;
      for (let c = 0; c < NC; c++) if (h[c] > o[c]) { necks.push(c); if (S.orders[k] === c) od = ORDER; if (S.market === c) mk = MARKET; }
      return { necks, nk: necks.length, od, mk, sk: h[5], total: necks.length * MAJ + od + mk - CURSE * h[5] };
    }
    // ---- CPU（シミュレーションの「強いAI」と同じ考え方：首飾りになる確率で数え、相手の選び方を読んで分ける） ----
    function comb(n, k) { if (k < 0 || k > n) return 0; let r = 1; for (let i = 1; i <= k; i++) r = r * (n - k + i) / i; return r; }
    function remaining(S) { const r = [0, 0, 0, 0, 0]; S.bag.forEach(s => { if (s < NC) r[s]++; }); return r; }
    function value(S, h, o, rem, order) {
      let v = -CURSE * h[5];
      for (let c = 0; c < NC; c++) {
        const a = h[c], b = o[c], r = rem[c];
        let p;
        if (a >= 3) p = 1; else if (b >= 3) p = 0; else if (!r) p = a > b ? 1 : 0;
        else { let s = 0; for (let j = 3 - a; j <= r; j++) s += comb(r, j); p = s / Math.pow(2, r); }
        let bonus = S.market === c ? MARKET : 0;
        bonus += order == null ? ORDER / NC : order === c ? ORDER : 0;
        v += (MAJ + bonus) * p;
      }
      return v;
    }
    const add = (h, arr) => { const x = h.slice(); arr.forEach(s => x[s]++); return x; };
    const diff = (S, me, op, rem, order) => value(S, me, op, rem, order) - value(S, op, me, rem, null);
    function unknownFor(S, pl, extra = []) {
      const pool = S.bag.slice();
      for (const p of [0, 1]) for (const c of S.chests[p]) if (c.by !== pl) pool.push(c.s);
      return pool.concat(extra);
    }
    function cpuSplit(S, me) {
      const draw = S.draw, rem = remaining(S), op = 1 - me;
      const pools = Array.from({ length: 8 }, () => shuffle(unknownFor(S, op)));
      let best = -1e9, bh = 0, bs = null;
      for (let h = 0; h < draw.length; h++) for (let m = 1; m < (1 << draw.length) - 1; m++) {
        if (!(m & 1)) continue;
        const side = draw.map((_, j) => (m >> j) & 1 ? 0 : 1);
        const P = piles(S, h, side);
        let va = 0, vb = 0;
        for (const pool of pools) {
          const ga = pool.slice(0, P[0].n), gb = pool.slice(P[0].n, P[0].n + P[1].n);
          va += diff(S, add(S.seen[op], P[0].open.concat(ga)), add(S.seen[me], P[1].open.concat(gb)), rem, null);
          vb += diff(S, add(S.seen[op], P[1].open.concat(gb)), add(S.seen[me], P[0].open.concat(ga)), rem, null);
        }
        const his = va >= vb ? 0 : 1;
        const v = diff(S, add(S.hold[me], P[1 - his].ix.map(j => draw[j])), add(S.hold[op], P[his].ix.map(j => draw[j])), rem, S.orders[me]) + Math.random() * 0.4;
        if (v > best) { best = v; bh = h; bs = side; }
      }
      return { hid: bh, side: bs };
    }
    function cpuTake(S, me) {
      const rem = remaining(S), op = 1 - me, P = piles(S), v = [0, 0];
      for (let t = 0; t < 24; t++) {
        const pool = shuffle(unknownFor(S, me, [S.draw[S.hid]]));
        for (let i = 0; i < 2; i++) {
          const g1 = pool.slice(0, P[i].n), g2 = pool.slice(P[i].n, P[i].n + P[1 - i].n);
          v[i] += diff(S, add(S.seen[me], P[i].open.concat(g1)), add(S.seen[op], P[1 - i].open.concat(g2)), rem, S.orders[me]) / 24;
        }
      }
      // 「ドクロを入れた」と言われたら、宝箱の山を少しだけ避ける（うそかもしれないので少しだけ）
      if (S.q === "skull" && S.ans === "yes") { const k = P[0].n ? 0 : 1; v[k] -= 0.6; }
      return v[0] >= v[1] ? 0 : 1;
    }
    const cpuAsk = () => ["skull", "color", "order", "none"][rnd(4)];
    function cpuAnswer(S, me) {
      const c = S.draw[S.hid], lie = Math.random() < 0.4;
      if (S.q === "skull") { const t = c === 5; return (lie ? !t : t) ? "yes" : "no"; }
      if (S.q === "color") { if (Math.random() < 0.3) return "secret"; return lie ? (c + 1 + rnd(5)) % 6 : c; }
      if (S.q === "order") { if (Math.random() < 0.2) return "secret"; return lie ? (S.orders[me] + 1 + rnd(4)) % 5 : S.orders[me]; }
      return "secret";
    }
    return { NC, MAJ, ORDER, MARKET, CURSE, ROUNDS, SEQ, NAME, create, splitter, piles, validSplit, take, score, cpuSplit, cpuTake, cpuAsk, cpuAnswer };
  })();

  // ===== 絵（色ごとに形も違う：赤＝六角・青＝丸・緑＝三角・黄＝四角・白＝ひし形・ドクロ） =====
  const GEM = ["#d62828", "#1d5fd8", "#2a9d6f", "#f2c230", "#f4f4f4"];
  function gem(c, s = 26) {
    const x = s / 2, y = s / 2, r = s * 0.42, st = 'stroke="#00000088" stroke-width="1.6"';
    let sh;
    if (c === 5) sh = `<circle cx="${x}" cy="${y}" r="${r}" fill="#1f1f1f" stroke="#000" stroke-width="1.6"/><circle cx="${x - r * .35}" cy="${y - r * .15}" r="${r * .22}" fill="#eee"/><circle cx="${x + r * .35}" cy="${y - r * .15}" r="${r * .22}" fill="#eee"/><rect x="${x - r * .32}" y="${y + r * .32}" width="${r * .64}" height="${r * .24}" fill="#eee"/>`;
    else if (c === 0) sh = `<polygon points="${[0, 1, 2, 3, 4, 5].map(i => `${x + r * Math.cos(Math.PI / 3 * i)},${y + r * Math.sin(Math.PI / 3 * i)}`).join(" ")}" fill="${GEM[0]}" ${st}/>`;
    else if (c === 1) sh = `<circle cx="${x}" cy="${y}" r="${r}" fill="${GEM[1]}" ${st}/>`;
    else if (c === 2) sh = `<polygon points="${x},${y - r} ${x + r},${y + r * .8} ${x - r},${y + r * .8}" fill="${GEM[2]}" ${st}/>`;
    else if (c === 3) sh = `<rect x="${x - r * .85}" y="${y - r * .85}" width="${r * 1.7}" height="${r * 1.7}" rx="2" fill="${GEM[3]}" ${st}/>`;
    else sh = `<polygon points="${x},${y - r} ${x + r},${y} ${x},${y + r} ${x - r},${y}" fill="${GEM[4]}" ${st}/>`;
    return `<svg class="tkg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" role="img" aria-label="${Y.NAME[c]}">${sh}</svg>`;
  }
  function chest(s = 34, label = "宝箱") {
    const w = s, h = s * 0.74;
    return `<svg class="tkg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${label}"><rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="5" fill="#7a4419" stroke="#3b1f08" stroke-width="2"/><rect x="1" y="1" width="${w - 2}" height="${h * .38}" rx="5" fill="#8f5222" stroke="#3b1f08" stroke-width="1.2"/><rect x="${w * .16}" y="1" width="${w * .1}" height="${h - 2}" fill="#d9a520"/><rect x="${w * .74}" y="1" width="${w * .1}" height="${h - 2}" fill="#d9a520"/><rect x="${w / 2 - 5}" y="${h / 2 - 3}" width="10" height="9" rx="2" fill="#f0c43a" stroke="#7a5b00"/></svg>`;
  }
  const orderStone = c => `<span class="tkord">${c == null ? "注" : gem(c, 18)}</span>`;

  // ===== ゲーム =====
  const CPU = "cpu";
  const N = Y.NAME;
  const clone = o => JSON.parse(JSON.stringify(o));
  const EV_MAX = 30, CPU_DELAY = 1200, LAST_MIN = 2500, LAST_MAX = 60000;
  const QTEXT = { skull: "宝箱にドクロを入れた？", color: "宝箱の中身は何色？", order: "きみの注文は何色？", none: "（質問しない）" };
  const ansText = (q, v) => v === "secret" ? "それは教えない" : q === "skull" ? (v === "yes" ? "入れたよ" : "入れてないよ") : q === "color" ? `${N[v]}だよ` : `${N[v]}だよ`;

  function apply(d, seat, a, now) {
    const S = clone(d.S), out = [];
    let seq = d.seq, phase = "play", winners = null;
    const push = e => { e.k = ++seq; out.push(e); };
    const sp = Y.splitter(S), ch = 1 - sp;
    if (S.ph === "split") {
      if (seat !== sp || a.a !== "split" || !Y.validSplit(S, a.hid, a.side)) return null;
      S.hid = a.hid; S.side = a.side.slice(); S.ph = "ask";
      const P = Y.piles(S);
      push({ t: "split", p: seat, r: S.r, L: P[0].open, Ln: P[0].n, R: P[1].open, Rn: P[1].n });
    } else if (S.ph === "ask") {
      if (seat !== ch || a.a !== "ask" || !QTEXT[a.q]) return null;
      S.q = a.q; S.ph = a.q === "none" ? "take" : "answer";
      push({ t: "ask", p: seat, q: a.q });
    } else if (S.ph === "answer") {
      if (seat !== sp || a.a !== "ans") return null;
      const v = a.v, max = S.q === "order" ? 4 : 5;
      const ok = v === "secret" || (S.q === "skull" ? (v === "yes" || v === "no") : (Number.isInteger(v) && v >= 0 && v <= max));
      if (!ok) return null;
      S.ans = v; S.ph = "take";
      push({ t: "ans", p: seat, q: S.q, v });
    } else if (S.ph === "take") {
      if (seat !== ch || a.a !== "take" || (a.k !== 0 && a.k !== 1)) return null;
      const r = S.r;
      Y.take(S, a.k);
      push({ t: "take", p: seat, k: a.k, r });
      if (S.ph === "done") {
        const s0 = Y.score(S, 0).total, s1 = Y.score(S, 1).total;   // 二人の合計はいつも奇数なので同点にならない
        const w = s0 > s1 ? 0 : 1;
        push({ t: "end", s: [s0, s1], w });
        phase = "last"; winners = [d.seats[w]];
      }
    } else return null;
    const nd = { ...d, S, phase, seq, n: d.n + 1, t: now, ev: d.ev.concat(out).slice(-EV_MAX) };
    if (winners) nd.winners = winners;
    return nd;
  }
  function cpuAct(d, me) {
    const S = d.S;
    if (S.ph === "split") { const m = Y.cpuSplit(S, me); return { a: "split", hid: m.hid, side: m.side }; }
    if (S.ph === "ask") return { a: "ask", q: Y.cpuAsk() };
    if (S.ph === "answer") return { a: "ans", v: Y.cpuAnswer(S, me) };
    return { a: "take", k: Y.cpuTake(S, me) };
  }
  const actor = S => (S.ph === "split" || S.ph === "answer") ? Y.splitter(S) : 1 - Y.splitter(S);

  // ---- それぞれのスマホ：画面の中だけの状態（分け手が選んでいる途中の宝箱と左右） ----
  let L = { gid: null };
  function syncLocal(c) {
    const d = c.d;
    if (L.gid !== c.gid) L = { gid: c.gid, n: -1 };
    if (L.n !== d.n) { L.n = d.n; L.hid = -1; L.side = d.S.draw.map((_, j) => j % 2); L.step = "hide"; }
  }
  const seatOf = (d, me) => d.seats.indexOf(me);
  const send = (c, o) => c.set({ ...o, n: c.d.n });
  const btn = (label, tap, o = {}) => `<button class="${o.pri ? "pri" : ""}${o.cls ? " " + o.cls : ""}" data-tap="${tap}"${o.data || ""}${o.dis ? " disabled" : ""}${o.aria ? ` aria-label="${o.aria}"` : ""}>${label}</button>`;

  function names(d, c) {
    const me = seatOf(d, c.me), spec = me < 0, vp = spec ? 0 : me;
    const isCpu = k => d.seats[k] === CPU;
    const raw = k => isCpu(k) ? "コンピュータ" : c.nm(d.seats[k]).name;
    const who = k => !spec && k === vp ? "あなた" : esc(raw(k));
    const whoS = k => !spec && k === vp ? "あなた" : isCpu(k) ? "コンピュータ" : esc(raw(k)) + "さん";
    const role = k => k === d.S.first ? "先手" : "後手";
    return { me, spec, vp, op: 1 - vp, isCpu, raw, who, whoS, role, side: k => (k === vp ? "m" : "o") };
  }

  const RULES = `<ul>
    <li><b>目的</b>：嵐が来る前に、二人の海賊が宝を山分けする。金貨（点）の多い方が勝ち。</li>
    <li><b>準備</b>：宝石25個（5色×5個。色ごとに形も違う）とドクロ5個を袋へ。注文の石を1個ずつこっそり見る（自分の<b>注文</b>の色）。1個は表にする（<b>今日の相場</b>）。</li>
    <li><b>流れ（全6回）</b>：分け手の順は <b>後・先・先・後・後・先</b>（航海日誌の枠の字）。分け手でない人が選び手。
      <ol><li>分け手は袋から5個引き、相手に見せずに<b>1個を宝箱に入れる</b>。</li>
      <li>残りの4個と宝箱を、綱の左右に分ける（どちらも1つ以上）。</li>
      <li>選び手は3つの質問「宝箱にドクロを入れた？」「宝箱の中身は何色？」「きみの注文は何色？」から1つだけ聞ける。<b>答えはうそでもよい</b>。</li>
      <li>選び手が左右どちらかの山を取る。残りは分け手のもの。宝箱はもらった人の航海日誌へ。中身は最後まで開けない（知っているのは入れた分け手だけ）。</li></ol></li>
    <li><b>決算</b>：最後に宝箱と注文を全部開ける。同じ色の宝石3個以上で<b>首飾り＝金貨3</b>。その色が自分の注文なら<b>+2</b>、今日の相場なら<b>+1</b>。ドクロは1個<b>−1</b>。二人の合計はいつも奇数なので同点にはならない。</li></ul>
    <p class="note">2人ならそれぞれのスマホで対戦、1人ならコンピュータと対戦（コンピュータもうそをつく）、3人目からは観戦。</p>`;

  function holdHTML(S, k, label) {
    const h = S.seen[k];
    const items = [0, 1, 2, 3, 4, 5].filter(c => h[c]).map(c => `<span class="tkcnt">${gem(c, 20)}<b>${h[c]}</b></span>`).join("");
    return `<div class="tkhold"><span class="tklab">${label}</span>${items || `<span class="tkdim">まだなし</span>`}</div>`;
  }
  function logHTML(S, k, w, reveal) {
    let s = `<div class="tklog" aria-label="${w.who(k)}の航海日誌">`;
    for (let r = 0; r < Y.ROUNDS; r++) {
      const spr = Y.splitter(S, r), cs = S.chests[k].filter(x => x.r === r);
      const inner = cs.map(x => reveal ? gem(x.s, 22) : (!w.spec && x.by === w.vp) ? `${chest(26)}<small>${N[x.s]}</small>` : chest(26)).join("");
      s += `<div class="tkslot ${w.side(spr)}${S.r === r && S.ph !== "done" ? " now" : ""}"><i>${r + 1}${spr === S.first ? "先" : "後"}</i>${inner}</div>`;
    }
    return s + `</div>`;
  }
  function chatHTML(d, c, w) {
    const av = k => avatar(c.nm(d.seats[k]), "sm");
    const bub = (k, html) => `<div class="ymsg ${w.side(k)}">${av(k)}<div class="b"><small class="sp">${w.who(k)}</small>${html}</div></div>`;
    const sys = html => `<div class="ysys">${html}</div>`;
    const pileT = (open, n) => open.map(s => gem(s, 16)).join("") + (n ? chest(18) : "");
    return d.ev.map(e => {
      if (e.t === "start") return sys(`― 出航 ― ${w.whoS(e.f)}が先手。1回目の分け手は後手の${w.who(1 - e.f)}`);
      if (e.t === "split") return bub(e.p, `${e.r + 1}回目：分けたよ<span class="tkpl">左 ${pileT(e.L, e.Ln)}</span><span class="tkpl">右 ${pileT(e.R, e.Rn)}</span>`);
      if (e.t === "ask") return bub(e.p, e.q === "none" ? "（質問しない）" : QTEXT[e.q]);
      if (e.t === "ans") return bub(e.p, ansText(e.q, e.v));
      if (e.t === "take") return sys(`${e.r + 1}回目：${w.who(e.p)}が<b>${e.k === 0 ? "左" : "右"}の山</b>を取った`);
      if (e.t === "end") return sys(`嵐が来た！ 宝箱と注文を開ける`);
      return "";
    }).join("");
  }
  function ledgerHTML(d, c, w) {
    const S = d.S;
    const row = k => { const s = Y.score(S, k);
      return `<tr class="${d.winners && d.winners[0] === d.seats[k] && !d.quit ? "win" : ""}"><th>${avatar(c.nm(d.seats[k]), "sm")}<span class="nm">${w.who(k)}</span></th>
        <td>${s.necks.map(x => gem(x, 16)).join("") || "−"}<br>${s.nk}×${Y.MAJ}</td><td>${orderStone(S.orders[k])} +${s.od}</td><td>+${s.mk}</td><td>${s.sk}個 −${s.sk * Y.CURSE}</td><td><b>${s.total}</b></td></tr>`; };
    return `<table class="tkledger"><tr><th></th><th>首飾り</th><th>注文</th><th>相場</th><th>ドクロ</th><th>金貨</th></tr>${row(w.op)}${row(w.vp)}</table>`;
  }

  addGame({
    id: "yamawake", name: "山分けの掟", icon: "🏴‍☠️", tone: "tomato", min: 1, max: 2,
    blurb: "ひとりが分けて、ひとりが選ぶ。宝箱の中身は分け手だけの秘密。うそOKの海賊の山分け。2人で対戦、1人ならコンピュータと。約10分。",
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
      // もう一回は「負けた人が先手」（掟どおり）
      let first;
      const pw = (prev?.winners || [])[0], pIdx = pw != null && Array.isArray(prev?.seats) ? seats.indexOf(pw) : -1;
      if (pIdx >= 0 && !prev.quit) first = 1 - pIdx;
      else first = seats[1] === CPU ? 0 : Math.floor(Math.random() * 2);
      const ro = roster(pl); ro[CPU] = ["コンピュータ", "🦊", "grape"];
      return { phase: "play", t: now, seats, players: seats.filter(s => s !== CPU), roster: ro, S: Y.create(first), n: 0, seq: 1,
               ev: [{ k: 1, t: "start", f: first }] };
    },

    step(d, { now, inputs, present }) {
      if (d.phase === "end") return d;
      const humans = d.seats.filter(s => s !== CPU);
      if (humans.some(s => !present.has(s))) return { ...d, phase: "end", t: now, quit: true, winners: humans.filter(s => present.has(s)) };
      if (d.phase === "last") {
        const el = now - d.t, acked = s => inputs[s] && inputs[s].a === "ack" && inputs[s].n === d.n;
        return el > LAST_MIN && (humans.every(acked) || el > LAST_MAX) ? { ...d, phase: "end", t: now } : d;
      }
      const seat = actor(d.S), peer = d.seats[seat];
      let a;
      if (peer === CPU) { if (now - d.t < CPU_DELAY) return d; a = cpuAct(d, seat); }
      else { a = inputs[peer]; if (!a || a.n !== d.n || typeof a.a !== "string") return d; }
      return apply(d, seat, a, now) || d;
    },

    view(el, c) {
      const d = c.d, S = d.S;
      syncLocal(c);
      const w = names(d, c), { vp, op, spec } = w;
      const pending = !!(c.my && c.my.n === d.n && c.my.a);
      const act = d.phase === "play" ? actor(S) : -1;
      const myAct = !spec && act === vp && !pending;
      const sp = S.ph === "done" ? -1 : Y.splitter(S);
      const reveal = d.phase !== "play";

      shell(el, "yamawake", `<div class="tkm">
        <div class="tktop" data-r="top"></div>
        <div class="tkturn" data-r="turn" role="status"></div>
        <div class="tkside o" data-r="opp"></div>
        <div class="tkboard" data-r="board"></div>
        <div class="ychat tkchat" data-r="chat" aria-live="polite"></div>
        <div class="tkside m" data-r="mine"></div>
        <div class="tkcomp"><p class="tkprompt" data-r="prompt"></p><div class="tkacts" data-r="acts"></div></div>
      </div>`);

      // 上：回・相場・自分の注文
      const roundT = S.ph === "done" ? "嵐が来た！" : `${S.r + 1}回目／全6回`;
      patch(R$(el, "top"), `<span class="tkchip">${roundT}</span><span class="tkchip">今日の相場 ${orderStone(S.market)} ${N[S.market]}</span>`
        + (spec ? "" : `<span class="tkchip me">あなたの注文 ${orderStone(S.orders[vp])} ${N[S.orders[vp]]}</span>`));

      // 番の表示
      let tt, tc;
      if (d.phase === "last") { tt = "決算！"; tc = "end"; }
      else {
        const doing = { split: "分けています", ask: "質問を考えています", answer: "答えを考えています", take: "山を選んでいます" }[S.ph];
        if (!spec && act === vp) { tc = "m"; tt = { split: "あなたが分け手", ask: "あなたが選び手：質問する？", answer: "質問に答える（うそOK）", take: "あなたが選ぶ番" }[S.ph]; }
        else { tc = "o"; tt = `${w.whoS(act)}が${doing}…`; }
        if (spec) tt = "観戦中 · " + tt;
      }
      const tb = R$(el, "turn"); tb.className = "tkturn " + tc; patch(tb, tt);

      // 相手と自分
      const sideHTML = k => `<div class="tkname">${avatar(c.nm(d.seats[k]), "sm")}<b>${w.who(k)}</b><span class="tkrole">${w.role(k)}</span>${reveal ? `<span class="tkchip">注文 ${orderStone(S.orders[k])} ${N[S.orders[k]]}</span>` : (k !== vp || spec ? `<span class="tkchip">注文 ${orderStone(null)} ？</span>` : "")}</div>`
        + holdHTML(S, k, "手元") + logHTML(S, k, w, reveal);
      patch(R$(el, "opp"), sideHTML(op));
      patch(R$(el, "mine"), sideHTML(vp));

      // 掟の板（綱の左右）
      let board = "";
      if (d.phase === "last") {
        board = ledgerHTML(d, c, w);
      } else if (S.ph === "split") {
        if (myAct) {
          if (L.step === "hide") {
            board = `<p class="tkhint">袋から引いた5個。<b>宝箱に入れる1個</b>を押す（相手には見えない）</p><div class="tkdraw">`
              + S.draw.map((s, j) => `<button class="tkpick${L.hid === j ? " on" : ""}" data-tap="hid" data-i="${j}" aria-pressed="${L.hid === j}">${gem(s, 40)}</button>`).join("") + `</div>`;
          } else {
            const cell = j => `<button class="tkpick" data-tap="flip" data-i="${j}" aria-label="${j === L.hid ? "宝箱" : N[S.draw[j]]}を反対側へ">${j === L.hid ? `${chest(40)}<small>${N[S.draw[j]]}</small>` : gem(S.draw[j], 36)}</button>`;
            const half = k => S.draw.map((_, j) => j).filter(j => L.side[j] === k).map(cell).join("");
            board = `<p class="tkhint">押すと綱の反対側へ動く。どちらの山も1つ以上</p><div class="tkhalves"><div class="tkhalf">${half(0)}<span>左の山</span></div><div class="tkrope"></div><div class="tkhalf">${half(1)}<span>右の山</span></div></div>`;
          }
        } else board = `<div class="tkhalves"><div class="tkhalf"><span>左の山</span></div><div class="tkrope"></div><div class="tkhalf"><span>右の山</span></div></div><p class="tkhint">${w.whoS(sp)}が袋から5個引いて、宝箱に1個隠しています…</p>`;
      } else {
        const P = Y.piles(S), mineChest = !spec && sp === vp;
        const half = k => P[k].ix.map(j => j === S.hid ? `<span class="tkitem">${chest(40)}${mineChest ? `<small>${N[S.draw[j]]}</small>` : ""}</span>` : `<span class="tkitem">${gem(S.draw[j], 34)}</span>`).join("");
        const can = myAct && S.ph === "take";
        const H = k => can ? `<button class="tkhalf pick" data-tap="take" data-k="${k}" aria-label="${k ? "右" : "左"}の山を取る">${half(k)}<span>${k ? "右" : "左"}の山を取る</span></button>`
          : `<div class="tkhalf">${half(k)}<span>${k ? "右" : "左"}の山</span></div>`;
        board = `<div class="tkhalves">${H(0)}<div class="tkrope"></div>${H(1)}</div>`;
      }
      patch(R$(el, "board"), board);

      // 会話
      const ch = R$(el, "chat"), before = ch.__h;
      patch(ch, chatHTML(d, c, w));
      if (ch.__h !== before) { const last = ch.lastElementChild; if (last) last.classList.add("new"); ch.scrollTop = ch.scrollHeight; }

      // 案内と操作
      let p = "", acts = "";
      if (d.phase === "last") {
        const won = d.winners && d.winners[0] === c.me;
        p = spec ? "宝箱と注文を開けました" : won ? "あなたの勝ち！" : "負けた…もう一回は負けた人が先手";
        if (!spec) acts = (c.my && c.my.a === "ack" && c.my.n === d.n) ? `<span class="tkdim">相手を待っています…</span>` : btn("結果を見る", "ack", { pri: 1 });
      } else if (spec) p = "";
      else if (pending) p = "送っています…";
      else if (!myAct) p = "";
      else if (S.ph === "split") {
        if (L.step === "hide") { p = L.hid < 0 ? "宝箱に入れる石を選んでね" : `宝箱に「${N[S.draw[L.hid]]}」を入れる`; acts = btn("宝箱に入れてふたをする", "hidok", { pri: 1, dis: L.hid < 0 }); }
        else { const ok = L.side.includes(0) && L.side.includes(1); p = "左右に分けたら「この分け方で出す」"; acts = btn("戻る", "back") + btn("この分け方で出す", "offer", { pri: 1, dis: !ok }); }
      } else if (S.ph === "ask") {
        p = "1つだけ質問できる（相手はうそをつくかも）";
        acts = ["skull", "color", "order"].map(q => btn(QTEXT[q], "ask", { data: ` data-q="${q}"` })).join("") + btn("聞かない", "ask", { data: ` data-q="none"` });
      } else if (S.ph === "answer") {
        const hc = S.draw[S.hid];
        p = `「${QTEXT[S.q]}」と聞かれた（宝箱の中身：${N[hc]}／あなたの注文：${N[S.orders[vp]]}）。うそでもいい`;
        if (S.q === "skull") acts = btn("入れたよ", "ans", { data: ` data-v="yes"` }) + btn("入れてないよ", "ans", { data: ` data-v="no"` });
        else acts = [0, 1, 2, 3, 4, 5].slice(0, S.q === "order" ? 5 : 6).map(v => btn(`${gem(v, 18)}${N[v]}`, "ans", { cls: "tkcol" + ((S.q === "color" ? hc : S.orders[vp]) === v ? " truth" : ""), data: ` data-v="${v}"` })).join("");
        acts += btn("それは教えない", "ans", { data: ` data-v="secret"` });
      } else if (S.ph === "take") p = "どちらかの山を押して取る。残りは分け手のもの";
      patch(R$(el, "prompt"), esc(p).replace(/&lt;b&gt;|&lt;\/b&gt;/g, ""));
      const ac = R$(el, "acts"); ac.hidden = !acts; patch(ac, acts);
    },

    tap(kind, ds, c) {
      const d = c.d, S = d.S;
      syncLocal(c);
      const seat = seatOf(d, c.me);
      if (seat < 0) return;
      if (kind === "ack") { if (d.phase === "last") send(c, { a: "ack" }); return; }
      if (d.phase !== "play" || actor(S) !== seat || (c.my && c.my.n === d.n && c.my.a)) return;
      if (S.ph === "split") {
        if (kind === "hid") { const i = +ds.i; if (i >= 0 && i < S.draw.length) L.hid = L.hid === i ? -1 : i; }
        else if (kind === "hidok" && L.hid >= 0) L.step = "split";
        else if (kind === "back") L.step = "hide";
        else if (kind === "flip") { const i = +ds.i; if (i >= 0 && i < L.side.length) L.side[i] = 1 - L.side[i]; }
        else if (kind === "offer" && Y.validSplit(S, L.hid, L.side)) send(c, { a: "split", hid: L.hid, side: L.side.slice() });
      } else if (S.ph === "ask" && kind === "ask") send(c, { a: "ask", q: ds.q });
      else if (S.ph === "answer" && kind === "ans") send(c, { a: "ans", v: /^\d$/.test(ds.v) ? +ds.v : ds.v });
      else if (S.ph === "take" && kind === "take") send(c, { a: "take", k: +ds.k });
    },

    scoreRows: () => [],

    endView(d, c) {
      const w = names(d, c);
      if (d.quit) return `<p class="note">相手が部屋を出たので、ここで終わりにしました。</p>`;
      const S = d.S, a = Y.score(S, w.vp), b = Y.score(S, w.op);
      const chests = k => S.chests[k].map(x => `<span class="tkcnt"><i>${x.r + 1}回目</i>${gem(x.s, 20)}</span>`).join("") || "なし";
      return `<div class="tkm tkend">${ledgerHTML(d, c, w)}
        <div class="tkhold"><span class="tklab">${w.who(w.vp)}の宝箱</span>${chests(w.vp)}</div>
        <div class="tkhold"><span class="tklab">${w.who(w.op)}の宝箱</span>${chests(w.op)}</div>
        <p class="note">${Math.abs(a.total - b.total)}点差。今日の相場は${N[S.market]}。もう一回は負けた人が先手。</p></div>`;
    }
  });
})();
