(() => {
  "use strict";

  // ── Config ──────────────────────────────────────────────────────────
  // Users must set their OpenAI API key here (or we read from localStorage).
  // The key is NEVER sent to ChatGPT's session — only to the OpenAI API directly.
  const STORAGE_KEY = "iqa_openai_api_key";
  const MODEL = "gpt-4o-mini"; // cheap & fast for inline QA

  function getApiKey() {
    return localStorage.getItem(STORAGE_KEY) || "";
  }

  function promptForApiKey() {
    const key = window.prompt(
      "ChatGPT Inline QA: Enter your OpenAI API key.\n" +
        "This is stored in localStorage and used ONLY for inline queries.\n" +
        "It will NOT affect your ChatGPT session."
    );
    if (key && key.trim().startsWith("sk-")) {
      localStorage.setItem(STORAGE_KEY, key.trim());
      return key.trim();
    }
    return "";
  }

  // ── Helpers ─────────────────────────────────────────────────────────
  function escapeHtml(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  /** Very minimal markdown → HTML (bold, code, code blocks, paragraphs) */
  function renderMarkdown(text) {
    // Code blocks
    let html = text.replace(
      /```(\w*)\n([\s\S]*?)```/g,
      (_, lang, code) => `<pre><code>${escapeHtml(code.trim())}</code></pre>`
    );
    // Inline code
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    // Paragraphs
    html = html
      .split(/\n{2,}/)
      .map((p) => `<p>${p.trim()}</p>`)
      .join("");
    // Single line breaks inside paragraphs
    html = html.replace(/(?<!\>)\n(?!\<)/g, "<br>");
    return html;
  }

  // ── Floating "Ask" button on selection ──────────────────────────────
  let askBtn = null;
  let currentSelection = null;
  let currentRange = null;

  function removeAskBtn() {
    if (askBtn) {
      askBtn.remove();
      askBtn = null;
    }
  }

  document.addEventListener("mouseup", (e) => {
    // Ignore clicks inside our own UI
    if (e.target.closest(".iqa-ask-btn, .iqa-input-popup, .iqa-card")) return;

    removeAskBtn();

    const sel = window.getSelection();
    const text = sel?.toString().trim();
    if (!text || text.length < 5) return;

    // Only trigger inside ChatGPT assistant message containers
    const range = sel.getRangeAt(0);
    const container = range.commonAncestorContainer;
    const msgEl =
      container.nodeType === 1
        ? container.closest('[data-message-author-role="assistant"]')
        : container.parentElement?.closest(
            '[data-message-author-role="assistant"]'
          );
    if (!msgEl) return;

    currentSelection = text;
    currentRange = range.cloneRange();

    // Position button near the end of the selection
    const rect = range.getBoundingClientRect();
    askBtn = document.createElement("button");
    askBtn.className = "iqa-ask-btn";
    askBtn.textContent = "Ask about this ✦";
    askBtn.style.top = `${window.scrollY + rect.bottom + 6}px`;
    askBtn.style.left = `${window.scrollX + rect.left}px`;
    document.body.appendChild(askBtn);

    askBtn.addEventListener("mousedown", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      showInputPopup();
    });
  });

  // Hide button when clicking elsewhere
  document.addEventListener("mousedown", (e) => {
    if (
      !e.target.closest(".iqa-ask-btn, .iqa-input-popup, .iqa-card")
    ) {
      removeAskBtn();
    }
  });

  // ── Input popup ─────────────────────────────────────────────────────
  function showInputPopup() {
    removeAskBtn();
    if (!currentRange) return;

    const popup = document.createElement("div");
    popup.className = "iqa-input-popup";
    popup.innerHTML = `
      <div class="iqa-context-preview">"${escapeHtml(
        currentSelection.length > 100
          ? currentSelection.slice(0, 100) + "…"
          : currentSelection
      )}"</div>
      <div class="iqa-input-row">
        <textarea rows="1" placeholder="Ask a question about this selection…"></textarea>
        <button class="iqa-send-btn">Send</button>
        <button class="iqa-cancel-btn">✕</button>
      </div>
    `;

    // Insert popup right after the paragraph/block that contains the selection end
    const insertionPoint = findInsertionPoint(currentRange);
    insertionPoint.parentNode.insertBefore(popup, insertionPoint.nextSibling);

    const textarea = popup.querySelector("textarea");
    const sendBtn = popup.querySelector(".iqa-send-btn");
    const cancelBtn = popup.querySelector(".iqa-cancel-btn");

    textarea.focus();

    // Auto-resize textarea
    textarea.addEventListener("input", () => {
      textarea.style.height = "auto";
      textarea.style.height = textarea.scrollHeight + "px";
    });

    // Enter to send (Shift+Enter for newline)
    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submit();
      }
      if (e.key === "Escape") {
        popup.remove();
      }
    });

    sendBtn.addEventListener("click", submit);
    cancelBtn.addEventListener("click", () => popup.remove());

    function submit() {
      const question = textarea.value.trim();
      if (!question) return;
      popup.remove();
      insertQACard(insertionPoint, currentSelection, question);
    }
  }

  /** Find the nearest block-level ancestor to insert after */
  function findInsertionPoint(range) {
    let node = range.endContainer;
    if (node.nodeType === 3) node = node.parentElement;

    // Walk up to find a block-level element that's a direct child of the message content
    const blockTags = new Set([
      "P", "DIV", "PRE", "UL", "OL", "LI", "TABLE",
      "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE",
    ]);

    while (node) {
      if (blockTags.has(node.tagName)) {
        // Check if parent is the markdown container or message body
        const parent = node.parentElement;
        if (
          parent?.classList.contains("markdown") ||
          parent?.classList.contains("prose") ||
          parent?.closest('[data-message-author-role="assistant"]') === parent
        ) {
          return node;
        }
      }
      node = node.parentElement;
    }

    // Fallback: just use the range's end container's parent
    return range.endContainer.nodeType === 3
      ? range.endContainer.parentElement
      : range.endContainer;
  }

  // ── QA Card ─────────────────────────────────────────────────────────
  function insertQACard(afterElement, context, question) {
    const card = document.createElement("div");
    card.className = "iqa-card";
    card.innerHTML = `
      <div class="iqa-card-header">
        <span class="iqa-card-label">Inline Q&A</span>
        <div>
          <button class="iqa-toggle-btn" title="Collapse/Expand">▼</button>
          <button class="iqa-card-close" title="Remove">✕</button>
        </div>
      </div>
      <div class="iqa-card-q"><strong>Q:</strong> ${escapeHtml(question)}</div>
      <div class="iqa-card-a">
        <div class="iqa-loading">
          <div class="iqa-spinner"></div>
          <span>Thinking…</span>
        </div>
      </div>
    `;

    afterElement.parentNode.insertBefore(card, afterElement.nextSibling);

    // Toggle collapse
    card.querySelector(".iqa-toggle-btn").addEventListener("click", () => {
      card.classList.toggle("iqa-collapsed");
      card.querySelector(".iqa-toggle-btn").textContent = card.classList.contains(
        "iqa-collapsed"
      )
        ? "▶"
        : "▼";
    });

    // Close
    card.querySelector(".iqa-card-close").addEventListener("click", () => {
      card.remove();
    });

    // Fire API call
    callOpenAI(context, question, card.querySelector(".iqa-card-a"));
  }

  // ── OpenAI API call (independent of ChatGPT session) ───────────────
  async function callOpenAI(context, question, answerEl) {
    let apiKey = getApiKey();
    if (!apiKey) {
      apiKey = promptForApiKey();
      if (!apiKey) {
        answerEl.innerHTML = `<p style="color:#ef4444">No API key provided. Click "Ask about this" again after setting your key.</p>`;
        return;
      }
    }

    const messages = [
      {
        role: "system",
        content:
          "You are a concise assistant. The user has selected a passage from a ChatGPT conversation and is asking a follow-up question about it. Answer clearly and concisely. Use markdown formatting.",
      },
      {
        role: "user",
        content: `Here is the selected text:\n\n---\n${context}\n---\n\nMy question: ${question}`,
      },
    ];

    try {
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages,
          max_tokens: 1024,
          stream: true,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        if (resp.status === 401) {
          localStorage.removeItem(STORAGE_KEY);
          answerEl.innerHTML = `<p style="color:#ef4444">Invalid API key. It has been cleared — try again.</p>`;
        } else {
          answerEl.innerHTML = `<p style="color:#ef4444">API error ${resp.status}: ${escapeHtml(err.error?.message || "Unknown error")}</p>`;
        }
        return;
      }

      // Stream the response
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      answerEl.innerHTML = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") break;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              fullText += delta;
              answerEl.innerHTML = renderMarkdown(fullText);
            }
          } catch {
            // skip malformed chunks
          }
        }
      }

      if (!fullText) {
        answerEl.innerHTML = `<p style="color:#6b7280">No response received.</p>`;
      }
    } catch (err) {
      answerEl.innerHTML = `<p style="color:#ef4444">Network error: ${escapeHtml(err.message)}</p>`;
    }
  }

  console.log("[ChatGPT Inline QA] Extension loaded ✓");
})();
