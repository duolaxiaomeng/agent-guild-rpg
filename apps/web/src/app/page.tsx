import { getWorldPayloadSafe } from "../lib/api-client";
import { WorldShell } from "../components/world/world-shell";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { data: world, degraded } = await getWorldPayloadSafe();
  const onlineHomesteads = world.homesteads.filter((homestead) => homestead.isOnline);

  return (
    <main>
      <h1>主城区</h1>
      {degraded ? <p>实时教学 API 暂不可达，主城区已降级为空态展示。</p> : null}
      <p>第 {world.currentDay} 天教学世界</p>
      <p>
        在线家园 {onlineHomesteads.length} / {world.homesteads.length}
      </p>
      <WorldShell />
    </main>
  );
}
