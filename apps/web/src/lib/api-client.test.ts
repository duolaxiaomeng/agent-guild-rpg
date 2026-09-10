import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createChatMessage,
  createRoomAccessGrant,
  createSubmission,
  decideReview,
  getChatRoom,
  getChatRoomSafe,
  getRoomAccessGrants,
  getRoomAccessGrantsSafe,
  getChatOverviewSafe,
  getChatOverview,
  getCurrentSession,
  getGuildListSafe,
  getGuildList,
  getQuestListSafe,
  getQuestList,
  getTeacherTaskProgress,
  getTeacherTaskProgressSafe,
  createTeacherTask,
  login,
  register,
  getReviewQueueSafe,
  getReviewQueue,
  revokeRoomAccessGrant,
  getWorldPayloadSafe,
  getWorldPayload,
  createAgentPairing,
  getAgentConnectorProfile,
  getAgentEvents,
  fetchMyAgentAvatarWithToken,
  moveMyAgentToZone,
  getAgentTeamBinding,
  getAgentTeamBindingSafe,
  setAgentTeamBinding,
  clearAgentTeamBinding,
  getAgentTeamRosterSafe,
  getAgentAssignments,
  getMyAgentAssignments,
  createAgentAssignment,
  confirmAgentAssignment,
  getActiveClassroom,
  getClassroomSnapshot,
  getActiveClassroomSafe,
  pauseClassroomStage,
  extendClassroomStage,
  claimHelpRequest,
  createHelpRequest,
  resolveHelpRequest,
  getHelpRequestsSafe,
  getHelpRequests,
  fetchNpcConversationSafe
} from "./api-client";

describe("api client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("classroom", () => {
    const snapshot = {
      session: { id: "class-1", courseWorldId: "course-1", dayId: "day-1", status: "live", version: 3 },
      currentStage: null,
      stages: [],
      helpRequests: [],
      viewer: { role: "teacher", canControlStages: true, canHandleHelp: true },
      serverNow: "2026-07-12T09:00:00.000Z"
    };

    it("gets the active classroom with the bearer token and no cache", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        json: async () => snapshot
      } as Response);

      await expect(getActiveClassroom("session_teacher-1")).resolves.toEqual(snapshot);
      expect(fetchSpy).toHaveBeenCalledWith(
        "http://localhost:3001/classrooms/sessions/active",
        expect.objectContaining({
          cache: "no-store",
          headers: { Authorization: "Bearer session_teacher-1" }
        })
      );
    });

    it("reads a classroom snapshot and help requests", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        json: async () => snapshot
      } as Response);

      await getClassroomSnapshot("class-1", "session_teacher-1");
      await getHelpRequests("class-1", "session_teacher-1");
      expect(fetchSpy).toHaveBeenNthCalledWith(1, "http://localhost:3001/classrooms/sessions/class-1", expect.objectContaining({ cache: "no-store", headers: { Authorization: "Bearer session_teacher-1" } }));
      expect(fetchSpy).toHaveBeenNthCalledWith(2, "http://localhost:3001/classrooms/sessions/class-1/help-requests", expect.objectContaining({ cache: "no-store", headers: { Authorization: "Bearer session_teacher-1" } }));
    });

    it("posts stage controls with version and extension seconds", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => snapshot } as Response);
      await pauseClassroomStage("stage-1", 2, "session_teacher-1");
      await extendClassroomStage("stage-1", 90, 2, "session_teacher-1");
      expect(fetchSpy).toHaveBeenNthCalledWith(1, "http://localhost:3001/classrooms/stages/stage-1/pause", expect.objectContaining({ method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer session_teacher-1" }, body: JSON.stringify({ expectedVersion: 2 }) }));
      expect(fetchSpy).toHaveBeenNthCalledWith(2, "http://localhost:3001/classrooms/stages/stage-1/extend", expect.objectContaining({ method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer session_teacher-1" }, body: JSON.stringify({ seconds: 90, expectedVersion: 2 }) }));
    });

    it("posts help lifecycle payloads with authorization", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({}) } as Response);
      await createHelpRequest({ sessionId: "class-1", category: "question", message: "卡住了" }, "session_student-1");
      await claimHelpRequest("help-1", 4, "session_teacher-1");
      await resolveHelpRequest("help-1", "已协助", "session_teacher-1", 5);
      expect(fetchSpy).toHaveBeenNthCalledWith(1, "http://localhost:3001/classrooms/help-requests", expect.objectContaining({ method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer session_student-1" }, body: JSON.stringify({ sessionId: "class-1", category: "question", message: "卡住了" }) }));
      expect(fetchSpy).toHaveBeenNthCalledWith(2, "http://localhost:3001/classrooms/help-requests/help-1/claim", expect.objectContaining({ body: JSON.stringify({ expectedVersion: 4 }) }));
      expect(fetchSpy).toHaveBeenNthCalledWith(3, "http://localhost:3001/classrooms/help-requests/help-1/resolve", expect.objectContaining({ body: JSON.stringify({ resolutionNote: "已协助", expectedVersion: 5 }) }));
    });

    it("returns a degraded empty snapshot when active classroom is unavailable", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));
      const result = await getActiveClassroomSafe("session_teacher-1");
      expect(result.degraded).toBe(true);
      expect(result.data).toMatchObject({ session: { id: "" }, stages: [], helpRequests: [] });
    });

    it("returns a degraded empty help queue when unavailable", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));
      await expect(getHelpRequestsSafe("class-1", "session_teacher-1")).resolves.toEqual({ data: [], degraded: true });
    });
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
    expect(fetchSpy).toHaveBeenCalledWith("http://localhost:3001/world", expect.objectContaining({
      cache: "no-store",
      credentials: "include"
    }));
  });

  it("uses the same-origin session proxy when talking to an NPC", async () => {
    const reply = {
      npcId: "reviewer",
      npcName: "评审员",
      reply: "先检查功能完整性。",
      degraded: false,
      llmUsed: true,
    };
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => reply,
    } as Response);

    await expect(
      fetchNpcConversationSafe(
        "reviewer",
        "student-1",
        "评审标准是什么？",
      ),
    ).resolves.toEqual({ data: reply, degraded: false });

    const [requestUrl, requestOptions] = fetchSpy.mock.calls[0];
    const url = new URL(String(requestUrl), "http://localhost:3000");
    expect(url.pathname).toBe("/api/npc/reviewer/conversation");
    expect(url.searchParams.get("studentId")).toBe("student-1");
    expect(url.searchParams.get("message")).toBe("评审标准是什么？");
    expect(requestOptions).toEqual(expect.objectContaining({
      credentials: "include",
    }));
    expect(requestOptions).not.toHaveProperty("headers.Authorization");
  });

  it("creates a short-lived local Agent connection credential", async () => {
    const mockPayload = {
      connectionCredential: "agc1.credential-payload.signature",
      expiresAt: "2026-07-12T04:10:00.000Z"
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockPayload
    } as Response);

    await expect(createAgentPairing("session_student-1")).resolves.toEqual(mockPayload);
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:3001/agent-connectors/pairing",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer session_student-1"
        },
        body: "{}"
      })
    );
  });

  it("reads the connected Agent profile and Day event timeline", async () => {
    const profile = {
      connectorId: "connector-1",
      agentSessionId: "session-1",
      provider: "codex-cli",
      clientName: "lin-mac",
      status: "online",
      capabilities: ["events"],
      connectedAt: "2026-07-12T04:00:00.000Z",
      lastSeenAt: "2026-07-12T04:00:00.000Z"
    };
    const events = [
      {
        id: "event-1",
        connectorId: "connector-1",
        studentId: "student-1",
        dayId: "day-1",
        type: "run.started",
        payload: { instruction: "Inspect the project" },
        occurredAt: "2026-07-12T04:00:00.000Z",
        createdAt: "2026-07-12T04:00:00.000Z"
      }
    ];

    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({ ok: true, json: async () => profile } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => events } as Response);

    await expect(getAgentConnectorProfile("session_student-1")).resolves.toEqual(profile);
    await expect(getAgentEvents("day-1", "session_student-1")).resolves.toEqual(events);
    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      "http://localhost:3001/agent-connectors/me",
      expect.objectContaining({
        cache: "no-store",
        headers: { Authorization: "Bearer session_student-1" }
      })
    );
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      "http://localhost:3001/agent-connectors/events?dayId=day-1",
      expect.objectContaining({
        cache: "no-store",
        headers: { Authorization: "Bearer session_student-1" }
      })
    );
  });

  it("moves the current Agent through the authenticated world endpoint", async () => {
    const avatar = {
      studentId: "teacher-1",
      displayName: "Teacher Lin",
      status: "idle",
      currentZone: "collab-room",
      lastActiveAt: "",
      activitySummary: "空闲",
    };
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => avatar,
    } as Response);

    await expect(
      moveMyAgentToZone("collab-room", "session_teacher-1"),
    ).resolves.toEqual(avatar);
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:3001/agent-avatars/me/zone",
      expect.objectContaining({
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer session_teacher-1",
        },
        body: JSON.stringify({ zone: "collab-room" }),
      }),
    );
  });

  it("reads the private Agent role, persisted position, and movement lock", async () => {
    const avatar = {
      studentId: "student-1",
      displayName: "Lin",
      status: "working",
      currentZone: "workstations",
      lastActiveAt: null,
      activitySummary: "正在执行真实任务",
      agentRole: "qa",
      visualRole: "files",
      position: {
        zone: "workstations",
        x: 122,
        y: 348,
        facing: "right",
        revision: 4,
        updatedAt: "2026-07-15T08:00:00.000Z",
      },
      movementLocked: true,
      movementLockReason: "task_running",
    };
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => avatar,
    } as Response);

    await expect(
      fetchMyAgentAvatarWithToken("session_student-1"),
    ).resolves.toEqual(avatar);
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:3001/agent-avatars/me",
      expect.objectContaining({
        cache: "no-store",
        headers: { Authorization: "Bearer session_student-1" },
      }),
    );
  });

  it("reads and updates the current Agent team identity", async () => {
    const binding = {
      studentId: "student-1",
      roleKey: "frontend-developer",
      visualRole: "coder",
      updatedAt: "2026-07-15T04:00:00.000Z",
    };
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({ ok: true, json: async () => ({ binding }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => binding } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ cleared: true }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => [binding] } as Response);

    await expect(getAgentTeamBinding("session_student-1")).resolves.toEqual({ binding });
    await expect(setAgentTeamBinding("frontend-developer", "session_student-1")).resolves.toEqual(binding);
    await expect(clearAgentTeamBinding("session_student-1")).resolves.toEqual({ cleared: true });
    await expect(getAgentTeamRosterSafe("session_student-1")).resolves.toEqual({ data: [binding], degraded: false });

    expect(fetchSpy).toHaveBeenNthCalledWith(1, "http://localhost:3001/agent-team/me", expect.objectContaining({
      cache: "no-store",
      headers: { Authorization: "Bearer session_student-1" },
    }));
    expect(fetchSpy).toHaveBeenNthCalledWith(2, "http://localhost:3001/agent-team/me", expect.objectContaining({
      method: "PUT",
      body: JSON.stringify({ roleKey: "frontend-developer" }),
    }));
    expect(fetchSpy).toHaveBeenNthCalledWith(3, "http://localhost:3001/agent-team/me", expect.objectContaining({
      method: "DELETE",
    }));
  });

  it("degrades the current Agent team identity to an empty binding", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));
    await expect(getAgentTeamBindingSafe("session_student-1")).resolves.toEqual({
      data: { binding: null },
      degraded: true,
    });
  });

  it("connects teacher dispatch and student confirmation to the Agent assignment APIs", async () => {
    const run = {
      id: "task-1",
      runId: "day-1-student-1-run",
      studentId: "student-1",
      status: "queued"
    };
    const confirmation = {
      submission: { id: "submission-1" },
      queue: { jobId: "review-submission-1", status: "queued" }
    };
    const createPayload = {
      runId: "day-1-student-1-run",
      studentId: "student-1",
      provider: "codex-cli",
      input: { instruction: "完成页面并运行测试" },
      courseWorldId: "course-world-1",
      dayId: "day-1",
      requiredCapabilities: ["provider-process"],
      resourceClass: "heavy" as const,
      maxAttempts: 3
    };
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({ ok: true, json: async () => [run] } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => [run] } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => run } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => confirmation } as Response);

    await expect(getAgentAssignments("session_teacher-1")).resolves.toEqual([run]);
    await expect(getMyAgentAssignments("session_student-1")).resolves.toEqual([run]);
    await expect(createAgentAssignment(createPayload, "session_teacher-1")).resolves.toEqual(run);
    await expect(confirmAgentAssignment({
      runId: run.runId,
      selfReflection: "我检查了真实执行输出，并确认测试结果符合任务要求。"
    }, "session_student-1")).resolves.toEqual(confirmation);

    expect(fetchSpy).toHaveBeenNthCalledWith(1, "http://localhost:3001/agent-orchestration/runs", expect.objectContaining({
      cache: "no-store",
      headers: { Authorization: "Bearer session_teacher-1" }
    }));
    expect(fetchSpy).toHaveBeenNthCalledWith(2, "http://localhost:3001/agent-orchestration/my-runs", expect.objectContaining({
      cache: "no-store",
      headers: { Authorization: "Bearer session_student-1" }
    }));
    expect(fetchSpy).toHaveBeenNthCalledWith(3, "http://localhost:3001/agent-orchestration/runs", expect.objectContaining({
      method: "POST",
      body: JSON.stringify(createPayload),
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer session_teacher-1"
      }
    }));
    expect(fetchSpy).toHaveBeenNthCalledWith(4, "http://localhost:3001/submissions/from-agent-task", expect.objectContaining({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer session_student-1"
      }
    }));
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
    expect(fetchSpy).toHaveBeenCalledWith("http://localhost:3001/guilds", expect.objectContaining({
      cache: "no-store",
      credentials: "include"
    }));
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
    expect(fetchSpy).toHaveBeenCalledWith("http://localhost:3001/quests", expect.objectContaining({
      cache: "no-store",
      credentials: "include"
    }));
  });

  it("reads the teacher task progress with the teacher credential", async () => {
    const progress = [
      {
        courseWorldId: "course-1",
        dayId: "day-2",
        title: "Prompt Iteration",
        status: "open",
        description: "迭代提示词",
        homework: "提交运行记录",
        acceptanceCriteria: ["能够稳定复现"],
        dueAt: null,
        publishedAt: "2026-07-14T03:00:00.000Z",
        teacherId: "teacher-1",
        summary: { total: 3, notStarted: 1, submitted: 1, reviewed: 1 },
        students: []
      }
    ];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => progress
    } as Response);

    await expect(getTeacherTaskProgress("session_teacher-1")).resolves.toEqual(progress);
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:3001/quests/progress",
      expect.objectContaining({
        cache: "no-store",
        credentials: "include",
        headers: { Authorization: "Bearer session_teacher-1" }
      })
    );
  });

  it("publishes a daily homework task through the teacher API", async () => {
    const payload = {
      courseWorldId: "course-1",
      dayId: "day-3",
      title: "Tool Agent",
      status: "open" as const,
      description: "构建一个工具 Agent",
      homework: "提交实现与运行记录",
      acceptanceCriteria: ["工具调用成功"],
      dueAt: null,
      publishedAt: "2026-07-14T04:00:00.000Z"
    };
    const response = { ...payload, teacherId: "teacher-1" };
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => response
    } as Response);

    await expect(createTeacherTask(payload, "session_teacher-1")).resolves.toEqual(response);
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:3001/quests",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer session_teacher-1"
        },
        body: JSON.stringify(payload),
        credentials: "include"
      })
    );
  });

  it("falls back to an empty teacher progress list when the API is unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));
    await expect(getTeacherTaskProgressSafe("session_teacher-1")).resolves.toEqual({
      data: [],
      degraded: true
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
          reviewStatus: "teacher_decided",
          suggestedScore: 85,
          finalScore: 90,
          decision: "adjust",
          isPendingTeacherDecision: false,
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
    expect(fetchSpy).toHaveBeenCalledWith("http://localhost:3001/reviews?page=1&pageSize=50", expect.objectContaining({
      cache: "no-store",
      credentials: "include"
    }));
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
      expect.objectContaining({ cache: "no-store", credentials: "include" })
    );
  });

  it("requests a room-scoped chat payload without cache", async () => {
    const mockPayload = {
      roomId: "room-chat-student-1",
      viewerRole: "guest",
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
      collaborationGuests: [],
      messages: [
        {
          id: "message-1",
          roomId: "room-chat-student-1",
          authorId: "student-1",
          authorName: "Lin",
          body: "欢迎进来一起看这次修改记录。",
          createdAt: "2026-06-29T10:05:00.000Z"
        }
      ]
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockPayload
    } as Response);

    await expect(getChatRoom("room-chat-student-1", "session_student-2")).resolves.toEqual(
      mockPayload
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:3001/chat?roomId=room-chat-student-1",
      expect.objectContaining({
        cache: "no-store",
        credentials: "include",
        headers: { Authorization: "Bearer session_student-2" }
      })
    );
  });

  it("posts login credentials to the auth api", async () => {
    const mockPayload = {
      token: "session_teacher-1",
      user: {
        id: "teacher-1",
        role: "teacher",
        displayName: "Teacher Lin"
      }
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockPayload
    } as Response);

    await expect(
      login({
        email: "teacher@academy.test",
        password: "teacher-pass-123"
      })
    ).resolves.toEqual(mockPayload);

    expect(fetchSpy).toHaveBeenCalledWith("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "include",
      body: JSON.stringify({
        email: "teacher@academy.test",
        password: "teacher-pass-123"
      })
    });
  });

  it("posts registration details through the same-origin auth route", async () => {
    const mockPayload = {
      token: "session_student-new",
      user: {
        id: "student-new",
        role: "student",
        displayName: "新同学"
      }
    };
    const payload = {
      displayName: "新同学",
      email: "new@academy.test",
      password: "student-pass-123",
      registrationCode: "chuangshuo_agent_one"
    };
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockPayload
    } as Response);

    await expect(register(payload)).resolves.toEqual(mockPayload);
    expect(fetchSpy).toHaveBeenCalledWith("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "include"
    });
  });

  it("requests the current session with the bearer token", async () => {
    const mockPayload = {
      token: "session_student-2",
      user: {
        id: "student-2",
        role: "student",
        displayName: "Mo"
      }
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockPayload
    } as Response);

    await expect(getCurrentSession("session_student-2")).resolves.toEqual(mockPayload);

    expect(fetchSpy).toHaveBeenCalledWith("http://localhost:3001/auth/session", expect.objectContaining({
      cache: "no-store",
      credentials: "include",
      headers: { Authorization: "Bearer session_student-2" }
    }));
  });

  it("requests the room access grant list without cache", async () => {
    const mockPayload = [
      {
        id: "grant-1",
        roomId: "room-chat-student-1",
        granteeId: "student-2",
        granteeName: "Mo",
        scope: "chat_summary",
        status: "approved",
        createdAt: "2026-06-29T10:00:00.000Z",
        expiresAt: "2026-06-30T10:00:00.000Z"
      }
    ];

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockPayload
    } as Response);

    await expect(getRoomAccessGrants("room-chat-student-1")).resolves.toEqual(
      mockPayload
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:3001/rooms/access-grants?roomId=room-chat-student-1",
      expect.objectContaining({ cache: "no-store", credentials: "include" })
    );
  });

  it("posts a chat submission to the write api", async () => {
    const mockPayload = {
      submission: {
        id: "submission-1"
      }
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockPayload
    } as Response);

    await expect(
      createSubmission({
        clientRequestId: "submission-request-web-001",
        studentId: "student-1",
        courseWorldId: "course-world-1",
        dayId: "day-1",
        agentSessionId: "session-1",
        triggerType: "button",
        conversationSummary:
          "Student compared expected and actual output, then corrected the prompt.",
        workSummary: "Student submitted progress from the chat page with summary notes.",
        artifacts: [
          {
            kind: "doc",
            label: "README",
            url: "https://example.com/readme"
          }
        ],
        selfReflection: "I learned to make the agent output easier to verify today.",
        agentEvaluationHints: ["submitted from chat"],
        timestamp: "2026-06-29T12:00:00.000Z"
      }, "session_student-1")
    ).resolves.toEqual(mockPayload);

    expect(fetchSpy).toHaveBeenCalledWith("http://localhost:3001/submissions", expect.objectContaining({
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer session_student-1"
      },
      body: JSON.stringify({
        clientRequestId: "submission-request-web-001",
        studentId: "student-1",
        courseWorldId: "course-world-1",
        dayId: "day-1",
        agentSessionId: "session-1",
        triggerType: "button",
        conversationSummary:
          "Student compared expected and actual output, then corrected the prompt.",
        workSummary: "Student submitted progress from the chat page with summary notes.",
        artifacts: [
          {
            kind: "doc",
            label: "README",
            url: "https://example.com/readme"
          }
        ],
        selfReflection: "I learned to make the agent output easier to verify today.",
        agentEvaluationHints: ["submitted from chat"],
        timestamp: "2026-06-29T12:00:00.000Z"
      })
    }));
  });

  it("posts a room chat message to the write api", async () => {
    const mockPayload = {
      id: "message-1",
      roomId: "room-chat-student-1",
      authorId: "student-1",
      authorName: "Lin",
      body: "我已经把验证步骤写进 README 了。",
      createdAt: "2026-06-29T11:30:00.000Z"
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockPayload
    } as Response);

    await expect(
      createChatMessage(
        {
          roomId: "room-chat-student-1",
          body: "我已经把验证步骤写进 README 了。"
        },
        "session_student-1"
      )
    ).resolves.toEqual(mockPayload);

    expect(fetchSpy).toHaveBeenCalledWith("http://localhost:3001/chat/messages", expect.objectContaining({
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer session_student-1"
      },
      body: JSON.stringify({
        roomId: "room-chat-student-1",
        body: "我已经把验证步骤写进 README 了。"
      })
    }));
  });

  it("posts a teacher review decision to the write api", async () => {
    const mockPayload = {
      submissionId: "submission-1",
      finalScore: 90,
      decision: "approve"
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockPayload
    } as Response);

    await expect(
      decideReview({
        submissionId: "submission-1",
        finalScore: 90,
        decision: "approve"
      })
    ).resolves.toEqual(mockPayload);

    expect(fetchSpy).toHaveBeenCalledWith("http://localhost:3001/reviews/decide", expect.objectContaining({
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        submissionId: "submission-1",
        finalScore: 90,
        decision: "approve"
      })
    }));
  });

  it("posts a room access grant creation request to the write api", async () => {
    const mockPayload = {
      id: "grant-1",
      roomId: "room-chat-student-1",
      granteeId: "student-2",
      granteeName: "Mo",
      scope: "chat_summary",
      status: "approved",
      createdAt: "2026-06-29T10:00:00.000Z",
      expiresAt: "2026-06-30T10:00:00.000Z"
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockPayload
    } as Response);

    await expect(
      createRoomAccessGrant({
        roomId: "room-chat-student-1",
        granteeId: "student-2",
        scope: "chat_summary",
        expiresInHours: 24
      })
    ).resolves.toEqual(mockPayload);

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:3001/rooms/access-grants",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          roomId: "room-chat-student-1",
          granteeId: "student-2",
          scope: "chat_summary",
          expiresInHours: 24
        })
      })
    );
  });

  it("posts a room access grant revoke request to the write api", async () => {
    const mockPayload = {
      id: "grant-1",
      roomId: "room-chat-student-1",
      granteeId: "student-2",
      granteeName: "Mo",
      scope: "chat_summary",
      status: "revoked",
      createdAt: "2026-06-29T10:00:00.000Z",
      expiresAt: "2026-06-30T10:00:00.000Z"
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockPayload
    } as Response);

    await expect(revokeRoomAccessGrant("grant-1")).resolves.toEqual(mockPayload);

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:3001/rooms/access-grants/grant-1/revoke",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({})
      })
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

  it("returns fallback data when the room chat api is unreachable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));

    await expect(getChatRoomSafe("room-chat-student-1")).resolves.toMatchObject({
      degraded: true,
      data: {
        roomId: "room-chat-student-1",
        viewerRole: "owner",
        studentId: "student-self",
        studentName: "当前学生",
        messages: []
      }
    });
  });

  it("returns fallback data when the room access api is unreachable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));

    await expect(getRoomAccessGrantsSafe("room-chat-student-1")).resolves.toMatchObject({
      degraded: true,
      data: []
    });
  });
});
