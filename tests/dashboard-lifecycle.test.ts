import { describe, expect, it, vi } from "vitest";
import { activateDashboard, type DashboardLeaf, type DashboardWorkspace } from "../src/dashboard-lifecycle";

function createLeaf(): DashboardLeaf {
  return {
    setViewState: vi.fn(async () => undefined),
    setPinned: vi.fn()
  };
}

describe("dashboard lifecycle", () => {
  it("reveals an existing dashboard without creating or pinning another leaf", async () => {
    const existing = createLeaf();
    const workspace: DashboardWorkspace = {
      getLeavesOfType: vi.fn(() => [existing]),
      getLeaf: vi.fn(() => createLeaf()),
      revealLeaf: vi.fn(async () => undefined)
    };

    await activateDashboard(workspace, "dashboard-view");

    expect(workspace.getLeaf).not.toHaveBeenCalled();
    expect(existing.setPinned).not.toHaveBeenCalled();
    expect(workspace.revealLeaf).toHaveBeenCalledWith(existing);
  });

  it("creates, pins and reveals one dashboard after explicit activation", async () => {
    const leaf = createLeaf();
    const workspace: DashboardWorkspace = {
      getLeavesOfType: vi.fn(() => []),
      getLeaf: vi.fn(() => leaf),
      revealLeaf: vi.fn(async () => undefined)
    };

    await activateDashboard(workspace, "dashboard-view");

    expect(workspace.getLeaf).toHaveBeenCalledWith("tab");
    expect(leaf.setViewState).toHaveBeenCalledWith({ type: "dashboard-view", active: true });
    expect(leaf.setPinned).toHaveBeenCalledWith(true);
    expect(workspace.revealLeaf).toHaveBeenCalledWith(leaf);
  });
});
