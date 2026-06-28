import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WorldShell } from "./world-shell";

describe("WorldShell", () => {
  it("renders the world description and mount point", () => {
    render(<WorldShell />);

    expect(screen.getByText("个人家园环绕主城区，像素世界在这里加载。")).toBeInTheDocument();
    expect(screen.getByLabelText("像素世界画布")).toBeInTheDocument();
  });
});
