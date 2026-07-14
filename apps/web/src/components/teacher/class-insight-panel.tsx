"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getClassInsightsSafe,
  type ClassInsight,
} from "../../lib/api-client";
import { loadSession } from "../../lib/session";

const FALLBACK_CLASS_INSIGHT: ClassInsight = {
  commonIssues: ["班级学情服务暂不可达"],
  topPerformers: [],
  needsAttention: [],
  classProgress: "请稍后重试，或查看评审队列获取学生状态。",
};

export function ClassInsightPanel() {
  const [insight, setInsight] = useState<ClassInsight>(FALLBACK_CLASS_INSIGHT);
  const [degraded, setDegraded] = useState(true);
  const [loading, setLoading] = useState(false);

  const fetchInsights = useCallback(async () => {
    const session = loadSession();

    if (!session) {
      setInsight(FALLBACK_CLASS_INSIGHT);
      setDegraded(true);
      return;
    }

    setLoading(true);
    try {
      const result = await getClassInsightsSafe(session.user.id, session.token);
      setInsight(result.data);
      setDegraded(result.degraded);
    } catch {
      setInsight(FALLBACK_CLASS_INSIGHT);
      setDegraded(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchInsights();
  }, [fetchInsights]);

  return (
    <section
      style={{
        marginTop: "24px",
        padding: "clamp(18px, 3vw, 24px)",
        background: "rgba(12,23,45,0.78)",
        borderRadius: "12px",
        border: "1px solid rgba(150,178,221,0.2)",
        boxShadow: "0 5px 0 rgba(3,6,14,0.42)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: "16px",
        }}
      >
        <div>
          <span style={eyebrowStyle}>LEARNING INSIGHTS</span>
          <h2 style={headingStyle}>班级学情面板</h2>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ ...statusBadgeStyle, color: degraded ? "#ff9aa8" : "#8ce7d5", borderColor: degraded ? "rgba(255,107,125,0.38)" : "rgba(80,214,186,0.38)", background: degraded ? "rgba(255,107,125,0.08)" : "rgba(80,214,186,0.08)" }}>
            <span aria-hidden="true">●</span>{degraded ? "离线" : "数据已同步"}
          </span>
        <button
          type="button"
          onClick={() => void fetchInsights()}
          disabled={loading}
          style={{
            minHeight: 34,
            padding: "6px 12px",
            background: loading ? "rgba(255,255,255,0.04)" : "rgba(118,146,255,0.12)",
            border: "1px solid rgba(154,175,255,0.36)",
            borderRadius: "5px",
            color: loading ? "#71809d" : "#dce4ff",
            cursor: loading ? "wait" : "pointer",
            fontSize: "12px",
            fontWeight: "800",
            boxShadow: loading ? "none" : "0 2px 0 rgba(3,6,14,0.38)",
          }}
        >
          {loading ? "刷新中..." : "刷新学情"}
        </button>
        </div>
      </div>

      {degraded ? (
        <p role="status" style={degradedNoticeStyle}>
          班级学情 API 暂不可达，当前显示降级文案。
        </p>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
          gap: "10px",
        }}
      >
        <InsightCard title="普遍问题" items={insight.commonIssues} color="#f87171" />
        <InsightCard
          title="表现突出"
          items={insight.topPerformers}
          color="#4ade80"
        />
        <InsightCard
          title="需关注"
          items={insight.needsAttention}
          color="#fbbf24"
        />
        <div
          style={{
            padding: "15px",
            background: "linear-gradient(145deg, rgba(27,43,76,0.72), rgba(7,13,28,0.36))",
            borderRadius: "6px",
            border: "1px solid rgba(100,183,255,0.24)",
            borderTop: "3px solid #64b7ff",
          }}
        >
          <h3
            style={{
              margin: "0 0 8px",
              fontFamily: "var(--font-pixel)",
              fontSize: "12px",
              color: "#60a5fa",
            }}
          >
            班级进度
          </h3>
          <p style={{ margin: 0, color: "#b7c3d8", fontSize: "13px", lineHeight: "1.6" }}>
            {insight.classProgress || "暂无进度数据"}
          </p>
        </div>
      </div>
    </section>
  );
}

function InsightCard({
  title,
  items,
  color,
}: {
  title: string;
  items: string[];
  color: string;
}) {
  return (
    <div
      style={{
        padding: "15px",
        background: "linear-gradient(145deg, rgba(27,43,76,0.72), rgba(7,13,28,0.36))",
        borderRadius: "6px",
        border: `1px solid ${color}3d`,
        borderTop: `3px solid ${color}`,
      }}
    >
      <h3
        style={{
          margin: "0 0 8px",
          fontFamily: "var(--font-pixel)",
          fontSize: "12px",
          color,
        }}
      >
        {title}
      </h3>
      {items && items.length > 0 ? (
        <ul style={{ margin: 0, paddingLeft: "18px" }}>
          {items.map((item, index) => (
            <li
              key={item}
              style={{ marginBottom: "5px", color: "#b7c3d8", fontSize: "13px", lineHeight: 1.5 }}
            >
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ margin: 0, color: "#7f8fab", fontSize: "13px" }}>暂无数据</p>
      )}
    </div>
  );
}

const eyebrowStyle: React.CSSProperties = { display: "block", color: "#8998b5", fontFamily: "var(--font-pixel)", fontSize: 9, fontWeight: 800, letterSpacing: "0.12em" };
const headingStyle: React.CSSProperties = { margin: "3px 0 0", color: "#fff", fontFamily: "var(--font-pixel)", fontSize: 20, fontWeight: 900 };
const statusBadgeStyle: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 8px", border: "1px solid", borderRadius: 999, fontSize: 10, fontWeight: 800, whiteSpace: "nowrap" };
const degradedNoticeStyle: React.CSSProperties = { margin: "0 0 14px", padding: "9px 11px", border: "1px solid rgba(255,107,125,0.28)", borderRadius: 5, background: "rgba(255,107,125,0.07)", color: "#ff9aa8", fontSize: 12 };
