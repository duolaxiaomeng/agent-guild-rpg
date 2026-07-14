import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AuthGuard } from "../src/modules/auth/auth.guard";
import { AuthService } from "../src/modules/auth/auth.service";
import { AgentTeamController } from "../src/modules/agent-team/agent-team.controller";
import { AgentTeamService } from "../src/modules/agent-team/agent-team.service";
import { TEACHING_AGENT_ROLES } from "../src/modules/memory/teaching-agents/agent-roles";

describe("agent team catalog", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const authService = {
      getSession: vi.fn(async (token: string) => ({
        token,
        user: {
          id: "student-1",
          role: "student",
          displayName: "Lin",
        },
      })),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [AgentTeamController],
      providers: [
        AgentTeamService,
        AuthGuard,
        { provide: AuthService, useValue: authService },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("requires an authenticated session", async () => {
    const response = await request(app.getHttpServer()).get(
      "/agent-team/catalog",
    );

    expect(response.status).toBe(401);
  });

  it("returns a stable catalog for all teaching agent roles", async () => {
    const response = await request(app.getHttpServer())
      .get("/agent-team/catalog")
      .set("Authorization", "Bearer test-token");

    expect(response.status).toBe(200);
    expect(response.body.roles).toHaveLength(10);
    expect(response.body.roles.map((role: { roleKey: string }) => role.roleKey)).toEqual([
      "ta",
      "reviewer",
      "mentor",
      "qa",
      "philosophy-design-mentor",
      "software-architect",
      "deployment-release",
      "frontend-developer",
      "backend-developer",
      "operations-architect",
    ]);
    expect(response.body.roles.slice(0, 3).map((role: {
      roleKey: "ta" | "reviewer" | "mentor";
      name: string;
      description: string;
    }) => ({
      roleKey: role.roleKey,
      name: role.name,
      description: role.description,
    }))).toEqual([
      {
        roleKey: "ta",
        name: TEACHING_AGENT_ROLES.ta.name,
        description: TEACHING_AGENT_ROLES.ta.role,
      },
      {
        roleKey: "reviewer",
        name: TEACHING_AGENT_ROLES.reviewer.name,
        description: TEACHING_AGENT_ROLES.reviewer.role,
      },
      {
        roleKey: "mentor",
        name: TEACHING_AGENT_ROLES.mentor.name,
        description: TEACHING_AGENT_ROLES.mentor.role,
      },
    ]);

    for (const role of response.body.roles) {
      expect(role).toEqual({
        roleKey: expect.any(String),
        name: expect.any(String),
        description: expect.any(String),
        capabilities: expect.arrayContaining([expect.any(String)]),
        defaultModel: "doubao-seed-2-1-turbo-260628",
        adapter: "ark",
        parallelResponsibilities: expect.arrayContaining([expect.any(String)]),
      });
    }
  });

  it("returns one mapped role by role key", async () => {
    const response = await request(app.getHttpServer())
      .get("/agent-team/roles/reviewer")
      .set("Authorization", "Bearer test-token");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      roleKey: "reviewer",
      name: "评审 Agent",
      description: "自动初评学生提交，给出结构化评审意见",
      capabilities: expect.arrayContaining(["提交初评", "评分建议"]),
      defaultModel: "doubao-seed-2-1-turbo-260628",
      adapter: "ark",
      parallelResponsibilities: expect.arrayContaining(["提交评审"]),
    });
  });

  it("returns a stable extended role by role key", async () => {
    const response = await request(app.getHttpServer())
      .get("/agent-team/roles/software-architect")
      .set("Authorization", "Bearer test-token");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      roleKey: "software-architect",
      name: "软件设计架构师 Agent",
      description: "负责系统分层、模块边界和技术架构决策",
      capabilities: ["软件设计", "架构设计", "模块拆分"],
      defaultModel: "doubao-seed-2-1-turbo-260628",
      adapter: "ark",
      parallelResponsibilities: ["架构评审", "边界定义", "技术方案设计"],
    });
  });

  it("returns a stable not-found response for an unknown role", async () => {
    const response = await request(app.getHttpServer())
      .get("/agent-team/roles/unknown")
      .set("Authorization", "Bearer test-token");

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      statusCode: 404,
      error: "Not Found",
      message: "Agent role not found: unknown",
    });
  });
});
