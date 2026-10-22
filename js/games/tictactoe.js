/* ○×ゲーム：2人対戦。ほかの人は観戦して、もう一回で交代 */
(() => {
const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];

addGame({
  id:"ttt", name:"○×ゲーム", icon:"⭕", tone:"sky", min:2, max:2,
  blurb:"2人で対戦、ほかの人は観戦。もう一回で負けた人と次の人が交代。",

  init(pl, now, prev) {
    const ids = pl.map(p => p.peer);
    let seats = ids.slice(0, 2);
    if (prev && Array.isArray(prev.seats)) {
      const [a, b] = prev.seats, w = (prev.winners || [])[0];
      const queue = ids.filter(p => p !== a && p !== b);
      if (queue.length && w && ids.includes(w)) seats = [queue[0], w];
      else if (queue.length >= 2) seats = queue.slice(0, 2);
      else if (queue.length === 1) seats = [queue[0], ids.includes(a) ? a : b];
      else if (ids.includes(a) && ids.includes(b)) seats = [b, a];
    }
    seats = seats.filter(p => ids.includes(p));
    if (seats.length < 2) seats = ids.slice(0, 2);
    return { phase:"play", t:now, seats, players:seats, roster:roster(pl), board:".........", turn:0, n:0, line:null };
  },

  step(d, { now, inputs, present }) {
    if (d.phase !== "play") return d;
    if (d.seats.some(s => !present.has(s))) return { ...d, phase:"end", t:now, winners:d.seats.filter(s => present.has(s)) };
    const mover = d.seats[d.turn], i = inputs[mover];
    if (!i || i.n !== d.n || !Number.isInteger(i.cell) || i.cell < 0 || i.cell > 8 || d.board[i.cell] !== ".") return d;
    const mark = d.turn === 0 ? "o" : "x";
    const b = d.board.slice(0, i.cell) + mark + d.board.slice(i.cell + 1);
    const line = LINES.find(l => l.every(k => b[k] === mark));
    if (line) return { ...d, board:b, n:d.n + 1, phase:"end", t:now, line, winners:[mover] };
    if (!b.includes(".")) return { ...d, board:b, n:d.n + 1, phase:"end", t:now, winners:[] };
    return { ...d, board:b, n:d.n + 1, turn:1 - d.turn };
  },

  boardHTML(d, c, live) {
    const b = typeof d.board === "string" && d.board.length === 9 ? d.board : ".........";
    const pend = c.my && c.my.n === d.n ? c.my.cell : -1;   // 押したけどまだ反映されていないマス
    const myTurn = live && d.seats[d.turn] === c.me && pend < 0;
    return [...b].map((m, i) => {
      const isPend = i === pend && m === ".";
      const mk = m === "o" ? "○" : m === "x" ? "×" : isPend ? (d.turn === 0 ? "○" : "×") : "";
      const cls = [m === "o" || (isPend && d.turn === 0) ? "o" : "", m === "x" || (isPend && d.turn === 1) ? "x" : "", d.line?.includes(i) ? "win" : "", isPend ? "pend" : ""].join(" ");
      return `<button class="cell ${cls}" data-tap="cell" data-cell="${i}" aria-label="マス${i + 1}" ${myTurn && m === "." ? "" : "disabled"}>${mk}</button>`;
    }).join("");
  },

  seatsHTML(d, c, live) {
    const s = k => { const n = c.nm(d.seats[k]); return `<div class="seat ${live && d.turn === k ? "now" : ""}"><span class="mk">${k ? "×" : "○"}</span>${avatar(n, "sm")}<span class="nm">${esc(n.name)}</span></div>`; };
    return `<div class="seats">${s(0)}<span class="vs">VS</span>${s(1)}</div>`;
  },

  view(el, c) {
    const d = c.d;
    shell(el, "ttt", `<div data-r="seats"></div><p class="prompt" data-r="msg"></p><div class="board" data-r="board"></div>`);
    patch(R$(el, "seats"), this.seatsHTML(d, c, true));
    const who = c.nm(d.seats[d.turn]);
    patch(R$(el, "msg"), d.seats[d.turn] === c.me ? "あなたの番！" : c.isPlayer ? `${esc(who.name)}さんの番です` : `観戦中 · ${esc(who.name)}さんの番`);
    patch(R$(el, "board"), this.boardHTML(d, c, true));
  },

  tap(kind, ds, c) {
    const d = c.d, cell = +ds.cell;
    if (kind === "cell" && d.phase === "play" && d.seats[d.turn] === c.me && d.board[cell] === "." && !(c.my && c.my.n === d.n)) c.set({ n:d.n, cell });
  },

  scoreRows: () => [],
  endView(d, c) { return `${this.seatsHTML(d, c, false)}<div class="board">${this.boardHTML(d, c, false)}</div>`; }
});
})();
