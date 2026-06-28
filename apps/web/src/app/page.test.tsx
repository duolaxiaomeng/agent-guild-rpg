import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomePage from "./page";

describe("home page", () => {
  it("renders the main city heading", () => {
    render(<HomePage />);

    expect(screen.getByText("主城区")).toBeInTheDocument();
  });
});
