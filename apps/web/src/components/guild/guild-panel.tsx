import type { CSSProperties } from "react";
import type { GuildSummary } from "../../lib/api-client";

type GuildPanelProps = {
  guilds: GuildSummary[];
};

/* ────────────────────────────────────────────
   Styles
   ──────────────────────────────────────────── */

const sectionStyle: CSSProperties = {
  maxWidth: 1080,
  margin: "0 auto",
  padding: "24px 24px 72px",
};

const titleStyle: CSSProperties = {
  color: "#fff",
  fontSize: 19,
  fontWeight: 800,
  margin: 0,
  letterSpacing: "-0.01em",
};

const subtitleStyle: CSSProperties = {
  color: "#64748b",
  fontSize: 12,
  margin: "5px 0 20px",
};

const listStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))",
  gap: 16,
  margin: 0,
  padding: 0,
  listStyle: "none",
};

const cardStyle: CSSProperties = {
  position: "relative",
  overflow: "hidden",
  minHeight: 154,
  background: "linear-gradient(145deg, rgba(19,35,61,.92), rgba(9,17,36,.94))",
  border: "1px solid rgba(148,163,184,.2)",
  borderRadius: 7,
  padding: 22,
  backdropFilter: "blur(10px)",
  boxShadow: "0 6px 0 rgba(2,6,23,.48), inset 0 1px 0 rgba(255,255,255,.05)",
  transition: "transform 140ms ease, border-color 140ms ease, box-shadow 140ms ease",
};

const guildNameStyle: CSSProperties = {
  color: "#fff",
  fontSize: 18,
  fontWeight: 800,
  lineHeight: 1.25,
  margin: 0,
};

const metaRowStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginTop: 22,
};

const metaItemStyle: CSSProperties = {
  display: "grid",
  gap: 3,
  minWidth: 94,
  padding: "9px 11px",
  color: "#64748b",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: ".08em",
  textTransform: "uppercase",
  background: "rgba(2,6,23,.34)",
  border: "1px solid rgba(148,163,184,.12)",
  borderRadius: 4,
};

const metaValueStyle: CSSProperties = {
  color: "#86efac",
  fontWeight: 800,
  fontSize: 20,
  letterSpacing: 0,
};

const emptyStyle: CSSProperties = {
  color: "rgba(255,255,255,0.7)",
  fontSize: 14,
  textAlign: "center",
  padding: "44px 20px",
  background: "rgba(15,23,42,.62)",
  border: "1px dashed rgba(148,163,184,.28)",
  borderRadius: 7,
};

/* ────────────────────────────────────────────
   Component
   ──────────────────────────────────────────── */

export function GuildPanel({ guilds }: GuildPanelProps) {
  return (
    <section style={sectionStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span aria-hidden="true" style={{ width: 9, height: 9, background: "#38bdf8", boxShadow: "0 0 12px rgba(56,189,248,.7)" }} />
        <div>
          <h2 style={titleStyle}>工会大厅</h2>
          <p style={subtitleStyle}>已同步 {guilds.length} 个工会据点</p>
        </div>
      </div>

      {guilds.length === 0 ? (
        <p style={emptyStyle}>暂无工会数据，请联系老师分配工会。</p>
      ) : (
        <ul style={listStyle}>
          {guilds.map((guild, index) => (
            <li key={guild.id} className="guild-summary-card" style={cardStyle}>
              <span aria-hidden="true" style={{ position: "absolute", inset: "0 auto 0 0", width: 3, background: index % 2 === 0 ? "#38bdf8" : "#a78bfa" }} />
              <span aria-hidden="true" style={{ position: "absolute", top: 14, right: 16, color: "rgba(148,163,184,.18)", fontSize: 32, fontWeight: 900 }}>
                {String(index + 1).padStart(2, "0")}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                <span aria-hidden="true" style={{ display: "grid", placeItems: "center", width: 36, height: 36, color: "#bae6fd", background: "rgba(14,116,144,.24)", border: "1px solid rgba(125,211,252,.3)", borderRadius: 4, boxShadow: "0 3px 0 rgba(2,6,23,.4)" }}>◆</span>
                <span style={guildNameStyle}>{guild.name}</span>
              </div>
              <div style={metaRowStyle}>
                <span style={metaItemStyle}>
                  成员 <span style={metaValueStyle}>{guild.memberCount}</span>
                </span>
                <span style={metaItemStyle}>
                  协作积分 <span style={{ ...metaValueStyle, color: "#fde68a" }}>{guild.collaborationPoints}</span>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      <style>{`
        .guild-summary-card:hover {
          transform: translateY(-3px);
          border-color: rgba(125,211,252,.48) !important;
          box-shadow: 0 9px 0 rgba(2,6,23,.52), 0 22px 42px rgba(2,6,23,.24) !important;
        }
        @media (prefers-reduced-motion: reduce) { .guild-summary-card { transition: none !important; } }
      `}</style>
    </section>
  );
}
