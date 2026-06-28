import { getGuildListSafe } from "../../lib/api-client";
import { GuildPanel } from "../../components/guild/guild-panel";

export const dynamic = "force-dynamic";

export default async function GuildsPage() {
  const { data: guilds, degraded } = await getGuildListSafe();

  return (
    <main>
      {degraded ? <p>工会数据暂不可达，当前显示安全空态。</p> : null}
      <GuildPanel guilds={guilds} />
    </main>
  );
}
