import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { getGuildList } from "../../lib/api-client";
import GuildsPage from "./page";

vi.mock("../../lib/api-client", () => ({
  getGuildList: vi.fn()
}));

describe("guilds page", () => {
  it("renders the guild hall overview from the api", async () => {
    vi.mocked(getGuildList).mockResolvedValue([
      {
        id: "guild-1",
        name: "Morning Forge",
        memberCount: 3,
        collaborationPoints: 12
      }
    ]);

    render(await GuildsPage());

    expect(screen.getByRole("heading", { name: "工会大厅" })).toBeInTheDocument();
    expect(screen.getByText("Morning Forge")).toBeInTheDocument();
    expect(screen.getByText("成员 3")).toBeInTheDocument();
    expect(screen.getByText("协作积分 12")).toBeInTheDocument();
  });
});
