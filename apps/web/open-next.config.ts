import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default {
  ...defineCloudflareConfig({}),
  buildCommand: "npm --prefix ../../packages/contracts run build && npm run build"
};
