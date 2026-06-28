import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getChatOverviewSafe,
  getChatOverview,
  getGuildListSafe,
  getGuildList,
  getQuestListSafe,
  getQuestList,
  getReviewQueueSafe,
  getReviewQueue,
  getWorldPayloadSafe,
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
      ok: true,
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
      ok: true,
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
      ok: true,
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
      ok: true,
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
      ok: true,
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

  it("returns fallback data when the world payload api is unreachable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));

    await expect(getWorldPayloadSafe()).resolves.toMatchObject({
      degraded: true,
      data: {
        currentDay: 0,
        location: "offline",
        homesteads: []
      }
    });
  });

  it("returns fallback data when the guild api is unreachable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));

    await expect(getGuildListSafe()).resolves.toMatchObject({
      degraded: true,
      data: []
    });
  });

  it("returns fallback data when the teacher api is unreachable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));

    await expect(getQuestListSafe()).resolves.toMatchObject({
      degraded: true,
      data: []
    });

    await expect(getReviewQueueSafe()).resolves.toMatchObject({
      degraded: true,
      data: {
        summary: {
          pendingCount: 0,
          reviewedToday: 0,
          flaggedCount: 0
        },
        items: []
      }
    });
  });

  it("returns fallback data when the chat overview api is unreachable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));

    await expect(getChatOverviewSafe("student-1")).resolves.toMatchObject({
      degraded: true,
      data: {
        studentId: "student-1",
        studentName: "当前学生",
        agentLabel: "Agent 暂不可用",
        sessionStatus: "failed",
        latestSubmission: null,
        collaborationGuests: []
      }
    });
  });
});
