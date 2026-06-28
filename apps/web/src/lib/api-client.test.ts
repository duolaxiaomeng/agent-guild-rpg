import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getChatOverview,
  getGuildList,
  getQuestList,
  getReviewQueue,
  getWorldPayload
} from "./api-client";

describe("api client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("requests the world payload without cache", async () => {
    const mockPayload = {
      currentDay: 1,
      location: "main_city",
      homesteads: []
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      json: async () => mockPayload
    } as Response);

    await expect(getWorldPayload()).resolves.toEqual(mockPayload);
    expect(fetchSpy).toHaveBeenCalledWith("http://localhost:3001/world", {
      cache: "no-store"
    });
  });

  it("requests the guild list without cache", async () => {
    const mockPayload = [
      {
        id: "guild-1",
        name: "Morning Forge",
        memberCount: 3,
        collaborationPoints: 12
      }
    ];

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      json: async () => mockPayload
    } as Response);

    await expect(getGuildList()).resolves.toEqual(mockPayload);
    expect(fetchSpy).toHaveBeenCalledWith("http://localhost:3001/guilds", {
      cache: "no-store"
    });
  });

  it("requests the quest list without cache", async () => {
    const mockPayload = [
      { id: "day-1", title: "First Agent Session", status: "completed" }
    ];

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      json: async () => mockPayload
    } as Response);

    await expect(getQuestList()).resolves.toEqual(mockPayload);
    expect(fetchSpy).toHaveBeenCalledWith("http://localhost:3001/quests", {
      cache: "no-store"
    });
  });

  it("requests the teacher review queue without cache", async () => {
    const mockPayload = {
      summary: {
        pendingCount: 1,
        reviewedToday: 2,
        flaggedCount: 1
      },
      items: [
        {
          submissionId: "submission-1",
          studentName: "Lin",
          guildName: "Morning Forge",
          suggestedScore: 85,
          finalScore: 90,
          decision: "adjust",
          rationale: "Need tighter artifact evidence before final approval.",
          dayLabel: "Day 2",
          submittedAt: "2026-06-29T09:00:00.000Z"
        }
      ]
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      json: async () => mockPayload
    } as Response);

    await expect(getReviewQueue()).resolves.toEqual(mockPayload);
    expect(fetchSpy).toHaveBeenCalledWith("http://localhost:3001/reviews", {
      cache: "no-store"
    });
  });

  it("requests the chat overview without cache", async () => {
    const mockPayload = {
      studentId: "student-1",
      studentName: "Lin",
      agentLabel: "Claude Code",
      sessionStatus: "active",
      sessionSummary: "最近一次对话聚焦 README 打磨与截图整理。",
      latestSubmission: {
        id: "submission-1",
        statusLabel: "待老师审核",
        submittedAt: "2026-06-29T10:00:00.000Z",
        dayLabel: "Day 1"
      },
      collaborationGuests: [
        {
          studentId: "student-2",
          studentName: "Mo",
          contributionLabel: "协作贡献 4"
        }
      ]
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      json: async () => mockPayload
    } as Response);

    await expect(getChatOverview("student-1")).resolves.toEqual(mockPayload);
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:3001/chat?studentId=student-1",
      {
        cache: "no-store"
      }
    );
  });
});
