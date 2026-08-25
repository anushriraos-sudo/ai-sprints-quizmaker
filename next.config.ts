import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

const nextConfig: NextConfig = {
	// Pin the workspace root so a stray lockfile elsewhere on the machine cannot
	// make Turbopack infer the wrong project directory.
	turbopack: {
		root: __dirname,
	},
};

export default nextConfig;

// Enable calling `getCloudflareContext()` in `next dev` only.
// Do not run during `next build` — it starts workerd/miniflare and leaves open
// handles that prevent a clean Node exit on Windows (UV_HANDLE_CLOSING crash).
// See https://opennext.js.org/cloudflare/bindings#local-access-to-bindings
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const isDevServer =
	process.env.NEXT_PHASE === PHASE_DEVELOPMENT_SERVER ||
	process.argv.includes("dev");

if (isDevServer) {
	initOpenNextCloudflareForDev();
}
