import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="page-header min-w-0">
        {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
        <h1 className="mt-1">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-sm leading-6 muted sm:text-[0.95rem]">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
