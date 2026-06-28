import { GuildPanel } from "../../components/guild/guild-panel";

export default function GuildsPage() {
  return (
    <main>
      <GuildPanel
        guildName="Morning Forge"
        collaborationPoints={128}
        missionTitle="本周互测挑战"
        missionSummary="每位成员至少完成一次同伴互测并记录改进建议。"
        members={[
          { id: "m1", name: "Lin", status: "正在互测", role: "会长" },
          { id: "m2", name: "Mia", status: "空闲", role: "成员" }
        ]}
      />
    </main>
  );
}
