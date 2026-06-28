import {
  AgentSessionStatus,
  GuildMembershipRole,
  MembershipStatus,
  PrismaClient,
  QuestStatus,
  UserRole
} from "@prisma/client";

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

export async function seedDatabase(prisma: PrismaClient) {
  await prisma.userSession.deleteMany();
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
    data: seedScenario.users.map((user) => ({
      ...user,
      role: userRoleMap[user.role]
    }))
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

  await prisma.agentSession.createMany({
    data: seedScenario.agentSessions.map((session) => ({
      ...session,
      status: agentSessionStatusMap[session.status]
    }))
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
        questDays: seedScenario.questDays.length
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
