"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { login, register } from "../../lib/api-client";
import { saveSession } from "../../lib/session";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [registrationCode, setRegistrationCode] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [forgotInfo, setForgotInfo] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const session =
        mode === "register"
          ? await register({ displayName, email, password, registrationCode })
          : await login({ email, password });
      saveSession(session);
      router.push(session.user.role === "teacher" ? "/teacher" : "/");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (
        message.includes("Failed to fetch") ||
        message.includes("abort") ||
        message.includes("fetch")
      ) {
        setErrorMessage("网络连接失败，请检查网络后重试。");
      } else if (mode === "register" && message.includes(": 403")) {
        setErrorMessage("内部注册码无效，请联系老师确认。");
      } else if (mode === "register" && message.includes(": 409")) {
        setErrorMessage("该邮箱已经注册，请直接登录。");
      } else if (message.includes(": 401")) {
        setErrorMessage("邮箱或密码错误，请重新输入。");
      } else {
        setErrorMessage("登录服务暂时不可用，请稍后重试。");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function clearError() {
    if (errorMessage) {
      setErrorMessage(null);
    }
  }

  function switchMode(nextMode: "login" | "register") {
    setMode(nextMode);
    setErrorMessage(null);
    setForgotInfo(false);
  }

  return (
    <main className="login-page" data-scrollable="true">
      <section className="login-card" aria-labelledby="login-title">
        <header className="login-brand">
          <div className="login-brand__crest" aria-hidden="true">
            A·G
          </div>
          <p className="login-brand__eyebrow">像素教学世界入口</p>
          <h1 className="login-brand__title" id="login-title">
            Agent Guild
          </h1>
          <p className="login-brand__subtitle">
            {mode === "login"
              ? "登录你的教学世界账号，继续冒险之旅"
              : "输入老师提供的内部注册码，创建学生账号"}
          </p>
        </header>

        {errorMessage ? (
          <div className="login-alert" id="login-error" role="alert">
            <span className="login-alert__icon" aria-hidden="true">
              !
            </span>
            <span>{errorMessage}</span>
          </div>
        ) : null}

        {forgotInfo ? (
          <div
            className="login-alert login-alert--info"
            id="forgot-password-info"
            role="status"
          >
            <span className="login-alert__icon" aria-hidden="true">
              i
            </span>
            <span>请联系老师重置密码。</span>
          </div>
        ) : null}

        <form className="login-form" onSubmit={(event) => void handleSubmit(event)}>
          {mode === "register" ? (
            <label className="login-field" htmlFor="register-display-name">
              <span className="login-field__label">显示名称</span>
              <input
                className="login-field__input"
                id="register-display-name"
                type="text"
                value={displayName}
                onChange={(event) => {
                  setDisplayName(event.target.value);
                  clearError();
                }}
                placeholder="例如：小林"
                autoComplete="name"
                minLength={2}
                maxLength={40}
                required
              />
            </label>
          ) : null}

          <label className="login-field" htmlFor="login-email">
            <span className="login-field__label">邮箱</span>
            <input
              className="login-field__input"
              id="login-email"
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                clearError();
              }}
              placeholder="your@email.com"
              autoComplete="email"
              aria-invalid={errorMessage ? "true" : undefined}
              aria-describedby={errorMessage ? "login-error" : undefined}
              required
            />
          </label>

          <label className="login-field" htmlFor="login-password">
            <span className="login-field__label">密码</span>
            <input
              className="login-field__input"
              id="login-password"
              type="password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                clearError();
              }}
              placeholder="输入密码"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={mode === "register" ? 8 : undefined}
              aria-invalid={errorMessage ? "true" : undefined}
              aria-describedby={errorMessage ? "login-error" : undefined}
              required
            />
          </label>

          {mode === "register" ? (
            <label className="login-field" htmlFor="registration-code">
              <span className="login-field__label">内部注册码</span>
              <input
                className="login-field__input"
                id="registration-code"
                type="password"
                value={registrationCode}
                onChange={(event) => {
                  setRegistrationCode(event.target.value);
                  clearError();
                }}
                placeholder="输入老师提供的注册码"
                autoComplete="off"
                aria-invalid={errorMessage ? "true" : undefined}
                aria-describedby={errorMessage ? "login-error" : undefined}
                required
              />
            </label>
          ) : null}

          <button
            className="login-submit-button"
            type="submit"
            disabled={isSubmitting}
            aria-busy={isSubmitting}
          >
            {isSubmitting
              ? mode === "login"
                ? "登录中..."
                : "注册中..."
              : mode === "login"
                ? "登录"
                : "注册并进入世界"}
          </button>
        </form>

        <footer className="login-card__footer">
          {mode === "login" ? (
            <>
              <button
                className="login-forgot-button"
                type="button"
                aria-controls="forgot-password-info"
                aria-expanded={forgotInfo}
                onClick={() => setForgotInfo((visible) => !visible)}
              >
                忘记密码？
              </button>
              <button
                className="login-forgot-button"
                type="button"
                onClick={() => switchMode("register")}
              >
                没有账号？注册
              </button>
            </>
          ) : (
            <button
              className="login-forgot-button"
              type="button"
              onClick={() => switchMode("login")}
            >
              已有账号？登录
            </button>
          )}
        </footer>
      </section>
    </main>
  );
}
