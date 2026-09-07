// TEST ONLY. The runner copies this file to its owned loopback app, never src/.
// Observe browser events and fixed UI states; do not change connectivity, fetch,
// application state, cookies or storage, and never capture text or credentials.
(() => {
  if (location.origin !== "http://127.0.0.1:3395" ||
      !/^\/ai-documents\/communication-note\/jobs\/[^/]+$/.test(location.pathname)) return;
  const page = crypto.randomUUID();
  const queue = [];
  let sequence = 0, sending = false, previousState;
  const states = new Map([
    ["Checking generation status", "CHECKING"],
    ["Generation is queued", "QUEUED"],
    ["Generating the Communication Note", "RUNNING"],
    ["Draft generated and saved", "SUCCEEDED"],
    ["Generation status is temporarily unavailable", "UNAVAILABLE"],
  ]);
  const panel = document.createElement("aside");
  panel.setAttribute("aria-label", "Local network test diagnostics");
  panel.style.cssText = "position:fixed;bottom:8px;left:8px;z-index:1000;max-width:520px;padding:8px 12px;background:white;color:#173832;border:1px solid #668377;font:12px/1.5 monospace";
  document.body.append(panel);
  let offlineEvents = 0, onlineEvents = 0, manualChecks = 0;
  const render = () => {
    const text = "仅本地测试 | online=" + navigator.onLine + " | offline事件=" + offlineEvents +
      " | online事件=" + onlineEvents + " | 手动重试=" + manualChecks + " | 页面=" + page.slice(0, 8);
    if (panel.textContent !== text) panel.textContent = text;
  };
  async function flush() {
    if (sending || !navigator.onLine) return;
    sending = true;
    try {
      while (queue.length && navigator.onLine) {
        const response = await fetch("/fixture-control/observation?" + queue[0], {
          method: "GET", credentials: "omit", cache: "no-store",
        });
        if (!response.ok) break;
        queue.shift();
      }
    } catch { /* Keep only this page's bounded, content-free queue in memory. */ }
    finally { sending = false; }
  }
  function record(kind, trusted = false) {
    if (sequence >= 64) return;
    queue.push(new URLSearchParams({ page, sequence: String(++sequence), kind,
      online: String(navigator.onLine), trusted: String(trusted) }).toString());
    render(); void flush();
  }
  addEventListener("offline", event => { offlineEvents += 1; record("OFFLINE", event.isTrusted); });
  addEventListener("online", event => { onlineEvents += 1; record("ONLINE", event.isTrusted); });
  document.addEventListener("click", event => {
    if (event.target instanceof Element && event.target.closest("button")?.textContent?.trim() === "Check status") {
      manualChecks += 1; record("MANUAL_CHECK", event.isTrusted);
    }
  });
  function observeView() {
    const headings = [...document.querySelectorAll("h1,h2")].map(element => element.textContent?.trim());
    const state = headings.map(text => states.get(text)).find(Boolean);
    if (state && state !== previousState) { previousState = state; record(state); }
  }
  new MutationObserver(observeView).observe(document.body, { childList: true, subtree: true, characterData: true });
  record("LOAD"); observeView();
})();
