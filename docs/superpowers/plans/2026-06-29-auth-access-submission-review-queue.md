# Auth Access Submission Review Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current teaching-platform skeleton into a usable workflow with real login state, persisted room access, real submit actions from the chat page, teacher review actions, and a Redis-backed review queue.

**Architecture:** Keep the backend as the source of truth and add one thin service layer per workflow: auth, room access, submission command, review command, and queue processing. The web app should call real APIs for submit/review actions while still using safe server-side degradation for read-only pages when the API is unavailable.

**Tech Stack:** Next.js App Router, NestJS, Prisma, SQLite-to-PostgreSQL-compatible Prisma models, Redis, BullMQ, Vitest, Playwright, TypeScript

---

## File Structure

- `apps/api/src/modules/auth/auth.controller.ts` - login endpoint and current-session read endpoint
- `apps/api/src/modules/auth/auth.service.ts` - password verification, token/session creation, current-user lookup
- `apps/api/src/modules/auth/auth.types.ts` - auth request/response types used inside the module
- `apps/api/src/modules/rooms/rooms.controller.ts` - create/list/revoke room access grants
- `apps/api/src/modules/rooms/rooms.service.ts` - room access persistence and scope validation
- `apps/api/src/modules/submissions/submissions.controller.ts` - create submission command endpoint
- `apps/api/src/modules/submissions/submissions.service.ts` - persist submission, enqueue review job, compute response
- `apps/api/src/modules/reviews/reviews.controller.ts` - teacher decision commands and list read model
- `apps/api/src/modules/reviews/reviews.service.ts` - teacher review decision updates and read-model mapping
- `apps/api/src/modules/queue/review.queue.ts` - BullMQ queue and worker bootstrap helpers
- `apps/api/src/modules/queue/review.processor.ts` - queue consumer for suggested review generation
- `apps/api/src/prisma/prisma.module.ts` - Prisma provider export
- `apps/api/prisma/schema.prisma` - auth/session/access/queue-related schema changes
- `apps/api/prisma/seed.ts` - seed credentials, access examples, and one teacher account
- `apps/api/test/auth-flow.spec.ts` - auth integration tests
- `apps/api/test/room-access.spec.ts` - room access integration tests
- `apps/api/test/submission-flow.spec.ts` - submission flow integration tests, now with persisted review lifecycle
- `apps/web/src/lib/api-client.ts` - write-capable API client methods
- `apps/web/src/app/chat/page.tsx` - chat page wired to real submit and access APIs
- `apps/web/src/app/teacher/page.tsx` - teacher dashboard wired to review actions
- `apps/web/src/components/chat/chat-room.tsx` - submit and grant-access action UI
- `apps/web/src/components/teacher/review-queue.tsx` - approve/adjust/reject action UI
- `apps/web/src/app/chat/page.test.tsx` - chat page integration-like unit test
- `apps/web/src/app/teacher/page.test.tsx` - teacher page integration-like unit test
- `apps/web/tests/e2e/smoke.spec.ts` - smoke test expanded to cover a real write action path

### Task 1: Real Auth Flow

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Modify: `apps/api/prisma/seed.ts`
- Create: `apps/api/src/modules/auth/auth.service.ts`
- Modify: `apps/api/src/modules/auth/auth.controller.ts`
- Create: `apps/api/test/auth-flow.spec.ts`

- [ ] **Step 1: Write the failing auth integration test**

```ts
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { prepareTestDatabase } from "./support/test-database";

describe("auth flow", () => {
  let app: INestApplication;

  beforeAll(async () => {
    await prepareTestDatabase("auth-flow");
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("logs in a seeded teacher and returns a session token", async () => {
    const response = await request(app.getHttpServer())
      .post("/auth/login")
      .send({
        email: "teacher@academy.test",
        password: "teacher-pass-123"
      });

    expect(response.status).toBe(201);
    expect(response.body.user.role).toBe("teacher");
    expect(response.body.token).toMatch(/^session_/);
  });
});
```

- [ ] **Step 2: Run the auth test to verify RED**

Run: `pnpm --filter api test -- auth-flow`

Expected: FAIL because `/auth/login` does not yet validate passwords or issue a real token.

- [ ] **Step 3: Add the minimal auth schema and service**

```prisma
model UserSession {
  id        String   @id @default(cuid())
  userId    String
  token     String   @unique
  createdAt DateTime @default(now())
  expiresAt DateTime
  user      User     @relation(fields: [userId], references: [id])
}
```

```ts
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || user.passwordHash !== password) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const session = await this.prisma.userSession.create({
      data: {
        userId: user.id,
        token: `session_${user.id}`,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 8)
      }
    });

    return {
      token: session.token,
      user: {
        id: user.id,
        role: user.role,
        displayName: user.displayName
      }
    };
  }
}
```

- [ ] **Step 4: Wire controller + seed data and verify GREEN**

```ts
import { Body, Controller, Post } from "@nestjs/common";
import { AuthService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("login")
  login(@Body() body: { email: string; password: string }) {
    return this.authService.login(body.email, body.password);
  }
}
```

Run: `pnpm --filter api test -- auth-flow && pnpm --filter api build`

Expected: PASS and the auth integration test succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/auth apps/api/prisma/schema.prisma apps/api/prisma/seed.ts apps/api/test/auth-flow.spec.ts
git commit -m "feat(api): add real auth sessions"
```

### Task 2: Persisted Room Access

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/src/modules/rooms/rooms.service.ts`
- Modify: `apps/api/src/modules/rooms/rooms.controller.ts`
- Create: `apps/api/test/room-access.spec.ts`

- [ ] **Step 1: Write the failing room access test**

```ts
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { prepareTestDatabase } from "./support/test-database";

describe("room access", () => {
  let app: INestApplication;

  beforeAll(async () => {
    await prepareTestDatabase("room-access");
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("creates and lists room access grants for a homestead chat room", async () => {
    const createResponse = await request(app.getHttpServer())
      .post("/rooms/access-grants")
      .send({
        roomId: "room-chat-1",
        granteeId: "student-2",
        scope: "chat_summary",
        expiresInHours: 24
      });

    const listResponse = await request(app.getHttpServer()).get(
      "/rooms/access-grants?roomId=room-chat-1"
    );

    expect(createResponse.status).toBe(201);
    expect(listResponse.status).toBe(200);
    expect(listResponse.body[0].roomId).toBe("room-chat-1");
    expect(listResponse.body[0].granteeId).toBe("student-2");
  });
});
```

- [ ] **Step 2: Run the room access test to verify RED**

Run: `pnpm --filter api test -- room-access`

Expected: FAIL because grants are not persisted or listable.

- [ ] **Step 3: Add the minimal Prisma model and service**

```prisma
model RoomAccessGrant {
  id          String   @id @default(cuid())
  roomId      String
  granteeId   String
  scope       String
  status      String
  expiresAt   DateTime
  createdAt   DateTime @default(now())
}
```

```ts
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class RoomsService {
  constructor(private readonly prisma: PrismaService) {}

  createGrant(roomId: string, granteeId: string, scope: string, expiresInHours: number) {
    return this.prisma.roomAccessGrant.create({
      data: {
        roomId,
        granteeId,
        scope,
        status: "approved",
        expiresAt: new Date(Date.now() + expiresInHours * 60 * 60 * 1000)
      }
    });
  }

  listGrants(roomId: string) {
    return this.prisma.roomAccessGrant.findMany({
      where: { roomId },
      orderBy: { createdAt: "desc" }
    });
  }
}
```

- [ ] **Step 4: Wire list/create endpoints and verify GREEN**

```ts
import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { RoomsService } from "./rooms.service";

@Controller("rooms")
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Post("access-grants")
  createGrant(
    @Body()
    body: {
      roomId: string;
      granteeId: string;
      scope: string;
      expiresInHours: number;
    }
  ) {
    return this.roomsService.createGrant(
      body.roomId,
      body.granteeId,
      body.scope,
      body.expiresInHours
    );
  }

  @Get("access-grants")
  listGrants(@Query("roomId") roomId: string) {
    return this.roomsService.listGrants(roomId);
  }
}
```

Run: `pnpm --filter api test -- room-access && pnpm --filter api build`

Expected: PASS with grants created and returned from Prisma.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/rooms apps/api/prisma/schema.prisma apps/api/test/room-access.spec.ts
git commit -m "feat(api): persist room access grants"
```

### Task 3: Real Submit Action From Chat Page

**Files:**
- Modify: `apps/api/src/modules/submissions/submissions.controller.ts`
- Create: `apps/api/src/modules/submissions/submissions.service.ts`
- Modify: `apps/web/src/lib/api-client.ts`
- Modify: `apps/web/src/app/chat/page.tsx`
- Modify: `apps/web/src/components/chat/chat-room.tsx`
- Modify: `apps/web/src/app/chat/page.test.tsx`

- [ ] **Step 1: Write the failing chat submit UI test**

```ts
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChatRoom } from "../../components/chat/chat-room";

describe("chat submit action", () => {
  it("calls the submit handler when the user clicks 今日提交", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <ChatRoom
        studentName="Lin"
        agentLabel="Claude Code"
        sessionStatusLabel="进行中"
        sessionSummary="正在整理今日任务"
        latestSubmissionStatus="今日未提交"
        latestSubmissionMeta={undefined}
        collaborationGuests={[]}
        onSubmit={onSubmit}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "今日提交" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the web test to verify RED**

Run: `pnpm --filter web test -- src/app/chat/page.test.tsx src/components/chat/chat-room.test.tsx`

Expected: FAIL because the component has no submit callback path yet.

- [ ] **Step 3: Add the minimal API client and button wiring**

```ts
export async function createSubmission(payload: {
  studentId: string;
  courseWorldId: string;
  dayId: string;
  agentSessionId: string;
  triggerType: "button";
  conversationSummary: string;
  workSummary: string;
  artifacts: Array<{ kind: string; label: string; url: string }>;
  selfReflection: string;
  agentEvaluationHints: string[];
  timestamp: string;
}) {
  const response = await fetch(`${API_BASE_URL}/submissions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  return response.json();
}
```

```tsx
<button type="button" onClick={() => void onSubmit?.()}>
  今日提交
</button>
```

- [ ] **Step 4: Make the page call the real endpoint and verify GREEN**

```tsx
"use client";
```

```tsx
const handleSubmit = async () => {
  await createSubmission({
    studentId: "student-1",
    courseWorldId: "course-world-1",
    dayId: "day-1",
    agentSessionId: "session-1",
    triggerType: "button",
    conversationSummary: chatOverview.sessionSummary,
    workSummary: "Student submitted from chat page.",
    artifacts: [{ kind: "doc", label: "Summary", url: "https://example.com/submission" }],
    selfReflection: "I submitted my current agent progress.",
    agentEvaluationHints: ["submitted from chat"],
    timestamp: new Date().toISOString()
  });
};
```

Run: `pnpm --filter web test -- src/app/chat/page.test.tsx src/components/chat/chat-room.test.tsx && pnpm --filter api test -- submission-flow`

Expected: PASS and the chat page can trigger the real submit endpoint contract.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/chat apps/web/src/components/chat apps/web/src/lib/api-client.ts apps/api/src/modules/submissions
git commit -m "feat(web): trigger real submission from chat page"
```

### Task 4: Teacher Review Actions

**Files:**
- Modify: `apps/web/src/lib/api-client.ts`
- Modify: `apps/web/src/app/teacher/page.tsx`
- Modify: `apps/web/src/components/teacher/review-queue.tsx`
- Modify: `apps/web/src/app/teacher/page.test.tsx`
- Modify: `apps/api/test/submission-flow.spec.ts`

- [ ] **Step 1: Write the failing teacher action test**

```ts
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReviewQueue } from "./review-queue";

describe("teacher review actions", () => {
  it("calls approve when the teacher clicks 通过", () => {
    const onApprove = vi.fn();

    render(
      <ReviewQueue
        summary={{ pendingCount: 1, reviewedToday: 0, flaggedCount: 0 }}
        items={[
          {
            submissionId: "submission-1",
            studentName: "Lin",
            guildName: "Morning Forge",
            suggestedScore: 85,
            finalScore: null,
            decision: null,
            rationale: "Clear goal",
            dayLabel: "Day 1",
            submittedAt: "2026-06-29T10:00:00.000Z"
          }
        ]}
        onApprove={onApprove}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "通过" }));
    expect(onApprove).toHaveBeenCalledWith("submission-1");
  });
});
```

- [ ] **Step 2: Run the web test to verify RED**

Run: `pnpm --filter web test -- src/app/teacher/page.test.tsx src/components/teacher/review-queue.test.tsx`

Expected: FAIL because the review UI does not expose action buttons yet.

- [ ] **Step 3: Add the minimal action API and buttons**

```ts
export async function decideReview(payload: {
  submissionId: string;
  finalScore: number;
  decision: "approve" | "adjust" | "reject";
}) {
  const response = await fetch(`${API_BASE_URL}/reviews/decide`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  return response.json();
}
```

```tsx
<button type="button" onClick={() => onApprove?.(item.submissionId)}>
  通过
</button>
<button type="button" onClick={() => onAdjust?.(item.submissionId)}>
  调整
</button>
<button type="button" onClick={() => onReject?.(item.submissionId)}>
  驳回
</button>
```

- [ ] **Step 4: Make the teacher page call the real decision endpoint and verify GREEN**

```tsx
const handleApprove = async (submissionId: string) => {
  await decideReview({
    submissionId,
    finalScore: 85,
    decision: "approve"
  });
};
```

Run: `pnpm --filter web test -- src/app/teacher/page.test.tsx src/components/teacher/review-queue.test.tsx && pnpm --filter api test -- submission-flow`

Expected: PASS and the teacher UI now triggers the real write endpoint contract.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/teacher apps/web/src/components/teacher apps/web/src/lib/api-client.ts apps/api/test/submission-flow.spec.ts
git commit -m "feat(web): add teacher review actions"
```

### Task 5: Real Redis Review Queue

**Files:**
- Modify: `apps/api/package.json`
- Modify: `README.md`
- Modify: `apps/api/src/modules/queue/review.queue.ts`
- Create: `apps/api/src/modules/queue/review.processor.ts`
- Modify: `apps/api/src/modules/submissions/submissions.controller.ts`
- Create: `apps/api/test/review-queue.spec.ts`

- [ ] **Step 1: Write the failing queue contract test**

```ts
import { describe, expect, it } from "vitest";
import { ReviewQueueService } from "../src/modules/queue/review.queue";

describe("ReviewQueueService", () => {
  it("returns a stable job id and queued status", async () => {
    const service = new ReviewQueueService();
    const result = await service.enqueue("submission-1");

    expect(result).toEqual({
      jobId: "review-submission-1",
      status: "queued"
    });
  });
});
```

- [ ] **Step 2: Run the queue test to verify RED**

Run: `pnpm --filter api test -- review-queue`

Expected: FAIL because the queue service is not yet backed by BullMQ/Redis.

- [ ] **Step 3: Add the minimal BullMQ-backed queue**

```ts
import { Queue } from "bullmq";

const connection = {
  url: process.env.REDIS_URL ?? "redis://127.0.0.1:6379"
};

export class ReviewQueueService {
  private readonly queue = new Queue("review-jobs", { connection });

  async enqueue(submissionId: string) {
    const jobId = `review-${submissionId}`;
    await this.queue.add(
      "generate-review",
      { submissionId },
      { jobId, removeOnComplete: true, removeOnFail: 100 }
    );

    return { jobId, status: "queued" as const };
  }
}
```

```ts
import { Worker } from "bullmq";

export function createReviewWorker() {
  return new Worker(
    "review-jobs",
    async (job) => {
      return {
        submissionId: job.data.submissionId,
        suggestedScore: 85
      };
    },
    {
      connection: {
        url: process.env.REDIS_URL ?? "redis://127.0.0.1:6379"
      }
    }
  );
}
```

- [ ] **Step 4: Verify queue contract and docs**

Run: `pnpm --filter api test -- review-queue`

Expected: PASS with the queue result preserved.

Run: `pnpm --filter api build`

Expected: PASS with BullMQ dependencies wired.

Add to `README.md`:

```md
## Redis For Review Queue

```bash
export REDIS_URL="redis://localhost:6379"
pnpm dev:api
```
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/queue apps/api/package.json README.md pnpm-lock.yaml apps/api/test/review-queue.spec.ts
git commit -m "feat(api): back review queue with redis"
```

## Self-Review

### Spec coverage

- Real auth: covered by Task 1.
- Real room access: covered by Task 2.
- Real submit action from chat page: covered by Task 3.
- Teacher review actions: covered by Task 4.
- Real Redis-backed review queue: covered by Task 5.

### Placeholder scan

- No `TODO`, `TBD`, or “similar to above” placeholders remain.
- Every task includes exact files, tests, commands, and minimal code direction.

### Type consistency

- Shared names remain aligned with existing code: `AgentSubmission`, `ReviewResult`, `RoomAccessGrant`, `submissionId`, `reviewedToday`, `flaggedCount`.
- Write endpoints stay consistent with existing routes: `/auth/login`, `/rooms/access-grants`, `/submissions`, `/reviews/decide`.
- Teacher workbench read/write split remains explicit: `/reviews` for reads, `/reviews/decide` for commands.
