"use client";

import { useMemo, useState, type CSSProperties } from "react";
import {
  createAgentAssignment,
  getAgentAssignments,
  type AgentAssignmentRun,
  type CreateAgentAssignment,
} from "../../lib/api-client";

type StudentOption = {
  id: string;
  displayName: string;
};

type AgentAssignmentBoardProps = {
  initialRuns: AgentAssignmentRun[];
  students: StudentOption[];
  courseWorldId?: string;
  defaultDayId?: string;
  token: string;
};

export function AgentAssignmentBoard({
  initialRuns,
  students,
  courseWorldId,
  defaultDayId,
  token,
}: AgentAssignmentBoardProps) {
  const [runs, setRuns] = useState(initialRuns);
  const [studentId, setStudentId] = useState(students[0]?.id ?? "");
  const [dayId, setDayId] = useState(defaultDayId ?? "");
  const [provider, setProvider] = useState("codex-cli");
  const [instruction, setInstruction] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const studentNames = useMemo(
    () => new Map(students.map((student) => [student.id, student.displayName])),
    [students],
  );

  async function dispatchTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!studentId || !courseWorldId || !dayId || !instruction.trim()) {
      setError("请选择学生、课程 Day，并填写可执行指令。");
      return;
    }

    const payload: CreateAgentAssignment = {
      runId: createRunId(dayId, studentId),
      studentId,
      provider,
      input: { instruction: instruction.trim() },
      courseWorldId,
      dayId,
      requiredCapabilities: ["provider-process"],
      resourceClass: "heavy",
      maxAttempts: 3,
    };

    setSubmitting(true);
    setFeedback(null);
    setError(null);
    try {
      const created = await createAgentAssignment(payload, token);
      try {
        setRuns(await getAgentAssignments(token));
      } catch {
        setRuns((current) => [created, ...current]);
      }
      setInstruction("");
      setFeedback("任务已派发，等待学生 Connector 领取。");
    } catch {
      setError("任务派发失败，请检查学生 Connector Provider 和任务范围后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section aria-labelledby="agent-assignment-title" style={sectionStyle}>
      <div style={headerStyle}>
        <div>
          <span style={eyebrowStyle}>AGENT CONTROL PLANE</span>
          <h2 id="agent-assignment-title" style={titleStyle}>学生 Agent 任务派发</h2>
          <p style={descriptionStyle}>任务由学生本机 Connector 领取，真实执行结果回传后由学生确认提交。</p>
        </div>
        <span style={countStyle}>{runs.length} 个运行</span>
      </div>

      <form onSubmit={dispatchTask} style={formStyle}>
        <label style={fieldStyle}>
          <span>派发学生</span>
          <select
            aria-label="派发学生"
            value={studentId}
            onChange={(event) => setStudentId(event.target.value)}
            style={inputStyle}
          >
            <option value="">选择学生</option>
            {students.map((student) => (
              <option key={student.id} value={student.id}>{student.displayName}</option>
            ))}
          </select>
        </label>
        <label style={fieldStyle}>
          <span>课程 Day</span>
          <input
            aria-label="课程 Day"
            value={dayId}
            onChange={(event) => setDayId(event.target.value)}
            placeholder="day-1"
            style={inputStyle}
          />
        </label>
        <label style={fieldStyle}>
          <span>本机 Provider</span>
          <select
            aria-label="本机 Provider"
            value={provider}
            onChange={(event) => setProvider(event.target.value)}
            style={inputStyle}
          >
            <option value="codex-cli">Codex CLI</option>
            <option value="claude-code">Claude Code</option>
          </select>
        </label>
        <label style={{ ...fieldStyle, gridColumn: "1 / -1" }}>
          <span>Agent 执行指令</span>
          <textarea
            aria-label="Agent 执行指令"
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            placeholder="例如：阅读 Day 任务，完成页面实现并运行相关测试；不要提交或推送代码。"
            rows={4}
            style={{ ...inputStyle, resize: "vertical" }}
          />
        </label>
        <button
          type="submit"
          disabled={submitting || !students.length || !courseWorldId}
          style={buttonStyle}
        >
          {submitting ? "派发中..." : "派发给学生 Agent"}
        </button>
      </form>

      {feedback ? <p role="status" style={successStyle}>{feedback}</p> : null}
      {error ? <p role="alert" style={errorStyle}>{error}</p> : null}

      <div style={listStyle}>
        {runs.length === 0 ? (
          <p style={emptyStyle}>暂无 Agent 运行任务。学生上线并连接 Connector 后即可派发。</p>
        ) : runs.map((run) => (
          <article key={run.id} style={cardStyle}>
            <div style={cardHeaderStyle}>
              <div>
                <strong>{studentNames.get(run.studentId) ?? run.studentId}</strong>
                <span style={metaStyle}>{run.dayId ?? "未绑定 Day"} · {run.provider}</span>
              </div>
              <span style={statusStyle(run.status)}>{statusLabel(run.status)}</span>
            </div>
            <p style={instructionStyle}>{readInstruction(run)}</p>
            {run.failureReason ? <p style={errorStyle}>{run.failureReason}</p> : null}
            {readOutput(run) ? <pre style={outputStyle}>{readOutput(run)}</pre> : null}
            {run.submission ? (
              <p style={successStyle}>已进入评审：{reviewLabel(run.submission.reviewStatus)}</p>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function createRunId(dayId: string, studentId: string) {
  const suffix = globalThis.crypto?.randomUUID?.().slice(0, 8)
    ?? Date.now().toString(36);
  return `${dayId}-${studentId}-${suffix}`.slice(0, 128);
}

function readInstruction(run: AgentAssignmentRun) {
  if (run.input && typeof run.input === "object" && !Array.isArray(run.input)) {
    const instruction = (run.input as Record<string, unknown>).instruction;
    if (typeof instruction === "string") return instruction;
  }
  return "未提供可展示的任务指令";
}

function readOutput(run: AgentAssignmentRun) {
  return typeof run.result?.output === "string" ? run.result.output : "";
}

function statusLabel(status: AgentAssignmentRun["status"]) {
  const labels: Record<AgentAssignmentRun["status"], string> = {
    blocked: "等待依赖",
    queued: "等待领取",
    leased: "已领取",
    running: "执行中",
    completed: "已完成",
    failed: "执行失败",
    needs_teacher: "需要老师处理",
    cancelled: "已取消",
  };
  return labels[status];
}

function reviewLabel(status: NonNullable<AgentAssignmentRun["submission"]>["reviewStatus"]) {
  if (status === "queued") return "AI 评审中";
  if (status === "ai_reviewed") return "等待老师裁定";
  if (status === "teacher_decided") return "老师已裁定";
  return "需要老师处理";
}

function statusStyle(status: AgentAssignmentRun["status"]): CSSProperties {
  const color = status === "completed"
    ? "#8ce7d5"
    : status === "failed" || status === "needs_teacher"
      ? "#fca5a5"
      : "#ffd789";
  return { padding: "4px 7px", border: `1px solid ${color}55`, borderRadius: 999, color, fontSize: 11, fontWeight: 800 };
}

const sectionStyle: CSSProperties = { marginTop: 24, padding: 20, border: "1px solid rgba(100,183,255,0.3)", borderTop: "3px solid #64b7ff", borderRadius: 8, background: "linear-gradient(145deg, rgba(13,24,48,.96), rgba(5,11,24,.96))", boxShadow: "0 5px 0 rgba(3,6,14,.48)" };
const headerStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" };
const eyebrowStyle: CSSProperties = { color: "#64b7ff", fontFamily: "var(--font-pixel)", fontSize: 10, fontWeight: 900, letterSpacing: ".14em" };
const titleStyle: CSSProperties = { margin: "5px 0 7px", color: "#fff", fontFamily: "var(--font-pixel)", fontSize: 19 };
const descriptionStyle: CSSProperties = { margin: 0, color: "#aebbd2", fontSize: 13, lineHeight: 1.6 };
const countStyle: CSSProperties = { padding: "5px 9px", border: "1px solid rgba(100,183,255,.32)", borderRadius: 999, color: "#b9ddff", fontSize: 11 };
const formStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginTop: 18, padding: 15, border: "1px solid rgba(150,178,221,.18)", borderRadius: 7, background: "rgba(5,11,24,.34)" };
const fieldStyle: CSSProperties = { display: "grid", gap: 6, color: "#cbd6eb", fontSize: 12, fontWeight: 700 };
const inputStyle: CSSProperties = { width: "100%", minHeight: 40, padding: "9px 10px", border: "1px solid rgba(150,178,221,.28)", borderRadius: 5, background: "rgba(5,11,24,.76)", color: "#f7f9ff", font: "inherit" };
const buttonStyle: CSSProperties = { minHeight: 40, padding: "9px 14px", border: "1px solid rgba(80,214,186,.5)", borderRadius: 5, background: "rgba(31,117,105,.78)", color: "#f2fffc", cursor: "pointer", fontWeight: 800 };
const listStyle: CSSProperties = { display: "grid", gap: 10, marginTop: 16 };
const cardStyle: CSSProperties = { padding: 14, border: "1px solid rgba(150,178,221,.2)", borderRadius: 7, background: "rgba(20,32,63,.64)" };
const cardHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" };
const metaStyle: CSSProperties = { display: "block", marginTop: 4, color: "#8292b2", fontSize: 11 };
const instructionStyle: CSSProperties = { margin: "10px 0 0", color: "#cbd6eb", fontSize: 13, lineHeight: 1.55 };
const outputStyle: CSSProperties = { maxHeight: 180, overflow: "auto", margin: "10px 0 0", padding: 10, borderRadius: 5, background: "#060b17", color: "#b9f6e7", fontSize: 11, whiteSpace: "pre-wrap" };
const successStyle: CSSProperties = { margin: "10px 0 0", color: "#8ce7d5", fontSize: 12 };
const errorStyle: CSSProperties = { margin: "10px 0 0", color: "#fca5a5", fontSize: 12 };
const emptyStyle: CSSProperties = { margin: 0, color: "#8292b2", fontSize: 13 };
