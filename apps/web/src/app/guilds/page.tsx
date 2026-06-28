import { getGuildList } from "../../lib/api-client";
import { GuildPanel } from "../../components/guild/guild-panel";

export default async function GuildsPage() {
  const guilds = await getGuildList();

  return (
    <main>
      <GuildPanel guilds={guilds} />
    </main>
  );
}
