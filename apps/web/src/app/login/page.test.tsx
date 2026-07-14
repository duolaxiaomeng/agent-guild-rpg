import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { login, register } from "../../lib/api-client";
import LoginPage from "./page";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push
  })
}));

vi.mock("../../lib/api-client", () => ({
  login: vi.fn(),
  register: vi.fn()
}));

describe("login page", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.cookie = "agent-guild-session-token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
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
      expect(document.cookie).toContain("agent-guild-session-token=session_teacher-1");
      expect(push).toHaveBeenCalledWith("/teacher");
    });
  });

  it("registers a student only after collecting the internal registration code", async () => {
    vi.mocked(register).mockResolvedValue({
      token: "session_new-student",
      user: {
        id: "student-new",
        role: "student",
        displayName: "新同学"
      }
    });

    render(<LoginPage />);

    fireEvent.click(screen.getByRole("button", { name: "没有账号？注册" }));
    fireEvent.change(screen.getByLabelText("显示名称"), {
      target: { value: "新同学" }
    });
    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "new@academy.test" }
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "student-pass-123" }
    });
    fireEvent.change(screen.getByLabelText("内部注册码"), {
      target: { value: "chuangshuo_agent_one" }
    });
    fireEvent.click(screen.getByRole("button", { name: "注册并进入世界" }));

    await waitFor(() => {
      expect(register).toHaveBeenCalledWith({
        displayName: "新同学",
        email: "new@academy.test",
        password: "student-pass-123",
        registrationCode: "chuangshuo_agent_one"
      });
      expect(push).toHaveBeenCalledWith("/");
    });
  });
});
