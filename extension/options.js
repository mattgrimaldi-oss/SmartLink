async function loadSettings() {
  const { greenhouseKey, slackToken, backendUrl } = await chrome.storage.sync.get([
    "greenhouseKey",
    "slackToken",
    "backendUrl",
  ]);
  if (greenhouseKey) document.getElementById("gh-key").value = greenhouseKey;
  if (slackToken) document.getElementById("slack-token").value = slackToken;
  document.getElementById("backend-url").value = backendUrl || "http://localhost:3000";
}

document.getElementById("save-btn").addEventListener("click", async () => {
  const greenhouseKey = document.getElementById("gh-key").value.trim();
  const slackToken = document.getElementById("slack-token").value.trim();
  const backendUrl = document.getElementById("backend-url").value.trim() || "http://localhost:3000";

  await chrome.storage.sync.set({ greenhouseKey, slackToken, backendUrl });

  const msg = document.getElementById("saved-msg");
  msg.style.display = "inline";
  setTimeout(() => (msg.style.display = "none"), 2000);
});

document.getElementById("test-btn").addEventListener("click", async () => {
  const { backendUrl } = await chrome.storage.sync.get(["backendUrl"]);
  const url = backendUrl || "http://localhost:3000";
  const btn = document.getElementById("test-btn");
  btn.textContent = "Testing…";
  btn.disabled = true;
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(4000) });
    const data = await res.json();
    btn.textContent = "Test connection";
    btn.disabled = false;
    const msg = document.getElementById("saved-msg");
    msg.style.display = "inline";
    msg.style.color = res.ok ? "#1e8e3e" : "#d93025";
    msg.textContent = res.ok
      ? `Connected! Greenhouse: ${data.greenhouse ? "✓" : "✗"}  Slack: ${data.slack ? "✓" : "✗"}`
      : "Backend responded with an error.";
    setTimeout(() => {
      msg.style.display = "none";
      msg.style.color = "#1e8e3e";
      msg.textContent = "Saved!";
    }, 4000);
  } catch {
    btn.textContent = "Test connection";
    btn.disabled = false;
    const msg = document.getElementById("saved-msg");
    msg.style.display = "inline";
    msg.style.color = "#d93025";
    msg.textContent = "Could not reach backend.";
    setTimeout(() => {
      msg.style.display = "none";
      msg.style.color = "#1e8e3e";
      msg.textContent = "Saved!";
    }, 3000);
  }
});

loadSettings();
