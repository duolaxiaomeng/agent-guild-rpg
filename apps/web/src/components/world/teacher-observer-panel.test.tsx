import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TeacherObserverPanel } from "./teacher-observer-panel";

const reviewQueue = {
  summary: { pendingCount: 3, queuedCount: 1, reviewedToday: 2, flaggedCount: 1 },
  items: [],
};

describe("TeacherObserverPanel", () => {
  it.each([
    ["lobby", "入口与导览", "区域入口"],
    ["workstations", "Agent 运行状态", "最近心跳"],
    ["collab-room", "交接与共享记忆", "共享记忆"],
    ["review-station", "证据与裁定", "证据完整度"],
  ] as const)("renders a distinct panel for %s", (zone, title, marker) => {
    render(
      <TeacherObserverPanel
        activeZone={zone}
        avatars={[]}
        quests={[]}
        reviewQueue={reviewQueue}
        selectedActor={null}
        onClearActor={vi.fn()}
      />,
    );

    expect(screen.getByRole("region", { name: "教师主城区观察" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    expect(screen.getByText(marker)).toBeInTheDocument();
    expect(screen.getByText("只读观察")).toBeInTheDocument();
  });

  it("shows the selected Agent without losing the teacher read-only boundary", () => {
    render(
      <TeacherObserverPanel
        activeZone="workstations"
        avatars={[
          {
            studentId: "student-2",
            displayName: "Lin",
            status: "working",
            currentZone: "workstations",
            lastActiveAt: "2026-07-13T08:00:00.000Z",
            activitySummary: "实现 API Contract",
          },
        ]}
        quests={[]}
        reviewQueue={reviewQueue}
        selectedActor={{ kind: "agent", id: "coding-agent" }}
        onClearActor={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Lin" })).toBeInTheDocument();
    expect(screen.getByText("实现 API Contract")).toBeInTheDocument();
    expect(screen.getByText("只读观察")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /返回工位区概览/ })).toBeInTheDocument();
  });
});
