// Teaches: permission helpers are pure functions over Pick<> shapes — no
// Supabase, no mocks. This test is the TS half of the contract; the RLS
// policies in migration 0004 are the SQL half. Change one, change both.
import { describe, expect, it } from "vitest";
import { canDeleteItem, canEditItem } from "@/features/example-items/permissions";

const item = { created_by: "creator-id" };

describe("canEditItem", () => {
  it("lets the creator edit their own item", () => {
    expect(canEditItem({ id: "creator-id", role: "member", is_active: true }, item)).toBe(true);
  });

  it("blocks another member", () => {
    expect(canEditItem({ id: "someone-else", role: "member", is_active: true }, item)).toBe(false);
  });

  it("lets an admin edit anyone's item", () => {
    expect(canEditItem({ id: "someone-else", role: "admin", is_active: true }, item)).toBe(true);
  });

  it("blocks deactivated users entirely — even the creator, even an admin", () => {
    expect(canEditItem({ id: "creator-id", role: "member", is_active: false }, item)).toBe(false);
    expect(canEditItem({ id: "someone-else", role: "admin", is_active: false }, item)).toBe(false);
  });
});

describe("canDeleteItem", () => {
  it("allows only active admins", () => {
    expect(canDeleteItem({ role: "admin", is_active: true })).toBe(true);
    expect(canDeleteItem({ role: "member", is_active: true })).toBe(false);
    expect(canDeleteItem({ role: "admin", is_active: false })).toBe(false);
  });
});
