import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorldShell, syncWorldScene } from "./world-shell";
import type { DestroyableGame } from "./phaser-scene";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

describe("WorldShell", () => {
  it("renders the mount point and floating controls", () => {
    render(<WorldShell />);

    const mount = screen.getByLabelText("像素世界画布");
    expect(mount).toBeInTheDocument();
    expect(mount.closest("section")).toHaveAttribute("data-hud-safe-top", "56");
    expect(mount.closest("section")).toHaveAttribute("data-hud-safe-bottom", "72");
    expect(screen.getByLabelText("任务日志")).toBeInTheDocument();
    expect(screen.getByText("世界加载中...")).toBeInTheDocument();
    expect(
      within(screen.getByLabelText("世界工具栏")).getByRole("link", { name: /工会/ }),
    ).toHaveAttribute("href", "/guilds");
  });

  it("renders four zone tab buttons", () => {
    render(<WorldShell />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(4);
  });

  it("defaults to lobby zone selected", () => {
    render(<WorldShell />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[0].textContent).toContain("工作室大厅");
  });

  it("opens the requested Agent entrance zone", () => {
    render(<WorldShell initialZone="collab-room" />);

    expect(screen.getByRole("tab", { name: /协作室/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByLabelText("像素世界画布").closest("section")).toHaveAttribute(
      "data-active-zone",
      "collab-room",
    );
  });

  it("keeps every zone in the same compact top HUD layout", () => {
    render(<WorldShell />);

    const navigation = screen.getByRole("tablist");
    expect(navigation).toHaveAttribute("data-layout", "compact-top");
    expect(navigation.closest("section")).toHaveAttribute("data-active-zone", "lobby");

    fireEvent.click(screen.getByRole("tab", { name: /工位区/ }));

    expect(navigation).toHaveAttribute("data-layout", "compact-top");
    expect(navigation.closest("section")).toHaveAttribute("data-active-zone", "workstations");
    expect(navigation).toHaveClass("world-zone-nav");
    expect(screen.getByLabelText("世界工具栏")).toHaveClass("world-toolbar");
  });

  it("lets the user collapse the quest log from inside the open panel", () => {
    render(<WorldShell />);

    fireEvent.click(screen.getByRole("button", { name: "📋 任务日志" }));

    const panel = screen.getByRole("region", { name: "任务日志" });
    expect(panel).toHaveAttribute("aria-hidden", "false");

    fireEvent.click(screen.getByRole("button", { name: "收起任务日志" }));
    expect(panel).toHaveAttribute("aria-hidden", "true");
  });

  it("syncs Phaser scene to the selected zone", () => {
    const activeScenes = new Set(["lobby"]);
    const stop = vi.fn((key: string) => activeScenes.delete(key));
    const start = vi.fn((key: string) => activeScenes.add(key));
    const game = {
      scene: {
        isActive: (key: string) => activeScenes.has(key),
        stop,
        start,
        getScene: vi.fn(),
      },
    } as unknown as DestroyableGame;

    const nextScene = syncWorldScene(game, "lobby", "workstations");

    expect(nextScene).toBe("workstations");
    expect(stop).toHaveBeenCalledWith("lobby");
    expect(start).toHaveBeenCalledWith("workstations");
  });

  it("starts selected scene if React state changed before Phaser was ready", () => {
    const activeScenes = new Set<string>();
    const start = vi.fn((key: string) => activeScenes.add(key));
    const game = {
      scene: {
        isActive: (key: string) => activeScenes.has(key),
        stop: vi.fn(),
        start,
        getScene: vi.fn(),
      },
    } as unknown as DestroyableGame;

    const nextScene = syncWorldScene(game, "workstations", "workstations");

    expect(nextScene).toBe("workstations");
    expect(game.scene.stop).not.toHaveBeenCalled();
    expect(start).toHaveBeenCalledWith("workstations");
  });
});
