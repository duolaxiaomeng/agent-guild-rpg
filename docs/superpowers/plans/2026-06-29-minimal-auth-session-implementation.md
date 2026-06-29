# Minimal Auth Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a minimal real login state that flows across API and web with a current-session read endpoint, a small login page, browser session storage, and page-level current-user reads.

**Architecture:** Keep the backend as the source of truth for credential validation and session lookup by extending the existing auth module with `GET /auth/session`. On the web side, add a tiny browser-only session store and a login page, then let page-level code read the current user and feed existing page APIs without pushing auth logic into `chat-room` or `review-queue`.

**Tech Stack:** NestJS, Prisma, Next.js App Router, React, Vitest, TypeScript

---

## File Structure

- `apps/api/src/modules/auth/auth.controller.ts` - expose login and current-session endpoints
- `apps/api/src/modules/auth/auth.service.ts` - create sessions and resolve current user from bearer token
- `apps/api/test/auth-flow.spec.ts` - verify login and current-session read end to end
- `packages/contracts/src/auth.ts` - shared auth/session payload schemas
- `apps/web/src/lib/api-client.ts` - login and current-session client helpers
- `apps/web/src/lib/session.ts` - browser session storage helpers
- `apps/web/src/app/login/page.tsx` - minimal login entry page
- `apps/web/src/app/login/page.test.tsx` - login page behavior tests
- `apps/web/src/app/chat/page.tsx` - page-level current-user lookup for student chat
- `apps/web/src/app/chat/page.test.tsx` - verify chat page uses current session student when available
- `apps/web/src/app/teacher/page.tsx` - page-level current-user display for teacher page
- `apps/web/src/app/teacher/page.test.tsx` - verify teacher page reads current user without changing queue component
- `apps/web/src/app/page.tsx` - show current user summary on the home page
- `apps/web/src/app/page.test.tsx` - verify home page reads current session safely
- `AGENTS.md` - capture the new login-state method learned from this task

### Task 1: API Current Session

**Files:**
- Modify: `packages/contracts/src/auth.ts`
- Modify: `apps/api/src/modules/auth/auth.controller.ts`
- Modify: `apps/api/src/modules/auth/auth.service.ts`
- Modify: `apps/api/test/auth-flow.spec.ts`

- [ ] **Step 1: Write the failing auth integration test**

```ts
it("reads the current session for a logged-in teacher", async () => {
  const loginResponse = await request(app.getHttpServer()).post("/auth/login").send({
    email: "teacher@academy.test",
    password: "teacher-pass-123"
  });

  const sessionResponse = await request(app.getHttpServer())
    .get("/auth/session")
    .set("Authorization", `Bearer ${loginResponse.body.token}`);

  expect(sessionResponse.status).toBe(200);
  expect(sessionResponse.body.user).toMatchObject({
    id: "teacher-1",
    role: "teacher",
    displayName: "Teacher Lin"
  });
});
```

- [ ] **Step 2: Run the single auth test file to verify RED**

Run: `pnpm --filter api exec vitest run test/auth-flow.spec.ts`

Expected: FAIL because `GET /auth/session` does not exist yet.

- [ ] **Step 3: Add the minimal shared schema and auth lookup**

```ts
export const authSessionSchema = z.object({
  token: z.string().min(1),
  user: authUserSchema
});
```

```ts
async getSession(token: string) {
  const session = await this.prisma.userSession.findUnique({
    where: { token },
    include: { user: true }
  });

  if (!session || session.expiresAt <= new Date()) {
    throw new UnauthorizedException("Invalid session");
  }

  return {
    token: session.token,
    user: {
      id: session.user.id,
      role: session.user.role,
      displayName: session.user.displayName
    }
  };
}
```

- [ ] **Step 4: Add controller endpoint and verify GREEN**

```ts
@Get("session")
getSession(@Headers("authorization") authorization?: string) {
  return this.authService.getSession(authorization?.replace(/^Bearer\s+/i, "") ?? "");
}
```

Run: `pnpm --filter api exec vitest run test/auth-flow.spec.ts`

Expected: PASS with login and current-session assertions green.

### Task 2: Web Login and Browser Session Store

**Files:**
- Modify: `apps/web/src/lib/api-client.ts`
- Create: `apps/web/src/lib/session.ts`
- Create: `apps/web/src/app/login/page.tsx`
- Create: `apps/web/src/app/login/page.test.tsx`
- Modify: `apps/web/src/lib/api-client.test.ts`

- [ ] **Step 1: Write the failing client and login-page tests**

```ts
await expect(login({ email: "teacher@academy.test", password: "teacher-pass-123" })).resolves.toEqual({
  token: "session_teacher-1",
  user: {
    id: "teacher-1",
    role: "teacher",
    displayName: "Teacher Lin"
  }
});
```

```tsx
render(<LoginPage />);
await user.type(screen.getByLabelText("邮箱"), "teacher@academy.test");
await user.type(screen.getByLabelText("密码"), "teacher-pass-123");
await user.click(screen.getByRole("button", { name: "登录" }));
expect(saveSession).toHaveBeenCalledWith({
  token: "session_teacher-1",
  user: expect.objectContaining({ role: "teacher" })
});
```

- [ ] **Step 2: Run the focused web tests to verify RED**

Run: `pnpm --filter web exec vitest run src/lib/api-client.test.ts src/app/login/page.test.tsx`

Expected: FAIL because login helpers, browser storage, and the login page do not exist yet.

- [ ] **Step 3: Add the minimal browser session store and login page**

```ts
const SESSION_STORAGE_KEY = "agent-guild-session";

export function saveSession(session: AuthSession) {
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}
```

```tsx
const session = await login({ email, password });
saveSession(session);
router.push(session.user.role === "teacher" ? "/teacher" : "/chat");
```

- [ ] **Step 4: Verify GREEN**

Run: `pnpm --filter web exec vitest run src/lib/api-client.test.ts src/app/login/page.test.tsx`

Expected: PASS with login request and storage behavior green.

### Task 3: Page-Level Current User Reads

**Files:**
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/app/page.test.tsx`
- Modify: `apps/web/src/app/chat/page.tsx`
- Modify: `apps/web/src/app/chat/page.test.tsx`
- Modify: `apps/web/src/app/teacher/page.tsx`
- Modify: `apps/web/src/app/teacher/page.test.tsx`

- [ ] **Step 1: Write the failing page tests**

```ts
expect(screen.getByText("当前登录：Teacher Lin（老师）")).toBeInTheDocument();
```

```ts
expect(vi.mocked(getChatOverviewSafe)).toHaveBeenCalledWith("student-2");
```

- [ ] **Step 2: Run the focused page tests to verify RED**

Run: `pnpm --filter web exec vitest run src/app/page.test.tsx src/app/chat/page.test.tsx src/app/teacher/page.test.tsx`

Expected: FAIL because pages do not yet read browser session state.

- [ ] **Step 3: Add minimal current-user reads without touching leaf components**

```tsx
const session = loadSession();
const currentUserText = session ? `${session.user.displayName}（${roleLabel}）` : "未登录";
```

```tsx
const studentId = session?.user.role === "student" ? session.user.id : "student-1";
const { data: chatOverview } = await getChatOverviewSafe(studentId);
```

- [ ] **Step 4: Verify GREEN**

Run: `pnpm --filter web exec vitest run src/app/page.test.tsx src/app/chat/page.test.tsx src/app/teacher/page.test.tsx`

Expected: PASS with page-level current-user display and student routing behavior green.

### Task 4: Verification, Method, and Commit

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Add the method learned from this auth task**

```md
### 25. 登录态先收口成“后端真相 + 页面层读取”，不要把会话逻辑下沉到叶子组件
```

- [ ] **Step 2: Run task-level verification**

Run: `pnpm --filter api exec vitest run test/auth-flow.spec.ts`

Run: `pnpm --filter web exec vitest run src/lib/api-client.test.ts src/app/login/page.test.tsx src/app/page.test.tsx src/app/chat/page.test.tsx src/app/teacher/page.test.tsx`

Run: `pnpm --filter api build`

Run: `pnpm --filter web build`

Expected: PASS for both focused tests and both builds.

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md packages/contracts/src/auth.ts apps/api/src/modules/auth/auth.controller.ts apps/api/src/modules/auth/auth.service.ts apps/api/test/auth-flow.spec.ts apps/web/src/lib/api-client.ts apps/web/src/lib/session.ts apps/web/src/app/login/page.tsx apps/web/src/app/login/page.test.tsx apps/web/src/app/page.tsx apps/web/src/app/page.test.tsx apps/web/src/app/chat/page.tsx apps/web/src/app/chat/page.test.tsx apps/web/src/app/teacher/page.tsx apps/web/src/app/teacher/page.test.tsx
git commit -m "feat: add minimal auth session flow"
```
