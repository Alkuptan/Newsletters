import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({
  // Incremental cache (ISR/SSG) is not enabled by default — internal tools
  // render dynamically behind auth. See https://opennext.js.org/cloudflare/caching
  // if you ever need it (requires an R2 bucket — ask the dev team).
});
