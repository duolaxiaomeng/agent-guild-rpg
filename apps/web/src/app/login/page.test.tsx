import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { login } from "../../lib/api-client";
import LoginPage from "./page";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push
  })
}));

vi.mock("../../lib/api-client", () => ({
  login: vi.fn()
}));

describe("login page", () => {
  beforeEach(() => {
    window.localStorage.clear();
    push.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs in a teacher and stores the local session", async () => {
    vi.mocked(login).mockResolvedValue({
      token: "session_teacher-1",
      user: {
        id: "teacher-1",
        role: "teacher",
        displayName: "Teacher Lin"
      }
    });

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "teacher@academy.test" }
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "teacher-pass-123" }
    });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith({
        email: "teacher@academy.test",
        password: "teacher-pass-123"
      });
      expect(window.localStorage.getItem("agent-guild-session")).toContain(
        "Teacher Lin"
      );
      expect(push).toHaveBeenCalledWith("/teacher");
    });
  });
});
