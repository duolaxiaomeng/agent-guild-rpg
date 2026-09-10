"use client";

import { type CSSProperties, type FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  acceptGuildInvitation,
  createGuild,
  declineGuildInvitation,
  inviteGuildMember,
  removeGuildMember,
  type GuildInvitation,
  type GuildMember,
  type GuildSummary
} from "../../lib/api-client";
import { loadSession } from "../../lib/session";

type GuildWorkspaceProps = {
  currentUserId: string;
  guilds: GuildSummary[];
  invitations: GuildInvitation[];
  members: GuildMember[];
};

const panelStyle: CSSProperties = {
  maxWidth: 1080,
  margin: "0 auto",
  padding: "0 24px 18px",
  display: "grid",
  gap: 16
};

const cardStyle: CSSProperties = {
  padding: 20,
  borderRadius: 7,
  border: "1px solid rgba(125,211,252,.24)",
  background: "linear-gradient(145deg, rgba(19,35,61,.92), rgba(9,17,36,.94))",
  boxShadow: "0 6px 0 rgba(2,6,23,.46)",
  color: "#cbd5e1"
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  border: "1px solid rgba(148,163,184,.3)",
  borderRadius: 4,
  background: "rgba(2,6,23,.48)",
  color: "#fff"
};

const buttonStyle: CSSProperties = {
  minHeight: 38,
  padding: "8px 14px",
  border: "1px solid rgba(186,230,253,.55)",
  borderRadius: 4,
  background: "linear-gradient(180deg, #0ea5e9, #0369a1)",
  color: "#fff",
  cursor: "pointer",
  fontWeight: 700
};

const secondaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: "rgba(30,41,59,.92)",
  borderColor: "rgba(148,163,184,.4)"
};

function getToken() {
  return loadSession()?.token ?? "";
}

export function GuildWorkspace({
  currentUserId,
  guilds: initialGuilds,
  invitations: initialInvitations,
  members: initialMembers
}: GuildWorkspaceProps) {
  const router = useRouter();
  const [guilds, setGuilds] = useState(initialGuilds);
  const [invitations, setInvitations] = useState(initialInvitations);
  const [members, setMembers] = useState(initialMembers);
  const [guildName, setGuildName] = useState("");
  const [description, setDescription] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");

  const currentGuild = useMemo(
    () => guilds.find((guild) => guild.viewerMembership?.status === "active") ?? null,
    [guilds]
  );
  const isLeader = currentGuild?.viewerMembership?.role === "leader";
  const pendingInvitations = invitations.filter(
    (invitation) => invitation.status === "invited"
  );

  async function runAction(key: string, action: () => Promise<void>) {
    setBusyKey(key);
    setFeedback("");
    try {
      await action();
    } catch {
      setFeedback("操作失败，请检查权限、邮箱或当前工会状态后重试。");
    } finally {
      setBusyKey(null);
    }
  }

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runAction("create", async () => {
      const guild = await createGuild({ name: guildName, description }, getToken());
      setGuilds((current) => [...current, guild]);
      setGuildName("");
      setDescription("");
      setFeedback(`已创建工会：${guild.name}`);
      router.refresh();
    });
  }

  function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentGuild) return;
    void runAction("invite", async () => {
      await inviteGuildMember(currentGuild.id, { email: inviteEmail }, getToken());
      setInviteEmail("");
      setFeedback("邀请已发送，等待学生本人确认。");
      router.refresh();
    });
  }

  function handleInvitation(invitation: GuildInvitation, accept: boolean) {
    const key = `${accept ? "accept" : "decline"}-${invitation.id}`;
    void runAction(key, async () => {
      const updated = accept
        ? await acceptGuildInvitation(invitation.id, getToken())
        : await declineGuildInvitation(invitation.id, getToken());
      setInvitations((current) =>
        current.map((item) =>
          item.id === updated.id
            ? updated
            : accept && item.status === "invited"
              ? { ...item, status: "declined" }
              : item
        )
      );
      if (accept) {
        setGuilds((current) =>
          current.map((guild) => ({
            ...guild,
            viewerMembership:
              guild.id === updated.guildId
                ? {
                    id: updated.id,
                    userId: currentUserId,
                    role: "member",
                    status: "active"
                  }
                : guild.viewerMembership ?? null
          }))
        );
      }
      setFeedback(accept ? "已加入工会。" : "已拒绝邀请。");
      router.refresh();
    });
  }

  function handleRemove(member: GuildMember) {
    if (!currentGuild) return;
    void runAction(`remove-${member.userId}`, async () => {
      await removeGuildMember(currentGuild.id, member.userId, getToken());
      setMembers((current) => current.filter((item) => item.userId !== member.userId));
      setGuilds((current) =>
        current.map((guild) =>
          guild.id === currentGuild.id
            ? { ...guild, memberCount: Math.max(0, guild.memberCount - 1) }
            : guild
        )
      );
      setFeedback(`已移除成员：${member.displayName}`);
      router.refresh();
    });
  }

  return (
    <section aria-label="我的工会工作区" style={panelStyle}>
      {feedback ? <p role="status" style={{ ...cardStyle, color: "#bae6fd" }}>{feedback}</p> : null}

      {pendingInvitations.length > 0 ? (
        <div style={cardStyle}>
          <h2 style={{ marginTop: 0, color: "#fff" }}>待处理邀请</h2>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
            {pendingInvitations.map((invitation) => (
              <li key={invitation.id} style={{ padding: 12, background: "rgba(2,6,23,.34)" }}>
                <strong style={{ color: "#fff" }}>{invitation.guildName}</strong>
                <p style={{ margin: "5px 0 10px" }}>邀请人：{invitation.inviterName}</p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    style={buttonStyle}
                    disabled={busyKey !== null}
                    onClick={() => handleInvitation(invitation, true)}
                  >
                    接受邀请
                  </button>
                  <button
                    type="button"
                    style={secondaryButtonStyle}
                    disabled={busyKey !== null}
                    onClick={() => handleInvitation(invitation, false)}
                  >
                    拒绝邀请
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!currentGuild ? (
        <form onSubmit={handleCreate} style={{ ...cardStyle, display: "grid", gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, color: "#fff" }}>创建我的工会</h2>
            <p style={{ color: "#94a3b8" }}>每名学生只能加入一个有效工会。</p>
          </div>
          <label>
            工会名称
            <input
              aria-label="工会名称"
              required
              minLength={2}
              maxLength={40}
              value={guildName}
              onChange={(event) => setGuildName(event.target.value)}
              style={inputStyle}
            />
          </label>
          <label>
            工会说明
            <textarea
              aria-label="工会说明"
              required
              minLength={10}
              maxLength={240}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              style={{ ...inputStyle, minHeight: 82, resize: "vertical" }}
            />
          </label>
          <button type="submit" style={buttonStyle} disabled={busyKey !== null}>
            {busyKey === "create" ? "创建中…" : "创建工会"}
          </button>
        </form>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          <div style={cardStyle}>
            <h2 style={{ margin: 0, color: "#fff" }}>我的工会 · {currentGuild.name}</h2>
            <p style={{ color: "#94a3b8" }}>{currentGuild.description}</p>
            <span>{isLeader ? "会长" : "成员"}</span>
          </div>

          {isLeader ? (
            <form onSubmit={handleInvite} style={{ ...cardStyle, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "end" }}>
              <label style={{ flex: "1 1 260px" }}>
                按注册邮箱邀请学生
                <input
                  aria-label="学生注册邮箱"
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  style={inputStyle}
                />
              </label>
              <button type="submit" style={buttonStyle} disabled={busyKey !== null}>
                {busyKey === "invite" ? "发送中…" : "发送邀请"}
              </button>
            </form>
          ) : null}

          <div style={cardStyle}>
            <h2 style={{ marginTop: 0, color: "#fff" }}>成员列表</h2>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
              {members.map((member) => (
                <li key={member.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: 10, background: "rgba(2,6,23,.34)" }}>
                  <span>
                    <strong style={{ color: "#fff" }}>{member.displayName}</strong>
                    {" · "}{member.role === "leader" ? "会长" : "成员"}
                  </span>
                  {isLeader && member.userId !== currentUserId && member.role !== "leader" ? (
                    <button
                      type="button"
                      style={secondaryButtonStyle}
                      disabled={busyKey !== null}
                      onClick={() => handleRemove(member)}
                    >
                      移除成员
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
