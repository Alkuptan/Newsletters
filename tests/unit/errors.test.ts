// Teaches: the leak guard. fromError() is the ONLY door between raw errors
// and the user's screen — these tests pin down that typed AppErrors pass
// through, known SQLSTATEs get friendly copy, and everything else collapses
// to a generic message that never echoes internal text.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ForbiddenError,
  NotFoundError,
  RateLimitedError,
  ValidationError,
  fromError,
  toResult,
} from "@/lib/errors";

// fromError logs unmapped errors via log.error (console.error under the
// hood) — silence it so test output stays clean.
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("toResult", () => {
  it("wraps a value in an ok envelope", () => {
    expect(toResult({ id: "1" })).toEqual({ ok: true, data: { id: "1" } });
    expect(toResult(null)).toEqual({ ok: true, data: null });
  });
});

describe("fromError", () => {
  it("gives code-default AppErrors friendly English copy, and passes custom/validation copy through", () => {
    // No custom message → code-keyed default (English fallback).
    expect(fromError(new ForbiddenError())).toEqual({
      ok: false,
      error: "You don't have permission to do that.",
      code: "forbidden",
    });
    expect(fromError(new RateLimitedError())).toEqual({
      ok: false,
      error: "Too many requests. Please slow down.",
      code: "rate_limited",
    });
    // Hand-written message → passed through verbatim (already localized by the caller).
    expect(fromError(new NotFoundError("That item no longer exists."))).toEqual({
      ok: false,
      error: "That item no longer exists.",
      code: "not_found",
    });
    expect(fromError(new ValidationError([], "Title is required."))).toEqual({
      ok: false,
      error: "Title is required.",
      code: "validation",
    });
  });

  it("uses the caller's localized copy for code-default errors when a messages map is passed", () => {
    const ar = {
      generic: "خطأ",
      unique: "مستخدمة",
      dataRule: "قاعدة",
      referenced: "مرتبط",
      forbidden: "ممنوع",
      notFound: "غير موجود",
      rateLimited: "تمهّل",
      unauthenticated: "سجّل الدخول",
    };
    const text = (r: ReturnType<typeof fromError>) => (r.ok ? null : r.error);
    expect(text(fromError(new ForbiddenError(), ar))).toBe("ممنوع");
    expect(text(fromError({ code: "23505", message: "dup" }, ar))).toBe("مستخدمة");
    // A hand-written message still wins over the map.
    expect(text(fromError(new NotFoundError("custom"), ar))).toBe("custom");
  });

  it("maps SQLSTATE 23505 (unique violation) to friendly copy without leaking the raw text", () => {
    // Shape of a real PostgrestError — a plain object, NOT an Error instance.
    const pgError = {
      code: "23505",
      message: 'duplicate key value violates unique constraint "quotations_pkey"',
      details: "Key (id)=(...) already exists.",
      hint: null,
    };
    const result = fromError(pgError);
    expect(result).toEqual({
      ok: false,
      error: "That value is already in use.",
      code: "validation",
    });
    if (!result.ok) {
      expect(result.error).not.toContain("duplicate key");
      expect(result.error).not.toContain("quotations_pkey");
    }
  });

  it("maps SQLSTATE 42501 (RLS denial) to forbidden", () => {
    const result = fromError({
      code: "42501",
      message: 'permission denied for table "quotations"',
    });
    expect(result).toEqual({
      ok: false,
      error: "You don't have permission to do that.",
      code: "forbidden",
    });
  });

  it("collapses unknown Errors to the generic message — the raw message never leaks", () => {
    const result = fromError(new Error("connect ECONNREFUSED db-internal-host:5432"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("unknown");
      expect(result.error).toBe("Something went wrong. Please try again.");
      expect(result.error).not.toContain("db-internal-host");
    }
  });

  it("collapses unmapped message-bearing objects and junk values to the generic message", () => {
    const junkValues: unknown[] = [
      { message: "raw supabase storage text" }, // unmapped Supabase-shaped object
      "boom",
      42,
      null,
      undefined,
    ];
    for (const junk of junkValues) {
      const result = fromError(junk);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("unknown");
        expect(result.error).toBe("Something went wrong. Please try again.");
      }
    }
  });
});
