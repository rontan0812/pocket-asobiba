"use strict";
/* =========================================================
   共通の道具（ゲームのファイルからも使えます）
   ========================================================= */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
const ID_CH = "abcdefghijkmnpqrstuvwxyz23456789";
const rid = (n = 8) => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => ID_CH[b % 32]).join("");
const CODE_CH = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), b => CODE_CH[b % CODE_CH.length]).join("");
const CODE_RE = /^[A-Z2-9]{4}$/;
const AV = ["🐶","🐱","🐼","🦊","🐸","🐵","🐧","🐙","🦁","🐰","🐻","🐨"];
const COLORS = ["tomato","mustard","teal","grape","sky"];
const pick = a => a[Math.floor(Math.random() * a.length)];

/* 画面の部分更新：shell は枠を1回だけ作り、patch は中身が変わったときだけ書き換える */
function shell(el, key, html) { if (!el) return false; if (el.__k !== key) { el.innerHTML = html; el.__k = key; el.__h = undefined; return true; } return false; }
function patch(el, html) { if (el && el.__h !== html) { el.innerHTML = html; el.__h = html; } }
const R$ = (el, name) => el.querySelector(`[data-r="${name}"]`);

function avatar(p, cls = "") {
  const color = COLORS.includes(p?.color) ? p.color : "sky";
  const emoji = AV.includes(p?.emoji) ? p.emoji : "🙂";
  return `<span class="av ${cls}" style="--tone:var(--${color})" aria-hidden="true">${emoji}</span>`;
}
let toastT;
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2600); }
/* ゲーム開始時の参加者の名前・アイコンを保存しておく（途中で抜けても名前が出るように） */
const roster = pl => Object.fromEntries(pl.map(p => [p.peer, [p.name, p.emoji, p.color]]));
const rank = (ids, val) => [...ids].sort((a, b) => val(b) - val(a));
/* スコアのチップ列（多くのゲームで使う） */
const scoreChips = (c, ids, val, okFn) => ids.map(p => { const n = c.nm(p);
  return `<span class="schip ${okFn && okFn(p) ? "ok" : ""}">${avatar(n, "sm")}${esc(n.name)} <b>${val(p)}</b></span>`; }).join("");

/* =========================================================
   ミニゲームの登録
   新しいゲームは js/games/ にファイルを作って addGame({...}) を呼び、
   index.html に <script> を1行足すだけ。書き方は docs/ADDING_GAMES.md。
   ========================================================= */
const GAME_LIST = [];
const GAMES = {};
function addGame(g) {
  for (const k of ["id", "name", "icon", "init", "step", "view", "tap", "scoreRows"]) if (!g[k]) throw new Error(`ゲーム ${g.id || "?"} に ${k} がありません`);
  if (GAMES[g.id]) throw new Error(`ゲームID ${g.id} が重複しています`);
  g.tone = COLORS.includes(g.tone) ? g.tone : "sky";
  g.min = g.min || 1; g.max = g.max || 8;
  GAME_LIST.push(g); GAMES[g.id] = g;
}
