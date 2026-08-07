"use client";

// ★ Teaches: THE form pattern — react-hook-form + zodResolver + the SAME zod
// schema the server action re-validates, so client and server can never
// disagree about what is valid. One component serves create (inside the
// "New item" dialog) and edit (prefilled, on the detail page).

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createItem, updateItem } from "../actions";
import { createItemSchema, type CreateItemFormValues, type CreateItemInput } from "../schema";

type ItemFormProps = {
  /** When set, the form edits this item; otherwise it creates a new one. */
  item?: { id: string; title: string; details: string | null };
  /** Create-in-dialog uses this to close the dialog on success. */
  onSuccess?: () => void;
};

export function ItemForm({ item, onSuccess }: ItemFormProps) {
  // useTransition, not a hand-rolled loading flag: isPending stays true
  // through the server action AND the router.refresh() re-render after it.
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  // useId keeps label/input pairs unique even with two forms on one page
  // (e.g. the create dialog opened on top of the edit form).
  const fieldId = useId();

  // Three generics because the schema TRANSFORMS: the fields hold the input
  // shape (FormValues); handleSubmit receives the parsed output (Input).
  const form = useForm<CreateItemFormValues, unknown, CreateItemInput>({
    resolver: zodResolver(createItemSchema),
    defaultValues: {
      title: item?.title ?? "",
      details: item?.details ?? "",
    },
  });
  const { errors } = form.formState;

  function onSubmit(values: CreateItemInput) {
    startTransition(async () => {
      // Server actions return Result<T> — they NEVER throw. Branch on .ok.
      const result = item
        ? await updateItem({
            id: item.id,
            title: values.title,
            // The create schema turns a cleared textarea into undefined; the
            // update schema needs an explicit "" to CLEAR the column (its
            // partial semantics treat undefined as "leave unchanged").
            details: values.details ?? "",
          })
        : await createItem(values);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      router.refresh(); // re-render the Server Components with the fresh row
      if (!item) form.reset();
      onSuccess?.();
    });
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={`${fieldId}-title`}>Title</Label>
        <Input
          id={`${fieldId}-title`}
          aria-invalid={errors.title ? true : undefined}
          {...form.register("title")}
        />
        {errors.title ? <p className="text-sm text-destructive">{errors.title.message}</p> : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${fieldId}-details`}>Details</Label>
        <Textarea
          id={`${fieldId}-details`}
          rows={4}
          aria-invalid={errors.details ? true : undefined}
          {...form.register("details")}
        />
        {errors.details ? (
          <p className="text-sm text-destructive">{errors.details.message}</p>
        ) : null}
      </div>
      <Button type="submit" disabled={isPending}>
        {item
          ? isPending
            ? "Saving..."
            : "Save changes"
          : isPending
            ? "Creating..."
            : "Create item"}
      </Button>
    </form>
  );
}

/** "New item" trigger + dialog for the list page header (a Server Component
 * can render this — the interactivity lives entirely in this leaf). */
export function NewItemDialog() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>New item</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New item</DialogTitle>
          <DialogDescription>Give it a title. Details are optional.</DialogDescription>
        </DialogHeader>
        <ItemForm onSuccess={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
