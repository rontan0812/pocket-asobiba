"use strict";
/* =========================================================
   アプリ本体
   同期のしくみ：全員が presence（自分の状態）を送り合うだけ。
   - 各プレイヤー: {name, emoji, color, joinedAt, req, inp}
   - ホスト（いちばん長くいる人）はさらに hs（ゲームの正式な状態）を
     持っていて、0.1秒ごとに各ゲームの step() で進めます。
   - ホストが抜けると、残った人のなかから自動で次のホストが決まります。
   ========================================================= */
let me = store.get("pa-me", null);
if (!me || typeof me !== "object") me = { name:"", emoji:pick(AV), color:pick(COLORS) };
if (!AV.includes(me.emoji)) me.emoji = pick(AV);
if (!COLORS.includes(me.color)) me.color = pick(COLORS);
if (typeof me.name !== "string") me.name = "";

let netMode = "connecting", netError = "";
let R = null, code = null, joinedAt = 0, unsubRoom = null, hostTimer = null;
let hs = null, amHost = false, myInp = null, processed = new Set();
let phaseMark = { key:"", t:0 }, showQR = false;

const roomUrl = c => `${location.origin}${location.pathname}?room=${c}`;
function urlCode() {
  const q = new URLSearchParams(location.search).get("room") || location.hash.replace("#", "");
  const c = String(q || "").toUpperCase();
  return CODE_RE.test(c) ? c : "";
}
function setUrl(c) { try { history.replaceState(null, "", c ? `?room=${c}` : location.pathname); } catch {} }

function saveMe() {
  store.set("pa-me", me);
  R?.presence({ name:me.name.trim().slice(0, 12) || "ななし", emoji:me.emoji, color:me.color }).catch(() => {});
}

function validHs(x) {
  if (!x || typeof x !== "object" || typeof x.v !== "number") return null;
  if (x.game != null && !GAMES[x.game]) return null;
  if (x.game && (!x.data || typeof x.data !== "object" || !Array.isArray(x.data.players))) return null;
  return x;
}
function players() {
  if (!R) return [];
  return R.peers()
    .filter(p => p.kind === "viewer" && p.presence && typeof p.presence.name === "string" && p.presence.name)
    .map(p => ({ peer:p.peer, isMe:p.sameTab, name:p.presence.name.slice(0, 12),
      emoji:AV.includes(p.presence.emoji) ? p.presence.emoji : "🙂", color:COLORS.includes(p.presence.color) ? p.presence.color : "sky",
      joinedAt:+p.presence.joinedAt || 0, hs:validHs(p.presence.hs),
      req:p.presence.req && typeof p.presence.req === "object" ? p.presence.req : null,
      inp:p.presence.inp && typeof p.presence.inp === "object" ? p.presence.inp : null }))
    .sort((a, b) => a.joinedAt - b.joinedAt || (a.peer < b.peer ? -1 : 1));
}
/* ホスト選び：すでに状態を配っている人のうち、いちばん進んでいる人（v が大きい人） */
function electHost(ps) {
  const withHs = ps.filter(p => p.hs).sort((a, b) => b.hs.v - a.hs.v || a.joinedAt - b.joinedAt || (a.peer < b.peer ? -1 : 1));
  if (withHs.length) return withHs[0];
  const first = ps[0];
  // 入ったばかりのときは、先にいる人の返事を少し待つ
  if (first && first.isMe && Date.now() - (R.connectedSince() || Date.now()) < 2000) return null;
  return first || null;
}
function noteHs() {
  const d = hs?.data;
  const key = `${hs?.gid}:${d?.phase}:${d?.round || 0}:${d?.n || 0}`;
  if (key !== phaseMark.key) phaseMark = { key, t:performance.now() };
}

function tick() {
  if (!R || !R.connected()) return;
  const ps = players(), self = ps.find(p => p.isMe);
  if (!self) return;
  const h = electHost(ps), was = amHost;
  amHost = !!h && h.isMe;
  if (!amHost) {
    if (h && h.hs && h.hs !== hs) { hs = h.hs; noteHs(); }
    if (self.hs) R.presence({ hs:null }).catch(() => {});
    return;
  }
  if (!was) {
    if (hs) ps.forEach(p => { if (p.req?.id) processed.add(p.req.id); });
    hs = hs ? { ...hs } : { v:0, game:null, gid:null, data:null, wins:{} };
  }
  hostStep(ps);
}

function hostStep(ps) {
  const now = Date.now(), present = new Set(ps.map(p => p.peer));
  let next = hs;
  const pruneWins = w => Object.fromEntries(Object.entries(w || {}).filter(([k]) => present.has(k)));
  for (const p of ps) {
    const q = p.req;
    if (!q || typeof q.id !== "string" || processed.has(q.id)) continue;
    processed.add(q.id);
    if (q.kind === "start" && GAMES[q.game] && ps.length >= GAMES[q.game].min) {
      const g = GAMES[q.game];
      next = { ...next, game:g.id, gid:rid(6), data:g.init(ps, now, next.game === g.id ? next.data : null), awarded:false, wins:pruneWins(next.wins) };
    } else if (q.kind === "lobby" && next.game) {
      next = { ...next, game:null, gid:null, data:null, wins:pruneWins(next.wins) };
    }
  }
  if (next.game) {
    const g = GAMES[next.game], inputs = {};
    for (const p of ps) if (p.inp && p.inp.gid === next.gid) inputs[p.peer] = p.inp;
    let d = next.data;
    try { d = g.step(next.data, { now, inputs, present }); } catch (e) { console.error(e); }
    if (d !== next.data) next = { ...next, data:d };
    if (next.data.phase === "end" && !next.awarded) {
      const wins = { ...next.wins };
      (next.data.winners || []).forEach(w => wins[w] = (wins[w] || 0) + 1);
      next = { ...next, wins, awarded:true };
    }
  }
  if (next !== hs || !ps.find(p => p.isMe)?.hs) {
    next = { ...next, v:(hs.v || 0) + 1 };
    hs = next; noteHs();
    R.presence({ hs }).catch(e => console.warn("state rejected", e));
  }
}

function sendReq(kind, game) { R?.presence({ req:{ id:rid(), kind, game:game || null } }).catch(() => {}); }

function ctx(ps) {
  const self = ps.find(p => p.isMe), mine = self?.peer, d = hs.data;
  const live = Object.fromEntries(ps.map(p => [p.peer, p]));
  const my = myInp && myInp.gid === hs.gid ? myInp : null;
  return {
    d, gid:hs.gid, me:mine, ps, my, isPlayer:d.players.includes(mine), elapsed:performance.now() - phaseMark.t,
    nm: peer => live[peer] || (Array.isArray(d.roster?.[peer]) ? { name:String(d.roster[peer][0] || "だれか").slice(0, 12), emoji:d.roster[peer][1], color:d.roster[peer][2] } : { name:"だれか", emoji:"🙂", color:"sky" }),
    inp: peer => { if (peer === mine) return my; const i = live[peer]?.inp; return i && i.gid === hs.gid ? i : null; },
    set: obj => { myInp = { ...obj, gid:hs.gid }; R.presence({ inp:myInp }).catch(() => {}); }
  };
}

/* ---------- 部屋の出入り ---------- */
async function enterRoom(c) {
  c = String(c || "").toUpperCase().trim();
  if (!CODE_RE.test(c)) { toast("部屋コードは英数字4文字です"); return; }
  if (!me.name.trim()) { toast("先に名前を入れてね"); $("#name")?.focus(); return; }
  if (netMode === "connecting") { toast("まだ準備中です。少し待ってね"); return; }
  if (R) await leaveRoom(true);
  const r = NET.openRoom("game-" + c.toLowerCase());
  R = r; code = c; joinedAt = Date.now(); hs = null; amHost = false; myInp = null; processed = new Set(); phaseMark = { key:"", t:0 }; showQR = false;
  R.presence({ name:me.name.trim().slice(0, 12), emoji:me.emoji, color:me.color, joinedAt }).catch(() => {});
  unsubRoom = R.onPeers(() => tick(), () => { if (R === r) toast("サーバーにつながりにくくなっています…"); });
  hostTimer = setInterval(tick, 100);
  store.set("pa-last", c);
  setUrl(c);
  window.scrollTo(0, 0);
}
async function leaveRoom(keepUrl) {
  const r = R;
  clearInterval(hostTimer); try { unsubRoom && unsubRoom(); } catch {}
  R = null; code = null; hs = null; amHost = false; myInp = null;
  if (!keepUrl) setUrl("");
  try { await r?.leave(); } catch {}
}

/* ---------- 画面 ---------- */
function cartHTML(g, opts = {}) {
  const need = opts.count != null && opts.count < g.min ? g.min - opts.count : 0;
  return `<article class="cart" style="--tone:var(--${g.tone})">
    <div class="label"><span class="icon" aria-hidden="true">${g.icon}</span><span class="cnt">${g.min === g.max ? g.min + "人" : g.min + "–" + g.max + "人"}</span></div>
    <div class="body"><h3 class="name">${esc(g.name)}</h3><p class="blurb">${esc(g.blurb || "")}</p>
    ${opts.play ? `<button class="btn sm ${need ? "" : "go"}" data-act="start" data-game="${g.id}" ${need ? "disabled" : ""}>${need ? `あと${need}人必要` : "はじめる"}</button>` : ""}</div>
  </article>`;
}
function homeShell() {
  const pre = urlCode() || store.get("pa-last", "");
  const invited = !!urlCode();
  return `<div class="app" style="padding:0">
    ${!NET.configured ? `<section class="card setup"><span class="eyebrow">SETUP</span>
      <p class="note">いまは<b>練習モード</b>です（同じ端末の別タブ同士だけでつながります）。別々のスマホで遊ぶには <code>config.js</code> にSupabaseの設定を入れてください。手順は README にあります。</p></section>` : ""}
    ${invited ? `<section class="card" style="background:var(--mustard);color:var(--on-accent)"><span class="eyebrow" style="color:inherit">INVITE</span>
      <p style="margin:0;font-weight:700">部屋 ${esc(pre)} に招待されています。名前を入れて「入る」を押してね。</p></section>` : ""}
    <section class="card" aria-labelledby="me-h">
      <span class="eyebrow" id="me-h">PLAYER</span>
      <div class="profile">
        <button class="av lg" data-act="emoji" aria-label="アイコンを変える" data-r="me"></button>
        <div class="field"><label for="name">名前（12文字まで）</label><input class="input" id="name" maxlength="12" placeholder="例：たろう" autocomplete="nickname"></div>
      </div>
      <div class="swatches" data-r="sw"></div>
    </section>
    <section class="card" aria-labelledby="play-h">
      <h2 class="h2" id="play-h">友だちと遊ぶ</h2>
      ${invited ? "" : `<button class="btn primary wide" data-act="create">部屋をつくる</button><div class="or">コードで入る</div>`}
      <form class="joinrow" id="joinform">
        <input class="input codein" id="code" maxlength="4" placeholder="ABCD" value="${esc(CODE_RE.test(pre) ? pre : "")}" autocomplete="off" autocapitalize="characters" aria-label="部屋コード">
        <button class="btn ${invited ? "primary" : ""}" type="submit">入る</button>
      </form>
      ${invited ? `<button class="btn ghost sm" data-act="create">自分で新しい部屋をつくる</button>` : `<p class="note">部屋をつくると招待リンクとQRコードが出ます。LINEなどで送るか、その場でQRを読んでもらえばOK。</p>`}
    </section>
    <section aria-labelledby="games-h" style="display:flex;flex-direction:column;gap:12px">
      <h2 class="h2" id="games-h">入っているミニゲーム</h2>
      <div class="carts">${GAME_LIST.map(g => cartHTML(g)).join("")}</div>
    </section>
  </div>`;
}
function drawHome(v) {
  if (shell(v, "home", homeShell())) $("#name").value = me.name;
  const meBtn = R$(v, "me");
  patch(meBtn, AV.includes(me.emoji) ? me.emoji : "🙂");
  meBtn.style.setProperty("--tone", `var(--${me.color})`);
  patch(R$(v, "sw"), COLORS.map(c => `<button class="sw" style="background:var(--${c})" data-act="color" data-color="${c}" aria-label="色 ${c}" aria-pressed="${me.color === c}"></button>`).join(""));
}
function drawRoom(v) {
  const url = roomUrl(code);
  shell(v, "room:" + code, `<div class="app" style="padding:0">
    <section class="card">
      <div class="codebox">
        <div><div class="eyebrow">部屋コード</div><div class="bigcode">${esc(code)}</div></div>
        <button class="btn sm ghost" data-act="leave">部屋を出る</button>
      </div>
      <div class="invite">
        <div class="row"><button class="btn sm primary" data-act="share">招待リンクを送る</button><button class="btn sm" data-act="copy">リンクをコピー</button><button class="btn sm" data-act="qr" data-r="qrbtn">QRコード</button></div>
        <div class="qr" data-r="qr" hidden></div>
        <div class="linkbox" data-r="link">${esc(url)}</div>
      </div>
      <div class="players" data-r="plist"></div>
    </section>
    <section data-r="stage" style="display:flex;flex-direction:column;gap:12px"></section>
  </div>`);
  const ps = players();
  const host = R.connected() ? electHost(ps) : null;
  patch(R$(v, "plist"), ps.map(p => { const w = hs?.wins?.[p.peer] || 0;
    return `<span class="pchip">${avatar(p, "sm")}<span class="nm">${esc(p.name)}</span>${p.isMe ? `<span class="tag">あなた</span>` : ""}${host && host.peer === p.peer ? `<span class="tag" title="ホスト">👑</span>` : ""}${w ? `<span class="star">★${w}</span>` : ""}</span>`; }).join("") || `<span class="note">入室中…</span>`);
  const st = R$(v, "stage");
  if (!hs) { shell(st, "wait", `<div class="card"><div class="empty">${R.connected() ? "部屋を準備しています…" : "サーバーに接続しています…"}</div></div>`); return; }
  if (!hs.game) {
    shell(st, "lobby", `<div class="between"><h2 class="h2">ゲームをえらぶ</h2><span class="eyebrow">だれが押してもOK</span></div><div class="carts" data-r="grid"></div>`);
    patch(R$(st, "grid"), GAME_LIST.map(g => cartHTML(g, { play:true, count:ps.length })).join(""));
    return;
  }
  const g = GAMES[hs.game], d = hs.data, end = d.phase === "end";
  shell(st, `g:${hs.gid}:${end ? 1 : 0}`, `<section class="card">
      <div class="gamehead"><span class="gtitle">${g.icon} ${esc(g.name)}</span><span data-r="spect"></span><button class="btn sm ghost" data-act="lobby">やめる</button></div>
      <div class="gbody" data-r="gbody"></div>
    </section>`);
  const c = ctx(ps);
  patch(R$(st, "spect"), c.isPlayer || end ? "" : `<span class="pill">観戦中</span>`);
  const gb = R$(st, "gbody");
  try { end ? patch(gb, endHTML(g, c)) : g.view(gb, c); } catch (e) { console.error(e); }
}
function endHTML(g, c) {
  const d = c.d, ws = (d.winners || []).filter(Boolean);
  const meWon = ws.includes(c.me);
  const title = !ws.length ? "引き分け" : meWon ? (ws.length > 1 ? "あなたも優勝！" : "あなたの勝ち！") : `${ws.map(w => esc(c.nm(w).name)).join("・")}の勝ち！`;
  const rows = (g.scoreRows(d) || []).map(r => { const n = c.nm(r.peer);
    return `<div class="res ${ws.includes(r.peer) ? "best" : ""}">${avatar(n, "sm")}<span>${esc(n.name)}</span><span class="ms">${esc(r.text)}</span></div>`; }).join("");
  return `<div class="trophy"><div class="avs">${ws.map(w => avatar(c.nm(w), "lg")).join("")}</div><div class="banner">${title}</div></div>
    ${g.endView ? g.endView(d, c) : ""}
    ${rows ? `<div class="endrows">${rows}</div>` : ""}
    <div class="actions"><button class="btn go" data-act="start" data-game="${g.id}" ${c.ps.length >= g.min ? "" : "disabled"}>もう一回</button><button class="btn" data-act="lobby">ほかのゲーム</button></div>`;
}
function drawConn() {
  const el = $("#conn");
  let txt, on = false;
  if (netMode === "connecting") txt = "準備中…";
  else if (netMode === "local") txt = "練習モード";
  else if (R) { on = R.connected(); txt = on ? `${players().length}人で接続中` : "再接続中…"; }
  else { on = true; txt = "オンライン"; }
  el.classList.toggle("on", on);
  patch(el, `<i></i><span>${esc(txt)}</span>`);
}
function draw() {
  const v = $("#view");
  try { R ? drawRoom(v) : drawHome(v); drawConn(); } catch (e) { console.error(e); }
}
function loop() { draw(); requestAnimationFrame(loop); }

/* ---------- 招待 ---------- */
let qrLib = null;
function loadQR() {
  if (window.QRCode) return Promise.resolve(window.QRCode);
  if (!qrLib) qrLib = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
    s.onload = () => window.QRCode ? res(window.QRCode) : rej(new Error("no QRCode"));
    s.onerror = () => { qrLib = null; rej(new Error("load failed")); };
    document.head.appendChild(s);
  });
  return qrLib;
}
async function toggleQR() {
  const box = $('[data-r="qr"]'); if (!box) return;
  if (!box.hidden) { box.hidden = true; return; }
  try {
    const QR = await loadQR();
    if (box.dataset.for !== code) { box.innerHTML = ""; new QR(box, { text:roomUrl(code), width:360, height:360, colorDark:"#191B25", colorLight:"#FFFFFF", correctLevel:QR.CorrectLevel.M }); box.dataset.for = code; }
    box.hidden = false;
  } catch { toast("QRコードを読み込めませんでした。リンクを送ってね"); }
}
function copyLink() {
  const url = roomUrl(code);
  const fallback = () => {
    const el = $('[data-r="link"]');
    if (el) { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
    toast("リンクを選択しました。コピーして送ってね");
  };
  try { navigator.clipboard.writeText(url).then(() => toast("招待リンクをコピーしました"), fallback); } catch { fallback(); }
}
async function shareLink() {
  const url = roomUrl(code);
  if (navigator.share) {
    try { await navigator.share({ title:"ポケットあそび場", text:`部屋 ${code} で一緒に遊ぼう！`, url }); return; }
    catch (e) { if (e && e.name === "AbortError") return; }
  }
  copyLink();
}

/* ---------- 操作 ---------- */
document.addEventListener("pointerdown", e => {
  const b = e.target.closest("[data-tap]");
  if (!b || b.disabled || !R || !hs?.game) return;
  e.preventDefault();
  try { GAMES[hs.game].tap(b.dataset.tap, b.dataset, ctx(players())); } catch (err) { console.error(err); }
});
document.addEventListener("keydown", e => {
  if ((e.key === "Enter" || e.key === " ") && e.target.matches?.("[data-tap]")) {
    e.preventDefault(); e.target.dispatchEvent(new PointerEvent("pointerdown", { bubbles:true }));
  }
});
document.addEventListener("click", e => {
  const b = e.target.closest("[data-act]");
  if (!b || b.disabled) return;
  const a = b.dataset.act;
  if (a === "emoji") { me.emoji = AV[(AV.indexOf(me.emoji) + 1) % AV.length]; saveMe(); }
  else if (a === "color") { me.color = b.dataset.color; saveMe(); }
  else if (a === "create") enterRoom(newCode());
  else if (a === "leave") leaveRoom();
  else if (a === "start") sendReq("start", b.dataset.game);
  else if (a === "lobby") sendReq("lobby");
  else if (a === "share") shareLink();
  else if (a === "copy") copyLink();
  else if (a === "qr") toggleQR();
});
document.addEventListener("input", e => {
  if (e.target.id === "name") { me.name = e.target.value.slice(0, 12); clearTimeout(saveMe.t); saveMe.t = setTimeout(saveMe, 300); }
  if (e.target.id === "code") { const s = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""); if (s !== e.target.value) e.target.value = s; }
});
document.addEventListener("submit", e => { if (e.target.id === "joinform") { e.preventDefault(); enterRoom($("#code").value); } });
// 長押しメニューやダブルタップ拡大を防ぐ（連打用）
document.addEventListener("dblclick", e => { if (e.target.closest("[data-tap]")) e.preventDefault(); }, { passive:false });

/* ---------- 起動 ---------- */
(async function boot() {
  loop();
  const r = await NET.init();
  netMode = r.mode; netError = r.error || "";
  if (netError) toast(netError + "。練習モードで動きます");
  const c = urlCode();
  if (c && me.name.trim()) enterRoom(c);
})();
