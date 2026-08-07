// Server Component on purpose — no interactivity, so no 'use client'.
// Every page starts with one of these for a consistent title row.
export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  /** Optional action slot (buttons, dialogs) rendered right-aligned. */
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children ? <div className="flex items-center gap-2">{children}</div> : null}
    </div>
  );
}
