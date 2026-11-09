import type { ProviderAdapter } from "../types.js";

/**
 * Adapters by source slug. Tasks 4.6 to 4.9 add one each.
 * A feed whose source has no adapter here is skipped, with a log line.
 */
export const adapters: Readonly<Record<string, ProviderAdapter>> = {};
