import { describe, expect, it, vi } from "vitest";
import { openPluginSettings } from "../src/open-plugin-settings";

describe("openPluginSettings", () => {
  it("opens Obsidian settings and selects the plugin tab", () => {
    const open = vi.fn();
    const openTabById = vi.fn();

    openPluginSettings({ setting: { open, openTabById } }, "ai-knowledge-dashboard");

    expect(open).toHaveBeenCalledOnce();
    expect(openTabById).toHaveBeenCalledWith("ai-knowledge-dashboard");
  });
});
