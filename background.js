chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'VALIDATE_KEY') {
    validateKey(message.apiKey, message.provider)
      .then(ok => sendResponse({ success: true, valid: ok }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
  if (message.type === 'CALL_AI') {
    callAI(message.apiKey, message.provider, message.prompt, message.systemPrompt)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
  if (message.type === 'PICK_BEST_POSTS') {
    pickBestPosts(message.apiKey, message.provider, message.dumps)
      .then(posts => sendResponse({ success: true, posts }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
  if (message.type === 'EXTRACT_BATCH') {
    extractBatch(message.apiKey, message.provider, message.dumps)
      .then(posts => sendResponse({ success: true, posts }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

// ── Validate key ───────────────────────────────────────
async function validateKey(apiKey, provider) {
  if (!apiKey || apiKey.length < 10) throw new Error('Key too short.');
  if (provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 5, messages: [{ role: 'user', content: 'hi' }] })
    });
    if (res.status === 401 || res.status === 403) throw new Error('Invalid Anthropic key.');
    return true;
  }
  if (provider === 'gemini') {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: 'hi' }] }] }) }
    );
    if (res.status === 403) throw new Error('Invalid Gemini key.');
    if (res.status === 400) {
      const body = await res.json().catch(() => ({}));
      const msg = body?.error?.message || '';
      if (msg.toLowerCase().includes('api key not valid') || msg.toLowerCase().includes('invalid')) {
        throw new Error('Invalid Gemini key. Get one free at aistudio.google.com');
      }
    }
    return true;
  }
  throw new Error('Unknown provider.');
}

// ── Insights: AI picks best posts from all dumps ───────
// Single call — AI reads all dumps and selects the 10 most insightful
async function pickBestPosts(apiKey, provider, dumps) {
  const rawText = dumps.map((d, i) => `=== ITEM ${i + 1} ===\n${d.raw.slice(0, 800)}\n`).join('\n');

  const prompt = `You are analyzing raw text from LinkedIn saved post cards.
Each item contains noise (author bio, timestamps, follower counts, UI buttons) mixed with the actual post content.

Your job has TWO steps:
1. Extract the actual post text from each item (ignore bios, timestamps, "View profile", follower counts, button labels)
2. Select the 10 most insightful, substantive posts from the list (skip posts with no real content)

Rules for extraction:
- Post text = what the person actually wrote (their opinion, story, tips, data)
- Skip: "View X profile", "X followers", "Xh •", "Visible to everyone", job titles with · separators
- If an item has no readable post text, set text to null

Rules for selection:
- Pick posts with the most substance, insight, or actionable content
- Skip pure promotional posts, job postings with no insight, or posts with null text
- Return exactly 10 (or fewer if less than 10 have real content)

Return ONLY a JSON array, no explanation:
[{"author": "Name", "text": "actual post content"}, ...]

Items to process:
${rawText}`;

  const raw = await callAI(apiKey, provider, prompt, 'You are a precise data extraction tool. Return only valid JSON arrays, nothing else.');
  return parseJSON(raw);
}

// ── Topic: extract a small batch of 5 posts ────────────
// Used repeatedly in sequence for topic insights
async function extractBatch(apiKey, provider, dumps) {
  const rawText = dumps.map((d, i) => `=== ITEM ${i + 1} ===\n${d.raw.slice(0, 1000)}\n`).join('\n');

  const prompt = `Extract the actual post content from these LinkedIn post card text dumps.
Each item has noise mixed in (author bio, timestamps, follower counts, UI labels, "View profile" links).

Extract ONLY what the person wrote — their message, story, opinion, tips.
Ignore: job titles with · separators, "X followers", timestamps like "1mo •", "View X profile", button labels.

Return ONLY a JSON array:
[{"author": "Name", "text": "post content or null if no real content"}]

Items:
${rawText}`;

  const raw = await callAI(apiKey, provider, prompt, 'Return only valid JSON arrays, nothing else.');
  return parseJSON(raw).filter(p => p.text && p.text.length > 20);
}

// ── Core AI call ───────────────────────────────────────
async function callAI(apiKey, provider, prompt, systemPrompt) {
  if (provider === 'anthropic') return callAnthropic(apiKey, prompt, systemPrompt);
  if (provider === 'gemini') return callGemini(apiKey, prompt, systemPrompt);
  throw new Error('Unknown provider.');
}

async function callAnthropic(apiKey, prompt, systemPrompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 4000, system: systemPrompt, messages: [{ role: 'user', content: prompt }] })
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || `Error ${res.status}`); }
  const data = await res.json();
  return data.content[0].text;
}

async function callGemini(apiKey, prompt, systemPrompt) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: systemPrompt + '\n\n' + prompt }] }] }) }
  );
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || `Error ${res.status}`); }
  const data = await res.json();
  return data.candidates[0].content.parts[0].text;
}

// ── Parse JSON safely ──────────────────────────────────
function parseJSON(raw) {
  const clean = raw.replace(/```json|```/g, '').trim();
  try { return JSON.parse(clean); } catch (_) {
    const match = clean.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
    throw new Error('AI returned invalid JSON. Try again.');
  }
}
