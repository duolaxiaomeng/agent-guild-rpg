import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HelpQueue } from "./help-queue";
import { claimHelpRequest, resolveHelpRequest } from "../../lib/api-client";

vi.mock("../../lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api-client")>("../../lib/api-client");
  return { ...actual, claimHelpRequest: vi.fn(), resolveHelpRequest: vi.fn() };
});

const requests = [
  { id: "help-1", sessionId: "class-1", studentId: "student-1", category: "question" as const, message: "下一步怎么做", status: "open" as const, assigneeId: null, resolutionNote: null, createdAt: "2026-07-12T09:00:00.000Z", claimedAt: null, resolvedAt: null, version: 2 },
  { id: "help-2", sessionId: "class-1", studentId: "student-2", category: "blocked" as const, message: "环境卡住了", status: "claimed" as const, assigneeId: "assistant-1", resolutionNote: null, createdAt: "2026-07-12T09:01:00.000Z", claimedAt: "2026-07-12T09:02:00.000Z", resolvedAt: null, version: 3 }
];

describe("HelpQueue", () => {
  it("sorts open requests first and lets staff claim and resolve", async () => {
    vi.mocked(claimHelpRequest).mockResolvedValue({ ...requests[0], status: "claimed", assigneeId: "teacher-1", claimedAt: "2026-07-12T09:03:00.000Z", version: 3 });
    vi.mocked(resolveHelpRequest).mockResolvedValue({ ...requests[1], status: "resolved", resolutionNote: "已协助", resolvedAt: "2026-07-12T09:04:00.000Z", version: 4 });
    render(<HelpQueue sessionId="class-1" requests={requests} token="session_teacher-1" canHandleHelp />);
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("下一步怎么做");
    fireEvent.click(screen.getByRole("button", { name: "认领" }));
    await waitFor(() => expect(claimHelpRequest).toHaveBeenCalledWith("help-1", 2, "session_teacher-1"));
    const note = screen.getByLabelText("处理备注-help-2");
    fireEvent.change(note, { target: { value: "已协助" } });
    fireEvent.click(within(screen.getByLabelText("处理备注-help-2").closest("li") as HTMLElement).getByRole("button", { name: "解决" }));
    await waitFor(() => expect(resolveHelpRequest).toHaveBeenCalledWith("help-2", "已协助", "session_teacher-1", 3));
  });

  it("hides actions for a viewer without help permissions", () => {
    render(<HelpQueue sessionId="class-1" requests={requests} token="session_assistant-1" canHandleHelp={false} />);
    expect(screen.queryByRole("button", { name: "认领" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "解决" })).not.toBeInTheDocument();
  });
});
