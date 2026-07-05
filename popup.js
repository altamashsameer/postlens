let lastResult = { markdown: '', mode: '', count: 0 };
let isRunning = false;

document.addEventListener('DOMContentLoaded', async () => {
  const { apiKey, provider } = await store('get', ['apiKey', 'provider']);
  if (apiKey && provider) { showMain(); updateKeyBadge(apiKey, provider); }
  else showSetup();
  setupSetup();
  setupTabs();
  setupChips();
  checkPage();
});

function store(action, data) {
  if (action === 'get') return chrome.storage.local.get(data);
  if (action === 'set') return chrome.storage.local.set(data);
}

function showSetup() { el('setup').classList.remove('hidden'); el('main').classList.add('hidden'); }
function showMain()  { el('setup').classList.add('hidden');    el('main').classList.remove('hidden'); }

// ── Setup ──────────────────────────────────────────────
function setupSetup() {
  el('prov-anthropic').addEventListener('click', () => setProvider('anthropic'));
  el('prov-gemini').addEventListener('click', () => setProvider('gemini'));
  el('save-btn').addEventListener('click', saveKey);
  el('key-input').addEventListener('keydown', e => { if (e.key === 'Enter') saveKey(); });
  el('change-key').addEventListener('click', showSetup);
  store('get', ['provider']).then(({ provider }) => setProvider(provider || 'gemini'));
}

function setProvider(p) {
  el('prov-anthropic').classList.toggle('active', p === 'anthropic');
  el('prov-gemini').classList.toggle('active', p === 'gemini');
  el('key-hint').textContent = p === 'gemini'
    ? 'Free key at aistudio.google.com → Get API Key (no card needed)'
    : 'Key at console.anthropic.com → API Keys ($5 minimum)';
}

function activeProvider() {
  return el('prov-anthropic').classList.contains('active') ? 'anthropic' : 'gemini';
}

async function saveKey() {
  const key = el('key-input').value.trim();
  if (!key || key.length < 15) { toast('Paste your full API key.', 'error'); return; }
  const provider = activeProvider();
  const btn = el('save-btn');
  btn.textContent = 'Validating...'; btn.disabled = true;
  try {
    const res = await Promise.race([
      chrome.runtime.sendMessage({ type: 'VALIDATE_KEY', apiKey: key, provider }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))
    ]);
    if (res && !res.valid) throw new Error(res.error || 'Key rejected.');
    await store('set', { apiKey: key, provider });
    btn.textContent = '✓ Key Saved'; btn.classList.add('success');
    updateKeyBadge(key, provider);
    setTimeout(() => { btn.textContent = 'Save Key'; btn.classList.remove('success'); btn.disabled = false; showMain(); }, 1200);
  } catch (err) {
    if (err.message === 'timeout') {
      await store('set', { apiKey: key, provider });
      updateKeyBadge(key, provider);
      btn.textContent = '✓ Saved';
      setTimeout(() => { btn.textContent = 'Save Key'; btn.disabled = false; showMain(); }, 1200);
    } else {
      toast(err.message, 'error'); btn.textContent = 'Save Key'; btn.disabled = false;
    }
  }
}

function updateKeyBadge(key, provider) {
  const masked = key.slice(0, 6) + '••••••••' + key.slice(-4);
  el('key-badge').textContent = `${provider === 'gemini' ? 'Gemini' : 'Anthropic'} · ${masked}`;
}

async function checkPage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const on = tab?.url?.includes('linkedin.com/my-items/saved-posts');
    el('status').innerHTML = on
      ? `<span class="dot ok"></span> LinkedIn Saved Posts detected`
      : `<span class="dot warn"></span> Open <a href="https://www.linkedin.com/my-items/saved-posts/" target="_blank">LinkedIn Saved Posts</a> first`;
  } catch (_) {}
}

// ── Tabs ───────────────────────────────────────────────
function setupTabs() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      if (isRunning) return;
      document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      el(`panel-${btn.dataset.tab}`)?.classList.add('active');
      if (lastResult.markdown) showResult(lastResult.markdown, lastResult.mode, lastResult.count);
    });
  });
  el('run-insights').addEventListener('click', () => run('insights'));
  el('run-topic').addEventListener('click', () => run('topic'));
  el('topic-input').addEventListener('keydown', e => { if (e.key === 'Enter') run('topic'); });
}

function setupChips() {
  document.querySelectorAll('.chips').forEach(group => {
    group.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => {
        group.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        const hidden = group.closest('.panel')?.querySelector('input[type="hidden"]');
        if (hidden) hidden.value = chip.dataset.val;
      });
    });
  });
}

// ── Run ────────────────────────────────────────────────
async function run(mode) {
  if (isRunning) return;
  const { apiKey, provider } = await store('get', ['apiKey', 'provider']);
  if (!apiKey) { toast('Add your API key first.', 'error'); showSetup(); return; }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url?.includes('linkedin.com/my-items/saved-posts')) {
    toast('Open LinkedIn Saved Posts first.', 'error'); return;
  }

  let count = 10, topic = '';
  if (mode === 'insights') count = parseInt(el('insights-count').value) || 10;
  if (mode === 'topic') {
    count = parseInt(el('topic-count').value) || 25;
    topic = el('topic-input').value.trim();
    if (!topic) { toast('Enter a topic first.', 'error'); return; }
  }

  isRunning = true;
  setLoading(mode, true);
  clearResult(); // clears immediately, no confirmation

  try {
    // ── Phase 1: Scrape ──────────────────────────────
    setStatus('Reading your saved posts...');
    const scrapeRes = await Promise.race([
      chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_POSTS', count }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('Scraping timed out. Refresh LinkedIn and try again.')), 180000))
    ]);
    if (!scrapeRes?.success) throw new Error(scrapeRes?.error || 'Could not read posts. Refresh LinkedIn and try again.');
    if (!scrapeRes.dumps?.length) throw new Error('No posts found. Make sure posts are visible on the page.');

    const dumps = scrapeRes.dumps;

    if (mode === 'insights') {
      await runInsights(apiKey, provider, dumps, count);
    } else {
      await runTopic(apiKey, provider, dumps, count, topic);
    }

  } catch (err) {
    showError(err.message);
    toast(err.message, 'error');
  } finally {
    isRunning = false;
    setLoading(mode, false);
    checkPage();
  }
}

// ── Insights: AI picks best 10 posts then analyzes ────
async function runInsights(apiKey, provider, dumps, count) {
  setStatus('AI selecting the best posts...');
  const pickRes = await Promise.race([
    chrome.runtime.sendMessage({ type: 'PICK_BEST_POSTS', apiKey, provider, dumps }),
    new Promise((_, rej) => setTimeout(() => rej(new Error('Selection timed out. Try again.')), 40000))
  ]);
  if (!pickRes?.success) throw new Error(pickRes?.error || 'Post selection failed.');
  if (!pickRes.posts?.length) throw new Error('Could not find any insightful posts. Try a larger count.');

  const posts = pickRes.posts;
  setStatus(`Analyzing ${posts.length} best posts...`);

  const postsText = posts.map((p, i) => `[${i+1}] ${p.author}:\n${p.text}`).join('\n\n---\n\n');
  const aiRes = await Promise.race([
    chrome.runtime.sendMessage({
      type: 'CALL_AI', apiKey, provider,
      systemPrompt: 'You are an expert content analyst. Extract clear, specific, actionable insights from LinkedIn posts. Use emoji section headers. Be concrete, never vague.',
      prompt: `Here are ${posts.length} LinkedIn saved posts (selected as most insightful from the last ${dumps.length} saves):\n\n${postsText}\n\n
## 🔑 Key Themes
3-5 dominant themes (be specific).

## 💡 Top Insights
5 most valuable, concrete takeaways.

## 📈 Patterns
What content types, writing styles, or ideas repeat?

## ⭐ Most Impactful Post
Paraphrase the single best post and explain why it stands out.`
    }),
    new Promise((_, rej) => setTimeout(() => rej(new Error('Analysis timed out. Try again.')), 40000))
  ]);
  if (!aiRes.success) throw new Error(aiRes.error);

  lastResult = { markdown: aiRes.data, mode: 'insights', count: dumps.length };
  showResult(aiRes.data, 'insights', dumps.length);
}

// ── Topic: batch 5 posts at a time, check all ─────────
async function runTopic(apiKey, provider, dumps, count, topic) {
  const BATCH = 3;
  const allPosts = [];

  for (let i = 0; i < dumps.length; i += BATCH) {
    const batch = dumps.slice(i, i + BATCH);
    const batchNum = Math.floor(i / BATCH) + 1;
    const totalBatches = Math.ceil(dumps.length / BATCH);
    setStatus(`Checking posts ${i + 1}–${Math.min(i + BATCH, dumps.length)} of ${dumps.length}...`);

    const res = await Promise.race([
      chrome.runtime.sendMessage({ type: 'EXTRACT_BATCH', apiKey, provider, dumps: batch }),
      new Promise((_, rej) => setTimeout(() => rej(new Error(`Batch ${batchNum}/${totalBatches} timed out. Try again.`)), 50000))
    ]);
    if (!res?.success) throw new Error(res?.error || 'Extraction failed.');
    allPosts.push(...(res.posts || []));
    // Pause between batches to avoid Gemini rate limiting
    if (i + BATCH < dumps.length) await new Promise(r => setTimeout(r, 4000));
  }

  // Filter to only posts relevant to topic
  setStatus(`Finding posts about "${topic}"...`);
  const postsText = allPosts.map((p, i) => `[${i+1}] ${p.author}:\n${p.text}`).join('\n\n---\n\n');

  const aiRes = await Promise.race([
    chrome.runtime.sendMessage({
      type: 'CALL_AI', apiKey, provider,
      systemPrompt: 'You are a topic-focused research analyst. Be honest about coverage. If 0 posts match, say so clearly.',
      prompt: `Here are ${allPosts.length} LinkedIn saved posts (from last ${count} saves):\n\n${postsText}\n\nTOPIC: "${topic}"\n\n
If 0 posts are relevant, respond with exactly:
"Found 0 posts about "${topic}" in the last ${count} saved posts. Try a broader term or increase the post count."

Otherwise provide:

## 🎯 Coverage
How many of the ${allPosts.length} posts touch "${topic}"?

## 💡 Key Insights on "${topic}"
Most valuable ideas about this topic from the relevant posts.

## 🔄 Different Angles
Different perspectives found (if multiple posts match).

## ⭐ Best Post on This Topic
Paraphrase the most insightful post about "${topic}" and explain why.

Be honest if coverage is thin (1-2 posts).`
    }),
    new Promise((_, rej) => setTimeout(() => rej(new Error('Final analysis timed out. Try again.')), 40000))
  ]);
  if (!aiRes.success) throw new Error(aiRes.error);

  lastResult = { markdown: aiRes.data, mode: 'topic', count };
  showResult(aiRes.data, 'topic', count);
}

// ── UI helpers ─────────────────────────────────────────
function el(id) { return document.getElementById(id); }

function setLoading(mode, state) {
  const map = { insights: 'run-insights', topic: 'run-topic' };
  const btn = el(map[mode]);
  if (!btn) return;
  btn.disabled = state;
  btn.textContent = state ? 'Analyzing...' : 'Analyze';
}

function setStatus(msg) {
  el('status').innerHTML = `<span class="dot pulse"></span> ${msg}`;
}

function clearResult() {
  el('result-box').classList.add('hidden');
  el('result-meta').textContent = '';
  el('result-content').innerHTML = '';
}

function showResult(markdown, mode, count) {
  const labels = { insights: 'Insights', topic: 'Topic Insights' };
  el('result-meta').textContent = `${labels[mode] || ''} · ${count} posts`;
  el('result-content').innerHTML = mdToHtml(markdown);
  el('result-box').classList.remove('hidden');
  el('copy-btn').onclick = () => {
    navigator.clipboard.writeText(markdown).then(() => {
      el('copy-btn').textContent = '✓ Copied';
      setTimeout(() => { el('copy-btn').textContent = 'Copy MD'; }, 2000);
    });
  };
}

function showError(msg) {
  el('result-content').innerHTML = `<p class="err">⚠ ${msg}</p>`;
  el('result-box').classList.remove('hidden');
}

function mdToHtml(md) {
  return md
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>[^<]*<\/li>\n?)+/g, m => `<ul>${m}</ul>`)
    .replace(/\n{2,}/g, '<br><br>')
    .replace(/\n/g, '<br>');
}

function toast(msg, type = 'info') {
  const t = el('toast');
  t.textContent = msg;
  t.className = `toast show ${type}`;
  setTimeout(() => t.classList.remove('show'), 3500);
}

async function runDebug() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url?.includes('linkedin.com/my-items/saved-posts')) {
    toast('Open LinkedIn Saved Posts first.', 'error'); return;
  }
  const res = await chrome.tabs.sendMessage(tab.id, { type: 'DEBUG' });
  const info = res?.info || {};
  const text = Object.entries(info).map(([k, v]) => `${k}:\n${v}`).join('\n\n');
  el('result-content').innerHTML = `<pre style="font-size:10px;white-space:pre-wrap;color:var(--acc2);line-height:1.6">${text}</pre>`;
  el('result-box').classList.remove('hidden');
}

document.addEventListener('DOMContentLoaded', () => {
  el('debug-btn')?.addEventListener('click', runDebug);
});
