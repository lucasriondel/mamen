import type { ComponentProps, ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * gousse's app-shell sidebar. A compound component — inspired by shadcn's
 * sidebar registry but rebuilt on gousse tokens and native semantics rather
 * than pulling shadcn's Radix-heavy stack: the shell is a plain `<aside>`, nav
 * rows are `<a>`/`<button>` with `aria-current`, and every color routes through
 * the preset (`bg-gousse-panel`, `border-gousse-line`, `text-gousse-ink`).
 *
 * Structure: Sidebar (shell) / SidebarHeader / SidebarContent (scroll region) /
 * SidebarGroup (+ SidebarGroupLabel) / SidebarItem (nav row) / SidebarFooter.
 * `collapsed` narrows the shell to an icon rail — rows hide their label and the
 * whole thing tweens width.
 */

export function Sidebar({
  className,
  collapsed = false,
  children,
  ...props
}: ComponentProps<"aside"> & { collapsed?: boolean }) {
  return (
    <aside
      data-collapsed={collapsed || undefined}
      className={cn(
        "group/sidebar flex h-full flex-col border-r border-gousse-line bg-gousse-panel text-gousse-ink transition-[width] duration-200",
        collapsed ? "w-16" : "w-64",
        className,
      )}
      {...props}
    >
      {children}
    </aside>
  );
}

export function SidebarHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex h-14 shrink-0 items-center gap-2 border-b border-gousse-line px-3 font-bold group-data-[collapsed]/sidebar:justify-center group-data-[collapsed]/sidebar:px-0",
        className,
      )}
      {...props}
    />
  );
}

/** Scrolling middle region that holds the groups. */
export function SidebarContent({ className, ...props }: ComponentProps<"nav">) {
  return (
    <nav
      className={cn("flex-1 overflow-y-auto p-2", className)}
      {...props}
    />
  );
}

export function SidebarGroup({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("mb-2 flex flex-col gap-0.5", className)} {...props} />;
}

export function SidebarGroupLabel({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "px-2.5 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-gousse-muted",
        className,
      )}
      {...props}
    />
  );
}

const item = cva(
  "flex w-full items-center gap-2.5 rounded-full px-3.5 py-2 text-left text-sm font-medium outline-hidden transition-[background,transform] duration-150 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-gousse-ink/30 group-data-[collapsed]/sidebar:justify-center group-data-[collapsed]/sidebar:px-0",
  {
    variants: {
      active: {
        true: "bg-gousse-line/60 text-gousse-ink",
        false: "text-gousse-muted hover:bg-gousse-line/40 hover:text-gousse-ink",
      },
    },
    defaultVariants: { active: false },
  },
);

type SidebarItemProps = VariantProps<typeof item> & {
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
} & Omit<ComponentProps<"a">, "className" | "children">;

/**
 * A nav row. Renders an `<a>`; pass `href`. Sets `aria-current="page"` when
 * `active`. In a collapsed Sidebar the label text is hidden via the parent's
 * `data-collapsed` marker, leaving the icon.
 *
 * Rows are pills. That is the point of the shape rather than a flourish: a
 * `rounded-full` hover/active fill reads as a pill *sitting in* the sidebar,
 * where a `rounded-xl` one reads as a block *filling* it. The inset widens to
 * `px-3.5` so the label clears the corner arc.
 */
export function SidebarItem({
  active,
  icon,
  className,
  children,
  ...props
}: SidebarItemProps) {
  return (
    <a
      aria-current={active ? "page" : undefined}
      className={cn(item({ active }), className)}
      {...props}
    >
      {icon ? <span className="shrink-0">{icon}</span> : null}
      <span className="truncate group-data-[collapsed]/sidebar:hidden">{children}</span>
    </a>
  );
}

export function SidebarFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "mt-auto flex shrink-0 items-center gap-2 border-t border-gousse-line p-3 group-data-[collapsed]/sidebar:justify-center group-data-[collapsed]/sidebar:px-0",
        className,
      )}
      {...props}
    />
  );
}
