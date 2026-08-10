import { redirect } from "next/navigation";

/**
 * Quick was folded into the Units screen — deciding "does this need a
 * newsletter?" and "has it gone out?" is one thought, not two. Kept as a
 * redirect so old links and bookmarks still land somewhere useful.
 */
export default function QuickPage() {
  redirect("/units");
}
