#!/usr/bin/env node

/**
 * 双账号 API 全面验证脚本
 *
 * 运行方式：npx tsx scripts/verify-dual-account.ts
 *
 * 前置条件：API 服务已在 http://localhost:3000 运行，且数据库已完成 seed。
 */

const BASE_URL = process.env.API_URL ?? "http://localhost:3001";

// ────────────────────────────────────────────────────────────────────────────
// ApiClient — 封装 fetch，自动附加 Bearer token
// ────────────────────────────────────────────────────────────────────────────

class ApiClient {
  private token: string | null = null;

  setToken(token: string) {
    this.token = token;
  }

  async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<{ status: number; data: T }> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    let data: T | null = null;
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      data = (await res.json()) as T;
    } else {
      data = (await res.text()) as unknown as T;
    }
    return { status: res.status, data: data as T };
  }

  get<T = unknown>(path: string) {
    return this.request<T>("GET", path);
  }

  post<T = unknown>(path: string, body?: unknown) {
    return this.request<T>("POST", path, body);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// assert — 输出 ✓/✗ 结果
// ────────────────────────────────────────────────────────────────────────────

let passedCount = 0;
let failedCount = 0;

function assert(label: string, condition: boolean, detail?: string) {
  if (condition) {
    passedCount++;
    console.log(`  ✓ ${label}`);
  } else {
    failedCount++;
    console.log(`  ✗ ${label}${detail ? " — " + detail : ""}`);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 账号配置
// ────────────────────────────────────────────────────────────────────────────

const ACCOUNTS = {
  lin: { email: "lin@academy.test", password: "student-pass-123", id: "student-1" },
  mo: { email: "mo@academy.test", password: "student-pass-456", id: "student-2" },
  teacher: { email: "teacher@academy.test", password: "teacher-pass-123", id: "teacher-1" },
};

// ────────────────────────────────────────────────────────────────────────────
// 主流程
// ────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🔍 API 验证开始 → ${BASE_URL}\n`);

  const linClient = new ApiClient();
  const moClient = new ApiClient();
  const teacherClient = new ApiClient();

  const scenarioResults: boolean[] = [];

  function scenarioPassed(index: number, ok: boolean) {
    scenarioResults[index] = ok;
  }

  // ── 1. 健康检查 ──────────────────────────────────────────────────────────
  console.log("【1】健康检查");
  try {
    const client = new ApiClient();
    const { status, data } = await client.get<{ status: string }>("/health");
    const ok = status === 200 && (data as { status: string }).status === "ok";
    assert("GET /health → 200 + status=ok", ok, `status=${status} data=${JSON.stringify(data)}`);
    scenarioPassed(0, ok);
  } catch (err) {
    assert("GET /health", false, String(err));
    scenarioPassed(0, false);
  }

  // ── 2. 三角色登录 ────────────────────────────────────────────────────────
  console.log("\n【2】三角色登录");
  let loginOk = true;
  try {
    const linRes = await linClient.post<{ token: string; user: { id: string; role: string } }>(
      "/auth/login",
      { email: ACCOUNTS.lin.email, password: ACCOUNTS.lin.password }
    );
    const linOk = linRes.status === 201 && linRes.data.token;
    assert("Lin 登录成功", linOk, `status=${linRes.status}`);
    if (linRes.data.token) linClient.setToken(linRes.data.token);
    loginOk = loginOk && linOk;

    const moRes = await moClient.post<{ token: string; user: { id: string; role: string } }>(
      "/auth/login",
      { email: ACCOUNTS.mo.email, password: ACCOUNTS.mo.password }
    );
    const moOk = moRes.status === 201 && moRes.data.token;
    assert("Mo 登录成功", moOk, `status=${moRes.status}`);
    if (moRes.data.token) moClient.setToken(moRes.data.token);
    loginOk = loginOk && moOk;

    const teacherRes = await teacherClient.post<{ token: string; user: { id: string; role: string } }>(
      "/auth/login",
      { email: ACCOUNTS.teacher.email, password: ACCOUNTS.teacher.password }
    );
    const teacherOk = teacherRes.status === 201 && teacherRes.data.token;
    assert("Teacher 登录成功", teacherOk, `status=${teacherRes.status}`);
    if (teacherRes.data.token) teacherClient.setToken(teacherRes.data.token);
    loginOk = loginOk && teacherOk;
  } catch (err) {
    assert("三角色登录", false, String(err));
    loginOk = false;
  }
  scenarioPassed(1, loginOk);

  // ── 3. Session 验证 ──────────────────────────────────────────────────────
  console.log("\n【3】Session 验证");
  let sessionOk = true;
  try {
    const linSession = await linClient.get<{ user: { id: string; displayName: string } }>("/auth/session");
    const linSessionOk = linSession.status === 200 && linSession.data.user.id === ACCOUNTS.lin.id;
    assert("Lin session 验证", linSessionOk, `data=${JSON.stringify(linSession.data)}`);
    sessionOk = sessionOk && linSessionOk;

    const moSession = await moClient.get<{ user: { id: string; displayName: string } }>("/auth/session");
    const moSessionOk = moSession.status === 200 && moSession.data.user.id === ACCOUNTS.mo.id;
    assert("Mo session 验证", moSessionOk, `data=${JSON.stringify(moSession.data)}`);
    sessionOk = sessionOk && moSessionOk;

    const teacherSession = await teacherClient.get<{ user: { id: string } }>("/auth/session");
    const teacherSessionOk = teacherSession.status === 200 && teacherSession.data.user.id === ACCOUNTS.teacher.id;
    assert("Teacher session 验证", teacherSessionOk, `data=${JSON.stringify(teacherSession.data)}`);
    sessionOk = sessionOk && teacherSessionOk;
  } catch (err) {
    assert("Session 验证", false, String(err));
    sessionOk = false;
  }
  scenarioPassed(2, sessionOk);

  // ── 4. 世界观查询 ────────────────────────────────────────────────────────
  console.log("\n【4】世界观查询");
  let worldOk = true;
  try {
    const world = await linClient.get("/world");
    const worldResult = world.status === 200;
    assert("GET /world", worldResult, `status=${world.status}`);
    worldOk = worldOk && worldResult;

    const quests = await linClient.get("/quests");
    const questsResult = quests.status === 200 && Array.isArray(quests.data);
    assert("GET /quests", questsResult, `status=${quests.status}`);
    worldOk = worldOk && questsResult;

    const guilds = await linClient.get("/guilds");
    const guildsResult = guilds.status === 200 && Array.isArray(guilds.data);
    assert("GET /guilds", guildsResult, `status=${guilds.status}`);
    worldOk = worldOk && guildsResult;
  } catch (err) {
    assert("世界观查询", false, String(err));
    worldOk = false;
  }
  scenarioPassed(3, worldOk);

  // ── 5. 提交与评审全链路 ──────────────────────────────────────────────────
  console.log("\n【5】提交与评审全链路");
  let submissionOk = false;
  let submissionId: string | null = null;
  try {
    const subRes = await linClient.post<{ submission: { id: string }; review: { submissionId: string } }>(
      "/submissions",
      {
        studentId: ACCOUNTS.lin.id,
        courseWorldId: "course-world-1",
        dayId: "day-1",
        agentSessionId: "session-1",
        triggerType: "button",
        conversationSummary: "讨论了 prompt engineering 的基本概念",
        workSummary: "完成了第一个 AI Agent 的 prompt 设计",
        artifacts: [{ kind: "code", label: "main.py", url: "https://example.com/main.py" }],
        selfReflection: "初步掌握了 system prompt 的写法",
        agentEvaluationHints: ["prompt_quality", "code_completeness"],
        timestamp: new Date().toISOString(),
      }
    );
    submissionOk = subRes.status === 201;
    assert("Lin POST /submissions", submissionOk, `status=${subRes.status} data=${JSON.stringify(subRes.data).slice(0, 120)}`);
    if (subRes.data?.submission?.id) {
      submissionId = subRes.data.submission.id;
    }
  } catch (err) {
    assert("Lin POST /submissions", false, String(err));
  }

  // 等待 AI review 处理
  if (submissionId) {
    console.log("  ⏳ 等待 AI review 处理（2 秒）...");
    await new Promise((r) => setTimeout(r, 2000));
  }

  let reviewListOk = false;
  try {
    const reviewsRes = await teacherClient.get<{ items: Array<{ submissionId: string; reviewStatus: string }> }>(
      "/reviews"
    );
    reviewListOk = reviewsRes.status === 200 && Array.isArray(reviewsRes.data.items);
    assert("Teacher GET /reviews", reviewListOk, `status=${reviewsRes.status}`);
  } catch (err) {
    assert("Teacher GET /reviews", false, String(err));
  }

  let decideOk = false;
  if (submissionId) {
    try {
      // 检查 review 状态，如果是 ai_reviewed 则可以 decide
      const reviewsRes2 = await teacherClient.get<{ items: Array<{ submissionId: string; reviewStatus: string; isPendingTeacherDecision: boolean }> }>(
        "/reviews"
      );
      const reviewItem = reviewsRes2.data.items.find((i) => i.submissionId === submissionId);
      if (reviewItem?.isPendingTeacherDecision) {
        const decideRes = await teacherClient.post<{ submissionId: string; finalScore: number; decision: string }>(
          "/reviews/decide",
          { submissionId, finalScore: 85, decision: "approve" }
        );
        decideOk = decideRes.status === 201 || decideRes.status === 200;
        assert("Teacher POST /reviews/decide", decideOk, `status=${decideRes.status}`);
      } else {
        // AI review 尚未完成，尝试直接 decide（可能返回 409）
        const decideRes = await teacherClient.post(
          "/reviews/decide",
          { submissionId, finalScore: 85, decision: "approve" }
        );
        decideOk = decideRes.status === 201 || decideRes.status === 200;
        assert(
          "Teacher POST /reviews/decide",
          decideOk,
          `status=${decideRes.status} (review status: ${reviewItem?.reviewStatus ?? "unknown"})`
        );
      }
    } catch (err) {
      assert("Teacher POST /reviews/decide", false, String(err));
    }
  }
  scenarioPassed(4, submissionOk && reviewListOk);

  // ── 6. 聊天消息 ──────────────────────────────────────────────────────────
  console.log("\n【6】聊天消息");
  let chatOk = false;
  try {
    const chatRes = await linClient.get("/chat");
    const chatGetOk = chatRes.status === 200;
    assert("Lin GET /chat", chatGetOk, `status=${chatRes.status}`);
    chatOk = chatGetOk;

    // 尝试发消息到 Lin 自己的房间
    const roomId = `room-chat-${ACCOUNTS.lin.id}`;
    const msgRes = await linClient.post("/chat/messages", {
      roomId,
      body: "你好，这是验证消息",
    });
    // 可能是 200/201，也可能是 400/404（如果房间不存在）
    const msgOk = msgRes.status === 200 || msgRes.status === 201;
    assert("Lin POST /chat/messages", msgOk, `status=${msgRes.status} data=${JSON.stringify(msgRes.data).slice(0, 100)}`);
    chatOk = chatOk && msgOk;
  } catch (err) {
    assert("聊天消息", false, String(err));
  }
  scenarioPassed(5, chatOk);

  // ── 7. 房间授权 ──────────────────────────────────────────────────────────
  console.log("\n【7】房间授权");
  let roomOk = false;
  let grantId: string | null = null;
  const roomId = `room-chat-${ACCOUNTS.lin.id}`;
  try {
    // Lin 授权 Mo
    const grantRes = await linClient.post<{ id: string; roomId: string; granteeId: string }>(
      "/rooms/access-grants",
      { roomId, granteeId: ACCOUNTS.mo.id, scope: "chat_summary", expiresInHours: 24 }
    );
    const grantOk = grantRes.status === 201 || grantRes.status === 200;
    assert("Lin POST /rooms/access-grants (授权 Mo)", grantOk, `status=${grantRes.status} data=${JSON.stringify(grantRes.data).slice(0, 120)}`);
    if (grantRes.data?.id) grantId = grantRes.data.id;
    roomOk = grantOk;
  } catch (err) {
    assert("Lin POST /rooms/access-grants", false, String(err));
  }

  try {
    // Mo 查询可访问房间
    const accessibleRes = await moClient.get("/rooms/accessible-rooms");
    const accessibleOk = accessibleRes.status === 200 && Array.isArray(accessibleRes.data);
    assert("Mo GET /rooms/accessible-rooms", accessibleOk, `status=${accessibleRes.status}`);
    roomOk = roomOk && accessibleOk;
  } catch (err) {
    assert("Mo GET /rooms/accessible-rooms", false, String(err));
  }

  if (grantId) {
    try {
      // Lin 撤销授权
      const revokeRes = await linClient.post(`/rooms/access-grants/${grantId}/revoke`);
      const revokeOk = revokeRes.status === 200 || revokeRes.status === 201;
      assert("Lin POST /rooms/access-grants/:id/revoke", revokeOk, `status=${revokeRes.status}`);
      roomOk = roomOk && revokeOk;
    } catch (err) {
      assert("Lin POST /rooms/access-grants/:id/revoke", false, String(err));
    }
  } else {
    assert("Lin POST /rooms/access-grants/:id/revoke (跳过，无 grantId)", false);
  }
  scenarioPassed(6, roomOk);

  // ── 8. Agent 记忆隔离 ────────────────────────────────────────────────────
  console.log("\n【8】Agent 记忆隔离");
  let memoryOk = false;
  try {
    const observeRes = await linClient.post("/agent-memory/observe", {
      studentId: ACCOUNTS.lin.id,
      type: "observation",
      content: "今天学习了 prompt engineering",
      importance: 5.0,
    });
    const observeOk = observeRes.status === 201 || observeRes.status === 200;
    assert("Lin POST /agent-memory/observe", observeOk, `status=${observeRes.status}`);
    memoryOk = observeOk;
  } catch (err) {
    assert("Lin POST /agent-memory/observe", false, String(err));
  }

  try {
    const retrieveRes = await linClient.get(
      `/agent-memory/retrieve?studentId=${ACCOUNTS.lin.id}&query=prompt`
    );
    const retrieveOk = retrieveRes.status === 200;
    assert("Lin GET /agent-memory/retrieve (自己的记忆)", retrieveOk, `status=${retrieveRes.status}`);
    memoryOk = memoryOk && retrieveOk;
  } catch (err) {
    assert("Lin GET /agent-memory/retrieve", false, String(err));
  }

  try {
    // Mo 尝试查看 Lin 的记忆 → 应 403
    const moRetrieveRes = await moClient.get(
      `/agent-memory/retrieve?studentId=${ACCOUNTS.lin.id}&query=prompt`
    );
    const moRetrieveForbidden = moRetrieveRes.status === 403;
    assert("Mo GET /agent-memory/retrieve (Lin 的记忆) → 403", moRetrieveForbidden, `status=${moRetrieveRes.status}`);
    memoryOk = memoryOk && moRetrieveForbidden;
  } catch (err) {
    assert("Mo GET /agent-memory/retrieve (Lin → 403)", false, String(err));
  }
  scenarioPassed(7, memoryOk);

  // ── 9. NPC 对话 ──────────────────────────────────────────────────────────
  console.log("\n【9】NPC 对话");
  let npcOk = false;
  try {
    const npcClient = new ApiClient(); // NPC 无需认证
    const npcRes = await npcClient.get<{ npcId: string; reply: string }>(
      "/npc/receptionist/conversation"
    );
    npcOk = npcRes.status === 200 && typeof npcRes.data.reply === "string";
    assert("GET /npc/receptionist/conversation", npcOk, `status=${npcRes.status} data=${JSON.stringify(npcRes.data).slice(0, 100)}`);
  } catch (err) {
    assert("NPC 对话", false, String(err));
  }
  scenarioPassed(8, npcOk);

  // ── 10. Agent 虚拟形象 ───────────────────────────────────────────────────
  console.log("\n【10】Agent 虚拟形象");
  let avatarOk = false;
  try {
    const avatarClient = new ApiClient(); // 无需认证
    const avatarRes = await avatarClient.get("/agent-avatars");
    avatarOk = avatarRes.status === 200;
    assert("GET /agent-avatars", avatarOk, `status=${avatarRes.status}`);
  } catch (err) {
    assert("Agent 虚拟形象", false, String(err));
  }
  scenarioPassed(9, avatarOk);

  // ── 11. 学习洞察 ─────────────────────────────────────────────────────────
  console.log("\n【11】学习洞察");
  let insightOk = false;
  try {
    // 教师查看班级洞察
    const classRes = await teacherClient.get("/learning-insights/class?teacherId=" + ACCOUNTS.teacher.id);
    const classOk = classRes.status === 200;
    assert("Teacher GET /learning-insights/class", classOk, `status=${classRes.status}`);
    insightOk = classOk;
  } catch (err) {
    assert("Teacher GET /learning-insights/class", false, String(err));
  }

  try {
    // 教师查看学生洞察
    const teacherStudentRes = await teacherClient.get("/learning-insights/student/student-1");
    const teacherStudentOk = teacherStudentRes.status === 200;
    assert("Teacher GET /learning-insights/student/student-1", teacherStudentOk, `status=${teacherStudentRes.status}`);
    insightOk = insightOk && teacherStudentOk;
  } catch (err) {
    assert("Teacher GET /learning-insights/student/student-1", false, String(err));
  }

  try {
    // Lin 查看自己的洞察
    const linInsightRes = await linClient.get("/learning-insights/student/student-1");
    const linInsightOk = linInsightRes.status === 200;
    assert("Lin GET /learning-insights/student/student-1 (自己)", linInsightOk, `status=${linInsightRes.status}`);
    insightOk = insightOk && linInsightOk;
  } catch (err) {
    assert("Lin GET /learning-insights/student/student-1", false, String(err));
  }

  try {
    // Mo 查看 Lin 的洞察 → 应 403
    const moInsightRes = await moClient.get("/learning-insights/student/student-1");
    const moInsightForbidden = moInsightRes.status === 403;
    assert("Mo GET /learning-insights/student/student-1 → 403", moInsightForbidden, `status=${moInsightRes.status}`);
    insightOk = insightOk && moInsightForbidden;
  } catch (err) {
    assert("Mo GET /learning-insights/student/student-1 (403)", false, String(err));
  }
  scenarioPassed(10, insightOk);

  // ── 12. 教学 Agent SOP ───────────────────────────────────────────────────
  console.log("\n【12】教学 Agent SOP");
  let sopOk = false;
  try {
    const questionRes = await linClient.post("/teaching-agents/question", {
      studentId: ACCOUNTS.lin.id,
      question: "什么是 prompt engineering?",
    });
    const questionOk = questionRes.status === 201 || questionRes.status === 200;
    assert("POST /teaching-agents/question", questionOk, `status=${questionRes.status}`);
    sopOk = questionOk;
  } catch (err) {
    assert("POST /teaching-agents/question", false, String(err));
  }

  try {
    const questCompleteRes = await linClient.post("/teaching-agents/quest-complete", {
      studentId: ACCOUNTS.lin.id,
      questId: "day-1",
    });
    const questOk = questCompleteRes.status === 201 || questCompleteRes.status === 200;
    assert("POST /teaching-agents/quest-complete", questOk, `status=${questCompleteRes.status}`);
    sopOk = sopOk && questOk;
  } catch (err) {
    assert("POST /teaching-agents/quest-complete", false, String(err));
  }

  try {
    const collabRes = await linClient.post("/teaching-agents/collaborate", {
      agents: ["ta", "reviewer", "mentor"],
      topic: "如何写好 system prompt",
      context: "学生正在学习 Agent 开发",
    });
    const collabOk = collabRes.status === 201 || collabRes.status === 200;
    assert("POST /teaching-agents/collaborate", collabOk, `status=${collabRes.status}`);
    sopOk = sopOk && collabOk;
  } catch (err) {
    assert("POST /teaching-agents/collaborate", false, String(err));
  }
  scenarioPassed(11, sopOk);

  // ── 13. 权限隔离 ─────────────────────────────────────────────────────────
  console.log("\n【13】权限隔离");
  let permOk = false;
  try {
    // Lin（学生）尝试访问 reviews → 应 403
    const linReviewsRes = await linClient.get("/reviews");
    const linReviewsForbidden = linReviewsRes.status === 403;
    assert("Lin GET /reviews → 403", linReviewsForbidden, `status=${linReviewsRes.status}`);
    permOk = linReviewsForbidden;
  } catch (err) {
    assert("Lin GET /reviews (403)", false, String(err));
  }

  try {
    // Lin（学生）尝试访问 class insights → 应 403
    const linClassRes = await linClient.get("/learning-insights/class");
    const linClassForbidden = linClassRes.status === 403;
    assert("Lin GET /learning-insights/class → 403", linClassForbidden, `status=${linClassRes.status}`);
    permOk = permOk && linClassForbidden;
  } catch (err) {
    assert("Lin GET /learning-insights/class (403)", false, String(err));
  }
  scenarioPassed(12, permOk);

  // ── 汇总 ─────────────────────────────────────────────────────────────────
  console.log("\n────────────────────────────────────────");
  const passedScenarios = scenarioResults.filter(Boolean).length;
  console.log(`=== ${passedScenarios}/13 passed ===`);
  console.log(`断言统计: ${passedCount} passed / ${failedCount} failed`);
  console.log("────────────────────────────────────────\n");

  if (passedScenarios < 13) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("脚本执行异常:", err);
  process.exit(2);
});
