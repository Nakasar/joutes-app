"use client";

import clsx from "clsx";
import { useTransition } from "react";
import { Locale } from "@/i18n/config";
import { setUserLocale } from "@/i18n/locale";
import {CheckIcon, LanguagesIcon} from "lucide-react";
import {Select, SelectContent, SelectItem, SelectTrigger} from "./ui/select";
import {SelectIcon, SelectPortal, SelectViewport} from "@radix-ui/react-select";
import {Button} from "@/components/ui/button";

type Props = {
  defaultValue: string;
  items: Array<{ value: string; label: string; flag: string }>;
  label: string;
};

export default function LocaleSwitcherSelect({
                                               defaultValue,
                                               items,
                                               label,
                                             }: Props) {
  const [isPending, startTransition] = useTransition();

  function onChange(value: string) {
    const locale = value as Locale;
    startTransition(() => {
      setUserLocale(locale);
    });
  }

  const currentFlag = items.find(l => l.value === defaultValue);

  return (
    <div className="relative">
      <Select defaultValue={defaultValue} onValueChange={onChange}>
        <SelectTrigger
          aria-label={label}
          className={clsx(
            "rounded-sm transition-colors hover:bg-slate-200 ring-0 outline-0",
            isPending && "pointer-events-none opacity-60",
          )}
        >
          {currentFlag?.flag}
        </SelectTrigger>
        <SelectPortal>
          <SelectContent
            align="end"
            className="min-w-32 overflow-hidden rounded-sm bg-white py-1 shadow-md"
            position="popper"
          >
            <SelectViewport>
              {items.map((item) => (
                <SelectItem
                  key={item.value}
                  className="flex cursor-default items-center px-3 py-2 text-base data-highlighted:bg-slate-100 outline-0 "
                  value={item.value}
                >
                  <span className="text-slate-900">{item.flag} {item.label}</span>
                </SelectItem>
              ))}
            </SelectViewport>
          </SelectContent>
        </SelectPortal>
      </Select>
    </div>
  );
}