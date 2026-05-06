// Tiny tagged logger with a single global level threshold.
//
// Why this exists: prior to this module every site reached for `console.*`
// directly, with ad-hoc tag prefixes (`[NiriAdapter]`, `[Compositor]`,
// some with no prefix at all). On long-running journald sessions the noise
// adds up, and there was no way to turn it down without a code edit.
//
// Configuration: read `AGS_LOG_LEVEL` once at module load. Recognised
// values are `debug`, `info`, `warn`, `error`, `silent`. Default is `warn`,
// so info/debug calls are no-ops in production while errors and warnings
// still surface.
//
// Output channels: `warn` → `console.warn` (LEVEL_WARNING), `error` →
// `console.error` (LEVEL_CRITICAL). Both are visible to gjs's default
// stderr handler. `info` and `debug` go through `console.log`
// (LEVEL_MESSAGE) — gjs's default GLib log handler suppresses
// LEVEL_INFO/LEVEL_DEBUG entirely unless `G_MESSAGES_DEBUG=all`, which
// would make AGS_LOG_LEVEL a no-op. Routing info/debug through `log`
// surfaces them when the user opts in via AGS_LOG_LEVEL, which is the
// real authority. The terminal/journald sees a uniform `Gjs-Console-Message`
// prefix; if you need to distinguish severity, filter on the `[Tag]`.
//
// Usage:
//   const log = createLogger("NiriAdapter");
//   log.debug("event-stream connected");
//   log.warn("workspace ID %d not found", id);
//   log.error("subprocess failed:", err);

import GLib from "gi://GLib";

const LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
} as const;

type LevelName = keyof typeof LEVELS;

function parseLevel(raw: string | null | undefined): LevelName {
  if (!raw) return "warn";
  const lower = raw.toLowerCase().trim();
  if (lower in LEVELS) return lower as LevelName;
  return "warn";
}

const threshold = LEVELS[parseLevel(GLib.getenv("AGS_LOG_LEVEL"))];

export interface Logger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

const NOOP: (...args: unknown[]) => void = () => {};

/**
 * Create a tagged logger. The tag is wrapped in brackets and prefixed to
 * every message — e.g. `createLogger("NiriAdapter")` produces output like
 * `[NiriAdapter] event-stream connected`. Methods below the configured
 * threshold collapse to a no-op so they cost nothing on the hot path.
 */
export function createLogger(tag: string): Logger {
  const prefix = `[${tag}]`;
  return {
    debug:
      threshold <= LEVELS.debug
        ? (...args) => console.log(prefix, ...args)
        : NOOP,
    info:
      threshold <= LEVELS.info
        ? (...args) => console.log(prefix, ...args)
        : NOOP,
    warn:
      threshold <= LEVELS.warn
        ? (...args) => console.warn(prefix, ...args)
        : NOOP,
    error:
      threshold <= LEVELS.error
        ? (...args) => console.error(prefix, ...args)
        : NOOP,
  };
}
