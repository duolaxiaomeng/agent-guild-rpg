import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SessionBanner } from "./session-banner";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("../../lib/session", () => ({
  loadSession: () => null,
  saveSession: vi.fn(),
  clearSession: vi.fn(),
}));

vi.mock("../../lib/api-client", () => ({
  getCurrentSession: vi.fn(),
}));

describe("SessionBanner", () => {
  it("uses a deterministic loading state during server rendering", () => {
    const html = renderToString(<SessionBanner />);

    expect(html).toContain("登录状态确认中...");
    expect(html).not.toContain("未登录");
  });
});
