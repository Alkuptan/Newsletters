// Teaches: schemas are pure logic — test accepts, rejects, AND the
// normalizations (trim, empty-string mapping) that the form and action rely on.
import { describe, expect, it } from "vitest";
import {
  createItemSchema,
  deleteItemSchema,
  transitionItemSchema,
  updateItemSchema,
} from "@/features/example-items/schema";

const UUID = "123e4567-e89b-12d3-a456-426614174000";

describe("createItemSchema", () => {
  it("accepts a minimal valid item and trims the title", () => {
    const result = createItemSchema.safeParse({ title: "  Hello  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe("Hello");
      expect(result.data.details).toBeUndefined();
    }
  });

  it("turns an empty details string into undefined (stored as NULL)", () => {
    const result = createItemSchema.safeParse({ title: "Hi", details: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.details).toBeUndefined();
  });

  it("trims details and keeps non-empty text", () => {
    const result = createItemSchema.safeParse({ title: "Hi", details: "  a note  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.details).toBe("a note");
  });

  it("treats whitespace-only details as empty (undefined)", () => {
    const result = createItemSchema.safeParse({ title: "Hi", details: "   " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.details).toBeUndefined();
  });

  it("rejects missing, empty, and whitespace-only titles", () => {
    expect(createItemSchema.safeParse({}).success).toBe(false);
    expect(createItemSchema.safeParse({ title: "" }).success).toBe(false);
    expect(createItemSchema.safeParse({ title: "   " }).success).toBe(false);
  });

  it("enforces the 200-character title limit (after trimming)", () => {
    expect(createItemSchema.safeParse({ title: "x".repeat(200) }).success).toBe(true);
    expect(createItemSchema.safeParse({ title: "x".repeat(201) }).success).toBe(false);
    // 200 real characters padded with whitespace still passes — trim runs first.
    expect(createItemSchema.safeParse({ title: `  ${"x".repeat(200)}  ` }).success).toBe(true);
  });

  it("enforces the 5000-character details limit", () => {
    expect(createItemSchema.safeParse({ title: "Hi", details: "x".repeat(5000) }).success).toBe(
      true,
    );
    expect(createItemSchema.safeParse({ title: "Hi", details: "x".repeat(5001) }).success).toBe(
      false,
    );
  });

  it("rejects non-string values", () => {
    expect(createItemSchema.safeParse({ title: 42 }).success).toBe(false);
    expect(createItemSchema.safeParse({ title: "Hi", details: 42 }).success).toBe(false);
  });
});

describe("updateItemSchema", () => {
  it("requires a uuid id", () => {
    expect(updateItemSchema.safeParse({ id: "not-a-uuid" }).success).toBe(false);
    expect(updateItemSchema.safeParse({ id: UUID }).success).toBe(true);
  });

  it("treats absent fields as 'leave unchanged' (undefined)", () => {
    const result = updateItemSchema.safeParse({ id: UUID });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBeUndefined();
      expect(result.data.details).toBeUndefined();
    }
  });

  it("maps empty details to null so the column can be cleared", () => {
    const result = updateItemSchema.safeParse({ id: UUID, details: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.details).toBeNull();
  });

  it("still enforces the shared field rules", () => {
    expect(updateItemSchema.safeParse({ id: UUID, title: "" }).success).toBe(false);
    expect(updateItemSchema.safeParse({ id: UUID, title: "x".repeat(201) }).success).toBe(false);
    expect(updateItemSchema.safeParse({ id: UUID, details: "x".repeat(5001) }).success).toBe(false);
  });
});

describe("transitionItemSchema", () => {
  it("accepts a known status", () => {
    expect(transitionItemSchema.safeParse({ id: UUID, to: "done" }).success).toBe(true);
    expect(transitionItemSchema.safeParse({ id: UUID, to: "in_progress" }).success).toBe(true);
  });

  it("rejects unknown statuses and bad ids", () => {
    expect(transitionItemSchema.safeParse({ id: UUID, to: "archived" }).success).toBe(false);
    expect(transitionItemSchema.safeParse({ id: "1", to: "done" }).success).toBe(false);
    expect(transitionItemSchema.safeParse({ id: UUID }).success).toBe(false);
  });
});

describe("deleteItemSchema", () => {
  it("accepts a uuid and rejects anything else", () => {
    expect(deleteItemSchema.safeParse({ id: UUID }).success).toBe(true);
    expect(deleteItemSchema.safeParse({ id: "123" }).success).toBe(false);
    expect(deleteItemSchema.safeParse({}).success).toBe(false);
  });
});
