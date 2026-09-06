import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import { createPointsPreviewBrowserChecks as create, pointsPreviewDomProbe as probe } from "./points-preview-browser-checks.mjs";
import { POINTS_PREVIEW_BROWSER_CHECKS } from "./points-preview-lifecycle.mjs";

const ORIGIN = "https://synthetic-browser-preview.vercel.app";
const IDS = ["22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"];
const SECRET = "synthetic-private-password-never-print";
const LOGIN = "/auth/login?next=%2Fplan-and-usage&lang=";

function markup({ state = "balance", locale = "en", balance = 62 } = {}) {
  const zh = locale === "zh-Hans";
  if (state === "gate") return `<main><h1>${zh ? "登录查看 Points 预览" : "Sign in to view your Points preview"}</h1><a href="${LOGIN}${locale}">Login</a></main>`;
  if (state === "revoked") return `<main><h1>Points</h1><h3>${zh ? "需要已验证的登录会话" : "A verified sign-in is required"}</h3><a href="${LOGIN}${locale}">Login</a></main>`;
  if (state === "documents") return `<main><header><h1>${zh ? "创建、复核并保存需要实际使用的文档草稿。" : "Create, review and save the documents you need to use."}</h1><a href="/plan-and-usage?lang=${locale}">View Points preview</a></header><a href="/plan-and-usage?lang=${locale}">View Points preview</a></main>`;
  return `<main><h1>${zh ? "Points 余额" : "Points"}</h1><section aria-live="polite"><dl><div><dt>${zh ? "预览 Points 余额" : "Preview Points balance"}</dt><dd>${balance}</dd></div><div><dt>${zh ? "已预留 Points" : "Reserved Points"}</dt><dd>0</dd></div></dl><p>${zh ? "这是只读预览，此余额目前不能使用。" : "Read-only preview. This balance cannot be used yet."}</p></section></main>`;
}
function evaluateDOM(fn, args, { html = markup(), url = `${ORIGIN}/plan-and-usage?lang=en`, locale = "en" } = {}) {
  const dom = new JSDOM(`<!doctype html><html lang="${locale}"><body>${html}</body></html>`, { url, runScripts: "outside-only" });
  try { return dom.window.eval(`(${fn.toString()})(${JSON.stringify(args)})`); }
  finally { dom.window.close(); }
}
function harness() {
  const events = [], state = { wrongBalance: false, deniedRevoke: false, redirectedLogin: false,
    gateMissing: false, closeFailure: false, ambiguousControl: false, aborted: false, badAction: false };
  const pages = [0, 1].map((index) => {
    let url = "about:blank", owner = false, revoked = false; const context = {};
    const setUrl = (value) => { url = new URL(value, ORIGIN).href; };
    const locator = (selector, scope = "page") => ({
      filter: () => locator(selector, scope),
      count: async () => state.ambiguousControl && selector === "link:English" ? 2 : 1,
      getAttribute: async () => state.badAction ? "https://unrelated.example/collect" : null,
      locator: (child) => locator(child, selector),
      getByRole: (role, { name }) => locator(`${role}:${name}`, selector),
      fill: async () => { events.push({ type: "fill", index, selector }); },
      click: async () => {
        events.push({ type: "click", index, selector, scope });
        if (selector === "button[type='submit']") { owner = true; revoked = false; setUrl("/plan-and-usage?lang=en"); }
        else if (selector === "link:简体中文") setUrl("/plan-and-usage?lang=zh-Hans");
        else if (selector === "link:English") setUrl("/plan-and-usage?lang=en");
        else if (selector === "link:Open AI Documents") setUrl("/ai-documents?lang=en");
        else if (selector === "link:View Points preview") {
          if (scope !== "main header") throw new Error(SECRET); // Two real-page copies.
          setUrl("/plan-and-usage?lang=en");
        } else if (selector === "button:Sign out") { owner = false; setUrl(`${LOGIN}en&notice=signed-out`); }
        else throw new Error(SECRET);
      },
    });
    return {
      context: () => context, url: () => url, locator,
      getByRole: (role, { name }) => locator(`${role}:${name}`),
      goto: vi.fn(async (value, options) => {
        events.push({ type: "goto", index, timeout: options.timeout }); setUrl(value);
        if (state.redirectedLogin && new URL(url).pathname === "/auth/login") url = "https://unrelated.example/login";
      }),
      waitForFunction: vi.fn(async (fn, args, options) => {
        events.push({ type: "probe", index, phase: args.phase, timeout: options.timeout });
        const current = new URL(url), locale = current.searchParams.get("lang") ?? "en";
        const currentState = current.pathname === "/ai-documents" ? "documents" :
          !owner ? "gate" : revoked ? "revoked" : "balance";
        const html = state.gateMissing && currentState === "gate" ? "<main>Unavailable</main>" :
          markup({ state: currentState, locale, balance: index === 1 ? state.wrongBalance ? 62 : 7 : 62 });
        if (!evaluateDOM(fn, args, { html, url, locale })) throw new Error(SECRET);
        return { dispose: vi.fn(async () => {}) };
      }),
      close: vi.fn(async () => { if (state.closeFailure) throw new Error(SECRET); }),
      revoke: () => { revoked = true; },
    };
  });
  const options = { pages, accounts: IDS.map((id, index) => ({ id, email: `owner-${index}@example.invalid`, password: SECRET })),
    deployment: { id: "dpl_synthetic", url: ORIGIN }, now: () => 1000,
    revokeOwnerSessions: vi.fn(async ({ userId }) => {
      expect(userId).toBe(IDS[0]); pages[0].revoke(); return { ok: !state.deniedRevoke };
    }),
  };
  const input = { deploymentId: "dpl_synthetic", url: ORIGIN,
    users: IDS.map((id, index) => ({ id, label: index === 0 ? "a" : "b" })), expectedBalances: [62, 7] };
  return { options, input, meta: { deadlineMs: 601000 }, events, state, pages };
}
async function rejected(h, checkpoint) {
  try { await create(h.options)(h.input, h.meta); expect.unreachable(); }
  catch (error) {
    expect(error.message).toBe("POINTS_PREVIEW_BROWSER_FAILED");
    if (checkpoint) expect(error.checkpoint).toBe(checkpoint);
    expect(error).not.toHaveProperty("cause");
    expect(JSON.stringify(error)).not.toContain(SECRET); expect(error.stack).not.toContain(SECRET);
  }
}

describe("Points Preview browser driver preparation (no real browser or cloud)", () => {
  it("executes both account flows, live DOM probes, locale links, sign-out and revoke/relogin", async () => {
    const h = harness(); const result = await create(h.options)(h.input, h.meta);
    expect(result).toEqual(Object.fromEntries(POINTS_PREVIEW_BROWSER_CHECKS.map((name) => [name, true])));
    expect(h.options.revokeOwnerSessions).toHaveBeenCalledOnce();
    expect(h.pages.every((page) => page.close.mock.calls.length === 1)).toBe(true);
    expect(h.events.filter((event) => event.type === "fill")).toHaveLength(8);
    expect(h.events.filter((event) => event.timeout).every((event) => event.timeout <= 30000)).toBe(true);
    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(h.events.filter((event) => event.type === "probe" && event.phase === "documents")).toHaveLength(2);
  });
  it.each(["context", "credentials", "origin", "id", "missing"])("rejects invalid host %s before interaction", (kind) => {
    const h = harness();
    if (kind === "context") h.pages[1].context = h.pages[0].context;
    if (kind === "credentials") h.options.accounts[1] = h.options.accounts[0];
    if (kind === "origin") h.options.deployment.url = "https://ai.careslink.com.au";
    if (kind === "id") h.options.deployment.id = "wrong";
    if (kind === "missing") delete h.options.revokeOwnerSessions;
    expect(() => create(h.options)).toThrow("POINTS_PREVIEW_BROWSER_FAILED"); expect(h.events).toEqual([]);
  });
  it.each([
    ["wrongBalance", "owner_b"], ["deniedRevoke", "revoke_recovery"], ["gateMissing", "signed_out_gate"],
    ["redirectedLogin", "owner_a"], ["badAction", "owner_a"], ["ambiguousControl", "locales"], ["closeFailure", "close_pages"],
  ])("fails closed on %s with sanitized diagnostics and closes both pages", async (fault, checkpoint) => {
    const h = harness(); h.state[fault] = true; await rejected(h, checkpoint);
    expect(h.pages.every((page) => page.close.mock.calls.length === 1)).toBe(true);
    if (["badAction", "redirectedLogin", "gateMissing"].includes(fault)) expect(h.events.some((event) => event.type === "fill")).toBe(false);
  });
  it("rejects swapped cleanup identities and closes owned pages without navigation", async () => {
    const h = harness(); h.input.users.reverse(); await rejected(h, "arguments"); expect(h.events).toEqual([]);
  });
  it.each(["expired", "aborted"])("stops on %s before navigation", async (kind) => {
    const h = harness();
    if (kind === "expired") h.meta.deadlineMs = 1000;
    else { const abort = new AbortController(); abort.abort(); h.meta.signal = abort.signal; }
    await rejected(h, "arguments"); expect(h.events).toEqual([]);
  });
  it("cancels an in-flight page operation and does not start the next account", async () => {
    const h = harness(), abort = new AbortController(); h.meta.signal = abort.signal;
    h.pages[0].goto = vi.fn(async () => { abort.abort(); throw new Error(SECRET); });
    await rejected(h, "signed_out_gate"); expect(h.pages[1].goto).not.toHaveBeenCalled();
    expect(h.pages.every((page) => page.close.mock.calls.length === 1)).toBe(true);
  });
  it("cannot be replayed to repeat login and revoke effects", async () => {
    const h = harness(), run = create(h.options); await run(h.input, h.meta);
    await expect(run(h.input, h.meta)).rejects.toMatchObject({ checkpoint: "arguments" });
    expect(h.options.revokeOwnerSessions).toHaveBeenCalledOnce();
  });
  it("has no executable default browser, network, output or credential loader", async () => {
    expect(() => create()).toThrow("POINTS_PREVIEW_BROWSER_FAILED");
    const source = await readFile(new URL("./points-preview-browser-checks.mjs", import.meta.url), "utf8");
    expect(source).not.toMatch(/\b(fetch|spawn|execFile|writeFile|readFile|launch|newContext|screenshot)\s*\(/);
    expect(source).not.toMatch(/process\.(env|argv)|console\./);
  });
});

describe("serialized Points DOM evidence", () => {
  it.each(["en", "zh-Hans"])("accepts exact owner metrics and language %s", (locale) => {
    expect(evaluateDOM(probe, { phase: "balance", origin: ORIGIN, locale, balance: 62 }, {
      html: markup({ locale }), url: `${ORIGIN}/plan-and-usage?lang=${locale}`, locale,
    })).toBe(true);
  });
  it.each(["balance", "reserved", "label", "legacy", "language", "origin", "missing"])("rejects %s drift", (fault) => {
    let html = markup(); const args = { phase: "balance", origin: ORIGIN, locale: "en", balance: 62 };
    if (fault === "balance") html = markup({ balance: 7 });
    if (fault === "reserved") html = html.replace("<dd>0</dd>", "<dd>1</dd>");
    if (fault === "label") html = html.replace("Preview Points balance", "Other balance");
    if (fault === "legacy") html = html.replace("</main>", "<p>3 credits remaining</p></main>");
    if (fault === "language") args.locale = "zh-Hans";
    if (fault === "origin") args.origin = "https://unrelated.example";
    if (fault === "missing") html = "<main><h1>Points</h1></main>";
    expect(evaluateDOM(probe, args, { html })).toBe(false);
  });
  it("never treats unavailable or revoked state as a balance", () => {
    for (const state of ["gate", "revoked", "documents"]) expect(evaluateDOM(probe,
      { phase: "balance", origin: ORIGIN, locale: "en", balance: 62 }, { html: markup({ state }) })).toBe(false);
  });
});
