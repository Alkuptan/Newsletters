/**
 * Saving design changes — a master, or one unit's own.
 *
 * The shape mirrors `ThemeOverrides`: only differences from the original are ever
 * stored. Values are checked here for shape and re-clamped when read
 * (`resolveTheme`), so neither a mistyped number nor a corrupted stored value can
 * produce a page nobody would send.
 */

import { z } from "zod";
import {
  BOX_HEIGHT_DEFAULTS,
  COLOUR_DEFAULTS,
  FIELD_DEFAULTS,
  TEMPLATE_KINDS,
  TEXT_DEFAULTS,
  textRange,
} from "@/lib/newsletter/theme";

export const templateKindSchema = z.enum(TEMPLATE_KINDS);

const { min: TEXT_MIN, max: TEXT_MAX } = textRange();

/**
 * Build a partial object schema from a defaults object's keys.
 *
 * The value schema is kept as a type parameter so the inferred override type is
 * `{ unitName?: number }` and not `{ unitName?: unknown }` — the latter compiles
 * here but fails the moment the result is written to a jsonb column.
 */
function partialOf<T extends Record<string, unknown>, V extends z.ZodTypeAny>(
  defaults: T,
  value: V,
): z.ZodObject<{ [K in keyof T & string]: z.ZodOptional<V> }> {
  const shape = Object.fromEntries(Object.keys(defaults).map((key) => [key, value.optional()])) as {
    [K in keyof T & string]: z.ZodOptional<V>;
  };
  return z.object(shape);
}

const textSize = z
  .number()
  .min(TEXT_MIN, `Text cannot be smaller than ${TEXT_MIN}.`)
  .max(TEXT_MAX, `Text cannot be larger than ${TEXT_MAX}.`);

const boxHeight = z.number().min(10, "A box needs some height.").max(700);

const colour = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "A colour must look like #E97132.");

export const themeOverridesSchema = z.object({
  text: partialOf(TEXT_DEFAULTS, textSize).optional(),
  boxes: partialOf(BOX_HEIGHT_DEFAULTS, boxHeight).optional(),
  colours: partialOf(COLOUR_DEFAULTS, colour).optional(),
  fields: partialOf(FIELD_DEFAULTS, z.boolean()).optional(),
});
export type ThemeOverridesInput = z.infer<typeof themeOverridesSchema>;

/** Change one of the three masters. Admin only — it moves every newsletter. */
export const saveTemplateDesignSchema = z.object({
  kind: templateKindSchema,
  overrides: themeOverridesSchema,
});
export type SaveTemplateDesignInput = z.infer<typeof saveTemplateDesignSchema>;

/**
 * Change one unit's design.
 *
 * `null` clears it, which puts the unit back to following its master — the reset.
 */
export const saveUnitDesignSchema = z.object({
  unitId: z.guid(),
  overrides: themeOverridesSchema.nullable(),
});
export type SaveUnitDesignInput = z.infer<typeof saveUnitDesignSchema>;
