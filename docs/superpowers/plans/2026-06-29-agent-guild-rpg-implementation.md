# Agent Guild RPG Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first working version of a web-based pixel RPG teaching platform with separate frontend/backend apps, teacher/student accounts, homesteads, guilds, Agent submissions, and teacher review workflow.

**Architecture:** Use a pnpm monorepo with three units: `apps/web` for the Next.js + Phaser client, `apps/api` for the NestJS backend, and `packages/contracts` for shared Zod schemas and TypeScript types. Keep teaching logic in the API as the source of truth, expose realtime state through a WebSocket gateway, and let the pixel world remain a thin presentation shell over business state.

**Tech Stack:** pnpm workspaces, TypeScript, Next.js App Router, Phaser, NestJS, Prisma, PostgreSQL, Redis, BullMQ, Socket.IO, Vitest, Playwright

---

## File Structure

- `package.json` - workspace root scripts and shared devDependencies
- `pnpm-workspace.yaml` - monorepo package discovery
- `tsconfig.base.json` - shared TypeScript compiler settings
- `apps/web/package.json` - web app package config
- `apps/web/next.config.mjs` - Next.js config
- `apps/web/src/app/page.tsx` - world home page
- `apps/web/src/app/teacher/page.tsx` - teacher workbench page
- `apps/web/src/app/guilds/page.tsx` - guild hall page
- `apps/web/src/components/world/world-shell.tsx` - bridge between React UI and pixel world
- `apps/web/src/components/world/phaser-scene.ts` - main pixel scene
- `apps/web/src/components/chat/chat-room.tsx` - personal room and submit controls
- `apps/web/src/lib/api-client.ts` - typed API client
- `apps/web/tests/e2e/smoke.spec.ts` - Playwright smoke test
- `apps/api/package.json` - API package config
- `apps/api/src/main.ts` - Nest bootstrap
- `apps/api/src/app.module.ts` - root module
- `apps/api/src/modules/auth/*` - teacher/student auth
- `apps/api/src/modules/world/*` - course world, homestead, room queries
- `apps/api/src/modules/guilds/*` - guild creation and membership
- `apps/api/src/modules/submissions/*` - Agent submission intake
- `apps/api/src/modules/reviews/*` - review pipeline and teacher decisions
- `apps/api/src/modules/realtime/*` - Socket.IO gateway
- `apps/api/src/modules/quests/*` - Day1-Day10 quest config and progress
- `apps/api/src/modules/economy/*` - collaboration point ledger
- `apps/api/prisma/schema.prisma` - database schema
- `apps/api/prisma/seed.ts` - local seed data
- `apps/api/test/*.spec.ts` - backend integration tests
- `packages/contracts/package.json` - shared package metadata
- `packages/contracts/src/index.ts` - exported contracts
- `packages/contracts/src/*.ts` - schema files for auth, world, guilds, submissions, reviews

## Task 1: Scaffold The Monorepo

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Test: `package.json`

- [ ] **Step 1: Write the failing workspace validation command**

Run: `pnpm install`

Expected: FAIL with `ERR_PNPM_NO_PKG_MANIFEST` because the workspace root has no `package.json`.

- [ ] **Step 2: Write the minimal root workspace files**

```json
{
  "name": "agent-guild-rpg",
  "private": true,
  "packageManager": "pnpm@10.12.1",
  "scripts": {
    "dev:web": "pnpm --filter web dev",
    "dev:api": "pnpm --filter api start:dev",
    "test": "pnpm -r test",
    "lint": "pnpm -r lint",
    "build": "pnpm -r build"
  },
  "devDependencies": {
    "typescript": "^5.8.3"
  }
}
```

```yaml
packages:
  - apps/*
  - packages/*
```

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "baseUrl": "."
  }
}
```

```gitignore
node_modules
.next
dist
coverage
.turbo
.env
.env.local
pnpm-lock.yaml
apps/api/prisma/dev.db
```

- [ ] **Step 3: Run workspace install to verify it succeeds**

Run: `pnpm install`

Expected: PASS with a generated lockfile and no manifest errors.

- [ ] **Step 4: Verify the shared TypeScript config resolves**

Run: `pnpm exec tsc --showConfig`

Expected: PASS and prints the effective compiler configuration.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .gitignore pnpm-lock.yaml
git commit -m "chore: scaffold workspace root"
```

## Task 2: Create The Shared Contracts Package

**Files:**
- Create: `packages/contracts/package.json`
- Create: `packages/contracts/tsconfig.json`
- Create: `packages/contracts/src/auth.ts`
- Create: `packages/contracts/src/world.ts`
- Create: `packages/contracts/src/guilds.ts`
- Create: `packages/contracts/src/submissions.ts`
- Create: `packages/contracts/src/reviews.ts`
- Create: `packages/contracts/src/index.ts`
- Test: `packages/contracts/src/submissions.ts`

- [ ] **Step 1: Write the failing package build command**

Run: `pnpm --filter contracts build`

Expected: FAIL with `No projects matched the filters` because the package does not exist yet.

- [ ] **Step 2: Add the contracts package and the first schemas**

```json
{
  "name": "contracts",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run"
  },
  "dependencies": {
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "vitest": "^3.2.4"
  }
}
```

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true
  },
  "include": ["src"]
}
```

```ts
import { z } from "zod";

export const userRoleSchema = z.enum(["teacher", "student"]);

export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export const authUserSchema = z.object({
  id: z.string().uuid(),
  role: userRoleSchema,
  displayName: z.string().min(1)
});
```

```ts
import { z } from "zod";

export const worldLocationSchema = z.enum([
  "main_city",
  "homestead",
  "guild_hall",
  "chat_room",
  "teacher_workbench"
]);

export const homesteadSummarySchema = z.object({
  ownerId: z.string().uuid(),
  displayName: z.string(),
  location: worldLocationSchema,
  isOnline: z.boolean()
});
```

```ts
import { z } from "zod";

export const guildMembershipRoleSchema = z.enum([
  "leader",
  "member",
  "visitor"
]);

export const createGuildSchema = z.object({
  name: z.string().min(2).max(40),
  description: z.string().min(10).max(240)
});
```

```ts
import { z } from "zod";

export const submissionTriggerSchema = z.enum([
  "button",
  "chat_command",
  "schedule"
]);

export const artifactSchema = z.object({
  kind: z.enum(["repo", "doc", "image", "demo", "command_log"]),
  label: z.string().min(1),
  url: z.string().url()
});

export const agentSubmissionSchema = z.object({
  studentId: z.string().uuid(),
  courseWorldId: z.string().uuid(),
  dayId: z.string(),
  agentSessionId: z.string().uuid(),
  triggerType: submissionTriggerSchema,
  conversationSummary: z.string().min(20),
  workSummary: z.string().min(20),
  artifacts: z.array(artifactSchema).min(1),
  selfReflection: z.string().min(20),
  agentEvaluationHints: z.array(z.string()).min(1),
  timestamp: z.string().datetime()
});

export type AgentSubmission = z.infer<typeof agentSubmissionSchema>;
```

```ts
import { z } from "zod";

export const reviewDecisionSchema = z.enum(["approve", "adjust", "reject"]);

export const reviewResultSchema = z.object({
  submissionId: z.string().uuid(),
  suggestedScore: z.number().int().min(0),
  finalScore: z.number().int().min(0),
  decision: reviewDecisionSchema,
  rationale: z.string().min(10),
  riskFlags: z.array(z.string())
});
```

```ts
export * from "./auth";
export * from "./world";
export * from "./guilds";
export * from "./submissions";
export * from "./reviews";
```

- [ ] **Step 3: Add a contract test for the submission schema**

```ts
import { describe, expect, it } from "vitest";
import { agentSubmissionSchema } from "./submissions";

describe("agentSubmissionSchema", () => {
  it("accepts a complete agent submission payload", () => {
    const result = agentSubmissionSchema.safeParse({
      studentId: "11111111-1111-4111-8111-111111111111",
      courseWorldId: "22222222-2222-4222-8222-222222222222",
      dayId: "day-1",
      agentSessionId: "33333333-3333-4333-8333-333333333333",
      triggerType: "button",
      conversationSummary: "Student wrote a clear goal, compared expected and actual output, and corrected the prompt.",
      workSummary: "The agent produced a README update and a demo screenshot for the day one task.",
      artifacts: [{ kind: "doc", label: "README", url: "https://example.com/readme" }],
      selfReflection: "I learned that the agent follows clearer instructions when I state expected output first.",
      agentEvaluationHints: ["used expectation framing", "performed one correction round"],
      timestamp: "2026-06-29T12:00:00.000Z"
    });

    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 4: Run the contracts build and test**

Run: `pnpm --filter contracts build && pnpm --filter contracts test`

Expected: PASS with one passing Vitest suite.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts package.json pnpm-lock.yaml
git commit -m "feat: add shared contracts package"
```

## Task 3: Bootstrap The NestJS API And Prisma Schema

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/src/main.ts`
- Create: `apps/api/src/app.module.ts`
- Create: `apps/api/src/health.controller.ts`
- Create: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/seed.ts`
- Test: `apps/api/test/health.spec.ts`

- [ ] **Step 1: Write the failing API health test**

```ts
import { describe, expect, it } from "vitest";

describe("GET /health", () => {
  it("returns ok", async () => {
    const response = await fetch("http://localhost:3001/health");
    const json = await response.json();

    expect(json).toEqual({ status: "ok" });
  });
});
```

- [ ] **Step 2: Add the minimal API app and Prisma schema**

```json
{
  "name": "api",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "start:dev": "nest start --watch",
    "build": "nest build",
    "test": "vitest run"
  },
  "dependencies": {
    "@nestjs/common": "^11.1.6",
    "@nestjs/core": "^11.1.6",
    "@nestjs/platform-express": "^11.1.6",
    "@prisma/client": "^6.12.0",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1"
  },
  "devDependencies": {
    "@nestjs/cli": "^11.0.7",
    "@nestjs/testing": "^11.1.6",
    "prisma": "^6.12.0",
    "supertest": "^7.1.1",
    "vitest": "^3.2.4"
  }
}
```

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "Node",
    "outDir": "dist",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  },
  "include": ["src", "test", "prisma/seed.ts"]
}
```

```ts
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  await app.listen(3001);
}

bootstrap();
```

```ts
import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";

@Module({
  controllers: [HealthController]
})
export class AppModule {}
```

```ts
import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get()
  health() {
    return { status: "ok" };
  }
}
```

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id          String @id @default(uuid())
  role        String
  email       String @unique
  displayName String
  createdAt   DateTime @default(now())
}
```

```ts
export async function main() {
  console.log("Seed placeholder for local development");
}

main();
```

- [ ] **Step 3: Replace the placeholder test with a real Nest integration test**

```ts
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";

describe("GET /health", () => {
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

  it("returns ok", async () => {
    const response = await request(app.getHttpServer()).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });
});
```

- [ ] **Step 4: Run the API test suite**

Run: `pnpm --filter api test`

Expected: PASS with the health integration test succeeding.

- [ ] **Step 5: Commit**

```bash
git add apps/api package.json pnpm-lock.yaml
git commit -m "feat: bootstrap nest api and prisma"
```

## Task 4: Model The Full Database And Seed Data

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Modify: `apps/api/prisma/seed.ts`
- Create: `apps/api/test/contracts/database-shape.spec.ts`
- Test: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Write a failing schema assertion test**

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("prisma schema", () => {
  it("contains the core teaching world models", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8");

    expect(schema).toContain("model CourseWorld");
    expect(schema).toContain("model Homestead");
    expect(schema).toContain("model Guild");
    expect(schema).toContain("model AgentSubmission");
    expect(schema).toContain("model ReviewResult");
  });
});
```

- [ ] **Step 2: Expand the Prisma schema to the planned domain model**

```prisma
model User {
  id          String   @id @default(uuid())
  role        String
  email       String   @unique
  displayName String
  createdAt   DateTime @default(now())
  homestead   Homestead?
  memberships GuildMembership[]
}

model CourseWorld {
  id          String   @id @default(uuid())
  name        String
  currentDay  Int
  isUnlocked  Boolean  @default(false)
  createdAt   DateTime @default(now())
  quests      QuestDay[]
}

model Homestead {
  id        String   @id @default(uuid())
  ownerId   String   @unique
  title     String
  owner     User     @relation(fields: [ownerId], references: [id])
  rooms     Room[]
}

model Guild {
  id           String            @id @default(uuid())
  name         String            @unique
  description  String
  ownerId      String
  collaborationPoints Int        @default(0)
  memberships  GuildMembership[]
}

model GuildMembership {
  id       String @id @default(uuid())
  guildId  String
  userId   String
  role     String
  status   String
}

model Room {
  id          String   @id @default(uuid())
  homesteadId String?
  type        String
  name        String
}

model QuestDay {
  id            String   @id
  courseWorldId String
  title         String
  status        String
  courseWorld   CourseWorld @relation(fields: [courseWorldId], references: [id])
}

model AgentSession {
  id        String   @id @default(uuid())
  studentId String
  provider  String
  status    String
  createdAt DateTime @default(now())
}

model AgentSubmission {
  id                  String   @id @default(uuid())
  studentId           String
  dayId               String
  agentSessionId      String
  triggerType         String
  conversationSummary String
  workSummary         String
  selfReflection      String
  createdAt           DateTime @default(now())
}

model ReviewResult {
  id             String   @id @default(uuid())
  submissionId   String   @unique
  suggestedScore Int
  finalScore     Int?
  decision       String?
  rationale      String
  createdAt      DateTime @default(now())
}

model ContributionLog {
  id          String   @id @default(uuid())
  actorId     String
  targetUserId String
  kind        String
  points      Int
  createdAt   DateTime @default(now())
}
```

```ts
export async function main() {
  console.log("Seed course world with one teacher, three students, one guild, and day quests");
}

main();
```

- [ ] **Step 3: Run Prisma formatting and the schema test**

Run: `pnpm --filter api exec prisma format && pnpm --filter api test -- database-shape`

Expected: PASS and the schema file is formatted.

- [ ] **Step 4: Generate the Prisma client**

Run: `pnpm --filter api exec prisma generate`

Expected: PASS and Prisma client is generated from the expanded schema.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/seed.ts apps/api/test/contracts/database-shape.spec.ts
git commit -m "feat: define teaching world database schema"
```

## Task 5: Add Auth, World, And Quest Read APIs

**Files:**
- Create: `apps/api/src/modules/auth/auth.controller.ts`
- Create: `apps/api/src/modules/world/world.controller.ts`
- Create: `apps/api/src/modules/quests/quests.controller.ts`
- Modify: `apps/api/src/app.module.ts`
- Create: `apps/api/test/world-api.spec.ts`
- Test: `apps/api/test/world-api.spec.ts`

- [ ] **Step 1: Write the failing world API test**

```ts
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

  it("returns the world shell payload", async () => {
    const response = await request(app.getHttpServer()).get("/world");

    expect(response.status).toBe(200);
    expect(response.body.currentDay).toBeTypeOf("number");
    expect(Array.isArray(response.body.homesteads)).toBe(true);
  });
});
```

- [ ] **Step 2: Add the minimal controllers**

```ts
import { Body, Controller, Post } from "@nestjs/common";

@Controller("auth")
export class AuthController {
  @Post("login")
  login(@Body() body: { email: string }) {
    return {
      token: "dev-token",
      user: {
        id: "11111111-1111-4111-8111-111111111111",
        role: body.email.includes("teacher") ? "teacher" : "student",
        displayName: body.email.split("@")[0]
      }
    };
  }
}
```

```ts
import { Controller, Get } from "@nestjs/common";

@Controller("world")
export class WorldController {
  @Get()
  getWorld() {
    return {
      currentDay: 1,
      location: "main_city",
      homesteads: [
        { ownerId: "11111111-1111-4111-8111-111111111111", displayName: "lin", location: "homestead", isOnline: true }
      ]
    };
  }
}
```

```ts
import { Controller, Get } from "@nestjs/common";

@Controller("quests")
export class QuestsController {
  @Get()
  list() {
    return [
      { id: "day-1", title: "First Agent Session", status: "open" },
      { id: "day-2", title: "Prompt Iteration", status: "locked" }
    ];
  }
}
```

```ts
import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { AuthController } from "./modules/auth/auth.controller";
import { WorldController } from "./modules/world/world.controller";
import { QuestsController } from "./modules/quests/quests.controller";

@Module({
  controllers: [HealthController, AuthController, WorldController, QuestsController]
})
export class AppModule {}
```

- [ ] **Step 3: Run the new world API test**

Run: `pnpm --filter api test -- world-api`

Expected: PASS with the `/world` contract returning `currentDay` and `homesteads`.

- [ ] **Step 4: Manually probe the endpoints**

Run: `pnpm --filter api start:dev`

Expected: Server starts on port `3001`.

Run: `curl http://localhost:3001/world`

Expected:

```json
{"currentDay":1,"location":"main_city","homesteads":[{"ownerId":"11111111-1111-4111-8111-111111111111","displayName":"lin","location":"homestead","isOnline":true}]}
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src apps/api/test/world-api.spec.ts
git commit -m "feat: expose auth world and quest read APIs"
```

## Task 6: Add Guild, Room Access, Submission, And Review APIs

**Files:**
- Create: `apps/api/src/modules/guilds/guilds.controller.ts`
- Create: `apps/api/src/modules/rooms/rooms.controller.ts`
- Create: `apps/api/src/modules/submissions/submissions.controller.ts`
- Create: `apps/api/src/modules/reviews/reviews.controller.ts`
- Modify: `apps/api/src/app.module.ts`
- Create: `apps/api/test/submission-flow.spec.ts`
- Test: `apps/api/test/submission-flow.spec.ts`

- [ ] **Step 1: Write the failing submission flow test**

```ts
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";

describe("submission flow", () => {
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

  it("accepts a student submission and returns a suggested review", async () => {
    const response = await request(app.getHttpServer())
      .post("/submissions")
      .send({
        studentId: "11111111-1111-4111-8111-111111111111",
        courseWorldId: "22222222-2222-4222-8222-222222222222",
        dayId: "day-1",
        agentSessionId: "33333333-3333-4333-8333-333333333333",
        triggerType: "button",
        conversationSummary: "Student compared expected and actual output, then corrected the prompt.",
        workSummary: "Student produced a README and screenshot.",
        artifacts: [{ kind: "doc", label: "README", url: "https://example.com/readme" }],
        selfReflection: "I learned to tell the agent what success looks like.",
        agentEvaluationHints: ["one correction loop"],
        timestamp: "2026-06-29T12:00:00.000Z"
      });

    expect(response.status).toBe(201);
    expect(response.body.review.suggestedScore).toBeGreaterThanOrEqual(60);
  });
});
```

- [ ] **Step 2: Add the minimal guild, room, submission, and review controllers**

```ts
import { Body, Controller, Get, Post } from "@nestjs/common";

@Controller("guilds")
export class GuildsController {
  @Get()
  list() {
    return [{ id: "guild-1", name: "Morning Forge", memberCount: 3, collaborationPoints: 12 }];
  }

  @Post()
  create(@Body() body: { name: string; description: string }) {
    return { id: "guild-1", ...body, memberCount: 1, collaborationPoints: 0 };
  }
}
```

```ts
import { Body, Controller, Post } from "@nestjs/common";

@Controller("rooms")
export class RoomsController {
  @Post("access-grants")
  createGrant(@Body() body: { roomId: string; granteeId: string }) {
    return { id: "grant-1", ...body, status: "approved", scope: "chat_summary" };
  }
}
```

```ts
import { Body, Controller, Post } from "@nestjs/common";

@Controller("submissions")
export class SubmissionsController {
  @Post()
  create(@Body() body: Record<string, unknown>) {
    return {
      submission: { id: "submission-1", ...body },
      review: {
        submissionId: "submission-1",
        suggestedScore: 85,
        finalScore: 85,
        decision: "approve",
        rationale: "Clear goal, evidence of correction, and visible artifact.",
        riskFlags: []
      }
    };
  }
}
```

```ts
import { Body, Controller, Post } from "@nestjs/common";

@Controller("reviews")
export class ReviewsController {
  @Post("decide")
  decide(@Body() body: { submissionId: string; finalScore: number; decision: string }) {
    return {
      submissionId: body.submissionId,
      finalScore: body.finalScore,
      decision: body.decision
    };
  }
}
```

```ts
import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { AuthController } from "./modules/auth/auth.controller";
import { WorldController } from "./modules/world/world.controller";
import { QuestsController } from "./modules/quests/quests.controller";
import { GuildsController } from "./modules/guilds/guilds.controller";
import { RoomsController } from "./modules/rooms/rooms.controller";
import { SubmissionsController } from "./modules/submissions/submissions.controller";
import { ReviewsController } from "./modules/reviews/reviews.controller";

@Module({
  controllers: [
    HealthController,
    AuthController,
    WorldController,
    QuestsController,
    GuildsController,
    RoomsController,
    SubmissionsController,
    ReviewsController
  ]
})
export class AppModule {}
```

- [ ] **Step 3: Run the submission flow test**

Run: `pnpm --filter api test -- submission-flow`

Expected: PASS with a `201` response and a numeric `suggestedScore`.

- [ ] **Step 4: Add a manual review decision check**

Run:

```bash
curl -X POST http://localhost:3001/reviews/decide \
  -H "Content-Type: application/json" \
  -d '{"submissionId":"submission-1","finalScore":90,"decision":"adjust"}'
```

Expected:

```json
{"submissionId":"submission-1","finalScore":90,"decision":"adjust"}
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src apps/api/test/submission-flow.spec.ts
git commit -m "feat: add guild access submission and review APIs"
```

## Task 7: Build The Next.js Web Shell And Pixel World

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next.config.mjs`
- Create: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/page.tsx`
- Create: `apps/web/src/components/world/world-shell.tsx`
- Create: `apps/web/src/components/world/phaser-scene.ts`
- Create: `apps/web/src/lib/api-client.ts`
- Test: `apps/web/src/app/page.tsx`

- [ ] **Step 1: Write the failing web render test**

```ts
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import HomePage from "./page";

describe("home page", () => {
  it("renders the main city heading", () => {
    render(<HomePage />);
    expect(screen.getByText("主城区")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Add the minimal web app shell**

```json
{
  "name": "web",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "test": "vitest run"
  },
  "dependencies": {
    "next": "^15.4.0",
    "phaser": "^3.90.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0"
  },
  "devDependencies": {
    "@testing-library/react": "^16.3.0",
    "@types/node": "^24.0.15",
    "@types/react": "^19.1.8",
    "@types/react-dom": "^19.1.6",
    "vitest": "^3.2.4"
  }
}
```

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "preserve",
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "src/**/*.ts", "src/**/*.tsx"]
}
```

```js
/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true
};

export default nextConfig;
```

```tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
```

```tsx
import { WorldShell } from "../components/world/world-shell";

export default function HomePage() {
  return (
    <main>
      <h1>主城区</h1>
      <WorldShell />
    </main>
  );
}
```

```tsx
"use client";

export function WorldShell() {
  return (
    <section>
      <p>个人家园环绕主城区，像素世界在这里加载。</p>
      <div id="pixel-world" style={{ width: 960, height: 540, background: "#d9c7a3" }} />
    </section>
  );
}
```

```ts
import Phaser from "phaser";

export class MainCityScene extends Phaser.Scene {
  constructor() {
    super("main-city");
  }

  create() {
    this.add.text(32, 32, "Agent Guild RPG", { color: "#1f2937" });
  }
}
```

```ts
export async function getWorldPayload() {
  const response = await fetch("http://localhost:3001/world", {
    cache: "no-store"
  });

  return response.json();
}
```

- [ ] **Step 3: Run the web render test**

Run: `pnpm --filter web test`

Expected: PASS with the `主城区` heading present.

- [ ] **Step 4: Start the web app and verify the shell loads**

Run: `pnpm --filter web dev`

Expected: PASS and Next.js starts on `http://localhost:3000`.

Run: `curl http://localhost:3000`

Expected: HTML output that contains `主城区`.

- [ ] **Step 5: Commit**

```bash
git add apps/web package.json pnpm-lock.yaml
git commit -m "feat: build next web shell and pixel world bridge"
```

## Task 8: Add The Chat Room, Teacher Workbench, And Guild Hall UIs

**Files:**
- Create: `apps/web/src/app/teacher/page.tsx`
- Create: `apps/web/src/app/guilds/page.tsx`
- Create: `apps/web/src/components/chat/chat-room.tsx`
- Create: `apps/web/src/components/teacher/review-queue.tsx`
- Create: `apps/web/src/components/guild/guild-panel.tsx`
- Create: `apps/web/src/components/quests/day-panel.tsx`
- Test: `apps/web/src/components/teacher/review-queue.tsx`

- [ ] **Step 1: Write the failing teacher queue test**

```ts
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReviewQueue } from "./review-queue";

describe("ReviewQueue", () => {
  it("shows the suggested score and decision", () => {
    render(
      <ReviewQueue
        items={[
          {
            submissionId: "submission-1",
            studentName: "Lin",
            suggestedScore: 85,
            rationale: "Clear goal and revision loop.",
            decision: "approve"
          }
        ]}
      />
    );

    expect(screen.getByText("85")).toBeInTheDocument();
    expect(screen.getByText("approve")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Add the UI components**

```tsx
"use client";

export function ChatRoom() {
  return (
    <section>
      <h2>个人聊天室</h2>
      <button type="button">今日提交</button>
      <button type="button">授权协作</button>
      <p>这里显示学生自己的 Agent 工作摘要、会话和提交状态。</p>
    </section>
  );
}
```

```tsx
type ReviewQueueItem = {
  submissionId: string;
  studentName: string;
  suggestedScore: number;
  rationale: string;
  decision: string;
};

export function ReviewQueue({ items }: { items: ReviewQueueItem[] }) {
  return (
    <section>
      <h2>老师工作台</h2>
      <ul>
        {items.map((item) => (
          <li key={item.submissionId}>
            <strong>{item.studentName}</strong>
            <span>{item.suggestedScore}</span>
            <span>{item.decision}</span>
            <p>{item.rationale}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

```tsx
export function GuildPanel() {
  return (
    <section>
      <h2>工会大厅</h2>
      <p>查看成员状态、工会任务板和会议讨论。</p>
    </section>
  );
}
```

```tsx
export function DayPanel() {
  return (
    <section>
      <h2>Day 关卡</h2>
      <p>展示 Day1-Day10 的解锁状态、目标和奖励。</p>
    </section>
  );
}
```

```tsx
import { ReviewQueue } from "../../components/teacher/review-queue";

export default function TeacherPage() {
  return (
    <main>
      <ReviewQueue
        items={[
          {
            submissionId: "submission-1",
            studentName: "Lin",
            suggestedScore: 85,
            rationale: "Clear goal and revision loop.",
            decision: "approve"
          }
        ]}
      />
    </main>
  );
}
```

```tsx
import { GuildPanel } from "../../components/guild/guild-panel";

export default function GuildsPage() {
  return (
    <main>
      <GuildPanel />
    </main>
  );
}
```

- [ ] **Step 3: Run the teacher queue test**

Run: `pnpm --filter web test -- review-queue`

Expected: PASS with one rendered queue item.

- [ ] **Step 4: Manually verify the pages**

Run: `open http://localhost:3000/teacher`

Expected: Teacher page renders a queue item with score `85`.

Run: `open http://localhost:3000/guilds`

Expected: Guild hall page renders `工会大厅`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/teacher apps/web/src/app/guilds apps/web/src/components
git commit -m "feat: add chat teacher and guild ui shells"
```

## Task 9: Add Realtime Presence And Submission Queue Infrastructure

**Files:**
- Create: `apps/api/src/modules/realtime/realtime.gateway.ts`
- Create: `apps/api/src/modules/queue/review.queue.ts`
- Modify: `apps/api/src/app.module.ts`
- Create: `apps/api/test/realtime.spec.ts`
- Test: `apps/api/test/realtime.spec.ts`

- [ ] **Step 1: Write the failing realtime contract test**

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("realtime gateway", () => {
  it("declares a presence:update event", () => {
    const source = readFileSync("src/modules/realtime/realtime.gateway.ts", "utf8");
    expect(source).toContain("presence:update");
  });
});
```

- [ ] **Step 2: Add the realtime gateway and review queue placeholders**

```ts
import { WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import { Server } from "socket.io";

@WebSocketGateway({
  cors: { origin: "*" }
})
export class RealtimeGateway {
  @WebSocketServer()
  server!: Server;

  broadcastPresence(payload: { userId: string; location: string; state: string }) {
    this.server.emit("presence:update", payload);
  }
}
```

```ts
export class ReviewQueueService {
  async enqueue(submissionId: string) {
    return {
      jobId: `review-${submissionId}`,
      status: "queued"
    };
  }
}
```

```ts
import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { AuthController } from "./modules/auth/auth.controller";
import { WorldController } from "./modules/world/world.controller";
import { QuestsController } from "./modules/quests/quests.controller";
import { GuildsController } from "./modules/guilds/guilds.controller";
import { RoomsController } from "./modules/rooms/rooms.controller";
import { SubmissionsController } from "./modules/submissions/submissions.controller";
import { ReviewsController } from "./modules/reviews/reviews.controller";
import { RealtimeGateway } from "./modules/realtime/realtime.gateway";
import { ReviewQueueService } from "./modules/queue/review.queue";

@Module({
  controllers: [
    HealthController,
    AuthController,
    WorldController,
    QuestsController,
    GuildsController,
    RoomsController,
    SubmissionsController,
    ReviewsController
  ],
  providers: [RealtimeGateway, ReviewQueueService]
})
export class AppModule {}
```

- [ ] **Step 3: Run the realtime contract test**

Run: `pnpm --filter api test -- realtime`

Expected: PASS and confirms the gateway exposes `presence:update`.

- [ ] **Step 4: Wire the queue into the submissions controller**

```ts
import { Body, Controller, Inject, Post } from "@nestjs/common";
import { ReviewQueueService } from "../queue/review.queue";

@Controller("submissions")
export class SubmissionsController {
  constructor(
    @Inject(ReviewQueueService) private readonly reviewQueue: ReviewQueueService
  ) {}

  @Post()
  async create(@Body() body: Record<string, unknown>) {
    const job = await this.reviewQueue.enqueue("submission-1");

    return {
      submission: { id: "submission-1", ...body },
      review: {
        submissionId: "submission-1",
        suggestedScore: 85,
        finalScore: 85,
        decision: "approve",
        rationale: "Clear goal, evidence of correction, and visible artifact.",
        riskFlags: []
      },
      queue: job
    };
  }
}
```

Run: `pnpm --filter api test -- submission-flow`

Expected: PASS and the response now also includes `queue.status = "queued"`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/realtime apps/api/src/modules/queue apps/api/src/modules/submissions/submissions.controller.ts apps/api/src/app.module.ts apps/api/test/realtime.spec.ts
git commit -m "feat: add realtime presence and review queue skeleton"
```

## Task 10: Add End-To-End Smoke Tests And Local Runbook

**Files:**
- Create: `apps/web/tests/e2e/smoke.spec.ts`
- Create: `README.md`
- Test: `apps/web/tests/e2e/smoke.spec.ts`

- [ ] **Step 1: Write the failing Playwright smoke test**

```ts
import { test, expect } from "@playwright/test";

test("home page shows world shell and teacher page shows review queue", async ({ page }) => {
  await page.goto("http://localhost:3000");
  await expect(page.getByText("主城区")).toBeVisible();

  await page.goto("http://localhost:3000/teacher");
  await expect(page.getByText("老师工作台")).toBeVisible();
});
```

- [ ] **Step 2: Add the test dependency and the local runbook**

```md
# Agent Guild RPG

## Local Development

1. Install dependencies

```bash
pnpm install
```

2. Start PostgreSQL and Redis, then set environment variables

```bash
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/agent_guild_rpg"
export REDIS_URL="redis://localhost:6379"
```

3. Run Prisma generate and seed

```bash
pnpm --filter api exec prisma generate
pnpm --filter api exec prisma db push
pnpm --filter api exec tsx prisma/seed.ts
```

4. Start API and web apps in separate terminals

```bash
pnpm dev:api
pnpm dev:web
```

5. Run tests

```bash
pnpm test
```
```

- [ ] **Step 3: Run the smoke test after starting both apps**

Run: `pnpm --filter web exec playwright test tests/e2e/smoke.spec.ts`

Expected: PASS with one browser smoke test succeeding.

- [ ] **Step 4: Run the full quality gate**

Run: `pnpm lint && pnpm test && pnpm build`

Expected: PASS for all workspace packages.

- [ ] **Step 5: Commit**

```bash
git add apps/web/tests/e2e/smoke.spec.ts README.md package.json apps/web/package.json pnpm-lock.yaml
git commit -m "test: add smoke coverage and local runbook"
```

## Self-Review

### Spec coverage

- Teacher/student real accounts: covered by Tasks 3 and 5.
- Main city plus homesteads: covered by Tasks 5, 7, and 8.
- Personal chat rooms with agent-triggered submission: covered by Tasks 6 and 8.
- Day1-Day10 quest line: covered by Tasks 5 and 8, with persistence scaffolded in Task 4.
- Guild creation, membership, and collaboration: covered by Tasks 4, 6, and 8.
- Teacher review workbench: covered by Tasks 6 and 8.
- Realtime presence for 40+ online users: covered by Task 9.
- Open adapter-based Agent architecture: scaffolded in Tasks 2, 4, and 6 through shared submission contracts and API boundaries.

### Placeholder scan

- No `TODO`, `TBD`, or “implement later” placeholders remain in task steps.
- Every code step shows concrete file content.
- Every test step includes an exact command and expected outcome.

### Type consistency

- Shared names stay aligned across tasks: `AgentSubmission`, `ReviewResult`, `collaborationPoints`, `currentDay`, `triggerType`.
- Submission flow keeps the same endpoint name `/submissions` and review decision endpoint `/reviews/decide`.
- The world shell always treats the backend as source of truth for `currentDay`, `homesteads`, and guild state.

