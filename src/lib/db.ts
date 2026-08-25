import { getCloudflareContext } from "@opennextjs/cloudflare";

/** Resolve the D1 binding. The only place `env.DB` is accessed. */
export async function getDb(): Promise<D1Database> {
  const { env } = await getCloudflareContext({ async: true });
  return env.DB;
}
