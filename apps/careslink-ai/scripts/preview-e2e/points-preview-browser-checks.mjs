import { isPointsPreviewUserId } from "./points-preview-identity-policy.mjs";

const fail = () => { throw new Error("POINTS_PREVIEW_BROWSER_FAILED"); };
const requireTrue = (value) => { if (!value) fail(); };

// Self-contained for page.waitForFunction serialization. Never return page text,
// identities, inputs, cookies or HTML to the controller's evidence stream.
export function pointsPreviewDomProbe({ phase, origin, locale, balance }) {
  const text = (element) => element?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  const main = document.querySelector("main");
  const location = new URL(document.location.href);
  if (!main || location.origin !== origin || document.documentElement.lang !== locale ||
      location.searchParams.get("lang") !== locale) return false;
  const zh = locale === "zh-Hans";
  const title = text(main.querySelector("h1"));
  const legacy = /\bcredits?\b|Period limit|Next reset|免费方案与使用量|本周期额度/i;
  if (legacy.test(text(main))) return false;
  const hrefs = [...main.querySelectorAll("a[href]")].map((a) => new URL(a.getAttribute("href"), location));
  const pointsLogin = hrefs.some((href) => href.origin === origin && href.pathname === "/auth/login" &&
    href.searchParams.get("next") === "/plan-and-usage" && href.searchParams.get("lang") === locale);
  const gate = title === (zh ? "登录查看 Points 预览" : "Sign in to view your Points preview");
  const metrics = [...main.querySelectorAll("section[aria-live='polite'] dl > div")];
  if (phase === "gate" || phase === "revoked") {
    const authRequired = [...main.querySelectorAll("h3")].some((h) =>
      text(h) === (zh ? "需要已验证的登录会话" : "A verified sign-in is required"));
    return location.pathname === "/plan-and-usage" && pointsLogin && metrics.length === 0 &&
      (gate || (phase === "revoked" && authRequired));
  }
  if (phase === "documents") {
    return location.pathname === "/ai-documents" && title === (zh ?
      "创建、复核并保存需要实际使用的文档草稿。" : "Create, review and save the documents you need to use.") &&
      hrefs.some((href) => href.origin === origin && href.pathname === "/plan-and-usage" &&
        href.searchParams.get("lang") === locale);
  }
  if (phase === "balance") {
    const labels = zh ? ["预览 Points 余额", "已预留 Points"] : ["Preview Points balance", "Reserved Points"];
    return location.pathname === "/plan-and-usage" && title === (zh ? "Points 余额" : "Points") &&
      Number.isSafeInteger(balance) && balance >= 0 && metrics.length === 2 &&
      metrics.every((metric, index) => text(metric.querySelector("dt")) === labels[index] &&
        text(metric.querySelector("dd")) === String(index === 0 ? balance : 0)) &&
      text(main).includes(zh ? "这是只读预览，此余额目前不能使用。" : "Read-only preview. This balance cannot be used yet.");
  }
  return false;
}

/**
 * Concrete DOM/login driver for the lifecycle's runBrowserChecks adapter.
 * No browser launch, credentials loader, cloud create, bypass, output or CLI.
 * The separately authorized private host owns two fresh isolated contexts,
 * protected-Preview access, blocked service workers and egress controls. It must
 * pass pages it owns (never the user's normal tabs), and join/close their contexts
 * in its lifecycle quiesce step even if this driver times out while closing.
 * This driver deliberately does not claim browser routing alone isolates server
 * egress: model-disabled deployment attestation and final DB audit are mandatory.
 */
export function createPointsPreviewBrowserChecks({ pages, accounts, deployment, revokeOwnerSessions, now } = {}) {
  try {
    requireTrue(Array.isArray(pages) && pages.length === 2 && pages[0] !== pages[1] &&
      pages.every((page) => page && ["context", "url", "goto", "locator", "getByRole", "waitForFunction", "close"]
        .every((key) => typeof page[key] === "function")) && pages[0].context() !== pages[1].context());
    requireTrue(Array.isArray(accounts) && accounts.length === 2 && accounts.every((account) =>
      isPointsPreviewUserId(account?.id) && typeof account.email === "string" &&
      /^[^\s@]+@[^\s@]+$/.test(account.email) && typeof account.password === "string" &&
      account.password.length >= 12 && account.password.length <= 256) &&
      accounts[0].id !== accounts[1].id && accounts[0].email.toLowerCase() !== accounts[1].email.toLowerCase());
    requireTrue(typeof deployment?.id === "string" && /^dpl_[A-Za-z0-9]+$/.test(deployment.id) &&
      typeof deployment.url === "string" && /^https:\/\/[a-z0-9][a-z0-9-]*\.vercel\.app$/.test(deployment.url) &&
      typeof revokeOwnerSessions === "function" && typeof now === "function");
  } catch { fail(); }
  const privateAccounts = accounts.map(({ id, email, password }) => Object.freeze({ id, email, password }));
  const boundPages = [...pages], boundDeployment = Object.freeze({ ...deployment });
  let used = false;
  return async function runBrowserChecks(input, { deadlineMs, signal } = {}) {
    let phase = "arguments", closing, error = null;
    const checks = {};
    const close = () => (closing ??= Promise.allSettled(boundPages.map((page) => Promise.resolve().then(() => page.close()))));
    const active = () => {
      const remaining = deadlineMs - now();
      requireTrue(!signal?.aborted && Number.isSafeInteger(remaining) && remaining > 0);
      return Math.min(30_000, remaining);
    };
    const onAbort = () => { void close(); };
    const pageUrl = (page, path) => {
      const url = new URL(page.url());
      requireTrue(url.origin === boundDeployment.url && url.pathname === path && !url.username && !url.password);
      return url;
    };
    const navigate = async (page, path, locale) => {
      const url = new URL(path, boundDeployment.url); url.searchParams.set("lang", locale);
      await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: active() });
      active(); pageUrl(page, url.pathname);
    };
    const probe = async (page, state, locale, balance) => {
      const handle = await page.waitForFunction(pointsPreviewDomProbe,
        { phase: state, origin: boundDeployment.url, locale, balance }, { timeout: active() });
      await handle.dispose(); active();
    };
    const click = async (page, role, name) => {
      // Responsive shell renders desktop and mobile copies. Use visible elements
      // and require exactly one; never force-click a hidden duplicate.
      const target = page.getByRole(role, { name, exact: true }).filter({ visible: true });
      requireTrue(await target.count() === 1);
      await target.click({ timeout: active() }); active();
    };
    const login = async (index) => {
      const page = boundPages[index], account = privateAccounts[index];
      await navigate(page, "/auth/login?next=%2Fplan-and-usage", "en");
      pageUrl(page, "/auth/login");
      const email = page.locator("input[name='email'][type='email']");
      const password = page.locator("input[name='password'][type='password']");
      requireTrue(await email.count() === 1 && await password.count() === 1);
      // Scope submit to the password form, excluding Google/OAuth forms.
      const form = page.locator("form").filter({ has: password });
      requireTrue(await form.count() === 1);
      const action = await form.getAttribute("action");
      // React's hydrated action may be a fixed javascript:throw stub. It is not
      // an exfiltration destination. All concrete action URLs must stay in scope.
      if (action && !action.startsWith("javascript:throw new Error(")) {
        const url = new URL(action, page.url());
        requireTrue(url.origin === boundDeployment.url && url.pathname === "/auth/login");
      }
      await email.fill(account.email, { timeout: active() }); active();
      pageUrl(page, "/auth/login");
      await password.fill(account.password, { timeout: active() }); active();
      pageUrl(page, "/auth/login");
      const submit = form.locator("button[type='submit']");
      requireTrue(await submit.count() === 1);
      await submit.click({ timeout: active() });
      await probe(page, "balance", "en", index === 0 ? 62 : 7);
    };
    try {
      requireTrue(!used); used = true;
      requireTrue(input?.deploymentId === boundDeployment.id && input.url === boundDeployment.url &&
        Array.isArray(input.users) && input.users.length === 2 && input.users.every((user, index) =>
          user.id === privateAccounts[index].id && user.label === (index === 0 ? "a" : "b")) &&
        Array.isArray(input.expectedBalances) && input.expectedBalances.length === 2 &&
        input.expectedBalances[0] === 62 && input.expectedBalances[1] === 7 && Number.isSafeInteger(deadlineMs));
      active(); signal?.addEventListener("abort", onAbort, { once: true });
      for (const page of boundPages) requireTrue(page.url() === "about:blank");
      phase = "signed_out_gate";
      for (const page of boundPages) {
        await navigate(page, "/plan-and-usage", "en"); await probe(page, "gate", "en");
      }
      checks.signedOutGate = true;
      phase = "owner_a"; await login(0); checks.ownerA = true;
      phase = "owner_b"; await login(1); checks.ownerB = true;
      // Re-read A after B signs in, so a shared-cookie leak cannot pass by order.
      await navigate(boundPages[0], "/plan-and-usage", "en"); await probe(boundPages[0], "balance", "en", 62);
      phase = "locales";
      for (const [index, page] of boundPages.entries()) {
        for (const locale of ["zh-Hans", "en"]) {
          await click(page, "link", locale === "zh-Hans" ? "简体中文" : "English");
          await probe(page, "balance", locale, index === 0 ? 62 : 7);
        }
      }
      checks.locales = true;
      phase = "documents_entry";
      for (const [index, page] of boundPages.entries()) {
        await click(page, "link", "Open AI Documents"); await probe(page, "documents", "en");
        await click(page.locator("main header"), "link", "View Points preview");
        await probe(page, "balance", "en", index === 0 ? 62 : 7);
      }
      checks.documentsEntry = true;
      phase = "sign_out";
      await click(boundPages[0], "button", "Sign out");
      const signedOut = await boundPages[0].waitForFunction(({ origin }) => {
        const url = new URL(document.location.href);
        return url.origin === origin && url.pathname === "/auth/login" &&
          url.searchParams.get("notice") === "signed-out" && !url.searchParams.has("error");
      }, { origin: boundDeployment.url }, { timeout: active() });
      await signedOut.dispose(); active();
      await navigate(boundPages[0], "/plan-and-usage", "en"); await probe(boundPages[0], "gate", "en");
      await navigate(boundPages[1], "/plan-and-usage", "en"); await probe(boundPages[1], "balance", "en", 7);
      checks.signOut = true;
      phase = "revoke_recovery";
      await login(0);
      active(); const revoked = await revokeOwnerSessions({ userId: privateAccounts[0].id }, { deadlineMs, signal });
      active(); requireTrue(revoked?.ok === true);
      await navigate(boundPages[0], "/plan-and-usage", "en"); await probe(boundPages[0], "revoked", "en");
      await navigate(boundPages[1], "/plan-and-usage", "en"); await probe(boundPages[1], "balance", "en", 7);
      await login(0); checks.revokeRecovery = true;
      checks.noLegacyCredits = true; // Every DOM probe rejects legacy balance UI.
    } catch { error = phase; }
    finally {
      signal?.removeEventListener("abort", onAbort);
      const results = await close();
      if (results.some((result) => result.status !== "fulfilled")) error ??= "close_pages";
    }
    if (error) {
      const failure = new Error("POINTS_PREVIEW_BROWSER_FAILED");
      failure.checkpoint = error; // Fixed stage only; no cause, DOM or raw driver error.
      throw failure;
    }
    return Object.freeze(checks);
  };
}
