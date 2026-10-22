/* 連打バトル：10秒間ひたすらタップ */
addGame({
  id:"renda", name:"連打バトル", icon:"👆", tone:"mustard", min:1, max:8,
  blurb:"10秒間ひたすらタップ。みんなの回数がリアルタイムで伸びていく。",

  init(pl, now) {
    pl = pl.slice(0, this.max);
    return { phase:"count", t:now, dur:10000, players:pl.map(p => p.peer), roster:roster(pl), final:null };
  },

  step(d, { now, inputs }) {
    if (d.phase === "count" && now - d.t >= 3000) return { ...d, phase:"play", t:now };
    if (d.phase === "play" && now - d.t >= d.dur) return { ...d, phase:"grace", t:now };
    // 少し待ってから集計（最後のタップが届くのを待つ）
    if (d.phase === "grace" && now - d.t >= 2000) {
      const final = {};
      for (const p of d.players) { const n = Math.floor(+(inputs[p]?.taps) || 0); final[p] = Math.max(0, Math.min(n, 400)); }
      const top = Math.max(0, ...Object.values(final));
      return { ...d, phase:"end", t:now, final, winners: top > 0 ? d.players.filter(p => final[p] === top) : [] };
    }
    return d;
  },

  view(el, c) {
    const d = c.d;
    shell(el, "rd" + d.phase, d.phase === "count"
      ? `<p class="prompt">よーい…</p><div class="count" data-r="cd"></div><div class="bars" data-r="bars"></div>`
      : d.phase === "play"
      ? `<div class="timer" data-r="tm"></div><div class="mytaps" data-r="mine"></div>
         <button class="btn pad" data-tap="tap" ${c.isPlayer ? "" : "disabled"}>${c.isPlayer ? "タップ！" : "観戦中"}</button>
         <div class="bars" data-r="bars"></div>`
      : `<div class="banner">そこまで！</div><p class="prompt">集計しています…</p><div class="bars" data-r="bars"></div>`);
    if (d.phase === "count") patch(R$(el, "cd"), String(Math.max(1, Math.ceil((3000 - c.elapsed) / 1000))));
    if (d.phase === "play") {
      const left = Math.max(0, d.dur - c.elapsed);
      patch(R$(el, "tm"), `<i style="width:${(left / d.dur * 100).toFixed(1)}%"></i>`);
      patch(R$(el, "mine"), `<div class="ms">${c.my?.taps || 0}</div><div class="eyebrow">残り ${(left / 1000).toFixed(1)} 秒</div>`);
    }
    const taps = p => Math.max(0, Math.min(400, Math.floor(+(c.inp(p)?.taps) || 0)));
    const max = Math.max(30, ...d.players.map(taps));
    patch(R$(el, "bars"), d.players.map(p => { const n = c.nm(p), t = taps(p);
      return `<div class="barrow">${avatar(n, "sm")}<div class="track" title="${esc(n.name)}"><i style="--tone:var(--${COLORS.includes(n.color) ? n.color : "sky"});width:${(t / max * 100).toFixed(1)}%"></i></div><span class="ms">${t}</span></div>`; }).join(""));
  },

  tap(kind, ds, c) {
    if (kind === "tap" && c.isPlayer && c.d.phase === "play" && c.elapsed < c.d.dur) c.set({ taps:(c.my?.taps || 0) + 1 });
  },

  scoreRows: d => rank(d.players, p => d.final?.[p] || 0).map(p => ({ peer:p, text:`${d.final?.[p] || 0}回（秒速${((d.final?.[p] || 0) / 10).toFixed(1)}）` }))
});
