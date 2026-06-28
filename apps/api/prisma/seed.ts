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
      displayName: "Teacher Lin"
    },
    {
      id: "student-1",
      role: "student",
      email: "lin@academy.test",
      displayName: "Lin"
    },
    {
      id: "student-2",
      role: "student",
      email: "mo@academy.test",
      displayName: "Mo"
    },
    {
      id: "student-3",
      role: "student",
      email: "kai@academy.test",
      displayName: "Kai"
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

export async function main() {
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
        questDays: seedScenario.questDays.length
      },
      null,
      2
    )
  );
}

void main();
