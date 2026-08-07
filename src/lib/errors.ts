import { log } from "@/lib/log";

/**
 * Every server action returns Result<T> — the client NEVER receives a thrown
 * error. Copy the action shape from the reference slice's actions.ts (the
 * fresh template ships src/features/example-items/actions.ts).
 */
export type Result<T> = { ok: true; data: T } | { ok: false; error: string; code: ErrorCode };

export type ErrorCode =
  "forbidden" | "not_found" | "validation" | "rate_limited" | "unauthenticated" | "unknown";

/**
 * Localizable, code-keyed error copy. A monolingual tool ignores this — the
 * English fallback below is used. A bilingual tool (see the Bilingual recipe
 * in RECIPES.md) passes `dict.errors` into fromError so the Result envelope
 * carries copy in the caller's language. Backward compatible: omit it and you
 * get English.
 */
export type ErrorMessages = {
  generic: string;
  unique: string;
  dataRule: string;
  referenced: string;
  forbidden: string;
  notFound: string;
  rateLimited: string;
  unauthenticated: string;
};

// English is the source of truth and the fallback. A bilingual tool mirrors
// these keys in each dictionary's `errors` section — keep them in sync.
const EN_ERRORS: ErrorMessages = {
  generic: "Something went wrong. Please try again.",
  unique: "That value is already in use.",
  dataRule: "That change isn't allowed by a data rule.",
  referenced: "This item is still referenced by other records, so it can't be changed or removed.",
  forbidden: "You don't have permission to do that.",
  notFound: "Not found.",
  rateLimited: "Too many requests. Please slow down.",
  unauthenticated: "You must sign in.",
};

// ErrorCode → the ErrorMessages key used when copy is not custom.
const CODE_KEY: Partial<Record<ErrorCode, keyof ErrorMessages>> = {
  forbidden: "forbidden",
  not_found: "notFound",
  rate_limited: "rateLimited",
  unauthenticated: "unauthenticated",
  unknown: "generic",
};

export class AppError extends Error {
  /** True when the caller passed its own (already-localized) message. */
  readonly hasCustomMessage: boolean;
  constructor(
    public code: ErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.hasCustomMessage = message !== undefined;
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message?: string) {
    super("unauthenticated", message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message?: string) {
    super("forbidden", message);
  }
}

export class NotFoundError extends AppError {
  constructor(message?: string) {
    super("not_found", message);
  }
}

export class ValidationError extends AppError {
  constructor(
    public details: unknown,
    message?: string,
  ) {
    super("validation", message ?? "Validation failed.");
  }
}

export class RateLimitedError extends AppError {
  constructor(message?: string) {
    super("rate_limited", message);
  }
}

export function toResult<T>(value: T): Result<T> {
  return { ok: true, data: value };
}

// SQLSTATE → { friendly-copy key, ErrorCode }. Keyed by Postgres error code
// (stable) rather than message substrings (fragile, leaky). NEVER expose raw
// Postgres / PostgREST / Storage text.
const SQLSTATE_MAP: Record<string, { key: keyof ErrorMessages; code: ErrorCode }> = {
  "23514": { key: "dataRule", code: "validation" }, // check_violation
  "23505": { key: "unique", code: "validation" }, // unique_violation
  "23503": { key: "referenced", code: "validation" }, // foreign_key_violation
  "42501": { key: "forbidden", code: "forbidden" }, // insufficient_privilege / RLS denial
};

function sqlStateOf(err: object): string | undefined {
  if ("code" in err) {
    const c = (err as { code?: unknown }).code;
    if (typeof c === "string" && c.length > 0) return c;
  }
  return undefined;
}

function messageOf(err: object): string | undefined {
  if ("message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string" && m.length > 0) return m;
  }
  return undefined;
}

/**
 * Collapse anything unmapped into a generic message, logging the raw text so
 * engineers can still diagnose it.
 */
function genericResult(
  m: ErrorMessages,
  rawMessage: string | undefined,
  err: unknown,
): Result<never> {
  log.error("Unmapped error surfaced to user", err, { rawMessage });
  return { ok: false, error: m.generic, code: "unknown" };
}

export function fromError(err: unknown, messages?: ErrorMessages): Result<never> {
  const m = messages ?? EN_ERRORS;

  // Our own typed errors.
  if (err instanceof AppError) {
    // Validation copy comes from zod (already localized), and any hand-written
    // message is the caller's localized text — pass both through verbatim.
    // Only code-default errors get localized by code here.
    if (err.code === "validation" || err.hasCustomMessage) {
      return { ok: false, error: err.message, code: err.code };
    }
    const key = CODE_KEY[err.code];
    return { ok: false, error: key ? m[key] : err.message, code: err.code };
  }

  // Supabase PostgrestError / StorageError are plain objects with `message`
  // and, for Postgres errors, a SQLSTATE `code`. Map by SQLSTATE first.
  if (err && typeof err === "object") {
    const sqlState = sqlStateOf(err);
    const mapped = sqlState ? SQLSTATE_MAP[sqlState] : undefined;
    if (mapped) {
      return { ok: false, error: m[mapped.key], code: mapped.code };
    }
    if (err instanceof Error) {
      return genericResult(m, err.message, err);
    }
    const raw = messageOf(err);
    if (raw !== undefined) {
      return genericResult(m, raw, err);
    }
  }

  return genericResult(m, undefined, err);
}
