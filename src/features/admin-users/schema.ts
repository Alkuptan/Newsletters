import { z } from "zod";

// Shared by the action (server validation) and the dialog (typing the form).
// Roles come from the app_role enum — extend both together, in a migration.
export const roleSchema = z.enum(["admin", "member"]);

export const inviteUserSchema = z.object({
  email: z.email("Enter a valid email address."),
  fullName: z.string().trim().min(1, "Name is required.").max(120),
  role: roleSchema,
});
export type InviteUserInput = z.infer<typeof inviteUserSchema>;

export const setUserRoleSchema = z.object({
  userId: z.guid(),
  role: roleSchema,
});
export type SetUserRoleInput = z.infer<typeof setUserRoleSchema>;

export const setUserActiveSchema = z.object({
  userId: z.guid(),
  isActive: z.boolean(),
});
export type SetUserActiveInput = z.infer<typeof setUserActiveSchema>;
