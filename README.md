# PostLens — AI Insights for Your LinkedIn Saved Posts

> A free, open-source Chrome extension that uses AI to analyze your LinkedIn saved posts. Runs entirely in your browser. Your data never leaves your device.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-Chrome-green.svg)
![Free](https://img.shields.io/badge/API-Free%20Tier-brightgreen.svg)

---

## What It Does

**Two powerful modes:**

**Insights** — Pick 10, 25, or 50 recent saved posts. AI selects the most valuable ones and surfaces:
- Key themes across your saves
- Top actionable insights
- Content patterns
- Most impactful post

**Topic Insights** — Type any topic (e.g. "SQL", "leadership", "AI agents"). AI scans your last 10 or 25 posts and tells you exactly what you've saved about that topic — or honestly tells you if nothing matches.

---

## Install in 3 Steps

### 1. Download
Download `postlens.zip` → Unzip it

### 2. Load into Chrome
1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer Mode** (toggle in top right)
3. Click **Load unpacked**
4. Select the unzipped `postlens-v2` folder

### 3. Get a Free API Key
1. Go to [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. Sign in with Google → Click **Create API Key**
3. Copy the key (starts with `AIza...`)
4. Click the PostLens icon → paste your key → Save

**Free tier:** 1,500 requests/day — more than enough for daily use.

---

## How to Use

1. Go to [linkedin.com/my-items/saved-posts](https://www.linkedin.com/my-items/saved-posts/)
2. Click the PostLens icon in your Chrome toolbar
3. Choose **Insights** or **Topic Insights**
4. Hit **Analyze**

---

## Privacy & Security

- Your API key is stored **only in your browser** — never on any server
- Post content is sent **directly from your browser to the AI provider**
- PostLens has **no backend, no database, no tracking**
- Completely open source — read every line of code yourself

---

## Supported AI Providers

| Provider | Cost | How to get key |
|---|---|---|
| **Gemini** (recommended) | Free tier available | [aistudio.google.com](https://aistudio.google.com/app/apikey) |
| **Anthropic** | $5 minimum | [console.anthropic.com](https://console.anthropic.com) |

---

## Rate Limits (Gemini Free Tier)

| Mode | API calls used | Safe to run |
|---|---|---|
| Insights (any count) | 2 calls | Anytime |
| Topic Insights — 10 posts | ~6 calls | Anytime |
| Topic Insights — 25 posts | ~11 calls | Once per 2 min |

If you see a quota error, wait 60 seconds and try again. Resets automatically.

---

## Contributing

PRs welcome. Key areas to improve:
- Firefox support
- Export results as PDF
- Save analysis history locally
- Support for more post types

---

## License

MIT — free to use, modify, and share. See [LICENSE](LICENSE).

---

*Built with curiosity and way too much debugging. If it helped you, give it a ⭐*
