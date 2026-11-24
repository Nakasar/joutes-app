import { ChartLine } from "lucide-react";

import { META_PAUSED_MESSAGE } from "@/lib/meta/paused";

/** Ce que montrent les pages de méta tant qu'elle est coupée (`lib/meta/paused.ts`). */
export function MetaPaused() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-4 py-12 text-center">
      <ChartLine className="size-8 text-muted-foreground" aria-hidden />
      <p className="text-xl font-semibold">{META_PAUSED_MESSAGE}</p>
    </div>
  );
}
