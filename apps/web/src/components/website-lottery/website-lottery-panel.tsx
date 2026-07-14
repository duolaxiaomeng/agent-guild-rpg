"use client";

import { useEffect, useState } from "react";
import {
  drawWebsiteLottery,
  getWebsiteLottery,
  type WebsiteLotteryPayload
} from "../../lib/api-client";
import { loadSession } from "../../lib/session";

export function WebsiteLotteryPanel({ dayId }: { dayId: string }) {
  const [payload, setPayload] = useState<WebsiteLotteryPayload | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);

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
        : { dayId, options: [result.draw.option], draw: result.draw });
      setMessage(result.alreadyDrawn ? "你已经抽过本日主题，结果已保留。" : "抽签完成，开始搭建你的网页吧！");
    } catch {
      setMessage("抽签失败，可能是本期题目已经被抽完了，或老师还没配置可用主题。");
    } finally {
      setDrawing(false);
    }
  }

  const drawResult = payload?.draw;
  return (
    <section aria-label="Day 网站主题抽奖" style={panelStyle}>
      <span style={eyebrowStyle}>DAY 01 / WEBSITE LOTTERY</span>
      <h2 style={titleStyle}>抽取你要做的网站类型</h2>
      {drawResult ? (
        <div style={resultStyle}>
          <strong>{drawResult.option.label}</strong>
          <p>{drawResult.option.description || "按照老师说明完成这个网站主题。"}</p>
        </div>
      ) : (
        <>
          <p style={copyStyle}>
            老师已准备 {payload?.options.length ?? "若干"} 个网站主题。本期里抽到过的题目不会重复，没被抽到的会继续留在池子里。
          </p>
          <button type="button" disabled={drawing || payload?.options.length === 0} onClick={() => void draw()} style={buttonStyle}>
            {drawing ? "抽取中..." : "开始抽签"}
          </button>
        </>
      )}
      {message ? <p role="status" style={messageStyle}>{message}</p> : null}
    </section>
  );
}

const panelStyle = { position: "absolute" as const, left: "16px", bottom: "86px", zIndex: 20, width: "min(330px, calc(100vw - 32px))", padding: "14px", border: "1px solid rgba(250,204,21,.42)", borderRadius: "7px", background: "linear-gradient(145deg, rgba(61,45,8,.95), rgba(25,17,4,.94))", boxShadow: "0 5px 0 rgba(24,16,2,.7)", color: "#fef3c7" };
const eyebrowStyle = { display: "block", color: "#fde68a", fontSize: "10px", fontWeight: 800, letterSpacing: ".15em" };
const titleStyle = { margin: "6px 0", color: "#fff", fontSize: "17px" };
const copyStyle = { margin: "8px 0 12px", color: "#fde68a", fontSize: "13px", lineHeight: 1.5 };
const resultStyle = { marginTop: "10px", padding: "11px", borderRadius: "5px", background: "rgba(2,6,23,.46)", border: "1px solid rgba(253,230,138,.28)" };
const buttonStyle = { minHeight: 36, padding: "8px 13px", border: "1px solid #fde68a", borderRadius: "4px", background: "#ca8a04", color: "#fff", cursor: "pointer", fontWeight: 800 };
const messageStyle = { margin: "10px 0 0", color: "#fef3c7", fontSize: "12px" };
