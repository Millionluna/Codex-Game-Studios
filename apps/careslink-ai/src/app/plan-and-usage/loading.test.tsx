import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import PlanAndUsageLoading from "./loading";

describe("Plan & Usage loading state", () => {
  it("renders a locale-neutral skeleton without presenting balance values", () => {
    const markup = renderToStaticMarkup(<PlanAndUsageLoading />);

    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).not.toContain('role="status"');
    expect(markup).not.toContain('aria-live="polite"');
    expect(markup).not.toContain("Account summary");
    expect(markup).not.toContain("Loading account balance");
    expect(markup).not.toContain("Checking the current session");
    expect(markup).not.toContain("<dd");
    expect(markup).not.toMatch(/\bcredits?\b/i);
  });
});
