export async function getWorldPayload() {
  const response = await fetch("http://localhost:3001/world", {
    cache: "no-store"
  });

  return response.json();
}
