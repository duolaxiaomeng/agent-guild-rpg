import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GuildPanel } from "./guild-panel";

describe("GuildPanel", () => {
  it("renders guild collaboration details and member presence", () => {
    render(
      <GuildPanel
        guildName="Morning Forge"
        collaborationPoints={128}
        missionTitle="本周互测挑战"
        missionSummary="每位成员至少完成一次同伴互测并记录改进建议。"
        members={[
          { id: "m1", name: "Lin", status: "正在互测", role: "会长" },
          { id: "m2", name: "Mia", status: "空闲", role: "成员" }
        ]}
      />
    );

    expect(screen.getByRole("heading", { name: "工会大厅" })).toBeInTheDocument();
    expect(screen.getByText("Morning Forge")).toBeInTheDocument();
    expect(screen.getByText("协作积分 128")).toBeInTheDocument();
    expect(screen.getByText("本周互测挑战")).toBeInTheDocument();
    expect(screen.getByText("Lin")).toBeInTheDocument();
    expect(screen.getByText("正在互测")).toBeInTheDocument();
    expect(screen.getByText("会长")).toBeInTheDocument();
  });
});
