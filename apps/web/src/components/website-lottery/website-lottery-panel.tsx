"use client";

import { useEffect, useState } from "react";
import {
  drawWebsiteLottery,
  getWebsiteLottery,
  redrawWebsiteLottery,
  type WebsiteLotteryPayload
} from "../../lib/api-client";
import { loadSession } from "../../lib/session";

export function WebsiteLotteryPanel({ dayId }: { dayId: string }) {
  const [payload, setPayload] = useState<WebsiteLotteryPayload | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [redrawing, setRedrawing] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const session = loadSession();
    if (!session || session.user.role !== "student") return;
    void getWebsiteLottery(dayId, session.token)
      .then(setPayload)
      .catch(() => setMessage("网站主题抽奖暂不可用，请稍后重试。"));
  }, [dayId]);

  async function draw() {
    const session = loadSession();
    if (!session) {
      setMessage("当前登录已失效，请重新登录。");
      return;
    }
    setDrawing(true);
    setMessage(null);
    try {
      const result = await drawWebsiteLottery(dayId, session.token);
      setPayload((current) => current
        ? { ...current, draw: result.draw }
        : { dayId, agentOnline: true, options: [result.draw.option], draw: result.draw });
      setMessage(result.alreadyDrawn ? "你已经抽过本日主题，结果已保留。" : "抽签完成，开始搭建你的网页吧！");
    } catch {
      setMessage("抽签失败，可能是本期题目已经被抽完了，或老师还没配置可用主题。");
    } finally {
      setDrawing(false);
    }
  }

  async function redraw() {
    const session = loadSession();
    if (!session) {
      setMessage("当前登录已失效，请重新登录。");
      return;
    }
    setRedrawing(true);
    setMessage(null);
    try {
      const result = await redrawWebsiteLottery(dayId, session.token);
      setPayload((current) => current
        ? { ...current, draw: result.draw }
        : { dayId, agentOnline: true, options: [result.draw.option], draw: result.draw });
      setMessage("已退回当前题目并重新抽取。");
    } catch {
      setMessage("退回重抽失败，可能是当前没有其他可选题目。");
    } finally {
      setRedrawing(false);
    }
  }

  const drawResult = payload?.draw;
  const dayLabel = dayId.replace(/^day-/i, "DAY ");
  const hasOptions = (payload?.options.length ?? 0) > 0;
  const agentOnline = payload?.agentOnline ?? false;
  const drawActionLabel = !payload
    ? "同步奖励中..."
    : !hasOptions
      ? "奖励池待配置"
      : !agentOnline
        ? "等待 Agent 接入"
        : "让 Agent 抽取奖励";
  const compactRewardLabel = drawResult
    ? "奖品已领取"
    : payload && !hasOptions
      ? "奖励待配置"
      : agentOnline
        ? "Agent 抽奖奖励"
        : "等待 Agent";

  return (
    <section
      aria-label="Day 网站主题抽奖"
      className="world-reward-panel"
      data-expanded={expanded}
      data-placement="below-zone-navigation"
    >
      <button
        type="button"
        aria-controls="website-lottery-reward-content"
        aria-expanded={expanded}
        aria-label={expanded ? "收起今日奖励" : "展开今日奖励"}
        className="world-reward-toggle"
        onClick={() => setExpanded((current) => !current)}
      >
        <span className="world-reward-gift" aria-hidden="true" />
        <span className="world-reward-toggle__copy">
          <small>TODAY REWARD</small>
          <strong>{compactRewardLabel}</strong>
        </span>
        <span className="world-reward-toggle__chevron" aria-hidden="true">
          {expanded ? "−" : "+"}
        </span>
      </button>

      {expanded ? (
        <div id="website-lottery-reward-content" className="world-reward-card">
          <span style={eyebrowStyle}>{dayLabel} / WEBSITE LOTTERY</span>
          <h2 style={titleStyle}>抽取你要做的网站类型</h2>
          {drawResult ? (
            <div style={resultStyle}>
              <strong>{drawResult.option.label}</strong>
              <p>{drawResult.option.description || "按照老师说明完成这个网站主题。"}</p>
              <button
                type="button"
                disabled={redrawing || !agentOnline}
                onClick={() => void redraw()}
                style={{ ...buttonStyle, ...(!agentOnline ? disabledButtonStyle : {}), marginTop: 10, width: "100%" }}
              >
                {redrawing ? "重抽中..." : agentOnline ? "不要这个，让 Agent 重抽" : "Agent 离线，暂不能重抽"}
              </button>
            </div>
          ) : (
            <>
              <p style={copyStyle}>
                {!payload
                  ? "正在同步主城区奖励状态。"
                  : !hasOptions
                    ? "奖励会一直展示在主城区；老师配置网站主题后，在线 Agent 才能抽取。"
                    : !agentOnline
                      ? `奖励池已有 ${payload.options.length} 个网站主题。接入并保持 Agent 在线后才能抽取。`
                      : `Agent 已在线，可以从 ${payload.options.length} 个网站主题中抽取奖励；抽过的题目不会重复。`}
              </p>
              <button
                type="button"
                disabled={drawing || !agentOnline || !hasOptions}
                onClick={() => void draw()}
                style={{ ...buttonStyle, ...(!agentOnline || !hasOptions ? disabledButtonStyle : {}) }}
              >
                {drawing ? "Agent 抽取中..." : drawActionLabel}
              </button>
            </>
          )}
          {message ? <p role="status" style={messageStyle}>{message}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

const eyebrowStyle = { display: "block", color: "#fde68a", fontSize: "10px", fontWeight: 800, letterSpacing: ".15em" };
const titleStyle = { margin: "6px 0", color: "#fff", fontSize: "17px" };
const copyStyle = { margin: "8px 0 12px", color: "#fde68a", fontSize: "13px", lineHeight: 1.5 };
const resultStyle = { marginTop: "10px", padding: "11px", borderRadius: "5px", background: "rgba(2,6,23,.46)", border: "1px solid rgba(253,230,138,.28)" };
const buttonStyle = { minHeight: 36, padding: "8px 13px", border: "1px solid #fde68a", borderRadius: "4px", background: "#ca8a04", color: "#fff", cursor: "pointer", fontWeight: 800 };
const disabledButtonStyle = { opacity: 0.62, cursor: "not-allowed" };
const messageStyle = { margin: "10px 0 0", color: "#fef3c7", fontSize: "12px" };
