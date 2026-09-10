import { CSSProperties } from "react";
import Link from "next/link";
import {
  getGuildListSafe,
  getGuildMembersSafe,
  getMyGuildInvitationsSafe
} from "../../lib/api-client";
import { GuildPanel } from "../../components/guild/guild-panel";
import { GuildWorkspace } from "../../components/guild/guild-workspace";
import { SessionBanner } from "../../components/auth/session-banner";
import { getServerSession } from "../../lib/server-session";

export const dynamic = "force-dynamic";

/* ────────────────────────────────────────────
   Styles
   ──────────────────────────────────────────── */

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  background:
    "radial-gradient(circle at 12% 8%, rgba(14,165,233,.14), transparent 25%), radial-gradient(circle at 88% 18%, rgba(168,85,247,.12), transparent 26%), linear-gradient(145deg, #07101f 0%, #101934 48%, #091528 100%)",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  color: "#e2e8f0",
};

const containerStyle: CSSProperties = {
  maxWidth: 1080,
  margin: "0 auto",
  padding: "36px 24px 18px",
};

const titleStyle: CSSProperties = {
  fontSize: "clamp(28px, 5vw, 42px)",
  fontWeight: "800",
  color: "#fff",
  margin: "6px 0 8px",
  letterSpacing: "-0.035em",
  textShadow: "3px 3px 0 rgba(2,6,23,.7)",
};

const backLinkStyle: CSSProperties = {
  fontSize: "12px",
  color: "#bae6fd",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  padding: "7px 10px",
  border: "1px solid rgba(125,211,252,.28)",
  borderRadius: 4,
  background: "rgba(8,47,73,.36)",
  boxShadow: "0 3px 0 rgba(2,6,23,.45)",
};

const degradedBannerStyle: CSSProperties = {
  maxWidth: 1080,
  margin: "0 auto",
  padding: "0 16px",
};

const degradedBannerInnerStyle: CSSProperties = {
  background: "rgba(120, 53, 15, 0.36)",
  border: "1px solid rgba(251, 191, 36, 0.38)",
  borderRadius: 5,
  padding: "12px 16px",
  marginBottom: 8,
  color: "#fde68a",
  fontSize: 14,
  boxShadow: "0 4px 0 rgba(36,16,4,.35)",
};

const heroCardStyle: CSSProperties = {
  position: "relative",
  overflow: "hidden",
  marginTop: 20,
  padding: "28px clamp(20px, 5vw, 42px)",
  background: "linear-gradient(135deg, rgba(15,36,67,.94), rgba(20,23,54,.92))",
  border: "1px solid rgba(125,211,252,.28)",
  borderRadius: 8,
  boxShadow: "0 7px 0 rgba(2,6,23,.56), 0 24px 60px rgba(2,6,23,.3), inset 0 1px 0 rgba(255,255,255,.06)",
};

const eyebrowStyle: CSSProperties = {
  color: "#7dd3fc",
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: ".2em",
};

const subtitleStyle: CSSProperties = {
  maxWidth: 620,
  margin: 0,
  color: "#94a3b8",
  fontSize: 14,
  lineHeight: 1.7,
};

export default async function GuildsPage() {
  const result = await getServerSession();

  if (result.status === "unauthenticated") {
    return (
      <main data-scrollable="true" style={pageStyle}>
        <SessionBanner />
        <div style={containerStyle}>
          <div style={heroCardStyle}>
            <span style={eyebrowStyle}>GUILD HALL / ACCESS LOCKED</span>
            <h1 style={titleStyle}>工会大厅</h1>
            <p style={subtitleStyle}>请先登录后再查看工会信息。</p>
            <Link href="/login" style={{ ...backLinkStyle, marginTop: 18 }}>
              前往登录 →
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const token = result.status === "authenticated" ? result.session.token : undefined;
  const isStudent =
    result.status === "authenticated" && result.session.user.role === "student";
  const [guildResult, invitationResult] = await Promise.all([
    getGuildListSafe(token),
    isStudent && token
      ? getMyGuildInvitationsSafe(token)
      : Promise.resolve({ data: [], degraded: false })
  ]);
  const currentGuild = guildResult.data.find(
    (guild) => guild.viewerMembership?.status === "active"
  );
  const memberResult =
    isStudent && token && currentGuild
      ? await getGuildMembersSafe(currentGuild.id, token)
      : { data: [], degraded: false };
  const degraded =
    guildResult.degraded || invitationResult.degraded || memberResult.degraded;

  return (
    <main data-scrollable="true" style={pageStyle}>
      <SessionBanner />
      <div style={containerStyle}>
        <Link href="/" style={backLinkStyle}>
          ← 返回主页
        </Link>
        <div style={heroCardStyle}>
          <span aria-hidden="true" style={{ position: "absolute", top: 0, left: 0, width: 72, height: 4, background: "#38bdf8" }} />
          <span aria-hidden="true" style={{ position: "absolute", right: 28, top: 24, fontSize: 52, opacity: .1 }}>⚔</span>
          <span style={eyebrowStyle}>GUILD NETWORK / COLLABORATION</span>
          <h1 style={titleStyle}>工会大厅</h1>
          <p style={subtitleStyle}>查看真实工会成员与协作积分，找到你的协作据点。</p>
        </div>
      </div>
      {degraded || result.status === "api-unreachable" ? (
        <div style={degradedBannerStyle}>
          <div style={degradedBannerInnerStyle}>
            工会数据暂不可达，当前显示安全空态。
          </div>
        </div>
      ) : null}
      {isStudent && result.status === "authenticated" ? (
        <GuildWorkspace
          currentUserId={result.session.user.id}
          guilds={guildResult.data}
          invitations={invitationResult.data}
          members={memberResult.data}
        />
      ) : null}
      <GuildPanel guilds={guildResult.data} />
      <style>{`
        a[href="/"]:hover, a[href="/login"]:hover { filter: brightness(1.18); transform: translateY(-1px); }
        a[href="/"]:focus-visible, a[href="/login"]:focus-visible { outline: 2px solid #7dd3fc; outline-offset: 3px; }
      `}</style>
    </main>
  );
}
