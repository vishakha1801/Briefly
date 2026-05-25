import { cn } from "@/lib/utils";

export const segmentedControlListClass =
  "grid h-10 w-full items-center gap-0.5 rounded-sm border border-brand/10 bg-brand/5 p-1";

export const segmentedControlItemClass =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-xs px-3 text-center text-xs font-medium leading-none text-muted-foreground border border-transparent transition-[transform,background-color,border-color,color,box-shadow] duration-150 ease-out-custom outline-none hover:bg-white/45 hover:text-foreground active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-brand/30 data-[state=active]:border-brand/8 data-[state=active]:bg-white data-[state=active]:text-brand data-[state=active]:shadow-[0_2px_8px_rgba(59,73,234,0.08)] data-active:border-brand/8 data-active:bg-white data-active:text-brand data-active:shadow-[0_2px_8px_rgba(59,73,234,0.08)]";

export const segmentedControlBadgeClass =
  "rounded-xs bg-brand/10 px-1 text-[9px] font-semibold tabular-nums text-brand";

export function segmentedControlButtonClass(
  active: boolean,
  className?: string
) {
  return cn(
    segmentedControlItemClass,
    active &&
      "border-brand/8 bg-white text-brand shadow-[0_2px_8px_rgba(59,73,234,0.08)] hover:bg-white hover:text-brand",
    className
  );
}
