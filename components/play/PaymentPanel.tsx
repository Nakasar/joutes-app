"use client";

import { useTranslations } from "next-intl";

import { CostChips, RUNE_MARK } from "@/components/play/HandPlay";
import { Button } from "@/components/ui/button";
import type { TableCard } from "@/lib/engine/cards";
import { abilityKey, type Coverage, type PayChoice } from "@/lib/engine/payment";
import type { EngineObj, EnginePayment } from "@/lib/engine/types";
import { DOMAIN_HEX } from "@/lib/engine/told-text";
import { cn } from "@/lib/utils";

type PaymentPanelProps = {
  payment: EnginePayment;
  cover: Coverage;
  choice: PayChoice;
  custom: boolean;
  /** Les objets du joueur, pour nommer runes, Seals et Or. */
  objOf: (id: number) => EngineObj | undefined;
  cardOf: (obj: EngineObj | undefined) => TableCard | undefined;
  onCustom: (custom: boolean) => void;
  onToggleAbility: (key: string) => void;
  onPay: () => void;
  onCancel: (() => void) | null;
};

/**
 * Le paiement : le coût, ce que le moteur propose, et en « Personnaliser » les
 * runes, Seals et Or que le joueur choisit lui-même, avec des jauges qui
 * passent au vert quand le coût est couvert.
 */
export function PaymentPanel({
  payment,
  cover,
  choice,
  custom,
  objOf,
  cardOf,
  onCustom,
  onToggleAbility,
  onPay,
  onCancel,
}: PaymentPanelProps) {
  const t = useTranslations("Games.Play.payment");
  const domainLabel = useTranslations("Games.Play.domain");
  const gaugeLabel = (key: string) =>
    key === "energy" ? t("energy") : key === "any" ? t("anyPower") : key === "card" ? t("cardPower") : domainLabel(key);
  const gaugeColor = (key: string) => (key === "energy" ? "var(--primary)" : DOMAIN_HEX[key] ?? "#eab308");

  const runeLines = Object.entries(choice.runes)
    .filter(([, use]) => use !== "none")
    .map(([id, use]) => {
      const obj = objOf(Number(id));
      const domain = cardOf(obj)?.domains[0]?.toLowerCase() ?? "";
      return { id: Number(id), use, domain, exhausted: obj?.exhausted === true };
    });
  const used = payment.abilities.filter((ability) => choice.abilities.includes(abilityKey(ability)));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span>{t("total")}</span>
        <CostChips cost={payment.cost} domains={payment.domains} />
      </div>

      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 text-sm">
        {[cover.energy, ...cover.power].map((gauge) => (
          <div key={gauge.key} className="contents">
            <span className="flex items-center gap-1.5">
              {gauge.key !== "energy" && (
                <span className="size-2.5 rounded-full" style={{ background: gaugeColor(gauge.key) }} />
              )}
              {gaugeLabel(gauge.key)}
            </span>
            <span className="h-1.5 overflow-hidden rounded-full bg-secondary">
              <span
                className="block h-full rounded-full transition-[width]"
                style={{
                  width: `${gauge.need ? Math.min(100, (gauge.have / gauge.need) * 100) : 100}%`,
                  background: gaugeColor(gauge.key),
                }}
              />
            </span>
            <span
              className={cn(
                "font-semibold tabular-nums",
                gauge.have >= gauge.need ? "text-emerald-400" : "text-amber-400",
              )}
            >
              {gauge.have} / {gauge.need}
            </span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1.5 text-sm">
        <h3 className="text-xs font-semibold">{custom ? t("yours") : t("proposed")}</h3>
        {runeLines.length === 0 && used.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("nothing")}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {runeLines.map((line) => (
              <li key={line.id} className="grid grid-cols-[0.75rem_minmax(0,1fr)_auto_auto] items-center gap-2">
                <span className="size-2.5 rounded-full" style={{ background: DOMAIN_HEX[line.domain] ?? "#94a3b8" }} />
                <span className="truncate">
                  {t("rune", { domain: line.domain ? domainLabel(line.domain) : "" })}
                  {line.exhausted && <span className="text-xs text-muted-foreground"> · {t("alreadyExhausted")}</span>}
                </span>
                <span
                  className={cn(
                    "rounded-full border px-1.5 text-[0.65rem] font-extrabold",
                    line.use === "recycle" ? "border-amber-400 text-amber-400" : "border-primary text-primary",
                  )}
                >
                  {RUNE_MARK[line.use as keyof typeof RUNE_MARK]}
                </span>
                <span className="text-xs text-muted-foreground">
                  {line.use === "exhaust"
                    ? t("givesEnergy")
                    : line.use === "recycle"
                      ? t("givesPower", { domain: line.domain ? domainLabel(line.domain) : "" })
                      : t("givesBoth", { domain: line.domain ? domainLabel(line.domain) : "" })}
                </span>
              </li>
            ))}
            {used.map((ability) => (
              <li key={abilityKey(ability)} className="grid grid-cols-[0.75rem_minmax(0,1fr)_auto] items-center gap-2">
                <span className="size-2.5 rounded-full bg-yellow-400" />
                <span className="truncate">{cardOf(objOf(ability.source))?.name ?? t("source")}</span>
                <span className="text-xs text-muted-foreground">{t("adds")}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {custom && (
        <>
          <p className="text-xs text-muted-foreground">{t("customHint")}</p>
          {payment.abilities.length > 0 && (
            <div className="flex flex-row flex-wrap gap-1.5">
              {payment.abilities.map((ability) => {
                const key = abilityKey(ability);
                const on = choice.abilities.includes(key);
                return (
                  <Button
                    key={key}
                    size="sm"
                    variant={on ? "default" : "outline"}
                    aria-pressed={on}
                    className="h-7 px-2 text-xs"
                    onClick={() => onToggleAbility(key)}
                  >
                    {cardOf(objOf(ability.source))?.name ?? t("source")}
                  </Button>
                );
              })}
            </div>
          )}
        </>
      )}

      {(cover.extraEnergy > 0 || cover.extraPower > 0) && (
        <p className="text-xs text-amber-400">
          {t("extra", { energy: cover.extraEnergy, power: cover.extraPower })}
        </p>
      )}

      <div className="flex flex-row flex-wrap items-center gap-2">
        <Button onClick={onPay} disabled={!cover.ok}>
          {t("pay")}
          <kbd className="ml-1 rounded max-lg:hidden border border-current px-1 font-mono text-[0.65rem] opacity-70">{t("enter")}</kbd>
        </Button>
        <Button variant="secondary" onClick={() => onCustom(!custom)}>
          {custom ? t("useProposed") : t("customize")}
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            {t("cancel")}
          </Button>
        )}
      </div>
    </div>
  );
}
