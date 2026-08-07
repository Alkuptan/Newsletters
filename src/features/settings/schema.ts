import { z } from "zod";

export const updateMyNameSchema = z.object({
  fullName: z.string().trim().min(1, "Name is required.").max(120),
});
export type UpdateMyNameInput = z.infer<typeof updateMyNameSchema>;
