chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "smartlink-trigger") return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => window.__smartlinkTrigger?.(),
  });
});
