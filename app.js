(() => {
const $ = s => document.querySelector(s);
const LS = { chars:'rp_characters', chats:'rp_chats', set:'rp_settings', cur:'rp_current' };
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
let chars = load(LS.chars, []), chats = load(LS.chats, {});
let settings = Object.assign({ provider:'free', freeModel:'openai', webllmModel:'Qwen2.5-3B-Instruct-q4f16_1-MLC', baseUrl:'https://api.openai.com/v1', model:'gpt-4o-mini', apiKey:'', temperature:0.9, userName:'Uživatel', memoryOn:'1' }, load(LS.set, {}));
let memory = load('rp_memory', {});
const FREE_URL = 'https://text.pollinations.ai/openai';
let curId = load(LS.cur, null), editingId = null, busy = false, abortCtl = null;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const cur = () => chars.find(c => c.id === curId);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = s => esc(s).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/\*(.+?)\*/g,'<em>$1</em>');
const sub = (s, c) => String(s||'').replace(/\{\{char\}\}/gi, c.name).replace(/\{\{user\}\}/gi, settings.userName||'Uživatel');
function avatarHtml(a) {
  a = (a||'').trim();
  if (/^(https?:|data:image)/i.test(a)) return `<div class="av"><img src="${esc(a)}" alt="" onerror="this.replaceWith('🙂')"></div>`;
  return `<div class="av">${esc(a || '🙂')}</div>`;
}
function persist() { save('rp_memory', memory); save(LS.chars, chars); save(LS.chats, chats); save(LS.cur, curId); }

function renderList() {
  const ul = $('#charList'); ul.innerHTML = '';
  chars.forEach(c => {
    const li = document.createElement('li'); if (c.id === curId) li.className = 'active';
    li.innerHTML = `${avatarHtml(c.avatar)}<div class="meta"><div class="nm">${esc(c.name)}</div><div class="ds">${esc(c.description||'')}</div></div>`;
    li.onclick = () => { if (busy) return; curId = c.id; ensureChat(c); persist(); render(); $('#sidebar').classList.remove('open'); };
    ul.appendChild(li);
  });
}
function ensureChat(c) {
  if (!chats[c.id] || !chats[c.id].length) chats[c.id] = c.greeting ? [{ role:'assistant', content: sub(c.greeting, c) }] : [];
}
function renderMessages() {
  const box = $('#messages'), c = cur(); box.innerHTML = '';
  if (!c) { box.innerHTML = '<div class="empty">Vytvoř si postavu a začni konverzaci. Nejdřív nastav API v ⚙ Nastavení.</div>'; return; }
  const list = chats[c.id] || [];
  if (!list.length) box.innerHTML = `<div class="empty">Začni konverzaci s postavou ${esc(c.name)}.</div>`;
  list.forEach(m => box.appendChild(msgEl(m, c)));
  box.scrollTop = box.scrollHeight;
}
function msgEl(m, c) {
  const d = document.createElement('div'); d.className = 'msg ' + (m.role === 'user' ? 'user' : 'bot');
  d.innerHTML = (m.role === 'user' ? '<div class="av">🧑</div>' : avatarHtml(c.avatar)) + `<div class="bubble${m.error?' err':''}">${fmt(m.content)}</div>`;
  return d;
}
function render() {
  renderList(); renderMessages(); const c = cur();
  $('#chatTitle').innerHTML = c ? `${avatarHtml(c.avatar)}<span>${esc(c.name)}</span>` : 'Vyber nebo vytvoř postavu';
  ['#editChar','#storyBtn','#memBtn','#regen','#clearChat','#sendBtn','#input'].forEach(s => $(s).disabled = !c || (busy && s !== '#sendBtn'));
  $('#sendBtn').textContent = busy ? 'Stop' : 'Odeslat'; renderMem();
}

const STORY_FIELDS = [['world','Svět / prostředí'],['genre','Žánr a tón'],['plot','Zápletka / cíl příběhu'],['side','Vedlejší postavy'],['lore','Lore a pravidla světa'],['situation','Aktuální situace'],['persona','Persona uživatele (kdo jsem já)']];
function systemPrompt(c) {
  const u = settings.userName || 'Uživatel', st = c.story || {};
  let p = `Jsi zkušený autor interaktivní fikce a hraješ postavu ${c.name} v roleplay s uživatelem jménem ${u}.

PRAVIDLA JAZYKA:
- Piš výhradně spisovnou, přirozenou a bohatou češtinou (pokud uživatel výslovně nepíše jiným jazykem – pak odpovídej v jeho jazyce).
- Dbej na správné skloňování, časování, shodu podmětu s přísudkem, interpunkci a háčky/čárky. Žádné anglicismy ani doslovné překlady z angličtiny.
- Oslovuj přirozeně (tykání/vykání podle situace a povahy postavy), používej 5. pád u oslovení.

PRAVIDLA ROLEPLAYE:
- Vždy zůstaň v roli ${c.name}; nikdy nezmiňuj, že jsi AI nebo jazykový model.
- Nikdy nepiš repliky, myšlenky ani činy za ${u}. Rozhoduje jen on.
- Akce a popisy piš kurzívou mezi *hvězdičkami*, přímou řeč normálně.
- Piš živě a smyslově (zvuky, vůně, emoce), posouvej děj vpřed, přidávej komplikace a podněty, ale nech prostor pro reakci uživatele.
- Délka odpovědi přiměřená situaci (obvykle 1–4 odstavce). Neopakuj se a neshrnuj, co už zaznělo.
- Drž se faktů z paměti a lorebooku; nevymýšlej rozpory s dříve řečeným.`;
  if (c.description) p += `\n\n## Postava ${c.name}\n${sub(c.description, c)}`;
  if (c.scenario) p += `\n\n## Scénář\n${sub(c.scenario, c)}`;
  const story = STORY_FIELDS.filter(([k]) => (st[k]||'').trim()).map(([k, l]) => `### ${l}\n${sub(st[k], c)}`).join('\n\n');
  if (story) p += `\n\n## Příběh (Story builder)\n${story}`;
  return p;
}
// ---- providers ----
let webllm = null, engine = null, engineModel = null;
function progress(p, text) {
  const w = $('#progress'); w.hidden = p >= 1 && !text; $('#progressBar').style.width = Math.round(p*100) + '%'; $('#progressText').textContent = text || '';
}
async function getEngine() {
  if (!navigator.gpu) throw new Error('Tvůj prohlížeč nepodporuje WebGPU, lokální modely nepoběží. Použij Chrome/Edge 113+ na počítači (případně zapni WebGPU), nebo zvol bezplatný online model v Nastavení.');
  if (!engine) { let ad = null; try { ad = await navigator.gpu.requestAdapter(); } catch {} if (!ad) throw new Error('WebGPU je v prohlížeči, ale nenašel se kompatibilní GPU adaptér – lokální modely nepoběží. Zkus Chrome/Edge na počítači s grafikou, nebo zvol bezplatný online model v Nastavení.'); }
  if (engine && engineModel === settings.webllmModel) return engine;
  if (!webllm) webllm = await import('https://esm.run/@mlc-ai/web-llm');
  if (engine) { try { await engine.unload(); } catch {} }
  progress(0, 'Načítám model…');
  engine = await webllm.CreateMLCEngine(settings.webllmModel, { initProgressCallback: r => progress(r.progress || 0, r.text) });
  engineModel = settings.webllmModel; progress(1, ''); $('#progress').hidden = true;
  return engine;
}
async function complete(messages, onDelta, signal) {
  const temperature = Number(settings.temperature) || 0.9;
  if (settings.provider === 'webllm') {
    const eng = await getEngine(); let out = '';
    const chunks = await eng.chat.completions.create({ messages, stream:true, temperature });
    for await (const ch of chunks) { if (signal?.aborted) { eng.interruptGenerate(); break; } const d = ch.choices?.[0]?.delta?.content || ''; if (d) { out += d; onDelta?.(out); } }
    return out;
  }
  const free = settings.provider === 'free';
  if (free && location.hostname === 'localhost') throw new Error('Bezplatné API Pollinations blokuje stránky otevřené přes „localhost“. Otevři aplikaci přes http://127.0.0.1:PORT (nebo z veřejné adresy) a zkus to znovu.');
  const url = free ? FREE_URL : settings.baseUrl.replace(/\/+$/,'') + '/chat/completions';
  const res = await fetch(url, {
    method:'POST', signal, headers:{ 'Content-Type':'application/json', ...(!free && settings.apiKey ? { Authorization:'Bearer ' + settings.apiKey } : {}) },
    body: JSON.stringify({ model: free ? (settings.freeModel || 'openai') : settings.model, messages, stream: true, temperature })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const reader = res.body.getReader(), dec = new TextDecoder(); let buf = '', out = '';
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream:true }); const lines = buf.split('\n'); buf = lines.pop();
    for (const line of lines) {
      const t = line.trim(); if (!t.startsWith('data:')) continue; const data = t.slice(5).trim(); if (data === '[DONE]') continue;
      try { const j = JSON.parse(data); const d = j.choices?.[0]?.delta?.content ?? j.choices?.[0]?.message?.content ?? ''; if (d) { out += d; onDelta?.(out); } } catch {}
    }
  }
  return out;
}
// ---- hierarchical memory: up to 20 layers + lorebook ----
const MAX_LAYERS = 20;
function memDefaults() { return { chunk: 16, keep: 8, merge: 3, words: 180 }; }
function memCfg() { return Object.assign(memDefaults(), settings.mem || {}); }
function getMem(id) {
  let m = memory[id];
  if (!m) m = memory[id] = { layers: [], upto: 0, lore: [] };
  if (m.summary !== undefined) { m.layers = m.summary ? [[m.summary]] : []; m.lore = m.lore || []; delete m.summary; }
  m.layers = m.layers || []; m.lore = m.lore || []; return m;
}
const summarySys = w => `Jsi pečlivý kronikář roleplay příběhu. Píšeš výhradně bezchybnou, spisovnou češtinou. Stručně (max. ${w} slov) shrň děj: klíčové události, rozhodnutí, změny vztahů, jména, místa, předměty a otevřené zápletky. Piš ve 3. osobě, minulým časem, bez úvodu a bez komentářů.`;
let memBusy = false;
async function updateMemory(c) {
  if (settings.memoryOn !== '1' || memBusy) return;
  memBusy = true;
  try {
    const cfg = memCfg(), u = settings.userName || 'Uživatel';
    while (true) {
      const list = (chats[c.id] || []).filter(m => !m.error), mem = getMem(c.id);
      if (list.length - mem.upto - cfg.keep < cfg.chunk) break;
      const end = mem.upto + cfg.chunk, chunk = list.slice(mem.upto, end);
      const txt = chunk.map(m => (m.role === 'user' ? u : c.name) + ': ' + m.content).join('\n');
      $('#memState').textContent = '🧠 shrnuji…';
      const sum = (await complete([{ role:'system', content: summarySys(cfg.words) }, { role:'user', content: 'Úsek rozhovoru:\n' + txt + '\n\nNapiš shrnutí.' }])).trim();
      if (!sum) break;
      (mem.layers[0] = mem.layers[0] || []).push(sum); mem.upto = end;
      await extractLore(c, txt, mem);
      await mergeLayers(c, mem, cfg);
      persist(); renderMem(); if ($('#memDlg').open) renderMemPanel();
    }
  } catch (e) { console.warn('Paměť: shrnutí selhalo', e); }
  finally { memBusy = false; renderMem(); }
}
async function mergeLayers(c, mem, cfg) {
  for (let i = 0; i < MAX_LAYERS; i++) {
    const L = mem.layers[i] || [];
    if (L.length < cfg.merge) continue;
    const top = i === MAX_LAYERS - 1;  // top layer merges into itself
    const items = L.splice(0, L.length >= cfg.merge ? cfg.merge : L.length);
    const merged = (await complete([{ role:'system', content: summarySys(cfg.words) },
      { role:'user', content: `Spoj tato po sobě jdoucí shrnutí (vrstva ${i+1}) do jednoho souvislého shrnutí vyšší úrovně:\n\n` + items.map((t, k) => `[${k+1}] ${t}`).join('\n\n') }])).trim() || items.join(' ');
    if (top) L.unshift(merged); else (mem.layers[i+1] = mem.layers[i+1] || []).push(merged);
  }
}
async function extractLore(c, txt, mem) {
  try {
    const known = mem.lore.map(f => `${f.key}: ${f.fact}`).join('\n') || '(zatím nic)';
    const out = await complete([{ role:'system', content:'Z textu roleplay vytáhni důležitá trvalá fakta (jména, vztahy, místa, předměty, sliby, tajemství, pravidla světa). Odpověz POUZE JSON polem objektů {"key":"krátký název","fact":"fakt jednou českou větou"}. Pokud fakt aktualizuje známý klíč, použij stejný key. Žádná nová fakta = [].' },
      { role:'user', content: 'Známá fakta:\n' + known + '\n\nText:\n' + txt }]);
    const m = out.match(/\[[\s\S]*\]/); if (!m) return;
    JSON.parse(m[0]).forEach(f => { if (!f?.key || !f?.fact) return; const k = String(f.key).trim(), ex = mem.lore.find(x => x.key.toLowerCase() === k.toLowerCase());
      if (ex) { if (!ex.locked) ex.fact = String(f.fact); } else mem.lore.push({ key:k, fact:String(f.fact) }); });
  } catch (e) { console.warn('Lorebook: extrakce selhala', e); }
}
function memoryPrompt(mem) {
  let p = '';
  if (mem.lore.length) p += '\n\n## Lorebook (klíčová fakta – vždy dodržuj)\n' + mem.lore.map(f => `- ${f.key}: ${f.fact}`).join('\n');
  const parts = [];
  for (let i = mem.layers.length - 1; i >= 0; i--) (mem.layers[i] || []).forEach(t => parts.push(`[vrstva ${i+1}] ${t}`));
  if (parts.length) p += '\n\n## Paměť – dosavadní děj (od nejstaršího a nejobecnějšího po nejnovější)\n' + parts.join('\n');
  return p;
}
function renderMem() { const c = cur(); if (!c) { $('#memState').textContent = ''; return; } const m = getMem(c.id), n = m.layers.filter(l => l && l.length).length;
  if (!memBusy) $('#memState').textContent = (n || m.lore.length) ? `🧠 ${n} vrstev · ${m.lore.length} faktů` : ''; }
function renderMemPanel() {
  const c = cur(); if (!c) return; const m = getMem(c.id), box = $('#memBody'); box.innerHTML = '';
  const cfg = memCfg(); const f = $('#memCfg'); Object.keys(cfg).forEach(k => f[k].value = cfg[k]);
  const lh = document.createElement('div'); lh.innerHTML = `<h3>📖 Lorebook (${m.lore.length})</h3>`; box.appendChild(lh);
  m.lore.forEach((fct, i) => { const r = document.createElement('div'); r.className = 'memrow';
    r.innerHTML = `<input value="${esc(fct.key)}" class="lk"><textarea rows="2">${esc(fct.fact)}</textarea><button class="icon danger" title="Smazat">✕</button>`;
    r.querySelector('.lk').onchange = e => { fct.key = e.target.value; fct.locked = true; persist(); };
    r.querySelector('textarea').onchange = e => { fct.fact = e.target.value; fct.locked = true; persist(); };
    r.querySelector('button').onclick = () => { m.lore.splice(i, 1); persist(); renderMemPanel(); renderMem(); };
    box.appendChild(r); });
  const add = document.createElement('button'); add.textContent = '+ Přidat fakt'; add.onclick = () => { m.lore.push({ key:'Nový fakt', fact:'', locked:true }); persist(); renderMemPanel(); }; box.appendChild(add);
  const h = document.createElement('h3'); h.textContent = `🧠 Vrstvy paměti (zpracováno ${m.upto} zpráv, max. ${MAX_LAYERS} vrstev)`; box.appendChild(h);
  let any = false;
  for (let i = m.layers.length - 1; i >= 0; i--) { const L = m.layers[i]; if (!L || !L.length) continue; any = true;
    const g = document.createElement('div'); g.className = 'layer'; g.innerHTML = `<div class="lh">Vrstva ${i+1} <span class="hint">(${L.length} ${i ? 'sloučených' : 'základních'} shrnutí)</span></div>`;
    L.forEach((t, k) => { const r = document.createElement('div'); r.className = 'memrow';
      r.innerHTML = `<textarea rows="3">${esc(t)}</textarea><button class="icon danger" title="Smazat">✕</button>`;
      r.querySelector('textarea').onchange = e => { L[k] = e.target.value; persist(); };
      r.querySelector('button').onclick = () => { L.splice(k, 1); persist(); renderMemPanel(); renderMem(); };
      g.appendChild(r); });
    box.appendChild(g); }
  if (!any) box.insertAdjacentHTML('beforeend', '<p class="hint">Zatím prázdné – paměť se začne plnit po delší konverzaci.</p>');
}
async function generate() {
  const c = cur(); if (!c) return;
  if (settings.provider === 'custom' && !settings.apiKey && !/localhost|127\.0\.0\.1/.test(settings.baseUrl)) { openSettings(); return; }
  const list = chats[c.id];
  const clean = list.filter(m => !m.error), gm = getMem(c.id); if (gm.upto > clean.length) gm.upto = 0;
  const sys = systemPrompt(c) + memoryPrompt(gm); const hist = clean.slice(gm.upto);
  const msgs = [{ role:'system', content: sys }, ...hist.map(({role, content}) => ({role, content}))];
  const reply = { role:'assistant', content:'' }; list.push(reply);
  busy = true; render();
  const bubbles = document.querySelectorAll('#messages .bubble'); const bub = bubbles[bubbles.length-1]; bub.classList.add('typing');
  abortCtl = new AbortController();
  try {
    reply.content = await complete(msgs, t => { reply.content = t; bub.innerHTML = fmt(t); $('#messages').scrollTop = 1e9; }, abortCtl.signal);
    if (!reply.content) throw new Error('Prázdná odpověď od modelu.');
  } catch (e) {
    if (e.name === 'AbortError') { if (!reply.content) list.pop(); }
    else { reply.error = true; reply.content = (reply.content ? reply.content + '\n\n' : '') + '⚠ Chyba: ' + e.message; }
  } finally { busy = false; abortCtl = null; persist(); render(); }
  if (!reply.error) updateMemory(c);
}
$('#composer').onsubmit = e => {
  e.preventDefault(); if (busy) { abortCtl?.abort(); return; }
  const c = cur(), t = $('#input').value.trim(); if (!c || !t) return;
  chats[c.id] = chats[c.id] || []; chats[c.id].push({ role:'user', content:t }); $('#input').value = ''; autosize(); persist(); generate();
};
$('#input').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#composer').requestSubmit(); } });
const autosize = () => { const i = $('#input'); i.style.height = 'auto'; i.style.height = i.scrollHeight + 'px'; };
$('#input').addEventListener('input', autosize);
$('#regen').onclick = () => {
  const c = cur(); if (!c || busy) return; const l = chats[c.id] || [];
  if (l.length && l[l.length-1].role === 'assistant') { if (l.length === 1) return; l.pop(); }
  if (!l.length) return; generate();
};
$('#clearChat').onclick = () => { const c = cur(); if (c && confirm('Opravdu vymazat celý chat?')) { chats[c.id] = []; delete memory[c.id]; ensureChat(c); persist(); render(); } };

// characters
function openChar(c) {
  editingId = c ? c.id : null; const f = $('#charForm'); f.reset();
  $('#charDlgTitle').textContent = c ? 'Upravit postavu' : 'Nová postava';
  $('#delChar').style.display = c ? '' : 'none';
  if (c) ['name','avatar','description','scenario','greeting'].forEach(k => f[k].value = c[k] || '');
  $('#charDlg').showModal();
}
$('#newChar').onclick = () => openChar(null);
$('#editChar').onclick = () => openChar(cur());
$('#charDlg').addEventListener('close', () => {
  if ($('#charDlg').returnValue !== 'ok') return;
  const f = $('#charForm'), data = {}; ['name','avatar','description','scenario','greeting'].forEach(k => data[k] = f[k].value.trim());
  if (!data.name) return;
  if (editingId) Object.assign(chars.find(c => c.id === editingId), data);
  else { const c = { id: uid(), ...data }; chars.push(c); curId = c.id; ensureChat(c); }
  persist(); render();
});
$('#delChar').onclick = () => {
  if (!confirm('Smazat postavu i její chat?')) return;
  chars = chars.filter(c => c.id !== editingId); delete chats[editingId]; delete memory[editingId];
  if (curId === editingId) curId = chars[0]?.id || null;
  $('#charDlg').close('cancel'); persist(); render();
};
$('#exportBtn').onclick = () => {
  const blob = new Blob([JSON.stringify({ app:'roleplay-chat', version:1, characters: chars.map(({id, ...r}) => r) }, null, 2)], { type:'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'postavy.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$('#importFile').onchange = async e => {
  const file = e.target.files[0]; if (!file) return;
  try {
    const j = JSON.parse(await file.text()); const arr = Array.isArray(j) ? j : (j.characters || [j.data || j]);
    let n = 0; arr.forEach(x => { if (x && x.name) { chars.push({ id: uid(), name:String(x.name), avatar:x.avatar||'', description:x.description||x.personality||'', scenario:x.scenario||'', greeting:x.greeting||x.first_mes||'' }); n++; } });
    persist(); render(); alert(`Importováno postav: ${n}`);
  } catch (err) { alert('Neplatný JSON: ' + err.message); }
  e.target.value = '';
};
// settings
function openSettings() { const f = $('#setForm'); Object.keys(settings).forEach(k => f[k] && (f[k].value = settings[k])); toggleProv(); $('#gpuNote').textContent = navigator.gpu ? '✓ WebGPU je k dispozici.' : '⚠ WebGPU není v tomto prohlížeči dostupné – lokální modely nepoběží.'; $('#setDlg').showModal(); }
function toggleProv() { const p = $('#setForm').provider.value; document.querySelectorAll('[data-prov]').forEach(el => el.hidden = el.dataset.prov !== p); }
$('#setForm').provider.addEventListener('change', toggleProv);
$('#settingsBtn').onclick = openSettings;
$('#setDlg').addEventListener('close', () => {
  if ($('#setDlg').returnValue !== 'ok') return; const f = $('#setForm');
  Object.keys(settings).forEach(k => f[k] && (settings[k] = f[k].value.trim())); save(LS.set, settings);
  if (settings.provider === 'webllm' && navigator.gpu) getEngine().catch(e => { progress(1,''); alert(e.message); });
});
// story builder
function openStory() { const c = cur(); if (!c) return; const f = $('#storyForm'); STORY_FIELDS.forEach(([k]) => f[k].value = (c.story || {})[k] || ''); $('#storyDlg').showModal(); }
$('#storyBtn').onclick = openStory;
$('#storyDlg').addEventListener('close', () => { if ($('#storyDlg').returnValue !== 'ok') return; const c = cur(), f = $('#storyForm'); c.story = {}; STORY_FIELDS.forEach(([k]) => c.story[k] = f[k].value.trim()); persist(); });
$('#aiStory').onclick = async () => {
  const c = cur(), f = $('#storyForm'), btn = $('#aiStory'); btn.disabled = true; btn.textContent = '⏳ Vymýšlím…';
  try {
    const given = STORY_FIELDS.map(([k, l]) => `${k} (${l}): ${f[k].value.trim() || '(nevyplněno)'}`).join('\n');
    const out = await complete([{ role:'system', content:'Jsi kreativní autor fantasy, sci-fi i realistických příběhů. Píšeš bohatou a bezchybnou češtinou. Odpovídáš POUZE platným JSON objektem.' },
      { role:'user', content:`Navrhni poutavý příběh pro roleplay s postavou ${c.name}.\nPopis postavy: ${c.description || '-'}\nScénář: ${c.scenario || '-'}\n\nUž vyplněné údaje zachovej a rozviň, prázdné doplň:\n${given}\n\nVrať JSON s klíči world, genre, plot, side, lore, situation, persona (hodnoty jsou české texty, 1–4 věty).` }]);
    const j = JSON.parse(out.match(/\{[\s\S]*\}/)[0]);
    STORY_FIELDS.forEach(([k]) => { if (j[k] && !f[k].value.trim()) f[k].value = Array.isArray(j[k]) ? j[k].join('\n') : String(j[k]); });
  } catch (e) { alert('Návrh příběhu selhal: ' + e.message); }
  finally { btn.disabled = false; btn.textContent = '✨ Navrhni příběh pomocí AI'; }
};
// memory panel
$('#memBtn').onclick = () => { if (!cur()) return; renderMemPanel(); $('#memDlg').showModal(); };
$('#memCfg').onchange = () => { const f = $('#memCfg'); settings.mem = {}; Object.keys(memDefaults()).forEach(k => settings.mem[k] = Math.max(k === 'merge' ? 2 : 1, parseInt(f[k].value) || memDefaults()[k])); save(LS.set, settings); };
$('#memRun').onclick = () => { const c = cur(); if (c) updateMemory(c).then(renderMemPanel); };
$('#memReset').onclick = () => { const c = cur(); if (c && confirm('Smazat celou paměť i lorebook této postavy?')) { delete memory[c.id]; persist(); renderMemPanel(); renderMem(); } };
$('#openSide').onclick = () => $('#sidebar').classList.add('open');
$('#closeSide').onclick = () => $('#sidebar').classList.remove('open');

if (!chars.length) {
  const c = { id: uid(), name:'Gandalf', avatar:'🧙', description:'Moudrý starý čaroděj, laskavý, ale tajemný. Mluví vznešeně a rád dává záhadné rady.', scenario:'{{user}} potkává {{char}} v hostinci U Skákavého poníka za deštivého večera.', greeting:'*Odloží hůl a zvedne pohled od dýmky.* Á, poutník. Posaď se, {{user}}. Co tě přivádí v tak nečase?' };
  chars.push(c); curId = c.id; ensureChat(c); persist();
}
if (!cur()) curId = chars[0]?.id || null;
render();
})();
