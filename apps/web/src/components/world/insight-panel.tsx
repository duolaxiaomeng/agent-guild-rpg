"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getStudentInsightsSafe,
  type StudentInsight,
} from "../../lib/api-client";
import { loadSession } from "../../lib/session";

type InsightPanelProps = {
  studentId?: string;
};

const FALLBACK_INSIGHT: StudentInsight = {
  strengths: ["学习洞察服务暂不可达"],
  weaknesses: [],
  recommendations: ["请稍后重试，或联系老师获取学习反馈。"],
  nextQuestSuggestion: "继续完成当前任务，保持学习节奏。",
};

export function InsightPanel({ studentId }: InsightPanelProps) {
  const [insight, setInsight] = useState<StudentInsight>(FALLBACK_INSIGHT);
  const [degraded, setDegraded] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchInsights = useCallback(async () => {
    const session = loadSession();
    const id = studentId ?? session?.user.id;

    if (!id) {
      setInsight(FALLBACK_INSIGHT);
      setDegraded(true);
      return;
    }

    setLoading(true);
    try {
      const result = await getStudentInsightsSafe(id, session?.token);
      setInsight(result.data);
      setDegraded(result.degraded);
    } catch {
      setInsight(FALLBACK_INSIGHT);
      setDegraded(true);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    void fetchInsights();
  }, [fetchInsights]);

  return (
    <div
      className="world-insight-panel"
      style={{
        position: "absolute",
        top: "auto",
        bottom: "76px",
        right: "16px",
        zIndex: 20,
        width: expanded ? "300px" : "52px",
        maxWidth: "calc(100vw - 32px)",
        maxHeight: "calc(100vh - 152px)",
        overflowY: "auto",
        background: "linear-gradient(145deg, rgba(17,34,61,.96), rgba(7,14,31,.97))",
        borderRadius: "5px",
        border: "1px solid rgba(167,139,250,.38)",
        color: "#e0e0f0",
        fontSize: "13px",
        boxShadow: "0 5px 0 rgba(2,6,23,.68), 0 18px 36px rgba(0,0,0,.3), inset 0 1px 0 rgba(255,255,255,.05)",
        transition: "width 180ms ease",
      }}
    >
      <button
        type="button"
        aria-label={expanded ? "收起学习洞察" : "展开学习洞察"}
        onClick={() => setExpanded((prev) => !prev)}
        className="world-insight-toggle"
        style={{
          width: "100%",
          minHeight: 48,
          padding: "10px 14px",
          background: expanded ? "rgba(2,6,23,.18)" : "rgba(124,58,237,.12)",
          border: "none",
          color: "#e0e0f0",
          fontSize: "14px",
          fontWeight: "bold",
          cursor: "pointer",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        {expanded ? (
          <>
            <span style={{ textAlign: "left" }}>
              <small style={{ display: "block", marginBottom: 2, color: "#c4b5fd", fontSize: 8, letterSpacing: ".16em" }}>LEARNING SCAN</small>
              {degraded ? "学习洞察（离线）" : "学习洞察"}{loading ? " ..." : ""}
            </span>
            <span>▼</span>
          </>
        ) : (
          <span aria-hidden="true" title="学习洞察">◉</span>
        )}
      </button>

      {expanded ? (
        <div style={{ padding: "2px 14px 14px", borderTop: "1px solid rgba(167,139,250,.14)" }}>
          {degraded ? (
            <p style={{ color: "#f87171", margin: "4px 0" }}>
              学习洞察 API 暂不可达，当前显示降级文案。
            </p>
          ) : null}

          <InsightSection title="强项" items={insight.strengths} color="#4ade80" />
          <InsightSection title="待改进" items={insight.weaknesses} color="#fbbf24" />
          <InsightSection title="建议" items={insight.recommendations} color="#60a5fa" />

          {insight.nextQuestSuggestion ? (
            <div style={{ marginTop: "10px", padding: "9px 10px", background: "rgba(88,28,135,.18)", border: "1px solid rgba(192,132,252,.18)", borderRadius: 4 }}>
              <p style={{ margin: "0 0 4px", color: "#c084fc", fontWeight: "bold" }}>
                下一关推荐
              </p>
              <p style={{ margin: 0, color: "#d0d0e0" }}>
                {insight.nextQuestSuggestion}
              </p>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => void fetchInsights()}
            disabled={loading}
            className="world-insight-refresh"
            style={{
              marginTop: "10px",
              padding: "4px 12px",
              background: "rgba(124,58,237,.24)",
              border: "1px solid rgba(167,139,250,.42)",
              borderRadius: "4px",
              color: "#e0e0f0",
              cursor: loading ? "wait" : "pointer",
              fontSize: "12px",
            }}
          >
            {loading ? "刷新中..." : "刷新洞察"}
          </button>
        </div>
      ) : null}
      <style>{`
        .world-insight-toggle:hover, .world-insight-refresh:hover:not(:disabled) { filter: brightness(1.15); }
        .world-insight-toggle:focus-visible, .world-insight-refresh:focus-visible { outline: 2px solid #c4b5fd; outline-offset: -2px; }
        @media (prefers-reduced-motion: reduce) { .world-insight-panel { transition: none !important; } }
      `}</style>
    </div>
  );
}

function InsightSection({
  title,
  items,
  color,
}: {
  title: string;
  items: string[];
  color: string;
}) {
  if (!items || items.length === 0) {
    return null;
  }

  return (
    <div style={{ marginTop: "10px", padding: "9px 10px", background: "rgba(2,6,23,.28)", border: "1px solid rgba(148,163,184,.12)", borderRadius: 4 }}>
      <p style={{ margin: "0 0 5px", color, fontWeight: "bold" }}>{title}</p>
      <ul style={{ margin: 0, paddingLeft: "17px" }}>
        {items.map((item) => (
          <li key={item} style={{ marginBottom: "2px", color: "#d0d0e0" }}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
