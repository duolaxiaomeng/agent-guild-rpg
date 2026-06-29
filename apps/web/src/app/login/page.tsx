"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "../../lib/api-client";
import { saveSession } from "../../lib/session";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const session = await login({ email, password });
      saveSession(session);
      router.push(session.user.role === "teacher" ? "/teacher" : "/chat");
    } catch {
      setErrorMessage("登录失败，请检查邮箱和密码。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main>
      <h1>登录</h1>
      <p>使用教学世界账号进入当前会话。</p>
      <form onSubmit={(event) => void handleSubmit(event)}>
        <label>
          邮箱
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          密码
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "登录中..." : "登录"}
        </button>
      </form>
      {errorMessage ? <p>{errorMessage}</p> : null}
    </main>
  );
}
