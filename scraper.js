// PostLens scraper v10 — AI-powered extraction
// Strategy: dump raw li.innerText to AI, let it extract post content
// No fragile CSS selectors for content extraction

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Get post list items ────────────────────────────────
function getPostItems() {
  const lists = document.querySelectorAll('ul[role="list"]');
  for (const ul of lists) {
    const items = ul.querySelectorAll(':scope > li');
    if (items.length >= 2) return Array.from(items);
  }
  return [];
}

// ── Expand all "see more" buttons ──────────────────────
async function expandAll() {
  let clicked = 0;
  document.querySelectorAll('button, span[role="button"]').forEach(el => {
    const t = el.innerText?.trim().toLowerCase();
    if (['see more', '…see more', '...see more', 'show more'].includes(t)) {
      try { el.click(); clicked++; } catch (_) {}
    }
  });
  if (clicked > 0) await wait(1200);
}

// ── Get raw text dump from each li ────────────────────
// We intentionally take the FULL innerText and let AI clean it
function getRawDumps() {
  const items = getPostItems();
  const dumps = [];
  const seen = new Set();

  items.forEach((item, idx) => {
    // Get full raw text of the li
    const raw = item.innerText?.trim();
    if (!raw || raw.length < 20) return;

    // Basic dedup — skip if we've seen this raw text
    const key = raw.slice(0, 80);
    if (seen.has(key)) return;
    seen.add(key);

    dumps.push({ idx, raw });
  });

  return dumps;
}

// ── Scroll + collect raw dumps ─────────────────────────
async function scrollAndCollect(targetCount) {
  await expandAll();
  let dumps = getRawDumps();
  let stalls = 0;

  while (dumps.length < targetCount && stalls < 8) {
    const before = dumps.length;
    window.scrollBy({ top: 1800, behavior: 'smooth' });
    await wait(2200);
    await expandAll();
    const fresh = getRawDumps();
    stalls = fresh.length === before ? stalls + 1 : 0;
    dumps = fresh;
  }

  return dumps.slice(0, targetCount);
}

// ── Debug ──────────────────────────────────────────────
function debugInfo() {
  const dumps = getRawDumps();
  const samples = dumps.slice(0, 3).map((d, i) =>
    `[${i+1}] raw (${d.raw.length} chars):\n"""\n${d.raw.slice(0, 200)}\n"""`
  ).join('\n\n');
  return {
    itemsFound: getPostItems().length,
    dumpsCollected: dumps.length,
    strategy: 'AI extraction from raw innerText',
    samples
  };
}

// ── Listener ───────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SCRAPE_POSTS') {
    scrollAndCollect(message.count)
      .then(dumps => sendResponse({ success: true, dumps }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
  if (message.type === 'CHECK_PAGE') {
    sendResponse({ ok: true, count: getRawDumps().length });
  }
  if (message.type === 'DEBUG') {
    sendResponse({ info: debugInfo() });
  }
});
