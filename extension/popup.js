const isMac = navigator.platform.toUpperCase().includes("MAC");
document.getElementById("shortcut-key").textContent = isMac ? "⌘+Shift+L" : "Ctrl+Shift+L";

document.getElementById("open-options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

async function checkStatus() {
  const { backendUrl, greenhouseKey, slackToken } = await chrome.storage.sync.get([
    "backendUrl",
    "greenhouseKey",
    "slackToken",
  ]);

  const url = backendUrl || "http://localhost:3000";

  const ghDot = document.getElementById("gh-dot");
  const slackDot = document.getElementById("slack-dot");
  const backendDot = document.getElementById("backend-dot");

  ghDot.className = `status-dot ${greenhouseKey ? "green" : "red"}`;
  slackDot.className = `status-dot ${slackToken ? "green" : "red"}`;

  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(3000) });
    backendDot.className = `status-dot ${res.ok ? "green" : "red"}`;
  } catch {
    backendDot.className = "status-dot red";
  }
}

checkStatus();
