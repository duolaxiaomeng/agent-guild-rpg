import path from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Classroom screens should not expose Next.js' floating development toolbar.
  devIndicators: false,
  output: "standalone",
  outputFileTracingRoot: workspaceRoot,
  // Keep Playwright's production build separate from a running classroom dev
  // server so `next build` cannot corrupt the live `.next` directory.
  distDir: process.env.NEXT_DIST_DIR ?? ".next"
};

export default nextConfig;
