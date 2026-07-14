"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import {
  createTeacherTask,
  getTeacherTaskProgress,
  type CreateTeacherTaskInput,
  type TeacherTaskProgressPayload
} from "../../lib/api-client";

type TeacherTaskBoardProps = {
  initialTasks: TeacherTaskProgressPayload[];
  courseWorldId: string;
  defaultDayId: string;
  token: string;
};

type Feedback = {
  tone: "success" | "warning" | "error";
  message: string;
} | null;

export function TeacherTaskBoard({
  initialTasks,
  courseWorldId,
  defaultDayId,
  token
}: TeacherTaskBoardProps) {
  const [tasks, setTasks] = useState(initialTasks);
  const [dayId, setDayId] = useState(defaultDayId);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [homework, setHomework] = useState("");
  const [criteria, setCriteria] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const acceptanceCriteria = criteria
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);

    if (!courseWorldId) {
      setFeedback({ tone: "error", message: "当前课程世界不可用，暂时无法发布任务。" });
      return;
    }

    if (acceptanceCriteria.length === 0) {
      setFeedback({ tone: "error", message: "请至少填写一条验收标准。" });
      return;
    }

    const payload: CreateTeacherTaskInput = {
      courseWorldId,
      dayId: dayId.trim(),
      title: title.trim(),
      status: "open",
      description: description.trim(),
      homework: homework.trim(),
      acceptanceCriteria,
      dueAt: dueAt ? new Date(dueAt).toISOString() : null,
      publishedAt: new Date().toISOString()
    };

    setSubmitting(true);
    setFeedback(null);
    try {
      await createTeacherTask(payload, token);
      setTitle("");
      setDescription("");
      setHomework("");
      setCriteria("");
      setDueAt("");

      try {
        const refreshedTasks = await getTeacherTaskProgress(token);
        setTasks(refreshedTasks);
        setDayId(getNextDayId(refreshedTasks));
        setFeedback({ tone: "success", message: "任务已发布，学生作业进度已刷新。" });
      } catch {
        setFeedback({
          tone: "warning",
          message: "任务已发布，但进度刷新失败，请稍后刷新页面。"
        });
      }
    } catch {
      setFeedback({
        tone: "error",
        message: "任务发布失败，请检查 Day 编号是否重复或稍后重试。"
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section aria-labelledby="teacher-task-title" style={sectionStyle}>
      <div style={headingRowStyle}>
        <div>
          <span style={eyebrowStyle}>ASSIGNMENT OPERATIONS</span>
          <h2 id="teacher-task-title" style={titleStyle}>任务发布与作业进度</h2>
          <p style={descriptionStyle}>发布每日作业，并依据真实提交和评审记录查看全班进度。</p>
        </div>
        <span style={countBadgeStyle}>{tasks.length} 项任务</span>
      </div>

      <div style={contentGridStyle}>
        <form onSubmit={handleSubmit} style={formStyle}>
          <div style={formHeadingStyle}>
            <span aria-hidden="true" style={formIconStyle}>＋</span>
            <div>
              <h3 style={formTitleStyle}>发布每日作业</h3>
              <p style={formHintStyle}>发布后会立即进入学生任务列表。</p>
            </div>
          </div>

          <div style={twoColumnStyle}>
            <Field label="Day 编号">
              <input
                required
                value={dayId}
                onChange={(event) => setDayId(event.target.value)}
                placeholder="day-3"
                style={inputStyle}
              />
            </Field>
            <Field label="截止时间（可选）">
              <input
                type="datetime-local"
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
                style={inputStyle}
              />
            </Field>
          </div>

          <Field label="任务标题">
            <input
              required
              maxLength={200}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="例如：完成第一个可调用工具的 Agent"
              style={inputStyle}
            />
          </Field>

          <Field label="课堂任务说明">
            <textarea
              required
              maxLength={4000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="说明今天要学习和完成的内容"
              rows={3}
              style={textareaStyle}
            />
          </Field>

          <Field label="每日作业">
            <textarea
              required
              maxLength={4000}
              value={homework}
              onChange={(event) => setHomework(event.target.value)}
              placeholder="写清楚学生需要提交的成果"
              rows={3}
              style={textareaStyle}
            />
          </Field>

          <Field label="验收标准（每行一条）">
            <textarea
              required
              value={criteria}
              onChange={(event) => setCriteria(event.target.value)}
              placeholder={"Agent 能完成指定目标\n提交运行记录与结果说明"}
              rows={3}
              style={textareaStyle}
            />
          </Field>

          {feedback ? (
            <p
              role={feedback.tone === "error" ? "alert" : "status"}
              style={{
                ...feedbackStyle,
                color: feedback.tone === "success"
                  ? "#8ce7d5"
                  : feedback.tone === "warning"
                    ? "#ffd789"
                    : "#fca5a5"
              }}
            >
              {feedback.message}
            </p>
          ) : null}

          <button type="submit" disabled={submitting || !courseWorldId} style={submitButtonStyle}>
            {submitting ? "正在发布..." : "发布任务"}
          </button>
        </form>

        <div style={taskListStyle}>
          <div style={listHeaderStyle}>
            <h3 style={listTitleStyle}>全班进度</h3>
            <span style={listHintStyle}>按最新提交状态统计</span>
          </div>
          {tasks.length === 0 ? (
            <div style={emptyStyle}>暂无已发布任务。发布后会在这里显示真实作业进度。</div>
          ) : (
            tasks.map((task) => <TaskProgressCard key={task.dayId} task={task} />)
          )}
        </div>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={fieldStyle}>
      <span style={labelStyle}>{label}</span>
      {children}
    </label>
  );
}

function TaskProgressCard({ task }: { task: TeacherTaskProgressPayload }) {
  return (
    <article style={taskCardStyle}>
      <div style={taskHeaderStyle}>
        <div>
          <span style={dayBadgeStyle}>{toDayLabel(task.dayId)}</span>
          <h4 style={taskTitleStyle}>{task.title}</h4>
        </div>
        <span style={dueStyle}>{task.dueAt ? `${formatDate(task.dueAt)} 截止` : "不设截止"}</span>
      </div>

      <p style={homeworkStyle}>{task.homework}</p>
      <div aria-label={`${task.title}进度统计`} style={metricGridStyle}>
        <Metric label="全班" value={task.summary.total} color="#dce5f8" />
        <Metric label="未开始" value={task.summary.notStarted} color="#94a3b8" />
        <Metric label="已提交" value={task.summary.submitted} color="#f8bd58" />
        <Metric label="已评审" value={task.summary.reviewed} color="#50d6ba" />
      </div>

      <details style={detailsStyle}>
        <summary style={summaryStyle}>查看学生明细</summary>
        <div style={studentListStyle}>
          {task.students.length === 0 ? (
            <span style={studentEmptyStyle}>当前课程暂无学生。</span>
          ) : task.students.map((student) => (
            <div key={student.studentId} style={studentRowStyle}>
              <span style={studentNameStyle}>{student.displayName}</span>
              <span style={{ ...studentStatusStyle, color: progressColor(student.status) }}>
                {progressLabel(student.status)}
              </span>
            </div>
          ))}
        </div>
      </details>
    </article>
  );
}

function Metric({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={metricStyle}>
      <strong style={{ color, fontSize: 18 }}>{value}</strong>
      <span style={metricLabelStyle}>{label}</span>
    </div>
  );
}

export function getNextDayId(tasks: Array<Pick<TeacherTaskProgressPayload, "dayId">>) {
  const maxDay = tasks.reduce((currentMax, task) => {
    const match = /^day-(\d+)$/i.exec(task.dayId);
    return match ? Math.max(currentMax, Number(match[1])) : currentMax;
  }, 0);
  return `day-${maxDay + 1}`;
}

function toDayLabel(dayId: string) {
  const match = /^day-(\d+)$/i.exec(dayId);
  return match ? `DAY ${match[1]}` : dayId.toUpperCase();
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间待定";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function progressLabel(status: TeacherTaskProgressPayload["students"][number]["status"]) {
  if (status === "reviewed") return "已评审";
  if (status === "submitted") return "已提交";
  return "未开始";
}

function progressColor(status: TeacherTaskProgressPayload["students"][number]["status"]) {
  if (status === "reviewed") return "#50d6ba";
  if (status === "submitted") return "#f8bd58";
  return "#94a3b8";
}

const sectionStyle: CSSProperties = { marginTop: 24, padding: "clamp(18px, 3vw, 24px)", border: "1px solid rgba(150,178,221,0.2)", borderRadius: 12, background: "rgba(13,24,46,0.78)", boxShadow: "0 5px 0 rgba(3,6,14,0.44)" };
const headingRowStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 18 };
const eyebrowStyle: CSSProperties = { color: "#50d6ba", fontFamily: "var(--font-pixel)", fontSize: 9, fontWeight: 800, letterSpacing: "0.12em" };
const titleStyle: CSSProperties = { margin: "3px 0 5px", color: "#fff", fontFamily: "var(--font-pixel)", fontSize: 20 };
const descriptionStyle: CSSProperties = { margin: 0, color: "#9eabc2", fontSize: 12, lineHeight: 1.55 };
const countBadgeStyle: CSSProperties = { flex: "0 0 auto", padding: "5px 9px", border: "1px solid rgba(80,214,186,0.34)", borderRadius: 999, background: "rgba(80,214,186,0.08)", color: "#a7eee0", fontSize: 11, fontWeight: 800 };
const contentGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))", gap: 18, alignItems: "start" };
const formStyle: CSSProperties = { display: "grid", gap: 12, padding: 16, border: "1px solid rgba(100,183,255,0.22)", borderTop: "3px solid #64b7ff", borderRadius: 8, background: "rgba(5,11,24,0.38)" };
const formHeadingStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 10, marginBottom: 2 };
const formIconStyle: CSSProperties = { display: "grid", width: 32, height: 32, placeItems: "center", border: "1px solid rgba(100,183,255,0.42)", borderRadius: 5, background: "rgba(100,183,255,0.12)", color: "#8dcbff", fontSize: 19 };
const formTitleStyle: CSSProperties = { margin: 0, color: "#fff", fontFamily: "var(--font-pixel)", fontSize: 14 };
const formHintStyle: CSSProperties = { margin: "2px 0 0", color: "#8798b8", fontSize: 11 };
const twoColumnStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 };
const fieldStyle: CSSProperties = { display: "grid", gap: 5 };
const labelStyle: CSSProperties = { color: "#c7d1e4", fontSize: 11, fontWeight: 800 };
const inputStyle: CSSProperties = { width: "100%", minHeight: 38, padding: "8px 10px", border: "1px solid rgba(150,178,221,0.26)", borderRadius: 5, outline: "none", background: "rgba(2,6,18,0.62)", color: "#f5f7ff", font: "inherit", boxSizing: "border-box" };
const textareaStyle: CSSProperties = { ...inputStyle, minHeight: 72, resize: "vertical", lineHeight: 1.5 };
const feedbackStyle: CSSProperties = { margin: 0, padding: "9px 10px", border: "1px solid currentColor", borderRadius: 5, background: "rgba(5,11,24,0.34)", fontSize: 12, lineHeight: 1.5 };
const submitButtonStyle: CSSProperties = { minHeight: 40, border: "1px solid rgba(80,214,186,0.54)", borderRadius: 5, background: "linear-gradient(145deg, rgba(31,117,105,0.9), rgba(16,76,71,0.92))", boxShadow: "0 3px 0 rgba(3,6,14,0.5)", color: "#f2fffc", cursor: "pointer", fontFamily: "var(--font-pixel)", fontSize: 12, fontWeight: 800 };
const taskListStyle: CSSProperties = { display: "grid", gap: 12 };
const listHeaderStyle: CSSProperties = { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 };
const listTitleStyle: CSSProperties = { margin: 0, color: "#fff", fontFamily: "var(--font-pixel)", fontSize: 15 };
const listHintStyle: CSSProperties = { color: "#8798b8", fontSize: 10 };
const emptyStyle: CSSProperties = { padding: 24, border: "1px dashed rgba(150,178,221,0.25)", borderRadius: 8, color: "#94a3b8", fontSize: 12, lineHeight: 1.6, textAlign: "center" };
const taskCardStyle: CSSProperties = { padding: 15, border: "1px solid rgba(150,178,221,0.2)", borderRadius: 8, background: "linear-gradient(145deg, rgba(27,43,75,0.68), rgba(8,17,34,0.7))", boxShadow: "0 3px 0 rgba(3,6,14,0.35)" };
const taskHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 };
const dayBadgeStyle: CSSProperties = { color: "#8dcbff", fontFamily: "var(--font-pixel)", fontSize: 9, fontWeight: 800, letterSpacing: "0.08em" };
const taskTitleStyle: CSSProperties = { margin: "3px 0 0", color: "#fff", fontSize: 15 };
const dueStyle: CSSProperties = { color: "#aebbd3", fontSize: 10, whiteSpace: "nowrap" };
const homeworkStyle: CSSProperties = { margin: "10px 0", color: "#b7c2d6", fontSize: 12, lineHeight: 1.55 };
const metricGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 6 };
const metricStyle: CSSProperties = { display: "grid", gap: 2, padding: "8px 5px", border: "1px solid rgba(150,178,221,0.14)", borderRadius: 5, background: "rgba(2,6,18,0.34)", textAlign: "center" };
const metricLabelStyle: CSSProperties = { color: "#8798b8", fontSize: 9 };
const detailsStyle: CSSProperties = { marginTop: 10, borderTop: "1px solid rgba(150,178,221,0.14)", paddingTop: 9 };
const summaryStyle: CSSProperties = { color: "#9aafff", cursor: "pointer", fontSize: 11, fontWeight: 800 };
const studentListStyle: CSSProperties = { display: "grid", gap: 6, marginTop: 9 };
const studentRowStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 10, padding: "6px 8px", borderRadius: 4, background: "rgba(2,6,18,0.3)" };
const studentNameStyle: CSSProperties = { color: "#dce5f8", fontSize: 11 };
const studentStatusStyle: CSSProperties = { fontSize: 10, fontWeight: 800 };
const studentEmptyStyle: CSSProperties = { color: "#8798b8", fontSize: 11 };
