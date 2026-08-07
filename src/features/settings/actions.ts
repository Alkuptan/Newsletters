"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { RateLimitedError, ValidationError, fromError, toResult, type Result } from "@/lib/errors";
import { log } from "@/lib/log";
import { updateMyNameSchema, type UpdateMyNameInput } from "@/features/settings/schema";

export async function updateMyName(input: UpdateMyNameInput): Promise<Result<null>> {
  try {
    const user = await requireUser();
    const parsed = updateMyNameSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError(z.flattenError(parsed.error));

    const supabase = await createClient();
    const { data: allowed, error: rateError } = await supabase.rpc("check_rate_limit", {
      p_scope: "settings",
      p_max: 10,
      p_window_seconds: 60,
    });
    if (rateError) throw rateError;
    if (!allowed) throw new RateLimitedError();

    // Normal RLS client: profiles_self_update lets users edit their own row,
    // and the profiles_protect_privileged trigger blocks role/is_active
    // changes by non-admins — so this can never escalate even if the code
    // were wrong. Reaching for the admin client here would be the anti-pattern.
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: parsed.data.fullName })
      .eq("id", user.id);
    if (error) throw error;

    log.info("Profile name updated", { userId: user.id });
    // "layout" scope: the shell's user menu shows the name on every page.
    revalidatePath("/", "layout");
    return toResult(null);
  } catch (err) {
    return fromError(err);
  }
}
