type GuildMember = {
  id: string;
  name: string;
  status: string;
  role: string;
};

type GuildPanelProps = {
  guildName: string;
  collaborationPoints: number;
  missionTitle: string;
  missionSummary: string;
  members: GuildMember[];
};

export function GuildPanel({
  guildName,
  collaborationPoints,
  missionTitle,
  missionSummary,
  members
}: GuildPanelProps) {
  return (
    <section>
      <h1>工会大厅</h1>
      <p>{guildName}</p>
      <p>协作积分 {collaborationPoints}</p>
      <h2>{missionTitle}</h2>
      <p>{missionSummary}</p>
      <ul>
        {members.map((member) => (
          <li key={member.id}>
            <strong>{member.name}</strong>
            <span>{member.status}</span>
            <span>{member.role}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
