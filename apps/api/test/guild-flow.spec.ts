import type { CanActivate, ExecutionContext, INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient, UserRole } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedDatabase } from "../prisma/seed";
import { AuthGuard } from "../src/modules/auth/auth.guard";
import { GuildsController } from "../src/modules/guilds/guilds.controller";
import { GuildsService } from "../src/modules/guilds/guilds.service";
import { PrismaModule } from "../src/prisma/prisma.module";
import { prepareTestDatabase } from "./support/test-database";

class GuildTestAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const requestData = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      authSession?: {
        user: { id: string; role: UserRole; displayName: string };
      };
    }>();
    const id = requestData.headers["x-user-id"] ?? "";
    const role = requestData.headers["x-user-role"] === UserRole.teacher
      ? UserRole.teacher
      : UserRole.student;
    requestData.authSession = {
      user: { id, role, displayName: id }
    };
    return true;
  }
}

describe("guild flow", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  function asUser(
    req: request.Test,
    id: string,
    role: UserRole = UserRole.student
  ) {
    return req.set("x-user-id", id).set("x-user-role", role);
  }

  async function createTestStudents() {
    await prisma.user.createMany({
      data: [
        {
          id: "student-4",
          role: UserRole.student,
          email: "new-one@academy.test",
          passwordHash: "unused",
          displayName: "New One"
        },
        {
          id: "student-5",
          role: UserRole.student,
          email: "new-two@academy.test",
          passwordHash: "unused",
          displayName: "New Two"
        }
      ]
    });
  }

  beforeAll(async () => {
    prisma = await prepareTestDatabase("guild-flow");
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule],
      controllers: [GuildsController],
      providers: [GuildsService]
    })
      .overrideGuard(AuthGuard)
      .useClass(GuildTestAuthGuard)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  beforeEach(async () => {
    await seedDatabase(prisma);
    await createTestStudents();
  });

  afterAll(async () => {
    if (app) await app.close();
    await prisma.$disconnect();
  });

  it("allows only an unassigned student to create a guild", async () => {
    const teacherResponse = await asUser(
      request(app.getHttpServer()).post("/guilds"),
      "teacher-1",
      UserRole.teacher
    ).send({
      name: "Teacher Guild",
      description: "Teachers cannot create student guilds."
    });
    const assignedResponse = await asUser(
      request(app.getHttpServer()).post("/guilds"),
      "student-1"
    ).send({
      name: "Second Guild",
      description: "Students cannot own two active guilds."
    });
    const createdResponse = await asUser(
      request(app.getHttpServer()).post("/guilds"),
      "student-4"
    ).send({
      name: "Night Shift",
      description: "Students collaborate after the daytime class."
    });

    expect(teacherResponse.status).toBe(403);
    expect(assignedResponse.status).toBe(409);
    expect(createdResponse.status).toBe(201);
    expect(createdResponse.body).toMatchObject({
      name: "Night Shift",
      memberCount: 1,
      viewerMembership: {
        userId: "student-4",
        role: "leader",
        status: "active"
      }
    });
  });

  it("lets a leader invite by email and atomically accepts only one guild", async () => {
    const secondGuild = await asUser(
      request(app.getHttpServer()).post("/guilds"),
      "student-5"
    ).send({
      name: "Night Shift",
      description: "A second guild used to verify invitation choice."
    });

    const nonLeader = await asUser(
      request(app.getHttpServer()).post("/guilds/guild-1/invitations"),
      "student-2"
    ).send({ email: "new-one@academy.test" });
    const firstInvite = await asUser(
      request(app.getHttpServer()).post("/guilds/guild-1/invitations"),
      "student-1"
    ).send({ email: " New-One@academy.test " });
    const duplicate = await asUser(
      request(app.getHttpServer()).post("/guilds/guild-1/invitations"),
      "student-1"
    ).send({ email: "new-one@academy.test" });
    const secondInvite = await asUser(
      request(app.getHttpServer()).post(
        `/guilds/${secondGuild.body.id}/invitations`
      ),
      "student-5"
    ).send({ email: "new-one@academy.test" });

    expect(nonLeader.status).toBe(403);
    expect(firstInvite.status).toBe(201);
    expect(firstInvite.body).toMatchObject({
      status: "invited",
      guildName: "Morning Forge",
      inviteeEmail: "new-one@academy.test"
    });
    expect(duplicate.status).toBe(409);
    expect(secondInvite.status).toBe(201);

    const mine = await asUser(
      request(app.getHttpServer()).get("/guilds/invitations/me"),
      "student-4"
    );
    expect(mine.status).toBe(200);
    expect(mine.body).toHaveLength(2);

    const accepted = await asUser(
      request(app.getHttpServer()).post(
        `/guilds/invitations/${firstInvite.body.id}/accept`
      ),
      "student-4"
    ).send({});
    expect(accepted.status).toBe(201);
    expect(accepted.body.status).toBe("active");

    const invitations = await prisma.guildMembership.findMany({
      where: { userId: "student-4" },
      orderBy: { guildId: "asc" }
    });
    expect(invitations.map((item) => item.status).sort()).toEqual([
      "active",
      "declined"
    ]);

    const members = await asUser(
      request(app.getHttpServer()).get("/guilds/guild-1/members"),
      "student-4"
    );
    expect(members.status).toBe(200);
    expect(members.body).toContainEqual(
      expect.objectContaining({ userId: "student-4", displayName: "New One" })
    );
  });

  it("supports declining, re-inviting and leader-only soft removal", async () => {
    const invite = await asUser(
      request(app.getHttpServer()).post("/guilds/guild-1/invitations"),
      "student-1"
    ).send({ email: "new-one@academy.test" });
    const declined = await asUser(
      request(app.getHttpServer()).post(
        `/guilds/invitations/${invite.body.id}/decline`
      ),
      "student-4"
    ).send({});
    const repeatedDecline = await asUser(
      request(app.getHttpServer()).post(
        `/guilds/invitations/${invite.body.id}/decline`
      ),
      "student-4"
    ).send({});
    expect(declined.body.status).toBe("declined");
    expect(repeatedDecline.status).toBe(409);

    const reinvited = await asUser(
      request(app.getHttpServer()).post("/guilds/guild-1/invitations"),
      "student-1"
    ).send({ email: "new-one@academy.test" });
    await asUser(
      request(app.getHttpServer()).post(
        `/guilds/invitations/${reinvited.body.id}/accept`
      ),
      "student-4"
    ).send({});

    const memberRemoval = await asUser(
      request(app.getHttpServer()).post(
        "/guilds/guild-1/members/student-4/remove"
      ),
      "student-2"
    ).send({});
    const selfRemoval = await asUser(
      request(app.getHttpServer()).post(
        "/guilds/guild-1/members/student-1/remove"
      ),
      "student-1"
    ).send({});
    const removed = await asUser(
      request(app.getHttpServer()).post(
        "/guilds/guild-1/members/student-4/remove"
      ),
      "student-1"
    ).send({});

    expect(memberRemoval.status).toBe(403);
    expect(selfRemoval.status).toBe(409);
    expect(removed.status).toBe(201);
    expect(removed.body.status).toBe("removed");
    expect(
      await prisma.guildMembership.findUnique({
        where: {
          guildId_userId: { guildId: "guild-1", userId: "student-4" }
        }
      })
    ).toMatchObject({ status: "removed" });
  });
});
