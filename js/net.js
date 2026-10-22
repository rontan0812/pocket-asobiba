"use strict";
/* =========================================================
   通信
   部屋（room）は次の5つの関数だけを持つ小さな部品です。
     presence(patch)  自分の状態を更新（相手に届く）
     peers()          部屋にいる全員（自分を含む）
     onPeers(fn)      だれかの状態が変わったら呼ばれる
     connected()      つながっているか
     connectedSince() つながった時刻（ms）
     leave()          部屋を出る
   本番は Supabase Realtime の Presence、設定が空なら
   同じ端末の別タブ同士だけでつながる「練習モード」になります。
   ========================================================= */
const NET = (() => {
  const cfg = window.PA_CONFIG || {};
  const configured = !!(cfg.supabaseUrl && cfg.supabaseKey);
  // 新しい版が読めなかったときのために候補を複数用意
  const SB_URLS = [
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.58.0/dist/umd/supabase.js",
    "https://unpkg.com/@supabase/supabase-js@2.58.0/dist/umd/supabase.js",
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/dist/umd/supabase.js"
  ];
  let client = null;

  const loadScript = src => new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src; s.async = true; s.crossOrigin = "anonymous";
    s.onload = res; s.onerror = () => { s.remove(); rej(new Error("load failed: " + src)); };
    document.head.appendChild(s);
  });

  const mkPeer = (peer, presence, isMe) => Object.freeze({
    peer, by:null, isMe, sameTab:isMe, kind:"viewer", guest:false,
    presence:Object.freeze({ ...presence }), updatedAt:Date.now()
  });
  const merge = (obj, p) => { const o = { ...obj }; for (const k in p) { if (p[k] === null) delete o[k]; else o[k] = p[k]; } return o; };

  /* ---------- Supabase ---------- */
  async function init() {
    if (!configured) return { mode:"local" };
    for (const u of SB_URLS) {
      try { await loadScript(u); if (window.supabase?.createClient) break; } catch {}
    }
    if (!window.supabase?.createClient) return { mode:"local", error:"通信ライブラリを読み込めませんでした" };
    try {
      client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
        auth:{ persistSession:false, autoRefreshToken:false, detectSessionInUrl:false },
        realtime:{ params:{ eventsPerSecond:10 } }
      });
    } catch (e) { console.error(e); return { mode:"local", error:"Supabaseの設定が正しくありません" }; }
    return { mode:"online" };
  }

  function supaRoom(name) {
    const self = rid(12);
    const ch = client.channel("pa-" + name, { config:{ presence:{ key:self } } });
    const listeners = new Set(), errFns = new Set();
    const cache = new Map();
    let mine = {}, me = mkPeer(self, mine, true), snap = Object.freeze([me]);
    let isConn = false, since = 0, lastSent = 0, timer = null, alive = true, fails = 0;

    // 送信間隔：人数が多いほど間隔をあける（無料枠の上限に収めるため）
    const interval = () => { const n = snap.length; return Math.max(150, n * n * 13); };
    function flush() {
      timer = null;
      if (!alive || !isConn) return;
      const wait = lastSent + interval() - Date.now();
      if (wait > 0) { timer = setTimeout(flush, wait); return; }
      lastSent = Date.now();
      Promise.resolve(ch.track(mine)).catch(e => console.warn("track", e));
    }
    const schedule = () => { if (!timer) timer = setTimeout(flush, 0); };

    function rebuild() {
      if (!alive) return;
      const st = ch.presenceState() || {};
      const list = [me];
      for (const key of Object.keys(st)) {
        if (key === self) continue;
        const metas = st[key]; if (!Array.isArray(metas) || !metas.length) continue;
        const { presence_ref, ...pres } = metas[metas.length - 1] || {};
        const raw = JSON.stringify(pres), old = cache.get(key);
        const p = old && old.raw === raw ? old.p : mkPeer(key, pres, false);
        cache.set(key, { raw, p }); list.push(p);
      }
      for (const k of [...cache.keys()]) if (!st[k]) cache.delete(k);
      snap = Object.freeze(list);
      // 再接続などで自分の状態が消えていたら送り直す
      if (isConn && !st[self] && Date.now() - lastSent > 2000) schedule();
      const change = { peers:snap, joined:[], left:[], updated:[] };
      listeners.forEach(f => { try { f(change); } catch (e) { console.error(e); } });
    }

    ch.on("presence", { event:"sync" }, rebuild);
    ch.subscribe((status, err) => {
      if (!alive) return;
      if (status === "SUBSCRIBED") { isConn = true; since = Date.now(); fails = 0; lastSent = 0; schedule(); }
      else {
        isConn = false;
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          fails++; console.warn("realtime", status, err);
          if (fails >= 3) errFns.forEach(f => { try { f({ code:"upstream_error", message:String(err?.message || status) }); } catch {} });
        }
      }
    });

    return {
      name, online:true,
      presence(p) { mine = merge(mine, p); me = mkPeer(self, mine, true); snap = Object.freeze([me, ...snap.slice(1)]); schedule(); queueMicrotask(() => listeners.forEach(f => f({ peers:snap, joined:[], left:[], updated:[] }))); return Promise.resolve(); },
      peers: () => snap,
      onPeers(f, onErr) { listeners.add(f); if (onErr) errFns.add(onErr); queueMicrotask(() => f({ peers:snap, joined:snap, left:[], updated:[] })); return () => { listeners.delete(f); errFns.delete(onErr); }; },
      connected: () => isConn,
      connectedSince: () => since,
      async leave() {
        alive = false; clearTimeout(timer); listeners.clear(); errFns.clear();
        try { await ch.untrack(); } catch {}
        try { await client.removeChannel(ch); } catch {}
      }
    };
  }

  /* ---------- 練習モード（同じ端末の別タブ同士） ---------- */
  function localRoom(name) {
    const self = rid(12), listeners = new Set(), others = new Map();
    let mine = {}, me = mkPeer(self, mine, true), snap = Object.freeze([me]), bc = null, alive = true;
    const since = Date.now();
    try { bc = new BroadcastChannel("pocket-asobiba:" + name); } catch {}
    const rebuild = () => { if (!alive) return; snap = Object.freeze([me, ...[...others.values()].map(o => o.p)]); const ch = { peers:snap, joined:[], left:[], updated:[] }; listeners.forEach(f => { try { f(ch); } catch (e) { console.error(e); } }); };
    const send = () => { try { bc && bc.postMessage({ t:"p", peer:self, presence:mine }); } catch {} };
    if (bc) bc.onmessage = e => {
      const m = e.data; if (!m || m.peer === self) return;
      if (m.t === "p") {
        const o = others.get(m.peer), raw = JSON.stringify(m.presence), same = o && o.raw === raw;
        others.set(m.peer, { raw, seen:Date.now(), p: same ? o.p : mkPeer(m.peer, m.presence, false) });
        if (!o) send();
        if (!same) rebuild();
      } else if (m.t === "bye" && others.delete(m.peer)) rebuild();
    };
    const hb = setInterval(() => { send(); const now = Date.now(); let ch = false; for (const [k, o] of others) if (now - o.seen > 3500) { others.delete(k); ch = true; } if (ch) rebuild(); }, 1000);
    const bye = () => { try { bc && bc.postMessage({ t:"bye", peer:self }); } catch {} };
    addEventListener("pagehide", bye);
    send();
    return {
      name, online:false,
      presence(p) { mine = merge(mine, p); me = mkPeer(self, mine, true); send(); queueMicrotask(rebuild); return Promise.resolve(); },
      peers: () => snap,
      onPeers(f) { listeners.add(f); queueMicrotask(() => f({ peers:snap, joined:snap, left:[], updated:[] })); return () => listeners.delete(f); },
      connected: () => true,
      connectedSince: () => since,
      leave() { alive = false; clearInterval(hb); bye(); removeEventListener("pagehide", bye); try { bc && bc.close(); } catch {} listeners.clear(); return Promise.resolve(); }
    };
  }

  return {
    configured, init,
    openRoom: name => client ? supaRoom(name) : localRoom(name)
  };
})();
