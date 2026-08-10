import type { NextConfig } from "next";

/**
 * Development-only routes.
 *
 * A page named `page.dev.tsx` is a route while developing and does not exist in
 * a production build at all — Next only treats a file as a page if its
 * extension is in this list, so leaving `dev.tsx` out of the production list
 * removes the route AND everything it imports from the bundle.
 *
 * This is not cosmetic. The Cloudflare Worker has a hard 3 MiB gzipped ceiling
 * and the design-preview page (with its four fixture newsletters) was 107 KiB
 * of it — enough, on its own, to push a working deploy over the line. A page
 * that returns 404 in production has no business being shipped.
 */
const DEV_PAGE_EXTENSIONS = ["dev.tsx", "dev.ts"];
const PAGE_EXTENSIONS = ["tsx", "ts", "jsx", "js"];

const nextConfig: NextConfig = {
  pageExtensions:
    process.env.NODE_ENV === "production"
      ? PAGE_EXTENSIONS
      : [...DEV_PAGE_EXTENSIONS, ...PAGE_EXTENSIONS],
};

export default nextConfig;
