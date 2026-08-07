// Structured logger — use this, never console.log. Cloudflare Workers
// surfaces console output in `wrangler tail` and the dashboard logs view as
// JSON when emitted as JSON.
type LogContext = Record<string, unknown>;

function emit(level: "info" | "warn" | "error", msg: string, ctx: LogContext) {
  const payload = {
    level,
    msg,
    ts: new Date().toISOString(),
    ...ctx,
  };
  console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](JSON.stringify(payload));
}

export const log = {
  info: (msg: string, ctx: LogContext = {}) => emit("info", msg, ctx),
  warn: (msg: string, ctx: LogContext = {}) => emit("warn", msg, ctx),
  error: (msg: string, err: unknown, ctx: LogContext = {}) =>
    emit("error", msg, {
      ...ctx,
      err:
        err instanceof Error
          ? { name: err.name, message: err.message, stack: err.stack }
          : String(err),
    }),
};
