import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  WorkspaceGrid,
  WorkspaceMainPanel,
  WorkspaceRightRail,
  WorkspaceSection,
  WorkspaceSignalRow,
  WorkspaceStatusPill,
} from "./workspace-layout";

describe("workspace layout primitives", () => {
  it("renders a workspace grid with main and right rail content", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceGrid
        className="custom-grid"
        data-testid="workspace-grid"
        main={
          <WorkspaceMainPanel className="custom-main">
            <div>Main workspace zone</div>
          </WorkspaceMainPanel>
        }
        rightRail={
          <WorkspaceRightRail className="custom-rail">
            <div>Right rail zone</div>
          </WorkspaceRightRail>
        }
      />,
    );

    expect(markup).toContain("workspace-grid");
    expect(markup).toContain("workspace-main-panel");
    expect(markup).toContain("workspace-right-rail");
    expect(markup).toContain("custom-grid");
    expect(markup).toContain("custom-main");
    expect(markup).toContain("custom-rail");
    expect(markup).toContain('data-testid="workspace-grid"');
    expect(markup).toContain("Main workspace zone");
    expect(markup).toContain("Right rail zone");
    expect(markup).not.toContain("hero-title");
  });

  it("renders stable Chinese labels for workspace sections and signals", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceSection
        title="转介准备"
        action={<WorkspaceStatusPill tone="warning">需要补充</WorkspaceStatusPill>}
      >
        <WorkspaceSignalRow
          title="服务范围需要补充"
          detail="说明哪些地区的转介较相关。"
          status="需要补充"
          tone="warning"
        />
      </WorkspaceSection>,
    );

    expect(markup).toContain("workspace-section");
    expect(markup).toContain("workspace-signal-row");
    expect(markup).toContain("workspace-status-pill");
    expect(markup).toContain("workspace-status-pill--warning");
    expect(markup).toContain("转介准备");
    expect(markup).toContain("需要补充");
    expect(markup).toContain("服务范围需要补充");
    expect(markup).toContain("说明哪些地区的转介较相关。");
    expect(markup).not.toMatch(new RegExp("[\\uFFFD\\u00C3]"));
  });
});
