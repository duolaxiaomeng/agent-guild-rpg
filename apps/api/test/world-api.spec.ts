import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";

describe("world api", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns a login payload for teacher and student roles", async () => {
    const teacherResponse = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "teacher@example.com" });

    const studentResponse = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "lin@example.com" });

    expect(teacherResponse.status).toBe(201);
    expect(teacherResponse.body).toMatchObject({
      token: expect.any(String),
      user: {
        role: "teacher",
        displayName: "teacher"
      }
    });
    expect(studentResponse.status).toBe(201);
    expect(studentResponse.body.user.role).toBe("student");
    expect(studentResponse.body.user.displayName).toBe("lin");
  });

  it("returns the world shell payload", async () => {
    const response = await request(app.getHttpServer()).get("/world");

    expect(response.status).toBe(200);
    expect(response.body.currentDay).toBeTypeOf("number");
    expect(response.body.location).toBe("main_city");
    expect(Array.isArray(response.body.homesteads)).toBe(true);
    expect(response.body.homesteads[0]).toMatchObject({
      ownerId: expect.any(String),
      displayName: expect.any(String),
      location: "homestead",
      isOnline: true
    });
  });

  it("returns the day quest list", async () => {
    const response = await request(app.getHttpServer()).get("/quests");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      { id: "day-1", title: "First Agent Session", status: "open" },
      { id: "day-2", title: "Prompt Iteration", status: "locked" }
    ]);
  });
});
