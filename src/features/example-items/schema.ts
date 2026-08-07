// ★ TEACHING FILE: one schema file per feature — the form, the action, and
// the tests all import THESE schemas, so client and server can never disagree.
import { z } from "zod";
import type { Enums } from "@/lib/supabase/database.types";

// Mirrors the Postgres enum `item_status` (migration 0004). `satisfies` fails
// the build if a value here is unknown to the DB; drift the other way (a new
// DB status missing here) surfaces as type errors wherever DB rows meet a
// Record<ItemStatus, ...> lookup (see status-machine.ts).
export const ITEM_STATUSES = [
  "open",
  "in_progress",
  "done",
] as const satisfies readonly Enums<"item_status">[];

export const itemStatusSchema = z.enum(ITEM_STATUSES);
export type ItemStatus = (typeof ITEM_STATUSES)[number];

// Field rules are defined ONCE and reused by create + update so they cannot
// drift. They intentionally match the DB CHECK constraints (migration 0004):
// zod gives the user a friendly message; the constraint is the backstop.
const titleField = z
  .string()
  .trim()
  .min(1, "Title is required.")
  .max(200, "Title must be 200 characters or fewer.");

const detailsField = z.string().trim().max(5000, "Details must be 5,000 characters or fewer.");

export const createItemSchema = z.object({
  title: titleField,
  // Browsers submit an untouched <textarea> as "" — normalize to undefined so
  // the DB stores NULL instead of empty strings.
  details: detailsField.optional().transform((value) => (value === "" ? undefined : value)),
});
// Because the schema transforms, input and output types differ. The form
// holds the INPUT shape; handleSubmit + the action receive the OUTPUT shape
// (react-hook-form: useForm<FormValues, unknown, Input>).
export type CreateItemInput = z.output<typeof createItemSchema>;
export type CreateItemFormValues = z.input<typeof createItemSchema>;

export const updateItemSchema = z.object({
  id: z.uuid(),
  // Partial-update semantics: an absent field (undefined) means "leave it
  // unchanged". For details, an explicit "" means "clear it" and becomes NULL
  // — otherwise a user could never empty the column from the edit form.
  title: titleField.optional(),
  details: detailsField.transform((value) => (value === "" ? null : value)).optional(),
});
export type UpdateItemInput = z.infer<typeof updateItemSchema>;

export const transitionItemSchema = z.object({
  id: z.uuid(),
  to: itemStatusSchema,
});
export type TransitionItemInput = z.infer<typeof transitionItemSchema>;

export const deleteItemSchema = z.object({
  id: z.uuid(),
});
export type DeleteItemInput = z.infer<typeof deleteItemSchema>;
