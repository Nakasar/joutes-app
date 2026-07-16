'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";
import { PlayGroupToolsNavBar } from "@/components/play-groups/PlayGroupToolsNavBar";

type GameOption = { id: string; name: string; slug?: string };

export default function PlayGroupGamesSettings({
  playGroupId,
  groupName,
  games,
  initialEnabledGameIds,
}: {
  playGroupId: string;
  groupName: string;
  games: GameOption[];
  initialEnabledGameIds: string[] | null;
}) {
  const t = useTranslations("PlayGroups.settings");
  const router = useRouter();
  const [restricted, setRestricted] = useState(initialEnabledGameIds !== null);
  const [selected, setSelected] = useState<string[]>(initialEnabledGameIds ?? games.map((game) => game.id));
  const [saving, setSaving] = useState(false);

  const options = games.map((game) => ({ value: game.id, label: game.name }));

  const handleRestrictedChange = (checked: boolean) => {
    setRestricted(checked);
    if (checked && selected.length === 0) {
      setSelected(games.map((game) => game.id));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/play-groups/${playGroupId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabledGameIds: restricted ? selected : null }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || t("saveError"));
      }

      toast.success(t("saveSuccess"));
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("saveError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">{t("title")}</h1>
          <p className="mt-2 text-muted-foreground">{t("subtitle", { group: groupName })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline">
            <Link href={`/play-groups/${playGroupId}`}>{t("back")}</Link>
          </Button>
          <PlayGroupToolsNavBar playGroupId={playGroupId} currentTab="settings" canManageSettings />
        </div>
      </div>

      <div className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="restrict-games" className="text-base font-medium">
              {t("restrictLabel")}
            </Label>
            <p className="text-sm text-muted-foreground">{t("restrictDescription")}</p>
          </div>
          <Switch id="restrict-games" checked={restricted} onCheckedChange={handleRestrictedChange} />
        </div>

        {restricted ? (
          <div className="space-y-2">
            <Label>{t("gamesLabel")}</Label>
            <MultiSelect
              options={options}
              selected={selected}
              onChange={setSelected}
              placeholder={t("gamesPlaceholder")}
              searchPlaceholder={t("gamesSearchPlaceholder")}
              emptyMessage={t("gamesEmpty")}
            />
            {selected.length === 0 ? (
              <p className="text-sm text-amber-600 dark:text-amber-400">{t("noneSelectedWarning")}</p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("allGamesEnabled")}</p>
        )}

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? t("saving") : t("save")}
          </Button>
        </div>
      </div>
    </div>
  );
}
