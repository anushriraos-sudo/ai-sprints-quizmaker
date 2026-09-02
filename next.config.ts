import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import {
	PHASE_DEVELOPMENT_SERVER,
	PHASE_PRODUCTION_BUILD,
} from "next/constants";

/**
 * Enable `getCloudflareContext()` / D1 in `next dev` only.
 * Never run during `next build` — workerd/miniflare leaves open handles and
 * prevents a clean Node exit on Windows (see AUTH_TECHNICAL_PRD troubleshooting).
 * https://opennext.js.org/cloudflare/bindings#local-access-to-bindings
 */
function shouldInitOpenNextCloudflareForDev(): boolean {
	const { argv } = process;
	const npmLifecycle = process.env.npm_lifecycle_event;
	const nextPhase = process.env.NEXT_PHASE;

	const isProductionBuild =
		nextPhase === PHASE_PRODUCTION_BUILD ||
		argv.some((arg) => arg === "build" || arg.endsWith("build.js"));

	if (isProductionBuild) {
		return false;
	}

	return (
		nextPhase === PHASE_DEVELOPMENT_SERVER ||
		npmLifecycle === "dev" ||
		argv.includes("dev")
	);
}

if (shouldInitOpenNextCloudflareForDev()) {
	initOpenNextCloudflareForDev();
}

const nextConfig: NextConfig = {
	// Pin the workspace root so a stray lockfile elsewhere on the machine cannot
	// make Turbopack infer the wrong project directory.
	turbopack: {
		root: __dirname,
	},
};

export default nextConfig;
