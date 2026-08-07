"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateMyName } from "@/features/settings/actions";
import { updateMyNameSchema } from "@/features/settings/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// One editable field → plain controlled input, no form library needed.
export function ProfileForm({ initialFullName }: { initialFullName: string }) {
  const [fullName, setFullName] = useState(initialFullName);
  const [isPending, startTransition] = useTransition();
  const unchanged = fullName.trim() === initialFullName.trim();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = updateMyNameSchema.safeParse({ fullName });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check the form fields.");
      return;
    }
    startTransition(async () => {
      const result = await updateMyName(parsed.data);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Name updated.");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <Label htmlFor="profile-name">Full name</Label>
      <div className="flex gap-2">
        <Input
          id="profile-name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="max-w-sm"
          required
        />
        <Button type="submit" disabled={isPending || unchanged}>
          {isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
