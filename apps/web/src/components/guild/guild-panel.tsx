import type { GuildSummary } from "../../lib/api-client";

type GuildPanelProps = {
  guilds: GuildSummary[];
};

export function GuildPanel({ guilds }: GuildPanelProps) {
  return (
    <section>
      <h1>工会大厅</h1>
      <ul>
        {guilds.map((guild) => (
          <li key={guild.id}>
            <strong>{guild.name}</strong>
            <p>成员 {guild.memberCount}</p>
            <p>协作积分 {guild.collaborationPoints}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
