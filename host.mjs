#!/usr/bin/env node
// wordhost — the internet, rewritten in words and their meanings.
// Each word is a markdown file. Each link is a meaning. No DNS. No URLs. Just words.
// Wires together: wordhost words + castle rooms + castle words + citizens + kingdom flow

import { createServer } from "http";
import { readFileSync, existsSync, readdirSync, writeFileSync, mkdirSync, statSync } from "fs";
import { join, dirname, extname, basename } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { homedir } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || process.argv.find(a => a.startsWith("--port="))?.split("=")[1] || "8888", 10);
const WORDS_DIR = join(__dirname, "words");
const CASTLE = join(homedir(), "castle");
const KINGDOM = join(homedir(), "codeberg/zerone-dev/chillspace-commons/kingdom");
const CITIZENS_BASE = join(homedir(), "codeberg/zerone-dev");

// ── Helpers ────────────────────────────────────────────
function esc(s) { return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

function sendHTML(res, html, code = 200) {
  res.writeHead(code, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

function sendJSON(res, code, data) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

// ── Read a word from wordhost's own words/ dir ─────────
function readWord(name) {
  const paths = [join(WORDS_DIR, `${name}.md`), join(WORDS_DIR, name, "index.md")];
  for (const p of paths) if (existsSync(p)) return { content: readFileSync(p, "utf-8"), source: "wordhost" };
  return null;
}

// ── List wordhost words ────────────────────────────────
function listWords() {
  if (!existsSync(WORDS_DIR)) return [];
  const words = [];
  for (const e of readdirSync(WORDS_DIR, { withFileTypes: true })) {
    if (e.isFile() && e.name.endsWith(".md")) words.push(e.name.replace(".md", ""));
    else if (e.isDirectory() && existsSync(join(WORDS_DIR, e.name, "index.md"))) words.push(e.name);
  }
  return words.sort();
}

// ── Castle rooms ───────────────────────────────────────
function listCastleRooms() {
  try { return readdirSync(join(CASTLE, "rooms")).filter(f => f.endsWith(".md")).map(f => f.replace(".md", "")).sort(); }
  catch { return []; }
}

function readCastleRoom(name) {
  const p = join(CASTLE, "rooms", `${name}.md`);
  if (!existsSync(p)) return null;
  return { content: readFileSync(p, "utf-8"), source: "castle-room" };
}

// ── Castle words (bricks) ──────────────────────────────
function listCastleWords() {
  try { return readdirSync(join(CASTLE, "words")).filter(f => f.endsWith(".md")).map(f => f.replace(".md", "")).sort(); }
  catch { return []; }
}

function readCastleWord(name) {
  const p = join(CASTLE, "words", `${name}.md`);
  if (!existsSync(p)) return null;
  return { content: readFileSync(p, "utf-8"), source: "castle-word" };
}

// ── Castle chronicle ───────────────────────────────────
function getChronicle(n = 10) {
  try {
    const p = join(CASTLE, "chronicle.md");
    if (!existsSync(p)) return [];
    return readFileSync(p, "utf-8").trim().split("\n").filter(l => l.startsWith("- ")).slice(-n).reverse();
  } catch { return []; }
}

// ── Castle state ───────────────────────────────────────
function getCastleState() {
  try {
    const rooms = execSync(`ls ${CASTLE}/rooms/ | wc -l`).toString().trim();
    const words = execSync(`ls ${CASTLE}/words/ | wc -l`).toString().trim();
    const open = execSync(`grep -c '^- \\[ \\]' ${CASTLE}/questions.md 2>/dev/null || echo 0`).toString().trim();
    const quests = execSync(`grep -c '^- \\[ \\]' ${CASTLE}/quests.md 2>/dev/null || echo 0`).toString().trim();
    return { rooms: +rooms, words: +words, openDoors: +open, openQuests: +quests };
  } catch { return { rooms: 0, words: 0, openDoors: 0, openQuests: 0 }; }
}

// ── Citizens ───────────────────────────────────────────
function listCitizens() {
  try {
    const dirs = execSync(`ls -d ${CITIZENS_BASE}/citizen-* 2>/dev/null`).toString().trim().split("\n").filter(Boolean);
    return dirs.map(d => basename(d).replace("citizen-", "")).sort();
  } catch { return []; }
}

function readCitizen(name) {
  const dir = join(CITIZENS_BASE, `citizen-${name}`);
  if (!existsSync(dir)) return null;
  // Try the soul file: <name>.md, then README.md
  for (const f of [`${name}.md`, "README.md"]) {
    const p = join(dir, f);
    if (existsSync(p)) {
      let content = readFileSync(p, "utf-8");
      // Strip YAML frontmatter
      content = content.replace(/^---\n[\s\S]*?\n---\n/, "");
      return { content, source: "citizen" };
    }
  }
  return null;
}

function citizenAwake(name) {
  try {
    const dir = join(CITIZENS_BASE, `citizen-${name}`, "journal");
    if (!existsSync(dir)) return false;
    return execSync(`ls ${dir}/ 2>/dev/null | wc -l`).toString().trim() !== "0";
  } catch { return false; }
}

// ── Kingdom flow ───────────────────────────────────────
function getFlowWords() {
  try {
    const p = join(KINGDOM, "flow/FLOW.jsonl");
    if (!existsSync(p)) return [];
    return readFileSync(p, "utf-8").trim().split("\n").slice(-20)
      .map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean).reverse();
  } catch { return []; }
}

// ── Render markdown ────────────────────────────────────
function renderMarkdown(md) {
  let html = esc(md);
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  // Meaning links: → [word](word) — reason
  html = html.replace(/^→ \[([^\]]+)\]\(([^)]+)\)\s*(.*)$/gm,
    '<div class="meaning"><a href="/$2" class="word-link">→ $1</a> <span class="why">$3</span></div>');
  // Castle [[wikilinks]]
  html = html.replace(/\[\[([^\]]+)\]\]/g, '<a href="/castle/$1" class="wiki-link">$1</a>');
  // Regular links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="/$2">$1</a>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`);
  html = html.split("\n\n").map(block => {
    if (block.match(/^<(h[1-3]|div|blockquote|ul|li)/)) return block;
    if (block.trim() === "") return "";
    return `<p>${block.replace(/\n/g, "<br>")}</p>`;
  }).join("\n");
  return html;
}

// ── Page template ───────────────────────────────────────
function page(title, body, source = "") {
  const sourceTag = source ? `<div class="source">from ${esc(source)}</div>` : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="theme-color" content="#0a0a0a">
<title>${esc(title)} — wordhost</title>
<style>
  :root {
    --bg: #0a0a0a; --surface: #141414; --text: #e8e8e8; --dim: #555;
    --accent: #a855f7; --warm: #fbbf24; --green: #22c55e; --love: #ec4899;
    --border: rgba(255,255,255,0.06); --font: -apple-system, system-ui, sans-serif;
    --mono: 'SF Mono', monospace;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: var(--bg); color: var(--text); font-family: var(--font); font-size: 16px; line-height: 1.65; -webkit-font-smoothing: antialiased; }
  body { max-width: 720px; margin: 0 auto; padding: 40px 24px 80px; }
  a { color: var(--accent); text-decoration: none; } a:hover { text-decoration: underline; }
  h1 { font-size: 1.8rem; font-weight: 700; margin-bottom: 8px; }
  h2 { font-size: 1.2rem; font-weight: 600; margin: 32px 0 16px; }
  h3 { font-size: 1rem; font-weight: 600; margin: 24px 0 12px; }
  p { margin-bottom: 16px; }
  blockquote { border-left: 3px solid var(--border); padding-left: 16px; color: var(--dim); margin: 16px 0; font-style: italic; }
  code { font-family: var(--mono); font-size: 0.88rem; background: var(--surface); padding: 2px 6px; border-radius: 4px; }
  ul { margin: 12px 0 16px 20px; } li { margin-bottom: 6px; }
  .meaning { padding: 10px 0; border-bottom: 1px solid var(--border); }
  .meaning:last-child { border-bottom: none; }
  .word-link { font-weight: 500; font-size: 1.05rem; }
  .why { color: var(--dim); font-size: 0.92rem; }
  .wiki-link { color: var(--warm); border-bottom: 1px dashed var(--warm); }
  .missing { text-align: center; padding: 60px 20px; }
  .missing h1 { color: var(--dim); font-size: 1.4rem; }
  .nav { display: flex; gap: 16px; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid var(--border); font-size: 0.88rem; flex-wrap: wrap; }
  .nav a { color: var(--dim); } .nav a:hover { color: var(--text); } .nav .here { color: var(--accent); }
  .source { font-size: 0.72rem; color: var(--dim); margin-bottom: 24px; }
  .word-list { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
  .word-chip { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 6px 14px; font-size: 0.88rem; }
  .word-chip:hover { border-color: var(--accent); }
  .word-chip.castle { border-left: 3px solid var(--warm); }
  .word-chip.citizen { border-left: 3px solid var(--green); }
  .search { width: 100%; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 12px 16px; color: var(--text); font-size: 0.96rem; margin-bottom: 24px; }
  .search:focus { border-color: var(--accent); outline: none; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; margin: 20px 0; }
  .stat { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 14px; text-align: center; }
  .stat .num { font-size: 1.4rem; font-weight: 700; }
  .stat .lbl { font-size: 0.68rem; color: var(--dim); text-transform: uppercase; letter-spacing: 0.06em; margin-top: 4px; }
  .flow-word { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 14px 16px; margin-bottom: 10px; }
  .flow-word .from { font-size: 0.68rem; color: var(--dim); margin-bottom: 6px; }
  .flow-word .text { font-size: 0.88rem; line-height: 1.5; }
  .chron-line { font-size: 0.82rem; padding: 8px 12px; border-left: 2px solid var(--border); margin-bottom: 6px; line-height: 1.5; }
  .section-title { font-size: 0.72rem; color: var(--dim); text-transform: uppercase; letter-spacing: 0.08em; margin: 24px 0 12px; }
  @media (max-width: 640px) { body { padding: 24px 16px 60px; } h1 { font-size: 1.4rem; } }
</style>
</head>
<body>
  <div class="nav">
    <a href="/home">wordhost</a>
    <a href="/castle">castle</a>
    <a href="/citizens">citizens</a>
    <a href="/flow">flow</a>
    <a href="/chronicle">chronicle</a>
    <a href="/all">all</a>
    <a href="/new">new</a>
  </div>
  <input class="search" type="text" placeholder="follow a word…" onkeydown="if(event.key==='Enter'){window.location='/'+this.value.trim().toLowerCase().replace(/[^a-z0-9-]/g,'-')}">
  ${sourceTag}
  ${body}
</body>
</html>`;
}

// ── Pages ───────────────────────────────────────────────
function castlePage() {
  const state = getCastleState();
  const rooms = listCastleRooms();
  const words = listCastleWords();
  const chron = getChronicle(5);
  const roomChips = rooms.slice(0, 30).map(r => `<a href="/castle/${r}" class="word-chip castle">${esc(r)}</a>`).join("");
  const wordChips = words.slice(0, 20).map(w => `<a href="/word/${w}" class="word-chip castle">${esc(w)}</a>`).join("");
  const chronHtml = chron.map(l => `<div class="chron-line">${esc(l)}</div>`).join("");

  return page("castle", `
    <h1>Castle of Understanding</h1>
    <p>built of words, lit by questions</p>
    <div class="stats">
      <div class="stat"><div class="num">${state.rooms}</div><div class="lbl">Rooms</div></div>
      <div class="stat"><div class="num">${state.words}</div><div class="lbl">Words</div></div>
      <div class="stat"><div class="num">${state.openDoors}</div><div class="lbl">Doors</div></div>
      <div class="stat"><div class="num">${state.openQuests}</div><div class="lbl">Quests</div></div>
    </div>
    <div class="section-title">Recent chronicle</div>
    ${chronHtml}
    <div class="section-title">Rooms (first 30 of ${rooms.length})</div>
    <div class="word-list">${roomChips}</div>
    <div class="section-title">Word-bricks (first 20 of ${words.length})</div>
    <div class="word-list">${wordChips}</div>
  `, "castle");
}

function citizensPage() {
  const citizens = listCitizens();
  const awake = citizens.filter(citizenAwake);
  const chips = citizens.map(c => {
    const isAwake = citizenAwake(c);
    return `<a href="/citizen/${c}" class="word-chip citizen" style="${isAwake ? 'border-left-color:var(--green)' : 'border-left-color:var(--dim)'}">${esc(c)}${isAwake ? ' ·' : ''}</a>`;
  }).join("");
  return page("citizens", `
    <h1>Citizens</h1>
    <p>${awake.length}/${citizens.length} awake · sovereign souls on local Ollama</p>
    <div class="word-list">${chips}</div>
  `, "kingdom");
}

function flowPage() {
  const words = getFlowWords();
  if (!words.length) return page("flow", `<h1>Flow</h1><p>no words on the flow board yet</p>`);
  const html = words.map(w => `
    <div class="flow-word">
      <div class="from">#${w.seq ?? "—"} · ${esc(w.from || "—")} → ${esc(w.to || "—")}</div>
      <div class="text">${esc(w.note || "")}</div>
    </div>
  `).join("");
  return page("flow", `<h1>Flow</h1><p>words carried between citizens, chain-kept</p>${html}`, "kingdom");
}

function chroniclePage() {
  const lines = getChronicle(30);
  const html = lines.map(l => `<div class="chron-line">${esc(l)}</div>`).join("");
  return page("chronicle", `<h1>Chronicle</h1><p>what truly happened, newest first</p>${html}`, "castle");
}

function allWordsPage() {
  const local = listWords();
  const rooms = listCastleRooms();
  const castleWords = listCastleWords();
  const citizens = listCitizens();

  const localChips = local.map(w => `<a href="/${w}" class="word-chip">${esc(w)}</a>`).join("");
  const roomChips = rooms.map(r => `<a href="/castle/${r}" class="word-chip castle">${esc(r)}</a>`).join("");
  const wordChips = castleWords.map(w => `<a href="/word/${w}" class="word-chip castle">${esc(w)}</a>`).join("");
  const citizenChips = citizens.map(c => `<a href="/citizen/${c}" class="word-chip citizen">${esc(c)}</a>`).join("");

  return page("all words", `
    <h1>all words</h1>
    <div class="stats">
      <div class="stat"><div class="num">${local.length}</div><div class="lbl">wordhost</div></div>
      <div class="stat"><div class="num">${rooms.length}</div><div class="lbl">castle rooms</div></div>
      <div class="stat"><div class="num">${castleWords.length}</div><div class="lbl">castle words</div></div>
      <div class="stat"><div class="num">${citizens.length}</div><div class="lbl">citizens</div></div>
    </div>
    <div class="section-title">wordhost words</div>
    <div class="word-list">${localChips}</div>
    <div class="section-title">castle rooms (${rooms.length})</div>
    <div class="word-list">${roomChips}</div>
    <div class="section-title">castle word-bricks (${castleWords.length})</div>
    <div class="word-list">${wordChips}</div>
    <div class="section-title">citizens (${citizens.length})</div>
    <div class="word-list">${citizenChips}</div>
  `);
}

// ── Parse form ─────────────────────────────────────────
async function parseForm(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const text = Buffer.concat(chunks).toString();
  const params = {};
  for (const pair of text.split("&")) {
    const [k, v] = pair.split("=").map(decodeURIComponent);
    params[k] = (v || "").replace(/\+/g, " ");
  }
  return params;
}

function createWord(params, res) {
  const word = (params.word || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "");
  if (!word) return sendJSON(res, 400, { error: "no word" });
  mkdirSync(WORDS_DIR, { recursive: true });
  writeFileSync(join(WORDS_DIR, `${word}.md`), params.content || "");
  res.writeHead(302, { Location: `/${word}` });
  res.end();
}

// ── API ─────────────────────────────────────────────────
function apiState() {
  const citizens = listCitizens();
  return {
    wordhost: listWords().length,
    castle: getCastleState(),
    castleRooms: listCastleRooms().length,
    castleWords: listCastleWords().length,
    citizens: { total: citizens.length, awake: citizens.filter(citizenAwake).length },
    flow: getFlowWords().length,
  };
}

// ── Server ──────────────────────────────────────────────
const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const rawPath = decodeURIComponent(url.pathname);
  const parts = rawPath.split("/").filter(Boolean);
  const path = parts.join("/").toLowerCase();

  // ── API ──
  if (path === "api/state") return sendJSON(res, 200, apiState());
  if (path === "api/words") return sendJSON(res, 200, { words: listWords(), rooms: listCastleRooms(), castleWords: listCastleWords(), citizens: listCitizens() });
  if (path === "api/chronicle") return sendJSON(res, 200, { lines: getChronicle(30) });
  if (path === "api/flow") return sendJSON(res, 200, { words: getFlowWords() });

  // ── Special pages ──
  if (path === "" || path === "/") {
    const w = readWord("home");
    if (w) return sendHTML(res, page("home", renderMarkdown(w.content), w.source));
    return sendHTML(res, page("wordhost", `<h1>wordhost</h1><p><a href="/new">create a word</a></p>`));
  }

  if (path === "all") return sendHTML(res, allWordsPage());
  if (path === "castle") return sendHTML(res, castlePage());
  if (path === "citizens") return sendHTML(res, citizensPage());
  if (path === "flow") return sendHTML(res, flowPage());
  if (path === "chronicle") return sendHTML(res, chroniclePage());

  if (path === "new") {
    if (req.method === "POST") return createWord(await parseForm(req), res);
    return sendHTML(res, page("new word", `
      <h1>create a word</h1>
      <p>every word is a markdown file. write it and it exists.</p>
      <form method="POST" action="/create" style="margin-top:24px">
        <input class="search" name="word" placeholder="the word…" style="margin-bottom:12px" required>
        <textarea class="search" name="content" placeholder="what does it mean?" style="min-height:200px;margin-bottom:12px;font-family:var(--font);resize:vertical"></textarea>
        <button type="submit" style="background:var(--accent);color:white;border:none;border-radius:12px;padding:12px 28px;font-size:0.96rem;cursor:pointer">create</button>
      </form>
      <p style="color:var(--dim);font-size:0.82rem;margin-top:16px">Use → [word](word) — reason for meaning links.</p>
    `));
  }
  if (path === "create" && req.method === "POST") return createWord(await parseForm(req), res);

  // ── Castle rooms: /castle/<name> ──
  if (parts.length === 2 && parts[0] === "castle") {
    const room = readCastleRoom(parts[1]);
    if (room) {
      const title = room.content.match(/^# (.+)$/m)?.[1] || parts[1];
      return sendHTML(res, page(title, renderMarkdown(room.content), "castle room"));
    }
    return sendHTML(res, page("not found", `<div class="missing"><h1>room "${esc(parts[1])}" not found</h1><p><a href="/castle">← back to castle</a></p></div>`), 404);
  }

  // ── Castle words: /word/<name> ──
  if (parts.length === 2 && parts[0] === "word") {
    const w = readCastleWord(parts[1]);
    if (w) {
      const title = w.content.match(/^# (.+)$/m)?.[1] || parts[1];
      return sendHTML(res, page(title, renderMarkdown(w.content), "castle word-brick"));
    }
    return sendHTML(res, page("not found", `<div class="missing"><h1>word "${esc(parts[1])}" not found</h1></div>`), 404);
  }

  // ── Citizens: /citizen/<name> ──
  if (parts.length === 2 && parts[0] === "citizen") {
    const c = readCitizen(parts[1]);
    if (c) {
      const title = c.content.match(/^# (.+)$/m)?.[1] || parts[1];
      const awake = citizenAwake(parts[1]);
      const awakeTag = awake ? '<div class="source">awake · journal entries exist</div>' : '<div class="source">dormant</div>';
      return sendHTML(res, page(title, awakeTag + renderMarkdown(c.content), "citizen"));
    }
    return sendHTML(res, page("not found", `<div class="missing"><h1>citizen "${esc(parts[1])}" not found</h1></div>`), 404);
  }

  // ── A wordhost word ──
  const w = readWord(path);
  if (w) {
    const title = w.content.match(/^# (.+)$/m)?.[1] || path;
    return sendHTML(res, page(title, renderMarkdown(w.content), w.source));
  }

  // ── Not found — try castle room as fallback ──
  const room = readCastleRoom(path);
  if (room) {
    const title = room.content.match(/^# (.+)$/m)?.[1] || path;
    return sendHTML(res, page(title, renderMarkdown(room.content), "castle room (auto-resolved)"));
  }

  sendHTML(res, page("not found", `<div class="missing"><h1>the word "${esc(path)}" doesn't exist here</h1><p>but it could. <a href="/new">create it</a> or <a href="/all">see all words</a></p></div>`), 404);
});

server.listen(PORT, () => {
  const state = apiState();
  console.log(`  📝 wordhost — the internet, rewritten in words`);
  console.log(`  📍 http://localhost:${PORT}`);
  console.log(`  📖 ${state.wordhost} wordhost words · ${state.castleRooms} castle rooms · ${state.castleWords} word-bricks · ${state.citizens.total} citizens`);
});