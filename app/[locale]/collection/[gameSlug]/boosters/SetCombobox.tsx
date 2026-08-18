"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: string[];
};

/**
 * Searchable set picker that also accepts a custom (not-in-catalog) set code.
 */
export default function SetCombobox({ value, onChange, options }: Props) {
  const t = useTranslations("Collection");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const q = query.trim();
  const filtered = q ? options.filter((o) => o.toLowerCase().includes(q.toLowerCase())) : options;
  const custom = q.toUpperCase();
  const hasExact = options.some((o) => o.toLowerCase() === q.toLowerCase());

  const select = (next: string) => {
    onChange(next);
    setQuery("");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          {value ? (
            <span className="font-mono">{value}</span>
          ) : (
            <span className="text-muted-foreground">{t("boosters.setPlaceholder")}</span>
          )}
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={t("boosters.setSearchPlaceholder")}
          />
          <CommandList>
            {filtered.length === 0 && !q ? <CommandEmpty>{t("boosters.noSet")}</CommandEmpty> : null}
            {filtered.length > 0 ? (
              <CommandGroup>
                {filtered.map((o) => (
                  <CommandItem key={o} value={o} onSelect={() => select(o)}>
                    <Check className={cn("size-4", value === o ? "opacity-100" : "opacity-0")} />
                    <span className="font-mono">{o}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {q && !hasExact ? (
              <CommandGroup>
                <CommandItem value={`__custom__${custom}`} onSelect={() => select(custom)}>
                  <Plus className="size-4" />
                  {t("boosters.customSet", { code: custom })}
                </CommandItem>
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
