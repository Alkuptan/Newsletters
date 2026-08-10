/**
 * The Gantt schedule's validation rules.
 *
 * These mirror the CHECK constraints in migration 0006, so the owner gets a
 * readable sentence and the database is the backstop. The editor and the server
 * action both parse with these exact schemas.
 */

import { describe, expect, it } from "vitest";
import {
  ganttActivityInputSchema,
  saveGanttScheduleSchema,
} from "@/features/gantt/schema";

const validActivity = {
  name: "Concrete Works",
  startDate: "2026-05-29",
  finishDate: "2026-07-09",
  tone: "normal" as const,
};

describe("one activity", () => {
  it("accepts a sensible bar", () => {
    expect(ganttActivityInputSchema.safeParse(validActivity).success).toBe(true);
  });

  it("accepts a single-day activity", () => {
    const result = ganttActivityInputSchema.safeParse({
      ...validActivity,
      finishDate: validActivity.startDate,
    });
    expect(result.success).toBe(true);
  });

  it("refuses a bar that finishes before it starts", () => {
    // Mirrors the constraint `gantt_activities_dates_ordered`. Without this the
    // chart would try to draw a negative-width bar.
    const result = ganttActivityInputSchema.safeParse({
      ...validActivity,
      startDate: "2026-07-09",
      finishDate: "2026-05-29",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/cannot finish before it starts/i);
  });

  it("insists on a name", () => {
    const result = ganttActivityInputSchema.safeParse({ ...validActivity, name: "   " });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/needs a name/i);
  });

  it("insists on real dates, not a half-filled row", () => {
    const result = ganttActivityInputSchema.safeParse({ ...validActivity, startDate: "" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/pick a date/i);
  });

  it("defaults a bar to the normal blue", () => {
    const { name, startDate, finishDate } = validActivity;
    const result = ganttActivityInputSchema.parse({ name, startDate, finishDate });
    expect(result.tone).toBe("normal");
  });

  it("allows the orange attention bar", () => {
    // "Pending Neighbour consent" on the Phase 4 Villa 2B sample.
    const result = ganttActivityInputSchema.parse({ ...validActivity, tone: "attention" });
    expect(result.tone).toBe("attention");
  });
});

describe("a whole schedule", () => {
  // A real v4 UUID: Zod checks the version and variant bits, and Postgres's
  // gen_random_uuid() always produces them.
  const base = { quotationId: "11111111-2222-4333-8444-555555555555" };

  it("accepts an empty list, which clears the schedule", () => {
    // Meaningful, not a mistake: with no bars the unit falls back to the photo
    // layout, which is right for quotations that have no time schedule.
    const result = saveGanttScheduleSchema.safeParse({ ...base, activities: [] });
    expect(result.success).toBe(true);
  });

  it("falls back to a blank band label rather than refusing", () => {
    const result = saveGanttScheduleSchema.parse({ ...base, activities: [validActivity] });
    expect(result.rowLabel).toBe("");
  });

  it("refuses a band label too long for the vertical band", () => {
    const result = saveGanttScheduleSchema.safeParse({
      ...base,
      rowLabel: "x".repeat(121),
      activities: [],
    });
    expect(result.success).toBe(false);
  });

  it("refuses more bars than the chart can show legibly", () => {
    const result = saveGanttScheduleSchema.safeParse({
      ...base,
      activities: Array.from({ length: 41 }, () => validActivity),
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/forty bars/i);
  });

  it("reports the offending activity when one row is wrong", () => {
    const result = saveGanttScheduleSchema.safeParse({
      ...base,
      activities: [validActivity, { ...validActivity, name: "" }],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toContain(1);
  });

  it("needs a real quotation id", () => {
    expect(
      saveGanttScheduleSchema.safeParse({ quotationId: "not-a-uuid", activities: [] }).success,
    ).toBe(false);
  });
});
