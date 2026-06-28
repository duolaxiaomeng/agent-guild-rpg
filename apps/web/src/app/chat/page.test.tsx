import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ChatPage from "./page";

describe("chat page", () => {
  it("renders the personal chat room and day panel", () => {
    render(<ChatPage />);

    expect(screen.getByRole("heading", { name: "个人聊天室" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Day 关卡面板" })).toBeInTheDocument();
    expect(screen.getByText("Lin 的 Agent 工作间")).toBeInTheDocument();
  });
});
