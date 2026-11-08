// Service worker: the toolbar button opens the side panel; the context menu sends
// the selection, or the current page's text, to it as a draft question.
const MENU_SELECTION = "scalvs-selection";
const MENU_PAGE = "scalvs-page";
const MAX_PAGE = 5000;

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: MENU_SELECTION, title: "Ask SCALVS.ai about the selection", contexts: ["selection"] });
    chrome.contextMenus.create({ id: MENU_PAGE, title: "Ask SCALVS.ai about this page", contexts: ["page"] });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_SELECTION && info.menuItemId !== MENU_PAGE) return;
  // open() must run inside the click's user gesture, before any await.
  if (tab?.windowId !== undefined) chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
  const base = { url: info.pageUrl || tab?.url || "", title: tab?.title || "" };
  if (info.menuItemId === MENU_SELECTION) {
    chrome.storage.session.set({ draft: { at: Date.now(), question: "Explain this.", page: { ...base, kind: "selection", text: info.selectionText || "" } } });
    return;
  }
  // The click grants activeTab, so the page's text can be read once.
  chrome.scripting
    .executeScript({ target: { tabId: tab.id }, func: (max) => (document.body?.innerText || "").replace(/\n{3,}/g, "\n\n").slice(0, max), args: [MAX_PAGE] })
    .then(([r] = []) => r?.result || "")
    .catch(() => "")
    .then((text) =>
      chrome.storage.session.set({ draft: { at: Date.now(), question: "Summarise this page.", page: { ...base, kind: "page", text } } }),
    );
});
