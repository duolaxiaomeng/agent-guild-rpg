import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AgentTeamPanel, type AgentTeamMember } from "./agent-team-panel";

const agents: AgentTeamMember[] = [
  {
    id: "scout",
    name: "Atlas",
    icon: "AT",
    responsibility: "探索任务上下文",
    capabilities: ["检索", "规划"],
    status: "running",
    concurrentTasks: 2
  },
  {
    id: "reviewer",
    name: "Pixel",
    icon: "PX",
    responsibility: "检查交付质量",
    capabilities: ["测试"],
    status: "idle",
    concurrentTasks: 0
  },
  {
    id: "builder",
    name: "Forge",
    icon: "FG",
    responsibility: "执行构建任务",
    capabilities: ["编码", "构建"],
    status: "online",
    concurrentTasks: 1
  }
];

describe("AgentTeamPanel", () => {
  it("renders injected agent details, statuses, capabilities, and task counts", () => {
    render(<AgentTeamPanel agents={agents} />);

    expect(screen.getByRole("heading", { name: "Agent 战队" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Atlas 角色图标" })).toHaveTextContent("AT");
    expect(screen.getByText("Atlas")).toBeInTheDocument();
    expect(screen.getByText("探索任务上下文")).toBeInTheDocument();
    expect(screen.getByText("running")).toBeInTheDocument();
    expect(screen.getByText("检索")).toBeInTheDocument();
    expect(screen.getByText("并发任务 2")).toBeInTheDocument();
    expect(screen.getByText("Pixel")).toBeInTheDocument();
    expect(screen.getByText("idle")).toBeInTheDocument();
    expect(screen.getByText("Forge")).toBeInTheDocument();
    expect(screen.getByText("online")).toBeInTheDocument();
  });

  it("starts collapsed when requested and toggles the roster", () => {
    render(<AgentTeamPanel agents={agents} defaultExpanded={false} />);

    const toggle = screen.getByRole("button", { name: "展开 Agent 战队" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Atlas")).not.toBeInTheDocument();

    fireEvent.click(toggle);

    expect(screen.getByRole("button", { name: "收起 Agent 战队" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    expect(screen.getByText("Atlas")).toBeInTheDocument();
  });

  it("selects an agent and reports selection and detail actions", () => {
    const onSelectAgent = vi.fn();
    const onViewDetails = vi.fn();
    render(
      <AgentTeamPanel
        agents={agents}
        onSelectAgent={onSelectAgent}
        onViewDetails={onViewDetails}
      />
    );

    const atlasCard = screen.getByRole("article", { name: "Atlas" });
    fireEvent.click(within(atlasCard).getByRole("button", { name: "选择角色" }));
    fireEvent.click(screen.getAllByRole("button", { name: "查看详情" })[0]);

    expect(onSelectAgent).toHaveBeenCalledWith(agents[0]);
    expect(onViewDetails).toHaveBeenCalledWith(agents[0]);
    expect(atlasCard).toHaveAttribute("data-selected", "true");
  });

  it("shows an empty state without inventing agent data", () => {
    render(<AgentTeamPanel agents={[]} />);

    expect(screen.getByText("当前没有可用的 Agent")).toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });
});
