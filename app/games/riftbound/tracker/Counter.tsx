"use client";

import { Button } from "@/components/ui/button";
import { Minus, Plus } from "lucide-react";
import type { ReactNode } from "react";

export default function Counter({
  label,
  value,
  onChange,
  min = 0,
  icon,
  size = "md",
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  icon?: ReactNode;
  size?: "md" | "lg";
}) {
  const isLarge = size === "lg";

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={isLarge ? "size-12" : "size-9"}
          onClick={() => onChange(Math.max(min, value - 1))}
          aria-label={`-1 ${label}`}
        >
          <Minus className={isLarge ? "h-5 w-5" : "h-4 w-4"} />
        </Button>
        <span className={isLarge ? "w-16 text-center text-4xl font-bold tabular-nums" : "w-10 text-center text-xl font-semibold tabular-nums"}>
          {value}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={isLarge ? "size-12" : "size-9"}
          onClick={() => onChange(value + 1)}
          aria-label={`+1 ${label}`}
        >
          <Plus className={isLarge ? "h-5 w-5" : "h-4 w-4"} />
        </Button>
      </div>
    </div>
  );
}
