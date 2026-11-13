"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";

/** Le code, en grand, et de quoi le copier pour le coller dans l'app. */
export function AppLoginCode({ code }: { code: string }) {
  const t = useTranslations("AppLogin");
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-col items-center gap-3">
      <p
        className="select-all rounded-xl border bg-card px-6 py-4 font-mono text-4xl font-bold tracking-[0.2em]"
        aria-label={t("codeLabel")}
      >
        {code}
      </p>
      <Button
        type="button"
        variant="outline"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code.replace("-", ""));
            setCopied(true);
          } catch {
            // Presse-papiers refusé : le code reste sélectionnable.
          }
        }}
      >
        {copied ? <Check className="mr-2 size-4" /> : <Copy className="mr-2 size-4" />}
        {copied ? t("copied") : t("copy")}
      </Button>
    </div>
  );
}
