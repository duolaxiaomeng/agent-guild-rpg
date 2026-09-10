"use client";

import { useState, type CSSProperties } from "react";
import {
  confirmAgentAssignment,
  type AgentAssignmentRun,
} from "../../lib/api-client";

type StudentAgentAssignmentsProps = {
  initialRuns: AgentAssignmentRun[];
  token: string;
};

export function StudentAgentAssignments({
  initialRuns,
  token,
}: StudentAgentAssignmentsProps) {
  const [runs, setRuns] = useState(initialRuns);
  const [reflections, setReflections] = useState<Record<string, string>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submitRun(run: AgentAssignmentRun) {
    const selfReflection = reflections[run.id]?.trim() ?? "";
    if (selfReflection.length < 20) {
      setErrors((current) => ({
        ...current,
        [run.id]: "请至少填写 20 个字符的学习反思，再确认提交。",
      }));
      return;
    }

    setSubmittingId(run.id);
    setErrors((current) => ({ ...current, [run.id]: "" }));
    try {
      const response = await confirmAgentAssignment(
        { runId: run.runId, selfReflection },
        token,
      );
      setRuns((current) => current.map((item) => item.id === run.id
        ? {
            ...item,
            submission: {
              id: response.submission.id,
              reviewStatus: "queued",
              decision: null,
            },
          }
        : item));
      setFeedback((current) => ({
        ...current,
        [run.id]: response.queue.status === "queued"
          ? "真实执行证据已提交，等待 AI 初评。"
          : "真实执行证据已保存，评审队列恢复后会自动处理。",
      }));
    } catch {
      setErrors((current) => ({
        ...current,
        [run.id]: "提交失败，请确认任务已完成且尚无待处理评审。",
      }));
    } finally {
      setSubmittingId(null);
    }
  }

  return (
    <section aria-labelledby="student-agent-runs-title" style={sectionStyle}>
      <span style={eyebrowStyle}>ASSIGNED RUNS / REAL EVIDENCE</span>
      <h2 id="student-agent-runs-title" style={titleStyle}>我的 Agent 执行任务</h2>
      <p style={descriptionStyle}>Connector 会自动领取老师派发的任务。结果回传后，请先核对真实输出，再由你确认提交。</p>

      <div style={listStyle}>
        {runs.length === 0 ? (
          <p style={emptyStyle}>暂时没有老师派发的 Agent 任务。</p>
        ) : runs.map((run) => {
          const output = typeof run.result?.output === "string"
            ? run.result.output
            : "";
          const canSubmit = run.status === "completed" && !run.submission;
          return (
            <article id={`agent-run-${run.id}`} key={run.id} style={cardStyle}>
              <div style={headerStyle}>
                <div>
                  <strong style={{ color: "#fff" }}>{readInstruction(run)}</strong>
                  <span style={metaStyle}>{run.dayId ?? "未绑定 Day"} · {run.provider}</span>
                </div>
                <span style={statusStyle(run)}>{runStatusLabel(run)}</span>
              </div>

              {output ? (
                <div style={{ marginTop: 12 }}>
                  <span style={outputLabelStyle}>Connector 真实回传输出</span>
                  <pre style={outputStyle}>{output}</pre>
                  <p style={evidenceMetaStyle}>
                    退出码 {run.result?.exitCode ?? "未知"} · 耗时 {run.result?.durationMs ?? "未知"}ms
                    {run.result?.outputTruncated ? " · 输出已截断" : ""}
                  </p>
                </div>
              ) : null}

              {canSubmit ? (
                <div style={confirmStyle}>
                  <label style={fieldStyle}>
                    <span>学习反思</span>
                    <textarea
                      aria-label="学习反思"
                      value={reflections[run.id] ?? ""}
                      onChange={(event) => setReflections((current) => ({
                        ...current,
                        [run.id]: event.target.value,
                      }))}
                      rows={3}
                      placeholder="说明你核对了哪些结果、学到了什么，以及是否存在需要老师关注的问题。"
                      style={textareaStyle}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void submitRun(run)}
                    disabled={submittingId === run.id}
                    style={buttonStyle}
                  >
                    {submittingId === run.id ? "提交中..." : "确认提交评审"}
                  </button>
                </div>
              ) : null}

              {feedback[run.id] ? <p role="status" style={successStyle}>{feedback[run.id]}</p> : null}
              {errors[run.id] ? <p role="alert" style={errorStyle}>{errors[run.id]}</p> : null}
              {run.failureReason ? <p style={errorStyle}>{run.failureReason}</p> : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function readInstruction(run: AgentAssignmentRun) {
  if (run.input && typeof run.input === "object" && !Array.isArray(run.input)) {
    const instruction = (run.input as Record<string, unknown>).instruction;
    if (typeof instruction === "string") return instruction;
  }
  return `Agent 任务 ${run.runId}`;
}

function runStatusLabel(run: AgentAssignmentRun) {
  if (run.submission) return reviewStatusLabel(run.submission.reviewStatus);
  const labels: Record<AgentAssignmentRun["status"], string> = {
    blocked: "等待依赖",
    queued: "等待 Connector 领取",
    leased: "Connector 已领取",
    running: "本机执行中",
    completed: "等待学生确认",
    failed: "执行失败",
    needs_teacher: "需要老师处理",
    cancelled: "任务已取消",
  };
  return labels[run.status];
}

function reviewStatusLabel(status: NonNullable<AgentAssignmentRun["submission"]>["reviewStatus"]) {
  if (status === "queued") return "AI 评审中";
  if (status === "ai_reviewed") return "AI 初评完成，等待老师裁定";
  if (status === "teacher_decided") return "老师已完成最终裁定";
  return "需要老师人工处理";
}

function statusStyle(run: AgentAssignmentRun): CSSProperties {
  const positive = run.status === "completed" || run.submission?.reviewStatus === "teacher_decided";
  const danger = run.status === "failed" || run.status === "needs_teacher";
  const color = positive ? "#8ce7d5" : danger ? "#fca5a5" : "#ffd789";
  return { padding: "4px 7px", border: `1px solid ${color}55`, borderRadius: 999, color, fontSize: 11, fontWeight: 800 };
}

const sectionStyle: CSSProperties = { marginTop: 22, padding: "clamp(18px,3vw,24px)", border: "1px solid rgba(80,214,186,.25)", borderTop: "3px solid #50d6ba", borderRadius: 10, background: "linear-gradient(145deg,rgba(13,34,46,.94),rgba(7,13,28,.95))", boxShadow: "0 5px 0 rgba(3,6,14,.5)" };
const eyebrowStyle: CSSProperties = { color: "#50d6ba", fontFamily: "var(--font-pixel)", fontSize: 10, fontWeight: 900, letterSpacing: ".14em" };
const titleStyle: CSSProperties = { margin: "6px 0 8px", color: "#fff", fontFamily: "var(--font-pixel)", fontSize: 20 };
const descriptionStyle: CSSProperties = { maxWidth: 760, margin: 0, color: "#aebbd2", fontSize: 13, lineHeight: 1.6 };
const listStyle: CSSProperties = { display: "grid", gap: 12, marginTop: 18 };
const cardStyle: CSSProperties = { padding: 15, border: "1px solid rgba(150,178,221,.2)", borderRadius: 7, background: "rgba(20,32,63,.62)", scrollMarginTop: 20 };
const headerStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" };
const metaStyle: CSSProperties = { display: "block", marginTop: 5, color: "#8292b2", fontSize: 11 };
const outputLabelStyle: CSSProperties = { color: "#8ce7d5", fontSize: 11, fontWeight: 800 };
const outputStyle: CSSProperties = { maxHeight: 240, overflow: "auto", margin: "6px 0 0", padding: 11, borderRadius: 5, background: "#060b17", color: "#b9f6e7", fontSize: 11, lineHeight: 1.55, whiteSpace: "pre-wrap" };
const evidenceMetaStyle: CSSProperties = { margin: "6px 0 0", color: "#8292b2", fontSize: 11 };
const confirmStyle: CSSProperties = { display: "grid", gap: 9, marginTop: 13, padding: 12, border: "1px solid rgba(246,200,95,.2)", borderRadius: 6, background: "rgba(35,28,10,.2)" };
const fieldStyle: CSSProperties = { display: "grid", gap: 6, color: "#dce5f8", fontSize: 12, fontWeight: 700 };
const textareaStyle: CSSProperties = { width: "100%", padding: 10, border: "1px solid rgba(150,178,221,.28)", borderRadius: 5, background: "rgba(5,11,24,.76)", color: "#f7f9ff", font: "inherit", resize: "vertical" };
const buttonStyle: CSSProperties = { justifySelf: "start", minHeight: 38, padding: "8px 13px", border: "1px solid rgba(80,214,186,.5)", borderRadius: 5, background: "rgba(31,117,105,.78)", color: "#f2fffc", cursor: "pointer", fontWeight: 800 };
const successStyle: CSSProperties = { margin: "10px 0 0", color: "#8ce7d5", fontSize: 12 };
const errorStyle: CSSProperties = { margin: "10px 0 0", color: "#fca5a5", fontSize: 12 };
const emptyStyle: CSSProperties = { margin: 0, color: "#8292b2", fontSize: 13 };
