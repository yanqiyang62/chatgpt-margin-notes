# ChatGPT Margin Notes

> Turn ChatGPT into an interactive textbook — select any text, ask a question, get an inline annotation right where you're reading.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-green?logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)
![License](https://img.shields.io/badge/License-MIT-yellow)

## The Problem

You're reading a long ChatGPT response. You hit a confusing paragraph. You want to ask about it — but if you type in the chat box, the context shifts, the conversation moves on, and you lose your place.

## The Solution

**ChatGPT Margin Notes** lets you select text in any ChatGPT response and ask a follow-up question *right there*. The answer appears as an inline annotation — like margin notes in a textbook. Your main conversation stays untouched.

### How It Works

```
1. 📖 Read a long ChatGPT response
2. 🖱️ Select confusing text → "Ask about this ✦" button appears
3. ❓ Type your question
4. 💬 Answer streams in as an inline card at the exact position
5. 🔄 Collapse, expand, or dismiss — your main chat is unaffected
```

### Key Features

- **Inline annotations** — Answers appear right where you're reading, not at the bottom of the chat
- **Zero session impact** — Uses OpenAI API directly; your ChatGPT conversation history is never modified
- **Streaming responses** — Answers stream in token-by-token via `gpt-4o-mini`
- **Collapsible cards** — Fold annotations you've already read; reopen them anytime
- **Dark mode** — Automatically matches ChatGPT's theme
- **Lightweight** — No background scripts, no popups, just a content script + CSS

## Installation

1. Clone this repo:
   ```bash
   git clone https://github.com/yanqiyang62/chatgpt-margin-notes.git
   ```
2. Open `chrome://extensions/` in Chrome
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** → select the cloned folder
5. Navigate to [chatgpt.com](https://chatgpt.com) and start reading

On first use, the extension will prompt for your **OpenAI API key** (stored locally in `localStorage`).

## Configuration

Edit `content.js` to customize:

| Variable | Default | Description |
|----------|---------|-------------|
| `MODEL` | `gpt-4o-mini` | OpenAI model for inline answers |
| `STORAGE_KEY` | `iqa_openai_api_key` | localStorage key for API key |

To change your API key, run in the browser console:
```js
localStorage.removeItem('iqa_openai_api_key')
```
Then trigger a new selection — it will prompt again.

## Architecture

```
chatgpt-margin-notes/
├── manifest.json   # Chrome MV3 manifest
├── content.js      # Selection detection, popup UI, OpenAI API streaming
├── style.css       # All styles (light + dark mode)
├── icon48.png      # Toolbar icon
└── icon128.png     # Store icon
```

The extension is intentionally simple — a single content script that:
1. Listens for text selection inside `[data-message-author-role="assistant"]` elements
2. Shows a floating button → input popup → annotation card
3. Calls the OpenAI API directly (streaming) with the selected context + your question
4. Renders the streamed markdown response inline

No background service worker. No popup page. No data leaves your browser except the API call to OpenAI.

## License

MIT
