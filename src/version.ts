/**
 * Version constants feeding the reproducibility stamp (ADR-0004). A run is
 * stamped with the model id, the prompt version, and this engine version so
 * results are reproducible and cache keys are stable.
 */

/**
 * semdiff engine version, stamped into `Provenance.engineVersion`. Kept in sync
 * with `package.json` `version`; `test/version.contract.test.ts` fails the build
 * if the two drift, so a published artifact never stamps a stale version.
 */
export const ENGINE_VERSION = "0.1.2";

/** Default prompt-template version, stamped into `Provenance.promptVersion`. */
export const DEFAULT_PROMPT_VERSION = "0";
