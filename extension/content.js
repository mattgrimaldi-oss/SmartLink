(() => {
  const BACKEND_URL = "https://smartlink-production-6c66.up.railway.app";

  function getSelectedText() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    const text = selection.toString().trim();
    return text.length > 0 ? { text, selection } : null;
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
        resolve(result.backendUrl || BACKEND_URL);
      });
    });
  }

  async function lookupLinkedIn(name) {
    const url = await getBackendUrl();
    const res = await fetch(`${url}/lookup?name=${encodeURIComponent(name)}`, {
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) throw new Error(`Backend error: ${res.status}`);
    return res.json();
  }

  function replaceSelectionWithLink(selection, text, linkedinUrl) {
    if (selection.rangeCount === 0) return false;

    const range = selection.getRangeAt(0);
    const anchor = document.createElement("a");
    anchor.href = linkedinUrl;
    anchor.textContent = text;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";

    try {
      range.deleteContents();
      range.insertNode(anchor);
      selection.removeAllRanges();
      return true;
    } catch {
      return false;
    }
  }

  async function handleTrigger() {
    const selected = getSelectedText();
    if (!selected) {
      showToast("Select a name first, then use the shortcut.", "error");
      return;
    }

    const { text, selection } = selected;

    showToast("Looking up…");

    let results;
    try {
      results = await lookupLinkedIn(text);
    } catch (err) {
      showToast("Could not reach SmartLink backend. Is it running?", "error");
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
      const ok = replaceSelectionWithLink(selection, text, r.linkedinUrl);
      if (ok) {
        showToast(isDrive ? `Linked to ${r.name}.` : `Linked to ${r.name}'s LinkedIn.`, "success");
      } else {
        navigator.clipboard.writeText(r.linkedinUrl);
        showToast(isDrive ? `${r.name} link copied to clipboard.` : `${r.name}'s LinkedIn copied to clipboard.`, "success");
      }
      return;
    }

    // Multiple matches — show picker
    showPicker(results, (linkedinUrl, result) => {
      const isDrive = result?.source === "Google Drive";
      const ok = replaceSelectionWithLink(selection, text, linkedinUrl);
      if (ok) {
        showToast(isDrive ? "Document linked." : "LinkedIn linked.", "success");
      } else {
        navigator.clipboard.writeText(linkedinUrl);
        showToast(isDrive ? "Document link copied to clipboard." : "LinkedIn URL copied to clipboard.", "success");
      }
    });
  }

  window.__smartlinkTrigger = handleTrigger;
})();
