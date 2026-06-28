import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GuildPanel } from "./guild-panel";

describe("GuildPanel", () => {
  it("renders real guild summary cards", () => {
    render(
      <GuildPanel
        guilds={[
          {
            id: "guild-1",
            name: "Morning Forge",
            memberCount: 3,
            collaborationPoints: 12
          },
          {
            id: "guild-2",
            name: "Night Owls",
            memberCount: 2,
            collaborationPoints: 8
          }
        ]}
      />
    );

    expect(screen.getByRole("heading", { name: "工会大厅" })).toBeInTheDocument();
    expect(screen.getByText("Morning Forge")).toBeInTheDocument();
    expect(screen.getByText("成员 3")).toBeInTheDocument();
    expect(screen.getByText("协作积分 12")).toBeInTheDocument();
    expect(screen.getByText("Night Owls")).toBeInTheDocument();
  });
});
