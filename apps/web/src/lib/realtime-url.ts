export function getRealtimeUrl() {
  const configuredApiUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

  if (configuredApiUrl) {
    try {
      const base =
        typeof window === "undefined" ? "http://localhost" : window.location.origin;
      return new URL(configuredApiUrl, base).origin;
    } catch {
      // Fall through to the stable local development address.
    }
  }

  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:3001`;
  }

  return "http://localhost:3001";
}
