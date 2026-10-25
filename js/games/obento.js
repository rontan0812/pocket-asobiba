/* おべんとう はんぶんこ：おかずを2つの皿に分けて、先に選ぶ／残りをもらう。もらったおかずを自分の弁当箱に詰める2人用パズル。
   2人ならそれぞれのスマホで対戦、1人ならコンピュータと対戦、3人目からは観戦（もう一回で交代）。
   - ルール（Ben）は設計ループの最終版 v8 と同じ（点の数え方・リクエスト・分ける人の決まり・コンピュータの考え方）。
   - ホストのスマホだけが Ben を動かす。詰める段階は2人が同時に、自分の箱だけを操作する。 */
(() => {
"use strict";
  // ===== ルールとコンピュータ（v8） =====
  const Ben = (() => {
    const W = 6, H = 4, N = W * H, ROUNDS = 5, OFFER = 4, BONUS = 3, REQV = 3;
    const TARGET = { R: 12, M: 4, S: 8 };                       // 主食:主菜:副菜 = 3:1:2
    const KIND = { w: "R", b: "M", y: "M", g: "S", r: "S" };    // 色 → 種類（白ごはん／茶からあげ・黄たまご焼き／緑ブロッコリー・赤トマト）
    const SHAPES = {
      m1: [[0, 0]], i2: [[0, 0], [1, 0]], i3: [[0, 0], [1, 0], [2, 0]], l3: [[0, 0], [0, 1], [1, 1]],
      o4: [[0, 0], [1, 0], [0, 1], [1, 1]], l4: [[0, 0], [0, 1], [0, 2], [1, 2]], t4: [[0, 0], [1, 0], [2, 0], [1, 1]],
      s4: [[1, 0], [2, 0], [0, 1], [1, 1]]
    };
    const DECK = [];
    const add = (k, sh, c, n) => { for (let i = 0; i < n; i++) DECK.push(k + ":" + sh + ":" + c); };
    add("R", "o4", "w", 3); add("R", "l4", "w", 2); add("R", "i3", "w", 2); add("R", "l3", "w", 2);
    add("M", "m1", "b", 2); add("M", "m1", "y", 2); add("M", "i2", "b", 2); add("M", "i2", "y", 2);
    add("S", "i2", "r", 2); add("S", "l3", "g", 2); add("S", "l3", "r", 1); add("S", "i3", "g", 1); add("S", "t4", "g", 1); add("S", "s4", "g", 1);
    const norm = cells => { const mx = Math.min(...cells.map(c => c[0])), my = Math.min(...cells.map(c => c[1]));
      return cells.map(c => [c[0] - mx, c[1] - my]).sort((a, b) => a[1] - b[1] || a[0] - b[0]); };
    const ROT = {};
    for (const k in SHAPES) { const out = [], seen = new Set(); let cur = SHAPES[k];
      for (let r = 0; r < 4; r++) { const n = norm(cur), key = JSON.stringify(n); if (!seen.has(key)) { seen.add(key); out.push(n); } cur = cur.map(([x, y]) => [-y, x]); }
      ROT[k] = out; }
    const kindOf = id => id.split(":")[0], shapeOf = id => id.split(":")[1], colorOf = id => id.split(":")[2], sizeOf = id => SHAPES[shapeOf(id)].length;
    const colorCount = (box, c) => box.filter(v => v === c).length;
    const REQ = {
      kara: { name: "からあげ好き", text: "からあげが3マス以上", need: 3, cnt: box => colorCount(box, "b"), color: "b" },
      tama: { name: "たまご焼き好き", text: "たまご焼きが3マス以上", need: 3, cnt: box => colorCount(box, "y"), color: "y" },
      toma: { name: "トマト好き", text: "トマトが3マス以上", need: 3, cnt: box => colorCount(box, "r"), color: "r" },
      bro: { name: "やさい多め", text: "ブロッコリーが5マス以上", need: 5, cnt: box => colorCount(box, "g"), color: "g" },
      oni: { name: "おにぎり2こ", text: "ごはんで2×2の四角を2つ（重ならない）", need: 2, cnt: box => { const used = new Set(); let n = 0;
        for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) { const q = [y * W + x, y * W + x + 1, (y + 1) * W + x, (y + 1) * W + x + 1];
          if (q.every(i => box[i] === "w" && !used.has(i))) { q.forEach(i => used.add(i)); n++; } } return n; } },
      shoku: { name: "ごはん少なめ", text: "ごはんを8マスまで（最後に判定）", need: 1, cnt: box => (colorCount(box, "w") <= 8 ? 1 : 0), late: true }
    };
    const REQ_IDS = Object.keys(REQ);
    function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
    function shuffle(arr, r) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
    const reqMet = (box, req, final) => (req || []).map(k => (REQ[k].late && !final) ? false : REQ[k].cnt(box) >= REQ[k].need);

    function create(seed, firstDiv) {
      const r = rng(seed), deck = shuffle(DECK, r), req = shuffle(REQ_IDS, r).slice(0, 2);
      return { deck, req, round: 0, phase: "split", offer: deck.slice(0, OFFER), split: 0,
        hands: [[], []], boxes: [Array(N).fill(null), Array(N).fill(null)], order: [], div: firstDiv };
    }
    const clone = s => ({ ...s, offer: s.offer.slice(), hands: [s.hands[0].slice(), s.hands[1].slice()], boxes: [s.boxes[0].slice(), s.boxes[1].slice()], order: s.order.slice() });
    const player = s => s.phase === "split" ? s.div : s.phase === "choose" ? 1 - s.div : (s.order.find(p => s.hands[p].length) ?? s.div);
    function fits(box, cells, x, y) { for (const [cx, cy] of cells) { const X = x + cx, Y = y + cy; if (X >= W || Y >= H || box[Y * W + X]) return false; } return true; }
    function movesFor(s, p) {
      const ms = [];
      s.hands[p].forEach((id, i) => ROT[shapeOf(id)].forEach((cells, r) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (fits(s.boxes[p], cells, x, y)) ms.push({ t: "place", i, r, x, y, p }); }));
      if (!ms.length) s.hands[p].forEach((id, i) => ms.push({ t: "drop", i, p }));
      return ms;
    }
    function moves(s) {
      if (s.phase === "split") { const ms = [], n = s.offer.length; for (let m = 1; m < (1 << n) - 1; m++) if (m & 1) ms.push({ t: "split", m }); return ms; }
      if (s.phase === "choose") return [{ t: "choose", k: 0 }, { t: "choose", k: 1 }];
      return movesFor(s, player(s));
    }
    const pileOf = (s, k) => s.offer.filter((_, i) => (((s.split >> i) & 1) ? 0 : 1) === k);
    function play(s, m) {
      const t = clone(s);
      if (m.t === "split") { t.split = m.m; t.phase = "choose"; return t; }
      if (m.t === "choose") { const ch = 1 - t.div; t.hands[ch] = pileOf(t, m.k); t.hands[1 - ch] = pileOf(t, 1 - m.k); t.order = [ch, 1 - ch]; t.phase = "place"; return t; }
      const p = m.p != null ? m.p : player(t), id = t.hands[p][m.i];
      if (m.t === "place") for (const [cx, cy] of ROT[shapeOf(id)][m.r]) t.boxes[p][(m.y + cy) * W + m.x + cx] = colorOf(id);
      t.hands[p].splice(m.i, 1);
      if (!t.hands[0].length && !t.hands[1].length) {
        t.round++;
        if (t.round < ROUNDS) {
          t.offer = t.deck.slice(t.round * OFFER, t.round * OFFER + OFFER); t.phase = "split";
          const sc = score(t); t.div = sc[0] !== sc[1] ? (sc[0] > sc[1] ? 0 : 1) : 1 - t.div;   // 点が多い方が分ける（同点は交代）
        } else { t.phase = "end"; t.offer = []; }
      }
      return t;
    }
    function counts(box) { const c = { R: 0, M: 0, S: 0 }; for (const v of box) if (v) c[KIND[v]]++; return c; }
    function colorCols(box) { const ok = []; for (let x = 0; x < W; x++) { const k = new Set(); for (let y = 0; y < H; y++) { const v = box[y * W + x]; if (v) k.add(v); } ok.push(k.size >= 3); } return ok; }
    function boxScore(box, req, final) {
      const c = counts(box); let base = 0;
      for (const k in TARGET) base += Math.min(c[k], TARGET[k]);
      const full = box.every(Boolean), cols = colorCols(box), color = cols.filter(Boolean).length;
      const rq = reqMet(box, req, final), reqPts = REQV * rq.filter(Boolean).length;
      return { base, bonus: full ? BONUS : 0, color, cols, req: rq, reqPts, total: base + (full ? BONUS : 0) + color + reqPts, c, empty: box.filter(v => !v).length };
    }
    const score = s => [0, 1].map(p => boxScore(s.boxes[p], s.req, s.phase === "end").total);
    function winner(s) { const f = score(s); if (f[0] !== f[1]) return f[0] > f[1] ? 0 : 1;
      const e = s.boxes.map(b => b.filter(x => !x).length); return e[0] < e[1] ? 0 : e[1] < e[0] ? 1 : -1; }
    // コンピュータの見込み（設計ループの計測AIと同じ）
    function evalFor(s, p) {
      const box = s.boxes[p], over = s.phase === "end", b = boxScore(box, s.req, over);
      let v = b.total;
      if (!over) s.req.forEach((k, j) => { const R = REQ[k]; if (R.late) { if (b.c.R <= 8) v += REQV * 0.6; return; } if (b.req[j]) return;
        let n = R.cnt(box); if (R.color) for (const id of s.hands[p]) if (colorOf(id) === R.color) n += sizeOf(id);
        v += REQV * 0.6 * Math.min(1, n / R.need); });
      const seen = new Array(N).fill(false); let small1 = 0, small2 = 0, edge = 0;
      for (let i = 0; i < N; i++) if (!box[i] && !seen[i]) { const st = [i]; seen[i] = true; let sz = 0;
        while (st.length) { const a = st.pop(); sz++; const x = a % W, y = (a / W) | 0;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= W || Y >= H) continue; const q = Y * W + X; if (!box[q] && !seen[q]) { seen[q] = true; st.push(q); } } }
        if (sz === 1) small1++; else if (sz === 2) small2++; }
      for (let i = 0; i < N; i++) if (box[i]) { const x = i % W, y = (i / W) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= W || Y >= H || box[Y * W + X]) edge++; } }
      v -= 0.7 * Math.max(0, small1 - Math.max(0, TARGET.M - b.c.M)) + 0.35 * small2; v += 0.02 * edge;
      const need = { R: TARGET.R - b.c.R, M: TARGET.M - b.c.M, S: TARGET.S - b.c.S }; let free = b.empty;
      for (const id of s.hands[p]) { const k = kindOf(id), sz = sizeOf(id), u = Math.max(0, Math.min(sz, need[k], free)); v += 0.8 * u; need[k] -= u; free -= sz; }
      if (!over) { v += BONUS * 0.25 * (1 - free / N) * (s.round + 1) / ROUNDS;
        v += 0.05 * Math.min(Math.max(0, need.R) + Math.max(0, need.M) + Math.max(0, need.S), free) * (ROUNDS - s.round); }
      return v;
    }
    const val = (s, p) => evalFor(s, p) - evalFor(s, 1 - p);
    // 分けるときは、相手の選び方まで読む。選ぶ・詰めるは1手読み
    function cpuMove(s, p) {
      const ms = s.phase === "place" ? movesFor(s, p) : moves(s);
      let best = -Infinity, cands = [];
      for (const m of ms) {
        const t = play(s, m); let v;
        if (s.phase === "split") { const q = 1 - p; let bq = -Infinity; v = 0;
          for (const m2 of moves(t)) { const u = play(t, m2), vq = val(u, q); if (vq > bq) { bq = vq; v = val(u, p); } } }
        else v = val(t, p);
        if (v > best + 1e-9) { best = v; cands = [m]; } else if (Math.abs(v - best) <= 1e-9) cands.push(m);
      }
      return cands[Math.floor(Math.random() * cands.length)];
    }
    return { W, H, N, ROUNDS, OFFER, BONUS, REQV, TARGET, KIND, ROT, REQ, create, play, movesFor, moves, pileOf, fits, boxScore, score, winner, cpuMove, shapeOf, colorOf, kindOf, sizeOf };
  })();

  const CPU = "cpu";
  const CPU_DELAY = 1000, CPU_PLACE = 650;            // コンピュータが考える時間・詰める間隔
  const BOX = ["あかい", "あおい"];                    // 座席0が「あかい弁当箱」（1回目に分ける）

  // ---- 絵（おかず1マス） ----
  function cellG(c, x, y, cs) {
    const r = cs * 0.18, m = cs / 2, base = (f, s) => `<rect x="${x + 1.5}" y="${y + 1.5}" width="${cs - 3}" height="${cs - 3}" rx="${r}" fill="${f}" stroke="${s}" stroke-width="1.5"/>`;
    if (c === "w") return base("#fdfaf2", "#c9bfa8") + [[.3, .35, 20], [.62, .3, -25], [.45, .62, 10], [.72, .66, 35]].map(([a, b, ro]) => `<ellipse cx="${x + cs * a}" cy="${y + cs * b}" rx="${cs * .07}" ry="${cs * .035}" transform="rotate(${ro} ${x + cs * a} ${y + cs * b})" fill="#cdbf9f"/>`).join("");
    if (c === "b") return base("#f6e7c8", "#c9a46a") + `<path d="M${x + cs * .22} ${y + cs * .55} q${cs * .02} -${cs * .32} ${cs * .3} -${cs * .32} q${cs * .3} ${cs * .02} ${cs * .27} ${cs * .3} q-${cs * .05} ${cs * .25} -${cs * .3} ${cs * .24} q-${cs * .28} -${cs * .02} -${cs * .27} -${cs * .22} Z" fill="#b5562a" stroke="#7a3517" stroke-width="1.5"/><circle cx="${x + cs * .42}" cy="${y + cs * .4}" r="${cs * .07}" fill="#d98b4e"/>`;
    if (c === "y") return base("#f6e7c8", "#c9a46a") + `<rect x="${x + cs * .16}" y="${y + cs * .24}" width="${cs * .68}" height="${cs * .52}" rx="${cs * .1}" fill="#f4c430" stroke="#c99a12" stroke-width="1.5"/>` + [.36, .5, .64].map(t => `<path d="M${x + cs * t} ${y + cs * .28} q${cs * .06} ${cs * .22} 0 ${cs * .44}" stroke="#e0a91a" stroke-width="1.5" fill="none"/>`).join("");
    if (c === "r") return base("#e6f1da", "#9cbf7e") + `<circle cx="${x + m}" cy="${y + m + cs * .04}" r="${cs * .26}" fill="#d7372f" stroke="#a3221c" stroke-width="1.5"/><circle cx="${x + m - cs * .09}" cy="${y + m - cs * .04}" r="${cs * .06}" fill="#f08a84"/><path d="M${x + m - cs * .1} ${y + m - cs * .2} l${cs * .1} ${cs * .06} l${cs * .1} -${cs * .06} l-${cs * .1} ${cs * .14} Z" fill="#3d6e22"/>`;
    return base("#e6f1da", "#9cbf7e") + `<rect x="${x + m - cs * .05}" y="${y + m}" width="${cs * .1}" height="${cs * .3}" fill="#8bb36a"/>` + [[-.16, .02], [.16, .02], [0, -.14], [0, .08]].map(([a, b]) => `<circle cx="${x + m + cs * a}" cy="${y + m + cs * b - cs * .06}" r="${cs * .16}" fill="#4f8f2e"/>`).join("");
  }
  const FOOD = { w: "ごはん", b: "からあげ", y: "たまご焼き", g: "ブロッコリー", r: "トマト" };
  function pieceSVG(id, rot, cs) {
    const cells = Ben.ROT[Ben.shapeOf(id)][rot || 0], c = Ben.colorOf(id);
    const w = Math.max(...cells.map(q => q[0])) + 1, h = Math.max(...cells.map(q => q[1])) + 1;
    return `<svg width="${w * cs + 2}" height="${h * cs + 2}" viewBox="0 0 ${w * cs + 2} ${h * cs + 2}" aria-hidden="true">${cells.map(([x, y]) => cellG(c, x * cs + 1, y * cs + 1, cs)).join("")}</svg>`;
  }
  const pieceName = id => `${FOOD[Ben.colorOf(id)]}${Ben.sizeOf(id)}マス`;
  const icon = c => `<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">${cellG(c, 0, 0, 22)}</svg>`;

  // 弁当箱：マスはボタン（自分が詰めるときだけ押せる）
  function boxHTML(box, o = {}) {
    const S = Ben.boxScore(box, o.req, o.final);
    const cells = box.map((c, i) => {
      const inner = c ? `<svg viewBox="0 0 40 40" aria-hidden="true">${cellG(c, 0, 0, 40)}</svg>` : "";
      const lab = c ? FOOD[c] : "空き";
      return o.live && !c ? `<button class="obc" data-tap="slot" data-i="${i}" aria-label="${(i % 6) + 1}列${Math.floor(i / 6) + 1}段目に置く"></button>`
        : `<span class="obc${c ? " on" : ""}" role="img" aria-label="${lab}">${inner}</span>`;
    }).join("");
    const stars = S.cols.map(ok => `<span>${ok ? "★" : ""}</span>`).join("");
    return `<div class="obbox ${o.seat ? "s1" : "s0"}${o.mini ? " mini" : ""}"><div class="obgrid">${cells}</div><div class="obstars" aria-hidden="true">${stars}</div></div>`;
  }
  function meterHTML(box, req, final) {
    const b = Ben.boxScore(box, req, final);
    const kinds = [["R", "ごはん"], ["M", "主菜"], ["S", "副菜"]].map(([k, n]) => { const ok = b.c[k] >= Ben.TARGET[k], over = b.c[k] - Ben.TARGET[k];
      return `<span class="obk${ok ? " ok" : ""}"><b>${n}</b> ${Math.min(b.c[k], Ben.TARGET[k])}/${Ben.TARGET[k]}${ok ? "✓" : ""}${over > 0 ? `<em>こえた${over}マスは0点</em>` : ""}</span>`; }).join("");
    const chip = (on, t) => `<span class="obchip${on ? " on" : ""}">${t}</span>`;
    const chips = chip(b.bonus, b.bonus ? `すき間なし +${Ben.BONUS}` : `すき間なし +${Ben.BONUS}（空き${b.empty}）`)
      + chip(b.color > 0, `彩り★ ${b.color}列 +${b.color}`)
      + req.map((k, j) => { const R = Ben.REQ[k];
        if (R.late) { const n = b.c.R; return chip(b.req[j], `「${R.name}」 ごはん${n}/8まで${b.req[j] ? ` +${Ben.REQV}` : n > 8 ? " ×" : ""}`); }
        return chip(b.req[j], `「${R.name}」 ${b.req[j] ? "+" + Ben.REQV : Math.min(R.cnt(box), R.need) + "/" + R.need}`); }).join("");
    return `<div class="obmeter"><div class="obkinds">${kinds}</div><div class="obchips">${chips}</div></div>`;
  }

  const RULES = `<ul>
    <li>きょうのおかずを2人で分けて、自分の弁当箱（4×6マス）に詰める。全部で5回。</li>
    <li>毎回おかずが4つ出る。<b>分ける人</b>が2つの皿に分け（どちらにも1つ以上）、もう1人が<b>先に好きな皿を取る</b>。残りが分ける人の分。</li>
    <li>分ける人は<b>そのとき点が多い方</b>（同点なら交代。1回目はあかい弁当箱）。先に選ぶ方が1回あたり約1点得なので、追いかける方が先に選べる。</li>
    <li>もらったおかずは2人同時に自分の箱へ。マスを押すと、そこに入る向きで置ける（「回す」で向きを選べる）。重ねたり、はみ出したりはできない。入らないおかずはあきらめる。</li>
    <li>1マス1点。ただし点になるのは<b>ごはん12・主菜4・副菜8マスまで</b>（主食:主菜:副菜＝3:1:2）。</li>
    <li><b>すき間なし</b>（24マス全部）で+3。<b>彩り★</b>：縦1列に3色以上（白・茶・黄・緑・赤）で1列ごとに+1。</li>
    <li><b>きょうのリクエスト</b>：毎回2枚。満たしたら1枚+3（2人とももらえる）。「ごはん少なめ」だけは最後に判定。</li>
    <li>5回終わって点が多い方の勝ち。同点なら空きマスが少ない方。</li></ul>
    <table class="ruletable"><tr><th>リクエスト</th><th>条件</th></tr>
    ${Object.values(Ben.REQ).map(R => `<tr><td>${R.name}</td><td>${R.text}</td></tr>`).join("")}</table>
    <p class="note">2人ならそれぞれのスマホで対戦、1人ならコンピュータと対戦、3人目からは観戦。約12分。</p>`;

  // ---- それぞれのスマホ：画面の中だけの状態 ----
  let L = { gid: null };
  function syncLocal(c) {
    const S = c.d.S, key = `${c.gid}:${S.round}:${S.phase}`;
    if (L.key !== key) { L = { gid: c.gid, key, assign: S.offer.map((_, i) => (i < 2 ? 0 : 1)), sel: 0, rot: 0, scrolled: L.scrolled }; }
  }
  const seatOf = (d, me) => d.seats.indexOf(me);
  // 自分がまだ届いていない詰め方も、自分の画面には先に反映して見せる
  function myPending(c, seat) {
    const d = c.d, S = d.S, my = c.my;
    if (seat < 0 || S.phase !== "place" || !my || my.rd !== S.round || !Array.isArray(my.pl)) return { S, pl: [] };
    let s = S; const pl = my.pl.slice(0, d.pc[seat]);
    for (let k = d.pc[seat]; k < my.pl.length; k++) { const m = check(s, seat, my.pl[k]); if (!m) break; s = Ben.play(s, m); pl.push(my.pl[k]); }
    return { S: s, pl };
  }
  function check(S, seat, e) {
    if (!e || S.phase !== "place" || !S.hands[seat].length) return null;
    const i = e.i, h = S.hands[seat];
    if (!Number.isInteger(i) || i < 0 || i >= h.length) return null;
    if (e.drop) return Ben.movesFor(S, seat)[0]?.t === "drop" ? { t: "drop", i, p: seat } : null;
    const rots = Ben.ROT[Ben.shapeOf(h[i])];
    if (!Number.isInteger(e.r) || !rots[e.r] || !Number.isInteger(e.x) || !Number.isInteger(e.y) || !Ben.fits(S.boxes[seat], rots[e.r], e.x, e.y)) return null;
    return { t: "place", i, r: e.r, x: e.x, y: e.y, p: seat };
  }

  function names(d, c) {
    const me = seatOf(d, c.me), spec = me < 0, vp = spec ? 0 : me;
    const isCpu = k => d.seats[k] === CPU;
    const raw = k => isCpu(k) ? "コンピュータ" : c.nm(d.seats[k]).name;
    const who = k => !spec && k === vp ? "あなた" : esc(raw(k));
    const whoS = k => !spec && k === vp ? "あなた" : isCpu(k) ? "コンピュータ" : esc(raw(k)) + "さん";
    return { me, spec, vp, op: 1 - vp, isCpu, raw, who, whoS };
  }

  addGame({
    id: "obento", name: "おべんとう はんぶんこ", icon: "🍱", tone: "mustard", min: 1, max: 2,
    blurb: "おかずを2皿に分けて、相手が先に選ぶ。もらったおかずを弁当箱に詰めるパズル。2人で対戦、1人ならコンピュータと。約12分。",
    rules: RULES,

    init(pl, now, prev) {
      const ids = pl.map(p => p.peer);
      let seats;
      if (ids.length === 1) seats = prev && Array.isArray(prev.seats) && prev.seats[0] === CPU ? [ids[0], CPU] : prev ? [CPU, ids[0]] : [ids[0], CPU];
      else {
        const ps = prev && Array.isArray(prev.seats) ? prev.seats.filter(s => s !== CPU) : [];
        seats = ids.slice(0, 2);
        if (ps.length === 2 && ps.every(p => ids.includes(p))) seats = [ps[1], ps[0]];   // 同じ2人なら、1回目に分ける人を交代
        if (ids.length > 2 && ps.length) {                                               // 3人目からは、負けた人と次の人が交代
          const queue = ids.filter(p => !ps.includes(p)), w = (prev?.winners || [])[0];
          if (queue.length && w && ids.includes(w)) seats = [queue[0], w];
          else if (queue.length >= 2) seats = queue.slice(0, 2);
          else if (queue.length === 1) seats = [queue[0], ps.find(p => ids.includes(p)) || ids.find(p => p !== queue[0])];
        }
        seats = seats.filter((p, i, a) => ids.includes(p) && a.indexOf(p) === i);
        if (seats.length < 2) seats = ids.slice(0, 2);
      }
      const S = Ben.create(Math.floor(Math.random() * 2 ** 31), 0);
      const ro = roster(pl); ro[CPU] = ["コンピュータ", "🦊", "mustard"];
      return { phase: "play", t: now, ct: now, seats, players: seats.filter(s => s !== CPU), roster: ro, S, pc: [0, 0], n: 0 };
    },

    step(d, { now, inputs, present }) {
      if (d.phase === "end") return d;
      const humans = d.seats.filter(s => s !== CPU);
      if (humans.some(s => !present.has(s))) return { ...d, phase: "end", t: now, quit: true, winners: humans.filter(s => present.has(s)) };
      let S = d.S, pc = d.pc.slice(), ct = d.ct, changed = false;
      const r0 = S.round, ph0 = S.phase;
      if (S.phase === "split" || S.phase === "choose") {
        const seat = S.phase === "split" ? S.div : 1 - S.div, peer = d.seats[seat];
        let m = null;
        if (peer === CPU) { if (now - d.t < CPU_DELAY) return d; m = Ben.cpuMove(S, seat); }
        else {
          const a = inputs[peer];
          if (!a || a.rd !== S.round || a.ph !== S.phase) return d;
          if (S.phase === "split" && Ben.moves(S).some(x => x.m === a.m)) m = { t: "split", m: a.m };
          if (S.phase === "choose" && (a.k === 0 || a.k === 1)) m = { t: "choose", k: a.k };
          if (!m) return d;
        }
        S = Ben.play(S, m); changed = true;
      } else if (S.phase === "place") {
        for (const seat of [0, 1]) {
          const peer = d.seats[seat];
          if (peer === CPU) {
            if (S.phase === "place" && S.round === r0 && S.hands[seat].length && now - Math.max(ct, d.t) >= CPU_PLACE) { S = Ben.play(S, Ben.cpuMove(S, seat)); ct = now; changed = true; }
            continue;
          }
          const a = inputs[peer];
          if (!a || a.rd !== r0 || !Array.isArray(a.pl)) continue;
          while (S.phase === "place" && S.round === r0 && S.hands[seat].length && pc[seat] < a.pl.length && pc[seat] < 12) {
            const m = check(S, seat, a.pl[pc[seat]]); if (!m) break;
            S = Ben.play(S, m); pc[seat]++; changed = true;
          }
        }
      }
      if (!changed) return d;
      const moved = S.round !== r0 || S.phase !== ph0;
      if (S.phase === "end") { const w = Ben.winner(S); return { ...d, S, pc, n: d.n + 1, t: now, phase: "end", winners: w < 0 ? [] : [d.seats[w]] }; }
      return { ...d, S, pc: S.round !== r0 ? [0, 0] : pc, ct, n: d.n + 1, t: moved ? now : d.t };
    },

    view(el, c) {
      const d = c.d;
      syncLocal(c);
      const w = names(d, c), { vp, op, spec } = w;
      const P = myPending(c, spec ? -1 : vp), S = P.S, D = d.S;             // S＝自分の画面用（自分の未着の詰め方を反映）
      const sc = Ben.score(S);
      shell(el, "obento", `<div class="obt">
        <div class="obside o" data-r="opp"></div>
        <div class="obturn" data-r="turn" role="status"></div>
        <div class="obcloth"><div class="oblegend">${icon("w")}ごはん　${icon("b")}${icon("y")}主菜　${icon("g")}${icon("r")}副菜</div>
          <div class="obrule">点が多い方が分け、追いかける方が先に選ぶ（先に選ぶ方が1回あたり約1点得）</div>
          <div class="obstage" data-r="stage"></div><div class="obreq" data-r="req"></div><div class="obnext" data-r="next"></div></div>
        <div class="obside m" data-r="me"></div>
      </div>`);

      if (L.scrolled !== c.gid) {   // 始まったら、ゲームの枠を画面の上に寄せる
        L.scrolled = c.gid;
        setTimeout(() => { const y = el.querySelector(".obt"); if (y && y.getBoundingClientRect().top > 8) y.scrollIntoView({ block: "start" }); }, 80);
      }
      const seatHead = k => `<div class="obhead"><span class="obbx s${k}" aria-hidden="true"></span>${avatar(c.nm(d.seats[k]), "sm")}<span class="nm">${w.who(k)}<small>${BOX[k]}弁当箱</small></span><b class="obpts">${sc[k]}<small>点</small></b></div>`;
      // 相手（小さく）
      patch(R$(el, "opp"), seatHead(op) + `<div class="obrow">${boxHTML(S.boxes[op], { seat: op, mini: 1, req: S.req })}${meterHTML(S.boxes[op], S.req, false)}</div>`);

      // 番の表示
      const div = D.div, chooser = 1 - div, mine = k => !spec && k === vp;
      let tt, tc = "o";
      if (D.phase === "split") { tt = mine(div) ? "あなたが分ける番" : `${w.whoS(div)}が分けています（先に選ぶのは${w.who(chooser)}）`; tc = mine(div) ? "m" : "o"; }
      else if (D.phase === "choose") { tt = mine(chooser) ? "あなたが先に選ぶ番" : `${w.whoS(chooser)}が皿を選んでいます`; tc = mine(chooser) ? "m" : "o"; }
      else { const left = spec ? 1 : S.hands[vp].length; tt = left ? "2人同時に、自分の箱に詰めよう" : "詰め終わり。相手を待っています"; tc = left ? "m" : "o"; }
      if (spec) tt = "観戦中 · " + tt;
      const tb = R$(el, "turn"); tb.className = "obturn " + tc; patch(tb, `<span class="rd">第${Math.min(D.round + 1, Ben.ROUNDS)}/${Ben.ROUNDS}回</span>${tt}`);

      // 中央：分ける・選ぶ
      let st = "";
      const sent = c.my && c.my.rd === D.round && c.my.ph === D.phase;
      if (D.phase === "split") {
        if (mine(div) && !sent) {
          const dish = k => `<div class="obdish">${D.offer.map((id, i) => L.assign[i] === k ? `<button class="obpc" data-tap="move" data-i="${i}" aria-label="${pieceName(id)}をもう1つの皿へ">${pieceSVG(id, 0, 22)}</button>` : "").join("")}</div>`;
          const ok = L.assign.includes(0) && L.assign.includes(1);
          st = `<p class="obhint">おかずを押すと、もう1つの皿へ移る</p><div class="obdishes">${dish(0)}${dish(1)}</div>
            <button class="btn go" data-tap="split" ${ok ? "" : "disabled"}>${ok ? "分けた！" : "どちらの皿にも1つ以上"}</button>`;
        } else st = `<div class="obdishes one"><div class="obdish">${D.offer.map(id => `<span class="obpc">${pieceSVG(id, 0, 20)}</span>`).join("")}</div></div><p class="obhint">${sent ? "送っています…" : "相手が分けるのを見張ろう"}</p>`;
      } else if (D.phase === "choose") {
        const can = mine(chooser) && !sent;
        st = `<div class="obdishes">${[0, 1].map(k => { const ids = Ben.pileOf(D, k), cells = ids.reduce((a, id) => a + Ben.sizeOf(id), 0), inner = ids.map(id => `<span class="obpc">${pieceSVG(id, 0, 20)}</span>`).join("");
            return can ? `<button class="obdish pick" data-tap="choose" data-k="${k}" aria-label="${ids.map(pieceName).join("・")}の皿を取る">${inner}<span class="obcnt">${cells}マス</span></button>` : `<div class="obdish">${inner}<span class="obcnt">${cells}マス</span></div>`; }).join("")}</div>
          <p class="obhint">${can ? "取りたい皿を押す（残りが相手の分）" : sent ? "送っています…" : `${w.whoS(chooser)}が先に選びます`}</p>`;
      } else st = `<p class="obhint">マスを押すと、そこに入る向きで置ける</p>`;
      patch(R$(el, "stage"), st);

      // リクエストと、このあと出るおかず
      patch(R$(el, "req"), `<b>きょうのリクエスト</b>（満たしたら+${Ben.REQV}・2人とももらえる）` + S.req.map(k => { const R = Ben.REQ[k];
        const tag = q => { const b = S.boxes[q]; if (R.late) { const n = b.filter(v => v === "w").length; return `<i class="s${q}">${BOX[q]} ごはん${n}/8${n > 8 ? " ×" : ""}</i>`; }
          const n = R.cnt(b); return `<i class="s${q}">${BOX[q]} ${n >= R.need ? "✓+" + Ben.REQV : Math.min(n, R.need) + "/" + R.need}</i>`; };
        return `<div class="obrq"><span><b>${R.name}</b> ${R.text}</span><span>${tag(0)}${tag(1)}</span></div>`; }).join(""));
      let nx = "";
      for (let r = D.round + 1; r < Ben.ROUNDS; r++) nx += `<span class="rd"><b>第${r + 1}回</b>${D.deck.slice(r * Ben.OFFER, r * Ben.OFFER + Ben.OFFER).map(id => pieceSVG(id, 0, 10)).join("")}</span>`;
      patch(R$(el, "next"), `<span>このあと出るおかず</span>${nx || "なし（最後の回）"}`);

      // 自分（大きく）：箱・点・手札
      const placing = !spec && S.phase === "place" && S.round === D.round && S.hands[vp].length > 0;
      let hand = "";
      if (placing) {
        const h = S.hands[vp]; if (L.sel >= h.length) L.sel = 0;
        const ms = Ben.movesFor(S, vp);
        hand = `<div class="obhand">${h.map((id, i) => `<button class="obpc${i === L.sel ? " sel" : ""}" data-tap="sel" data-i="${i}" aria-pressed="${i === L.sel}" aria-label="${pieceName(id)}を選ぶ">${pieceSVG(id, i === L.sel ? L.rot % Ben.ROT[Ben.shapeOf(id)].length : 0, 24)}</button>`).join("")}
          <button class="btn sm" data-tap="rot">回す</button>${ms[0]?.t === "drop" ? `<button class="btn sm" data-tap="drop">入らない：あきらめる</button>` : ""}</div>`;
      }
      patch(R$(el, "me"), seatHead(vp) + boxHTML(S.boxes[vp], { seat: vp, live: placing, req: S.req }) + meterHTML(S.boxes[vp], S.req, false) + hand);
    },

    tap(kind, ds, c) {
      const d = c.d, D = d.S;
      syncLocal(c);
      const seat = seatOf(d, c.me); if (seat < 0) return;
      if (kind === "move" && D.phase === "split" && D.div === seat) { const i = +ds.i; if (i >= 0 && i < L.assign.length) L.assign[i] = 1 - L.assign[i]; return; }
      if (kind === "split" && D.phase === "split" && D.div === seat) {
        if (!(L.assign.includes(0) && L.assign.includes(1))) return;
        let m = 0; L.assign.forEach((a, i) => { if (a === 0) m |= 1 << i; }); if (!(m & 1)) m = ((1 << D.offer.length) - 1) ^ m;
        c.set({ rd: D.round, ph: "split", m }); return;
      }
      if (kind === "choose" && D.phase === "choose" && D.div !== seat) { const k = +ds.k; if (k === 0 || k === 1) c.set({ rd: D.round, ph: "choose", k }); return; }
      if (D.phase !== "place") return;
      const P = myPending(c, seat), S = P.S;
      if (S.phase !== "place" || S.round !== D.round || !S.hands[seat].length) return;
      const h = S.hands[seat];
      if (kind === "sel") { const i = +ds.i; if (i >= 0 && i < h.length) { L.sel = i; L.rot = 0; } return; }
      if (kind === "rot") { L.rot++; return; }
      const send = e => { L.rot = 0; L.sel = 0; c.set({ rd: D.round, pl: P.pl.concat([e]) }); };
      if (kind === "drop") { if (Ben.movesFor(S, seat)[0]?.t === "drop") send({ i: L.sel, drop: 1 }); return; }
      if (kind === "slot") {
        const i = +ds.i, id = h[L.sel]; if (!id) return;
        const rots = Ben.ROT[Ben.shapeOf(id)], r0 = L.rot % rots.length, x = i % Ben.W, y = Math.floor(i / Ben.W);
        // 押したマスに入る向きを、いまの向きから順にさがす（押したマスが、おかずの左上になる）
        for (let k = 0; k < rots.length; k++) { const r = (r0 + k) % rots.length; if (Ben.fits(S.boxes[seat], rots[r], x, y)) { send({ i: L.sel, r, x, y }); return; } }
        toast("そのマスからは入りません。向きか場所を変えてね");
      }
    },

    scoreRows: () => [],

    endView(d, c) {
      const S = d.S, w = names(d, c), B = [0, 1].map(k => Ben.boxScore(S.boxes[k], S.req, true));
      const row = (label, f) => `<tr><th>${label}</th><td>${f(B[0], 0)}</td><td>${f(B[1], 1)}</td></tr>`;
      const head = k => `${avatar(c.nm(d.seats[k]), "sm")}<span class="nm">${w.who(k)}</span>`;
      return `<div class="obend">
        <div class="obendbox">${[0, 1].map(k => `<div><div class="obhead sm">${head(k)}<b class="obpts">${B[k].total}<small>点</small></b></div>${boxHTML(S.boxes[k], { seat: k, mini: 1, req: S.req, final: true })}</div>`).join("")}</div>
        <table class="ruletable obtable"><tr><th></th><th>${w.who(0)}</th><th>${w.who(1)}</th></tr>
        ${row("ごはん・主菜・副菜", b => b.base)}${row("すき間なし", b => b.bonus)}${row("彩り★", b => b.color)}
        ${S.req.map((k, j) => row(`「${Ben.REQ[k].name}」`, b => b.req[j] ? Ben.REQV : 0)).join("")}
        ${row("<b>合計</b>", b => `<b>${b.total}</b>`)}</table>
        ${d.quit ? `<p class="note">相手が部屋を出たので、ここで終わりにしました。</p>` : B[0].total === B[1].total ? `<p class="note">同点なので、空きマスが少ない方の勝ち（空き ${B[0].empty}・${B[1].empty}マス）。</p>` : ""}</div>`;
    }
  });
})();
