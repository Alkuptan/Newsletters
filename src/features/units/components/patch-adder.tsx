"use client";

/**
 * Create a patch name.
 *
 * A patch only becomes real once a unit is put in it, so this does not write
 * anything — it adds the name to the dropdowns and filters by it, which is the
 * next thing you want to do anyway.
 *
 * It sits with the filters rather than below the list: with 152 rows, a control
 * under the table is a scroll past the entire programme away.
 */

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function PatchAdder({ patches }: { patches: string[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();
  const [name, setName] = useState("");

  function add() {
    const patch = name.trim();
    if (!patch) return;
    if (patches.includes(patch)) {
      toast.info(`"${patch}" already exists.`);
      return;
    }
    // Filtering to the new (empty) patch would show nothing, so instead it goes
    // into the address as the patch to assign, and the dropdowns pick it up.
    const query = new URLSearchParams(params.toString());
    query.set("newpatch", patch);
    router.push(`${pathname}?${query}`);
    setName("");
    toast.success(`"${patch}" is ready — choose it on any unit to put it in.`);
  }

  return (
    <div className="space-y-1">
      <label htmlFor="new-patch" className="text-muted-foreground block text-xs">
        New patch
      </label>
      <div className="flex gap-1">
        <Input
          id="new-patch"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") add();
          }}
          placeholder="Patch 3"
          className="h-8 w-28"
        />
        <Button variant="outline" size="sm" className="h-8" disabled={!name.trim()} onClick={add}>
          Add
        </Button>
      </div>
    </div>
  );
}
