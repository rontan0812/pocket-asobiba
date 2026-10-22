/* 反射神経：画面が緑になった瞬間にタップ。5回勝負 */
addGame({
  id:"reaction", name:"反射神経", icon:"⚡", tone:"teal", min:1, max:8,
  blurb:"画面が緑になった瞬間にタップ。5回勝負で一番速かった回数を競う。",

  init(pl, now) {
    pl = pl.slice(0, this.max);
    return { phase:"ready", round:1, rounds:5, t:now, wait:1500 + Math.random() * 2500,
      players:pl.map(p => p.peer), roster:roster(pl), score:{}, bestMs:{}, res:null, best:null };
  },

  step(d, { now, inputs, present }) {
    const act = d.players.filter(p => present.has(p));
    if (!act.length) return { ...d, phase:"end", t:now, winners:[] };
    const got = p => { const i = inputs[p]; return i && i.round === d.round ? i : null; };
    if (d.phase === "ready") return now - d.t >= d.wait ? { ...d, phase:"go", t:now } : d;
    if (d.phase === "go") {
      if (act.every(got) || now - d.t > 3500) {
        const res = {}; let best = null;
        for (const p of d.players) {
          const i = got(p);
          if (!i) { res[p] = null; continue; }
          if (i.foul) { res[p] = "f"; continue; }
          const ms = Math.round(+i.ms);
          if (Number.isFinite(ms) && ms > 0 && ms < 10000) { res[p] = ms; if (best == null || ms < res[best]) best = p; }
          else res[p] = null;
        }
        const score = { ...d.score }; if (best) score[best] = (score[best] || 0) + 1;
        const bestMs = { ...d.bestMs };
        for (const p in res) if (typeof res[p] === "number" && !(bestMs[p] <= res[p])) bestMs[p] = res[p];
        return { ...d, phase:"result", t:now, res, best, score, bestMs };
      }
      return d;
    }
    if (d.phase === "result" && now - d.t > 2800) {
      if (d.round >= d.rounds) {
        const top = Math.max(0, ...act.map(p => d.score[p] || 0));
        return { ...d, phase:"end", t:now, winners: top > 0 ? act.filter(p => (d.score[p] || 0) === top) : [] };
      }
      return { ...d, phase:"ready", round:d.round + 1, t:now, wait:1500 + Math.random() * 2500, res:null, best:null };
    }
    return d;
  },

  view(el, c) {
    const d = c.d;
    shell(el, "rx", `
      <div class="between"><span class="eyebrow" data-r="rd"></span><span class="eyebrow">5回勝負</span></div>
      <div data-r="tile"></div>
      <div class="results" data-r="res"></div>
      <div class="chips" data-r="sc"></div>`);
    patch(R$(el, "rd"), `ROUND ${d.round} / ${d.rounds}`);
    const my = c.my && c.my.round === d.round ? c.my : null;
    let cls, big, sub;
    if (!c.isPlayer) { cls = "done"; big = d.phase === "go" ? "いま！" : "観戦中"; sub = "次のゲームから参加できます"; }
    else if (my && my.foul) { cls = "bad"; big = "フライング！"; sub = "この回はノーカウント"; }
    else if (d.phase === "ready") { cls = "wait"; big = "まだ…"; sub = "緑になったらタップ"; }
    else if (d.phase === "go" && !my) { cls = "go"; big = "いま！"; sub = "タップ！"; }
    else if (my && my.ms) { cls = "done"; big = `<span class="ms">${my.ms} ms</span>`; sub = d.phase === "go" ? "みんなを待っています" : (d.best === c.me ? "この回の最速！" : "結果を見てね"); }
    else { cls = "done"; big = "時間切れ"; sub = ""; }
    patch(R$(el, "tile"), `<div class="tile ${cls}" data-tap="react" role="button" tabindex="0"><span class="big">${big}</span><span class="sub">${esc(sub)}</span></div>`);
    if (d.phase === "result" && d.res) {
      const order = rank(d.players, p => typeof d.res[p] === "number" ? -d.res[p] : -1e9);
      patch(R$(el, "res"), order.map(p => { const n = c.nm(p), v = d.res[p];
        return `<div class="res ${p === d.best ? "best" : ""}">${avatar(n, "sm")}<span>${esc(n.name)}</span><span class="ms">${v === "f" ? "フライング" : typeof v === "number" ? v + " ms" : "—"}</span></div>`; }).join(""));
    } else patch(R$(el, "res"), "");
    patch(R$(el, "sc"), scoreChips(c, d.players, p => d.score[p] || 0));
  },

  tap(kind, ds, c) {
    const d = c.d;
    if (kind !== "react" || !c.isPlayer) return;
    if (c.my && c.my.round === d.round) return;
    if (d.phase === "ready") c.set({ round:d.round, foul:true });
    else if (d.phase === "go") c.set({ round:d.round, ms:Math.max(1, Math.round(c.elapsed)) });
  },

  scoreRows: d => rank(d.players, p => (d.score[p] || 0) * 1e5 - (d.bestMs[p] || 9999))
    .map(p => ({ peer:p, text:`${d.score[p] || 0}回最速 · ベスト ${d.bestMs[p] ? d.bestMs[p] + "ms" : "—"}` }))
});
