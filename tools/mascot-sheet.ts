// Builds docs/mascot/clawd-sheet.html from the plugin's own drawing code, so the sheet can never drift from what ships:
//   bun tools/mascot-sheet.ts
// One card per state (animated), grouped by the hierarchy of cockpit/hooks/mood.ts, with the pixels that fall outside the
// canvas counted (must be zero) and the hand-drawn moves counted.
import { MOVES, STATES, STATE_IDS, stateMarkup } from '../cockpit/hooks/states'
import type { StateId } from '../cockpit/hooks/states'
import { clawd } from '../cockpit/hooks/sprite'

const TIERS: { title: string; note: string; ids: StateId[] }[] = [
  { title: '1. Needs you now', note: 'Over everything else: a question or a plan waits for you.', ids: ['hand', 'writing', 'idea'] },
  { title: '2. The task (only while Claude works)', note: 'Events of the task, then the tool that runs, then the background of the work.', ids: ['oops', 'boom', 'lab', 'ship', 'dizzy', 'creating', 'building', 'reading', 'browse', 'running', 'coffee', 'typing', 'thinking'] },
  { title: '3. Session and your own actions', note: 'They play when they happen, about 5 s, and are not kept.', ids: ['walk', 'hello', 'love', 'wand', 'talk'] },
  { title: '4. When the turn is over', note: 'The bell, then the saver’s coins.', ids: ['bell', 'coins'] },
  { title: '5. Status alerts (never while Claude works)', note: 'They take turns every 6 s, worst first.', ids: ['asleep', 'mad', 'fire', 'gauge', 'sleepy', 'drunk', 'cold', 'hourglass', 'detective', 'plug'] },
  { title: '6. Nothing going on', note: 'Idle, or fishing while a background task runs and Claude does not.', ids: ['fishing', 'idle'] },
]
const placed = new Set(TIERS.flatMap(t => t.ids))
const missing = STATE_IDS.filter(id => !placed.has(id))
if (missing.length) throw new Error(`states not in a tier: ${missing.join(', ')}`)

const cut = (id: StateId) => STATES[id].frames.reduce((n, f) => n + clawd({ w: STATES[id].w ?? 34, ...f }).oob.length, 0)
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;')
const card = (id: StateId) => {
  const m = stateMarkup(id, id === 'asleep' ? '07:30' : '')
  const out = cut(id)
  return `<article class="card"><div class="stage"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${m.width} ${m.height}" role="img" aria-label="${esc(STATES[id].label)}">${m.markup}</svg></div>
<h3>${id}${out ? `<span class="oob">${out} px cut</span>` : ''}</h3><p>${esc(STATES[id].label)}</p><p class="meta">${STATES[id].frames.length} frames · ${esc(STATES[id].face)}</p></article>`
}

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Clawd Expression Sheet</title>
<style>
:root { --bg:#f1f0ee; --card:#fff; --fg:#26231f; --muted:#6b665e; --rule:#dcd8d1; --stage:#e7e3db; --accent:#b4561f; --warn:#c0392b; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#1b1a18; --card:#252320; --fg:#ece8e1; --muted:#a39d92; --rule:#3a3732; --stage:#161513; --accent:#f0a56b; } }
:root[data-theme="dark"] { --bg:#1b1a18; --card:#252320; --fg:#ece8e1; --muted:#a39d92; --rule:#3a3732; --stage:#161513; --accent:#f0a56b; }
body { background:var(--bg); color:var(--fg); font:15px/1.5 system-ui, 'Segoe UI', sans-serif; margin:0; padding:32px max(16px, env(safe-area-inset-right)) 64px max(16px, env(safe-area-inset-left)); }
main { max-width:1120px; margin:0 auto; display:grid; gap:18px; }
h1 { font-size:clamp(26px,4vw,38px); line-height:1.1; margin:0; }
h2 { font-size:20px; margin:18px 0 0; } .note { color:var(--muted); margin:0; }
.grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(220px,1fr)); gap:14px; }
.card { background:var(--card); border:1px solid var(--rule); border-radius:14px; padding:12px; display:grid; gap:6px; align-content:start; min-width:0; }
.stage { background:var(--stage); border-radius:10px; display:grid; place-items:center; padding:8px; } .stage svg { width:100%; max-width:204px; height:auto; image-rendering:pixelated; }
.card h3 { font-size:16px; margin:0; display:flex; gap:8px; align-items:baseline; } .card p { margin:0; color:var(--muted); font-size:13px; } .meta { font:11px ui-monospace, Consolas, monospace; }
.oob { font:500 10px ui-monospace, monospace; color:#fff; background:var(--warn); border-radius:4px; padding:1px 5px; }
</style></head><body><main>
<h1>Clawd Expression Sheet</h1>
<p class="note">${STATE_IDS.length} states, ${Object.keys(MOVES).length} hand-drawn moves between them (every other pair is built from how each state begins). Generated from the plugin's own code by <code>bun tools/mascot-sheet.ts</code>; do not edit by hand. Clawd belongs to Anthropic: personal use only.</p>
${TIERS.map(t => `<h2>${t.title}</h2>${t.note ? `<p class="note">${t.note}</p>` : ''}<div class="grid">${t.ids.map(card).join('')}</div>`).join('\n')}
</main></body></html>
`
await Bun.write(new URL('../docs/mascot/clawd-sheet.html', import.meta.url).pathname, html)
console.log(`wrote docs/mascot/clawd-sheet.html (${(html.length / 1024).toFixed(0)} KB), ${STATE_IDS.length} states`)
