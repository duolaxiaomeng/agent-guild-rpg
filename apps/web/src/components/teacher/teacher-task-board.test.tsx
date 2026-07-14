import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TeacherTaskBoard, getNextDayId } from "./teacher-task-board";
import { createTeacherTask, getTeacherTaskProgress } from "../../lib/api-client";

vi.mock("../../lib/api-client", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../lib/api-client")>();
  return {
    ...original,
    createTeacherTask: vi.fn(),
    getTeacherTaskProgress: vi.fn()
  };
});

const progress = {
  courseWorldId: "course-1",
  dayId: "day-3",
  title: "工具 Agent 实战",
  status: "open" as const,
  description: "完成一个可调用工具的 Agent",
  homework: "提交实现、测试与运行记录",
  acceptanceCriteria: ["工具调用成功", "失败时有日志"],
  dueAt: null,
  publishedAt: "2026-07-14T04:00:00.000Z",
  teacherId: "teacher-1",
  summary: { total: 3, notStarted: 1, submitted: 1, reviewed: 1 },
  students: [
    {
      studentId: "student-1",
      displayName: "Lin",
      status: "reviewed" as const,
      submissionId: "submission-1",
      submittedAt: "2026-07-14T05:00:00.000Z",
      reviewedAt: "2026-07-14T05:30:00.000Z"
    }
  ]
};

describe("TeacherTaskBoard", () => {
  beforeEach(() => {
    vi.mocked(createTeacherTask).mockReset();
    vi.mocked(getTeacherTaskProgress).mockReset();
  });

  it("publishes daily homework and refreshes real progress", async () => {
    vi.mocked(createTeacherTask).mockResolvedValue(progress);
    vi.mocked(getTeacherTaskProgress).mockResolvedValue([progress]);

    render(
      <TeacherTaskBoard
        initialTasks={[]}
        courseWorldId="course-1"
        defaultDayId="day-3"
        token="session_teacher-1"
      />
    );

    fireEvent.change(screen.getByLabelText("任务标题"), {
      target: { value: "工具 Agent 实战" }
    });
    fireEvent.change(screen.getByLabelText("课堂任务说明"), {
      target: { value: "完成一个可调用工具的 Agent" }
    });
    fireEvent.change(screen.getByLabelText("每日作业"), {
      target: { value: "提交实现、测试与运行记录" }
    });
    fireEvent.change(screen.getByLabelText("验收标准（每行一条）"), {
      target: { value: "工具调用成功\n失败时有日志" }
    });
    fireEvent.click(screen.getByRole("button", { name: "发布任务" }));

    await waitFor(() => {
      expect(createTeacherTask).toHaveBeenCalledWith(
        expect.objectContaining({
          courseWorldId: "course-1",
          dayId: "day-3",
          title: "工具 Agent 实战",
          status: "open",
          description: "完成一个可调用工具的 Agent",
          homework: "提交实现、测试与运行记录",
          acceptanceCriteria: ["工具调用成功", "失败时有日志"],
          dueAt: null,
          publishedAt: expect.any(String)
        }),
        "session_teacher-1"
      );
    });
    expect(getTeacherTaskProgress).toHaveBeenCalledWith("session_teacher-1");
    expect(await screen.findByText("任务已发布，学生作业进度已刷新。")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "工具 Agent 实战" })).toBeInTheDocument();
    expect(screen.getByText("提交实现、测试与运行记录")).toBeInTheDocument();
    expect(screen.getByText("1 项任务")).toBeInTheDocument();
  });

  it("requires at least one acceptance criterion", async () => {
    render(
      <TeacherTaskBoard
        initialTasks={[]}
        courseWorldId="course-1"
        defaultDayId="day-1"
        token="session_teacher-1"
      />
    );

    fireEvent.change(screen.getByLabelText("任务标题"), { target: { value: "任务" } });
    fireEvent.change(screen.getByLabelText("课堂任务说明"), { target: { value: "说明" } });
    fireEvent.change(screen.getByLabelText("每日作业"), { target: { value: "作业" } });
    fireEvent.change(screen.getByLabelText("验收标准（每行一条）"), { target: { value: "   \n" } });
    fireEvent.submit(screen.getByRole("button", { name: "发布任务" }).closest("form")!);

    expect(await screen.findByRole("alert")).toHaveTextContent("请至少填写一条验收标准。");
    expect(createTeacherTask).not.toHaveBeenCalled();
  });

  it("derives the next numeric Day id without depending on list order", () => {
    expect(getNextDayId([{ dayId: "day-8" }, { dayId: "custom" }, { dayId: "day-3" }])).toBe("day-9");
  });
});
