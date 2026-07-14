import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InsightPanel } from "./insight-panel";

vi.mock("../../lib/session", () => ({
  loadSession: () => null,
}));

vi.mock("../../lib/api-client", () => ({
  getStudentInsightsSafe: vi.fn(() => new Promise(() => {})),
}));

describe("InsightPanel", () => {
  it("stays compact in the bottom HUD safe area until expanded", () => {
    render(<InsightPanel studentId="student-1" />);

    const toggle = screen.getByRole("button", { name: /学习洞察/ });
    const panel = toggle.parentElement;
    expect(panel).toHaveStyle({
      bottom: "76px",
      top: "auto",
      width: "52px",
      maxHeight: "calc(100vh - 152px)",
      overflowY: "auto",
    });

    fireEvent.click(toggle);
    expect(panel).toHaveStyle({ width: "300px" });
  });
});
