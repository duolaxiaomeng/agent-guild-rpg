import {
  AgentSessionStatus,
  ClassroomSessionStatus,
  ClassroomStageStatus,
  ClassroomStaffRole,
  GuildMembershipRole,
  MembershipStatus,
  PrismaClient,
  QuestStatus,
  RoomType,
  SubmissionTriggerType,
  UserRole
} from "@prisma/client";
import * as bcrypt from "bcrypt";

export const seedScenario = {
  courseWorld: {
    id: "course-world-1",
    name: "Agent Guild Academy",
    currentDay: 1,
    isUnlocked: true
  },
  users: [
    {
      id: "teacher-1",
      role: "teacher",
      email: "teacher@academy.test",
      passwordHash: "teacher-pass-123",
      displayName: "Teacher Lin",
      isOnline: false
    },
    {
      id: "student-1",
      role: "student",
      email: "lin@academy.test",
      passwordHash: "student-pass-123",
      displayName: "Lin",
      isOnline: true
    },
    {
      id: "student-2",
      role: "student",
      email: "mo@academy.test",
      passwordHash: "student-pass-456",
      displayName: "Mo",
      isOnline: false
    },
    {
      id: "student-3",
      role: "student",
      email: "kai@academy.test",
      passwordHash: "student-pass-789",
      displayName: "Kai",
      isOnline: true
    }
  ],
  homesteads: [
    { id: "home-1", ownerId: "student-1", title: "Lin's Workshop" },
    { id: "home-2", ownerId: "student-2", title: "Mo's Prompt Lab" },
    { id: "home-3", ownerId: "student-3", title: "Kai's Build Base" }
  ],
  guilds: [
    {
      id: "guild-1",
      name: "Morning Forge",
      description: "Students collaborate on daily agent quests and peer review.",
      ownerId: "student-1",
      collaborationPoints: 12
    }
  ],
  guildMemberships: [
    {
      id: "guild-membership-1",
      guildId: "guild-1",
      userId: "student-1",
      role: "leader",
      status: "active"
    },
    {
      id: "guild-membership-2",
      guildId: "guild-1",
      userId: "student-2",
      role: "member",
      status: "active"
    },
    {
      id: "guild-membership-3",
      guildId: "guild-1",
      userId: "student-3",
      role: "member",
      status: "active"
    }
  ],
  agentSessions: [
    {
      id: "session-1",
      studentId: "student-1",
      provider: "claude-code",
      status: "active"
    }
  ],
  questDays: [
    {
      id: "day-1",
      courseWorldId: "course-world-1",
      title: "First Agent Session",
      status: "open"
    },
    {
      id: "day-2",
      courseWorldId: "course-world-1",
      title: "Prompt Iteration",
      status: "locked"
    }
  ],
  classroomSessions: [
    {
      id: "classroom-session-1",
      courseWorldId: "course-world-1",
      dayId: "day-1",
      teacherId: "teacher-1",
      status: "draft",
      currentStageId: null,
      version: 0
    }
  ],
  classroomStages: [
    {
      id: "classroom-stage-briefing",
      sessionId: "classroom-session-1",
      title: "讲解",
      description: "了解今日 Agent 任务目标与验收标准。",
      sortOrder: 0,
      durationSeconds: 600,
      status: "draft",
      version: 0
    },
    {
      id: "classroom-stage-practice",
      sessionId: "classroom-session-1",
      title: "个人实践",
      description: "完成今日切片并记录 Agent 协作过程。",
      sortOrder: 1,
      durationSeconds: 1800,
      status: "draft",
      version: 0
    },
    {
      id: "classroom-stage-peer-review",
      sessionId: "classroom-session-1",
      title: "互测",
      description: "与工会成员互测提交并记录反馈。",
      sortOrder: 2,
      durationSeconds: 900,
      status: "draft",
      version: 0
    },
    {
      id: "classroom-stage-submit",
      sessionId: "classroom-session-1",
      title: "提交",
      description: "提交今日成果，等待 AI 与老师评审。",
      sortOrder: 3,
      durationSeconds: 600,
      status: "draft",
      version: 0
    }
  ],
  classroomStaffAssignments: [
    {
      id: "classroom-staff-teacher-1",
      sessionId: "classroom-session-1",
      userId: "teacher-1",
      role: "teacher"
    },
    {
      id: "classroom-staff-assistant-1",
      sessionId: "classroom-session-1",
      userId: "student-3",
      role: "assistant"
    }
  ],
  rooms: [
    { id: "room-chat-student-1", homesteadId: "home-1", type: "chat_room", name: "Lin 的聊天室" }
  ],
  submissions: [
    {
      id: "sub-1",
      studentId: "student-1",
      courseWorldId: "course-world-1",
      dayId: "day-1",
      agentSessionId: "session-1",
      triggerType: "button" as const,
      conversationSummary: "与 Agent 讨论了基础配置方案，确认了工具链选型。",
      workSummary: "完成了 Day 1 的基础任务，实现了 Agent 的初始配置与第一轮 prompt 调试。",
      artifacts: [{ kind: "code", label: "config.ts", url: "https://example.com/artifacts/sub-1/config.ts" }],
      selfReflection: "整体进展顺利，但在 prompt 结构上还需要进一步优化。",
      agentEvaluationHints: ["结构清晰", "缺少边界用例覆盖"],
      submittedAt: new Date(Date.now() - 86400000)
    },
    {
      id: "sub-2",
      studentId: "student-2",
      courseWorldId: "course-world-1",
      dayId: "day-1",
      agentSessionId: "session-1",
      triggerType: "chat_command" as const,
      conversationSummary: "通过聊天命令触发提交，讨论了 prompt 迭代策略。",
      workSummary: "完成了 prompt 模板设计，并进行了两轮对比测试。",
      artifacts: [{ kind: "doc", label: "prompt-v2.md", url: "https://example.com/artifacts/sub-2/prompt-v2.md" }],
      selfReflection: "prompt 效果提升明显，但还需更多测试数据支撑。",
      agentEvaluationHints: ["实验设计合理", "样本量偏小"],
      submittedAt: new Date(Date.now() - 43200000)
    },
    {
      id: "sub-3",
      studentId: "student-3",
      courseWorldId: "course-world-1",
      dayId: "day-1",
      agentSessionId: "session-1",
      triggerType: "schedule" as const,
      conversationSummary: "定时触发提交，汇总了今日所有 Agent 交互记录。",
      workSummary: "搭建了自动化测试框架的基础骨架，接入了 CI 流水线。",
      artifacts: [{ kind: "code", label: "ci-pipeline.yml", url: "https://example.com/artifacts/sub-3/ci-pipeline.yml" }],
      selfReflection: "CI 接入比较顺利，遇到了环境变量问题已解决。",
      agentEvaluationHints: ["工程实践能力强", "文档有待补充"],
      submittedAt: new Date(Date.now() - 21600000)
    }
  ],
  reviews: [
    {
      submissionId: "sub-1",
      status: "ai_reviewed" as const,
      suggestedScore: 82,
      rationale: "结构清晰，任务完成度高，但 summary 可以更加详细。",
      aiReviewedAt: new Date(Date.now() - 80000000)
    },
    {
      submissionId: "sub-2",
      status: "teacher_decided" as const,
      suggestedScore: 75,
      finalScore: 78,
      decision: "approve" as const,
      reviewerId: "teacher-1",
      rationale: "实验设计不错，样本量建议下次扩大到 10 组以上。",
      aiReviewedAt: new Date(Date.now() - 40000000),
      decidedAt: new Date(Date.now() - 30000000)
    },
    {
      submissionId: "sub-3",
      status: "queued" as const,
      rationale: "AI review queued."
    }
  ],
  chatMessages: [
    {
      roomId: "room-chat-student-1",
      authorId: "student-1",
      body: "大家好，我刚完成了 Day 1 的任务！",
      createdAt: new Date(Date.now() - 3600000)
    },
    {
      roomId: "room-chat-student-1",
      authorId: "student-2",
      body: "不错！我还在调 prompt，马上也提交。",
      createdAt: new Date(Date.now() - 3000000)
    },
    {
      roomId: "room-chat-student-1",
      authorId: "student-3",
      body: "CI 流水线终于跑通了，环境变量坑了我好久 😂",
      createdAt: new Date(Date.now() - 2400000)
    },
    {
      roomId: "room-chat-student-1",
      authorId: "student-1",
      body: "@Kai 哈哈辛苦了，要不要一起看看评审结果？",
      createdAt: new Date(Date.now() - 1800000)
    },
    {
      roomId: "room-chat-student-1",
      authorId: "teacher-1",
      body: "大家今天表现都很好，sub-2 我已经审批通过了。",
      createdAt: new Date(Date.now() - 1200000)
    }
  ],
  roomAccessGrants: [
    {
      roomId: "room-chat-student-1",
      granteeId: "student-2",
      scope: "collaboration",
      status: "approved",
      expiresAt: new Date(Date.now() + 86400000 * 7)
    },
    {
      roomId: "room-chat-student-1",
      granteeId: "teacher-1",
      scope: "observe",
      status: "approved",
      expiresAt: new Date(Date.now() + 86400000 * 30)
    }
  ]
} as const;

const userRoleMap = {
  teacher: UserRole.teacher,
  student: UserRole.student
} as const;

const membershipRoleMap = {
  leader: GuildMembershipRole.leader,
  member: GuildMembershipRole.member,
  visitor: GuildMembershipRole.visitor
} as const;

const membershipStatusMap = {
  active: MembershipStatus.active,
  invited: MembershipStatus.invited,
  removed: MembershipStatus.removed
} as const;

const questStatusMap = {
  open: QuestStatus.open,
  locked: QuestStatus.locked,
  completed: QuestStatus.completed
} as const;

const agentSessionStatusMap = {
  active: AgentSessionStatus.active,
  completed: AgentSessionStatus.completed,
  failed: AgentSessionStatus.failed
} as const;

const classroomSessionStatusMap = {
  draft: ClassroomSessionStatus.draft,
  live: ClassroomSessionStatus.live,
  completed: ClassroomSessionStatus.completed
} as const;

const classroomStageStatusMap = {
  draft: ClassroomStageStatus.draft,
  running: ClassroomStageStatus.running,
  paused: ClassroomStageStatus.paused,
  completed: ClassroomStageStatus.completed,
  ended_early: ClassroomStageStatus.ended_early
} as const;

const classroomStaffRoleMap = {
  teacher: ClassroomStaffRole.teacher,
  assistant: ClassroomStaffRole.assistant
} as const;

export async function seedDatabase(prisma: PrismaClient) {
  const passwordByEmail: Record<string, string> = {
    "teacher@academy.test": "teacher-pass-123",
    "lin@academy.test": "student-pass-123",
    "mo@academy.test": "student-pass-456",
    "kai@academy.test": "student-pass-789"
  };
  await prisma.classroomEvent.deleteMany();
  await prisma.helpRequest.deleteMany();
  await prisma.classroomStaffAssignment.deleteMany();
  await prisma.classroomStage.deleteMany();
  await prisma.classroomSession.deleteMany();
  await prisma.agentMemory.deleteMany();
  await prisma.agentEvent.deleteMany();
  await prisma.agentConnector.deleteMany();
  await prisma.agentPairing.deleteMany();
  await prisma.userSession.deleteMany();
  await prisma.chatMessage.deleteMany();
  await prisma.reviewResult.deleteMany();
  await prisma.agentSubmission.deleteMany();
  await prisma.agentSession.deleteMany();
  await prisma.contributionLog.deleteMany();
  await prisma.roomAccessGrant.deleteMany();
  await prisma.guildMembership.deleteMany();
  await prisma.guild.deleteMany();
  await prisma.room.deleteMany();
  await prisma.homestead.deleteMany();
  await prisma.questDay.deleteMany();
  await prisma.courseWorld.deleteMany();
  await prisma.user.deleteMany();

  await prisma.courseWorld.create({
    data: seedScenario.courseWorld
  });

  await prisma.user.createMany({
    data: await Promise.all(
      seedScenario.users.map(async (user) => ({
        ...user,
        passwordHash: await bcrypt.hash(
          passwordByEmail[user.email] ?? "the-password",
          10
        ),
        role: userRoleMap[user.role]
      }))
    )
  });

  await prisma.homestead.createMany({
    data: seedScenario.homesteads.map((homestead) => ({ ...homestead }))
  });

  await prisma.guild.createMany({
    data: seedScenario.guilds.map((guild) => ({ ...guild }))
  });

  await prisma.guildMembership.createMany({
    data: seedScenario.guildMemberships.map((membership) => ({
      ...membership,
      role: membershipRoleMap[membership.role],
      status: membershipStatusMap[membership.status]
    }))
  });

  await prisma.questDay.createMany({
    data: seedScenario.questDays.map((questDay) => ({
      ...questDay,
      status: questStatusMap[questDay.status]
    }))
  });

  await prisma.classroomSession.createMany({
    data: seedScenario.classroomSessions.map((session) => ({
      ...session,
      status: classroomSessionStatusMap[session.status]
    }))
  });

  await prisma.classroomStage.createMany({
    data: seedScenario.classroomStages.map((stage) => ({
      ...stage,
      status: classroomStageStatusMap[stage.status]
    }))
  });

  await prisma.classroomStaffAssignment.createMany({
    data: seedScenario.classroomStaffAssignments.map((assignment) => ({
      ...assignment,
      role: classroomStaffRoleMap[assignment.role]
    }))
  });

  await prisma.agentSession.createMany({
    data: seedScenario.agentSessions.map((session) => ({
      ...session,
      status: agentSessionStatusMap[session.status]
    }))
  });

  await prisma.room.createMany({
    data: seedScenario.rooms.map((room) => ({
      ...room,
      type: RoomType.chat_room
    }))
  });

  await prisma.agentSubmission.createMany({
    data: seedScenario.submissions.map((sub) => ({
      ...sub,
      triggerType: SubmissionTriggerType[sub.triggerType],
      artifacts: JSON.stringify(sub.artifacts),
      agentEvaluationHints: JSON.stringify(sub.agentEvaluationHints)
    }))
  });

  await prisma.reviewResult.createMany({
    data: seedScenario.reviews.map((review) => ({ ...review }))
  });

  await prisma.chatMessage.createMany({
    data: seedScenario.chatMessages.map((msg) => ({ ...msg }))
  });

  await prisma.roomAccessGrant.createMany({
    data: seedScenario.roomAccessGrants.map((grant) => ({ ...grant }))
  });
}

export async function main() {
  const prisma = new PrismaClient();

  await seedDatabase(prisma);

  console.log(
    "Seed course world with one teacher, three students, one guild, and day quests"
  );
  console.log(
    JSON.stringify(
      {
        courseWorld: seedScenario.courseWorld.name,
        users: seedScenario.users.length,
        homesteads: seedScenario.homesteads.length,
        guilds: seedScenario.guilds.length,
        guildMemberships: seedScenario.guildMemberships.length,
        agentSessions: seedScenario.agentSessions.length,
        questDays: seedScenario.questDays.length,
        submissions: seedScenario.submissions.length,
        reviews: seedScenario.reviews.length,
        chatMessages: seedScenario.chatMessages.length,
        roomAccessGrants: seedScenario.roomAccessGrants.length
      },
      null,
      2
    )
  );

  await prisma.$disconnect();
}

if (require.main === module) {
  void main();
}
