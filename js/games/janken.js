/* じゃんけん：全員同時に出して、先に3勝した人の勝ち */
(() => {
const HANDS = { g:{ e:"✊", n:"グー", beats:"c" }, c:{ e:"✌️", n:"チョキ", beats:"p" }, p:{ e:"✋", n:"パー", beats:"g" } };

addGame({
  id:"janken", name:"じゃんけん", icon:"✊", tone:"tomato", min:2, max:8,
  blurb:"全員で同時に出す。先に3勝した人の優勝。",
  rules:`<ul>
    <li>全員で同時に、グー・チョキ・パーから1つ選ぶ（15秒以内）。</li>
    <li>出た手が2種類のときだけ勝負がつき、勝った手を出した人全員に1勝。3種類そろったときと全員同じときは、あいこ。</li>
    <li>先に3勝した人の優勝（同時に3勝なら全員優勝）。</li>
    <li>時間内に選ばなかった人は、その回はお休み。</li></ul>`,

  init(pl, now) {
    pl = pl.slice(0, this.max);
    return { phase:"pick", round:1, t:now, target:3, players:pl.map(p => p.peer), roster:roster(pl),
      score:Object.fromEntries(pl.map(p => [p.peer, 0])), last:null };
  },

  step(d, { now, inputs, present }) {
    const act = d.players.filter(p => present.has(p));
    if (act.length < 2) return { ...d, phase:"end", t:now, winners:act };
    if (d.phase === "pick") {
      const picks = {};
      for (const p of act) { const i = inputs[p]; if (i && i.round === d.round && HANDS[i.hand]) picks[p] = i.hand; }
      if (act.every(p => picks[p]) || now - d.t > 15000) {
        const kinds = [...new Set(Object.values(picks))];
        let win = null;
        if (kinds.length === 2) win = HANDS[kinds[0]].beats === kinds[1] ? kinds[0] : kinds[1];
        const score = { ...d.score };
        if (win) for (const p in picks) if (picks[p] === win) score[p] = (score[p] || 0) + 1;
        return { ...d, phase:"show", t:now, score, last:{ picks, win } };
      }
      return d;
    }
    if (d.phase === "show" && now - d.t > 3200) {
      const top = Math.max(...act.map(p => d.score[p] || 0));
      if (top >= d.target) return { ...d, phase:"end", t:now, winners:act.filter(p => (d.score[p] || 0) === top) };
      return { ...d, phase:"pick", round:d.round + 1, t:now };
    }
    return d;
  },

  view(el, c) {
    const d = c.d;
    if (d.phase === "pick") {
      shell(el, "pick" + d.round, `
        <div class="between"><span class="eyebrow">ROUND ${d.round}</span><span class="eyebrow">先に${d.target}勝</span></div>
        <div class="chips" data-r="sc"></div>
        <p class="prompt" data-r="msg"></p>
        <div class="hands" data-r="hands"></div>`);
      const picked = p => { const i = c.inp(p); return !!(i && i.round === d.round && HANDS[i.hand]); };
      patch(R$(el, "sc"), scoreChips(c, d.players, p => d.score[p] || 0, picked));
      const mine = c.my && c.my.round === d.round ? c.my.hand : null;
      const done = d.players.filter(picked).length;
      const left = Math.max(0, Math.ceil((15000 - c.elapsed) / 1000));
      let msg = !c.isPlayer ? "観戦中。次のゲームから参加できます"
        : mine ? `${HANDS[mine].n}を出しました（${done}/${d.players.length}人）` : "出す手を選んでね";
      if (left <= 5 && c.isPlayer) msg += `　あと${left}秒`;
      patch(R$(el, "msg"), esc(msg));
      patch(R$(el, "hands"), Object.entries(HANDS).map(([k, h]) =>
        `<button class="btn hand" data-tap="hand" data-hand="${k}" aria-pressed="${mine === k}" ${c.isPlayer ? "" : "disabled"}>${h.e}<small>${h.n}</small></button>`).join(""));
    } else {
      const L = d.last || { picks:{}, win:null };
      shell(el, "show" + d.round, `
        <div class="between"><span class="eyebrow">ROUND ${d.round}</span><span class="eyebrow">先に${d.target}勝</span></div>
        <div class="banner">${L.win ? `${HANDS[L.win].e} ${HANDS[L.win].n}の勝ち！` : "あいこ！"}</div>
        <div class="reveal">${d.players.map(p => { const n = c.nm(p), h = L.picks[p];
          return `<div class="rv ${h && h === L.win ? "win" : ""}"><span class="h">${h ? HANDS[h].e : "…"}</span><span class="n">${esc(n.name)}</span></div>`; }).join("")}</div>
        <div class="chips">${scoreChips(c, d.players, p => d.score[p] || 0)}</div>`);
    }
  },

  tap(kind, ds, c) {
    if (kind === "hand" && c.d.phase === "pick" && c.isPlayer && HANDS[ds.hand]) c.set({ round:c.d.round, hand:ds.hand });
  },

  scoreRows: d => rank(d.players, p => d.score[p] || 0).map(p => ({ peer:p, text:`${d.score[p] || 0}勝` }))
});
})();
