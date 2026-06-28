import { getWorldPayload } from "../lib/api-client";
import { WorldShell } from "../components/world/world-shell";

export default async function HomePage() {
  const world = await getWorldPayload();
  const onlineHomesteads = world.homesteads.filter((homestead) => homestead.isOnline);

  return (
    <main>
      <h1>主城区</h1>
      <p>第 {world.currentDay} 天教学世界</p>
      <p>
        在线家园 {onlineHomesteads.length} / {world.homesteads.length}
      </p>
      <WorldShell />
    </main>
  );
}
