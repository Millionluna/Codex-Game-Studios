import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import PlanAndUsageLoading from "./loading";

describe("Plan & Usage loading state", () => {
  it("announces a neutral loading state without presenting balance values", () => {
    const markup = renderToStaticMarkup(<PlanAndUsageLoading />);

    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain("Loading account balance");
    expect(markup).not.toContain("<dd");
    expect(markup).not.toMatch(/\bcredits?\b/i);
  });
});
