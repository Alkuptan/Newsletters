import { z } from "zod";

/**
 * Auth input schemas. Shared by the server actions (authoritative validation)
 * and the client forms (fast feedback) — one source of truth, never two.
 */

export const signInSchema = z.object({
  // zod v4: z.email() is the top-level API (z.string().email() is deprecated).
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

export const requestPasswordResetSchema = z.object({
  email: z.email("Enter a valid email address."),
});

/** What the updatePassword ACTION accepts — confirm stays client-side. */
export const updatePasswordSchema = z.object({
  password: z.string().min(10, "Password must be at least 10 characters."),
});

/** Client-only variant for the reset form: adds the confirm field. */
export const resetPasswordFormSchema = updatePasswordSchema
  .extend({
    confirm: z.string(),
  })
  .refine((values) => values.password === values.confirm, {
    message: "Passwords do not match.",
    path: ["confirm"],
  });
