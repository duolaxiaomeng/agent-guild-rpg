import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TeacherPage from "./page";

describe("teacher page", () => {
  it("renders the teacher workbench and quest control panel", () => {
    render(<TeacherPage />);

    expect(screen.getByRole("heading", { name: "老师工作台" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Day 关卡面板" })).toBeInTheDocument();
    expect(screen.getByText("待审核 3")).toBeInTheDocument();
  });
});
