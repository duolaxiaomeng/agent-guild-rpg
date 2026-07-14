"use client";

import { useCallback, useState } from "react";
import {
  runStudentQuestionSafe,
  type SopResult,
} from "../../lib/api-client";
import { loadSession } from "../../lib/session";

const EMPTY_SOP_RESULT: SopResult = {
  sopType: "student-question",
  steps: [],
  finalOutput: "",
  completedAt: "",
  degraded: true,
};

/**
 * SOP execution panel — lightweight version.
 *
 * Allows a student to ask a question and see the multi-agent
 * SOP flow (助教 → 答疑 → 综合回答) in action.
 */
export function SopPanel({ studentId }: { studentId: string }) {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<SopResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    if (!question.trim()) return;

    const session = loadSession();
    if (!session) {
      setError("请先登录");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await runStudentQuestionSafe(
        studentId,
        question.trim(),
        session.token,
      );
      setResult(res.data);
      if (res.degraded) {
        setError("SOP 服务暂不可达，显示降级结果");
      }
    } catch {
      setResult(EMPTY_SOP_RESULT);
      setError("SOP 执行失败");
    } finally {
      setLoading(false);
    }
  }, [question, studentId]);

  return (
    <section
      style={{
        marginTop: "24px",
        padding: "clamp(16px, 3vw, 22px)",
        background: "linear-gradient(145deg, rgba(13,24,48,0.94), rgba(7,13,28,0.94))",
        borderRadius: "8px",
        border: "1px solid rgba(150,178,221,0.22)",
        borderTop: "3px solid #9aafff",
        boxShadow: "0 5px 0 rgba(3,6,14,0.48)",
      }}
    >
      <div style={headerStyle}>
        <div>
          <span style={eyebrowStyle}>MULTI-AGENT TEACHING FLOW</span>
          <h2 style={headingStyle}>教学 Agent SOP 面板</h2>
        </div>
        <span style={{ ...statusBadgeStyle, color: result?.degraded ? "#ff9aa8" : "#8ce7d5", borderColor: result?.degraded ? "rgba(255,107,125,0.35)" : "rgba(80,214,186,0.35)" }}>
          <span aria-hidden="true">●</span>{result?.degraded ? "离线" : loading ? "协作中" : "待命"}
        </span>
      </div>

      {/* Question input */}
      <div style={questionRowStyle}>
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleSubmit();
          }}
          placeholder="输入你的问题，教学 Agent 群将协作解答..."
          disabled={loading}
          style={{
            flex: 1,
            minWidth: "min(100%, 220px)",
            minHeight: 40,
            padding: "9px 12px",
            background: "rgba(5,11,24,0.72)",
            border: "1px solid rgba(150,178,221,0.28)",
            borderRadius: "5px",
            color: "#e0e0f0",
            fontSize: "14px",
            outline: "none",
          }}
        />
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={loading || !question.trim()}
          style={{
            minHeight: 40,
            padding: "8px 16px",
            background: loading || !question.trim() ? "rgba(255,255,255,0.04)" : "rgba(118,146,255,0.16)",
            border: "1px solid rgba(154,175,255,0.36)",
            borderRadius: "5px",
            color: loading || !question.trim() ? "#71809d" : "#e6ebff",
            cursor: loading ? "wait" : !question.trim() ? "not-allowed" : "pointer",
            fontSize: "13px",
            fontWeight: 800,
            whiteSpace: "nowrap",
            boxShadow: loading || !question.trim() ? "none" : "0 2px 0 rgba(3,6,14,0.42)",
          }}
        >
          {loading ? "执行中..." : "发起 SOP"}
        </button>
      </div>

      {error ? (
        <p role="status" style={errorStyle}>
          {error}
        </p>
      ) : null}

      {/* SOP Steps */}
      {result && result.steps.length > 0 ? (
        <div style={{ display: "grid", gap: "12px" }}>
          {result.steps.map((step, index) => (
            <SopStepCard key={index} step={step} index={index} />
          ))}

          {/* Final Output */}
          <div
            style={{
              padding: "15px",
              background: "rgba(10,30,48,0.72)",
              borderRadius: "6px",
              border: "1px solid rgba(100,183,255,0.44)",
              borderLeft: "4px solid #64b7ff",
            }}
          >
            <h3
              style={{
                margin: "0 0 8px",
                fontSize: "14px",
                color: "#64b7ff",
                fontFamily: "var(--font-pixel)",
              }}
            >
              最终结果
            </h3>
            <p
              style={{
                margin: 0,
                color: "#c5cfe1",
                fontSize: "13px",
                whiteSpace: "pre-wrap",
                lineHeight: 1.6,
              }}
            >
              {result.finalOutput || "暂无最终结果"}
            </p>
            {result.completedAt ? (
              <p
                style={{
                  margin: "8px 0 0",
                  fontSize: "11px",
                  color: "#7183a4",
                }}
              >
                完成时间: {new Date(result.completedAt).toLocaleString("zh-CN")}
              </p>
            ) : null}
          </div>
        </div>
      ) : loading ? (
        <div
          style={{
            padding: "24px",
            textAlign: "center",
            color: "#8998b5",
            fontSize: "13px",
          }}
        >
          SOP 执行中，教学 Agent 群正在协作...
        </div>
      ) : null}
    </section>
  );
}

function SopStepCard({
  step,
  index,
}: {
  step: SopResult["steps"][number];
  index: number;
}) {
  const roleColors: Record<string, string> = {
    ta: "#4ade80",
    reviewer: "#fbbf24",
    mentor: "#a78bfa",
  };

  const color = roleColors[step.agentRole] ?? "#60a5fa";

  return (
    <div
      style={{
        padding: "14px",
        background: "rgba(20,32,63,0.7)",
        borderRadius: "6px",
        border: `1px solid ${color}33`,
        borderLeft: `4px solid ${color}`,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "8px",
        }}
      >
        <span
          style={{
            fontSize: "13px",
            fontFamily: "var(--font-pixel)",
            fontWeight: 800,
            color,
          }}
        >
          步骤 {index + 1}: {step.agentName}
        </span>
        {step.timestamp ? (
          <span style={{ fontSize: "11px", color: "#7183a4" }}>
            {new Date(step.timestamp).toLocaleTimeString("zh-CN")}
          </span>
        ) : null}
      </div>
      <p
        style={{
          margin: 0,
          color: "#c5cfe1",
          fontSize: "13px",
          whiteSpace: "pre-wrap",
          lineHeight: 1.6,
        }}
      >
        {step.output}
      </p>
    </div>
  );
}

const headerStyle: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 14 };
const eyebrowStyle: React.CSSProperties = { display: "block", color: "#8998b5", fontFamily: "var(--font-pixel)", fontSize: 9, fontWeight: 800, letterSpacing: "0.12em" };
const headingStyle: React.CSSProperties = { margin: "3px 0 0", color: "#f5f7ff", fontFamily: "var(--font-pixel)", fontSize: 18 };
const statusBadgeStyle: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 8px", border: "1px solid", borderRadius: 999, background: "rgba(5,11,24,0.3)", fontSize: 10, fontWeight: 800 };
const questionRowStyle: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16, padding: 11, border: "1px solid rgba(150,178,221,0.17)", borderRadius: 6, background: "rgba(5,11,24,0.26)" };
const errorStyle: React.CSSProperties = { margin: "0 0 12px", padding: "8px 10px", border: "1px solid rgba(255,107,125,0.3)", borderRadius: 5, background: "rgba(255,107,125,0.07)", color: "#ff9aa8", fontSize: 12 };
