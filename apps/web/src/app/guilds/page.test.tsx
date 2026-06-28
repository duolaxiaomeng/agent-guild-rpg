import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import GuildsPage from "./page";

describe("guilds page", () => {
  it("renders the guild hall overview", () => {
    render(<GuildsPage />);

    expect(screen.getByRole("heading", { name: "工会大厅" })).toBeInTheDocument();
    expect(screen.getByText("Morning Forge")).toBeInTheDocument();
    expect(screen.getByText("协作积分 128")).toBeInTheDocument();
  });
});
