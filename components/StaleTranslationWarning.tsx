import { TriangleAlert } from "lucide-react";

export default function StaleTranslationWarning({ message }: { message: string }) {
  return (
    <div className="mb-2 flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300">
      <TriangleAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden />
      <span>{message}</span>
    </div>
  );
}
