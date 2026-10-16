(() => {
  const BACKEND_URL = "https://smartlink-backend-flip-cx.vercel.app";
  const OLD_BACKEND_HOSTS = ["smartlink-production-6c66.up.railway.app"];
  const IS_GOOGLE_DOC = location.hostname === "docs.google.com" && location.pathname.startsWith("/document/");

  // Google Docs draws text on a canvas, so the page's Selection API is empty.
  // Its keyboard/clipboard input goes through a hidden iframe instead, so we
  // talk to Docs by dispatching copy/paste events into that iframe.
  function getDocsEventTarget() {
    const iframe = document.querySelector("iframe.docs-texteventtarget-iframe");
    const doc = iframe?.contentDocument;
    if (!doc) return null;
    return doc.querySelector('[contenteditable="true"]') || doc.body;
  }

  function readDocsSelection() {
    const target = getDocsEventTarget();
    if (!target) return null;
    const data = new DataTransfer();
    target.dispatchEvent(new ClipboardEvent("copy", { clipboardData: data, bubbles: true, cancelable: true }));
    return data.getData("text/plain").trim() || null;
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  }

  function linkHtml(text, url) {
    return `<a href="${escapeHtml(url)}">${escapeHtml(text)}</a>`;
  }

  function pasteLinkIntoDocs(text, url) {
    const target = getDocsEventTarget();
    if (!target) return false;
    target.ownerDocument.defaultView.focus();
    target.focus();
    const data = new DataTransfer();
    data.setData("text/html", linkHtml(text, url));
    data.setData("text/plain", text);
    // Docs calls preventDefault() when it consumes a paste, so a cancelled
    // event means the link went in.
    return !target.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }

  async function copyLinkToClipboard(text, url) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([linkHtml(text, url)], { type: "text/html" }),
          "text/plain": new Blob([url], { type: "text/plain" }),
        }),
      ]);
    } catch {
      await navigator.clipboard.writeText(url).catch(() => {});
    }
  }

  // Fallback when Docs won't hand us the selected text: ask for the name.
  function promptForName() {
    return new Promise((resolve) => {
      document.getElementById("smartlink-prompt")?.remove();

      const box = document.createElement("div");
      box.id = "smartlink-prompt";
      Object.assign(box.style, {
        position: "fixed",
        bottom: "70px",
        right: "24px",
        zIndex: "99999",
        background: "#fff",
        border: "1px solid #dadce0",
        borderRadius: "8px",
        boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
        fontFamily: "Google Sans, Roboto, sans-serif",
        fontSize: "13px",
        padding: "10px 14px",
        minWidth: "260px",
      });

      const label = document.createElement("div");
      label.textContent = "Name to link (Enter to search, Esc to cancel):";
      Object.assign(label.style, { fontWeight: "600", color: "#202124", marginBottom: "8px" });

      const input = document.createElement("input");
      input.type = "text";
      Object.assign(input.style, {
        width: "100%",
        boxSizing: "border-box",
        padding: "6px 8px",
        border: "1px solid #dadce0",
        borderRadius: "4px",
        fontSize: "13px",
      });

      const done = (value) => {
        box.remove();
        resolve(value);
      };
      input.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") done(input.value.trim() || null);
        if (e.key === "Escape") done(null);
      });

      box.append(label, input);
      document.body.appendChild(box);
      input.focus();
    });
  }

  function captureSelection() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    const text = selection.toString().trim();
    if (text.length === 0) return null;
    // Clone the range now: clicking a picker option later collapses the
    // live document selection, so we can't rely on it still being there.
    return { text, range: selection.getRangeAt(0).cloneRange() };
  }

  function showToast(message, type = "info") {
    const existing = document.getElementById("smartlink-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = "smartlink-toast";
    toast.textContent = message;
    Object.assign(toast.style, {
      position: "fixed",
      bottom: "24px",
      right: "24px",
      zIndex: "99999",
      padding: "10px 16px",
      borderRadius: "8px",
      fontSize: "14px",
      fontFamily: "Google Sans, Roboto, sans-serif",
      fontWeight: "500",
      color: "#fff",
      background: type === "error" ? "#d93025" : type === "success" ? "#1e8e3e" : "#202124",
      boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
      transition: "opacity 0.3s",
      opacity: "1",
    });

    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  function showPicker(candidates, onSelect) {
    const existing = document.getElementById("smartlink-picker");
    if (existing) existing.remove();

    const picker = document.createElement("div");
    picker.id = "smartlink-picker";
    Object.assign(picker.style, {
      position: "fixed",
      bottom: "70px",
      right: "24px",
      zIndex: "99999",
      background: "#fff",
      border: "1px solid #dadce0",
      borderRadius: "8px",
      boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
      fontFamily: "Google Sans, Roboto, sans-serif",
      fontSize: "13px",
      minWidth: "260px",
      overflow: "hidden",
    });

    const header = document.createElement("div");
    header.textContent = "Select the right person:";
    Object.assign(header.style, {
      padding: "10px 14px 8px",
      fontWeight: "600",
      color: "#202124",
      borderBottom: "1px solid #f1f3f4",
    });
    picker.appendChild(header);

    candidates.forEach((c) => {
      const item = document.createElement("div");
      item.textContent = `${c.name}${c.source ? ` · ${c.source}` : ""}`;
      Object.assign(item.style, {
        padding: "9px 14px",
        cursor: "pointer",
        color: "#1a73e8",
        borderBottom: "1px solid #f1f3f4",
      });
      item.addEventListener("mouseenter", () => (item.style.background = "#f1f3f4"));
      item.addEventListener("mouseleave", () => (item.style.background = ""));
      item.addEventListener("click", () => {
        picker.remove();
        onSelect(c.linkedinUrl, c);
      });
      picker.appendChild(item);
    });

    const cancel = document.createElement("div");
    cancel.textContent = "Cancel";
    Object.assign(cancel.style, {
      padding: "9px 14px",
      cursor: "pointer",
      color: "#5f6368",
    });
    cancel.addEventListener("mouseenter", () => (cancel.style.background = "#f1f3f4"));
    cancel.addEventListener("mouseleave", () => (cancel.style.background = ""));
    cancel.addEventListener("click", () => picker.remove());
    picker.appendChild(cancel);

    document.body.appendChild(picker);
    document.addEventListener("click", (e) => {
      if (!picker.contains(e.target)) picker.remove();
    }, { once: true });
  }

  async function getBackendUrl() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(["backendUrl"], (result) => {
        const stored = result.backendUrl;
        const isStale = stored && OLD_BACKEND_HOSTS.some((h) => stored.includes(h));
        resolve(stored && stored.startsWith("https://") && !isStale ? stored : BACKEND_URL);
      });
    });
  }

  async function lookupLinkedIn(name) {
    const url = await getBackendUrl();
    const res = await fetch(`${url}/lookup?name=${encodeURIComponent(name)}`);
    if (!res.ok) throw new Error(`Backend error: ${res.status}`);
    return res.json();
  }

  function replaceRangeWithLink(range, text, linkedinUrl) {
    const anchor = document.createElement("a");
    anchor.href = linkedinUrl;
    anchor.textContent = text;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";

    try {
      range.deleteContents();
      range.insertNode(anchor);
      return true;
    } catch {
      return false;
    }
  }

  async function captureTarget() {
    if (IS_GOOGLE_DOC) {
      const text = readDocsSelection() || (await promptForName());
      return text ? { text, link: (url) => pasteLinkIntoDocs(text, url) } : null;
    }
    const selected = captureSelection();
    if (!selected) return null;
    const { text, range } = selected;
    return { text, link: (url) => replaceRangeWithLink(range, text, url) };
  }

  async function applyLink(target, url, linkedMsg, copiedMsg) {
    if (target.link(url)) {
      showToast(linkedMsg, "success");
      return;
    }
    await copyLinkToClipboard(target.text, url);
    showToast(IS_GOOGLE_DOC ? "Link copied. Press ⌘V to paste it over the name." : copiedMsg, "success");
  }

  async function handleTrigger() {
    const target = await captureTarget();
    if (!target) {
      if (!IS_GOOGLE_DOC) showToast("Select a name first, then use the shortcut.", "error");
      return;
    }

    const { text } = target;

    showToast("Looking up…");

    let results;
    try {
      results = await lookupLinkedIn(text);
    } catch (err) {
      const msg = err.message?.includes("<!DOCTYPE") || err.message?.includes("token '<'")
        ? "Backend returned an error page — check Railway logs."
        : "Could not reach SmartLink backend. Is it running?";
      showToast(msg, "error");
      console.error("[SmartLink]", err);
      return;
    }

    if (!results || results.length === 0) {
      showToast(`"${text}" not found.`, "error");
      return;
    }

    if (results.length === 1) {
      const r = results[0];
      const isDrive = r.source === "Google Drive";
      await applyLink(
        target,
        r.linkedinUrl,
        isDrive ? `Linked to ${r.name}.` : `Linked to ${r.name}'s LinkedIn.`,
        isDrive ? `${r.name} link copied to clipboard.` : `${r.name}'s LinkedIn copied to clipboard.`,
      );
      return;
    }

    // Multiple matches — show picker
    showPicker(results, (linkedinUrl, result) => {
      const isDrive = result?.source === "Google Drive";
      applyLink(
        target,
        linkedinUrl,
        isDrive ? "Document linked." : "LinkedIn linked.",
        isDrive ? "Document link copied to clipboard." : "LinkedIn URL copied to clipboard.",
      );
    });
  }

  window.__smartlinkTrigger = handleTrigger;
})();
