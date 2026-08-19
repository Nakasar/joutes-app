"use client";

import { useState, useTransition } from "react";
import { DateTime } from "luxon";
import { SmartphoneIcon, TabletSmartphoneIcon } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import type { PushDeviceSummary } from "@/lib/types/PushDevice.ts";
import { revokePushDeviceAction } from "@/app/[locale]/(app)/account/actions.ts";

/**
 * Les appareils qui reçoivent les notifications de ce compte.
 *
 * Un utilisateur n'a aucun autre moyen de savoir quels téléphones sont
 * enregistrés : celui qu'il a revendu, celui de son ancien travail, celui qu'il
 * a réinstallé. La liste ne sert qu'à ça — reconnaître, et retirer.
 */
export function PushDevicesSection({ devices }: { devices: PushDeviceSummary[] }) {
  const [removed, setRemoved] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const visible = devices.filter(
    (device) => device.state === "active" && !removed.includes(device.id)
  );

  if (visible.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aucun appareil enregistré. Ouvrez l&apos;application Joutes sur votre téléphone et
        acceptez les notifications : il apparaîtra ici.
      </p>
    );
  }

  function handleRemove(deviceId: string) {
    setError(null);
    startTransition(async () => {
      const result = await revokePushDeviceAction(deviceId);
      if (result.success) {
        setRemoved((current) => [...current, deviceId]);
      } else {
        setError(result.error ?? "Retrait impossible.");
      }
    });
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {visible.map((device) => {
          const lastSeen = DateTime.fromISO(device.lastSeenAt).setLocale("fr").toRelative();

          return (
            <li
              key={device.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                {device.platform === "ios" ? (
                  <TabletSmartphoneIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
                ) : (
                  <SmartphoneIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0">
                  <p className="font-medium">
                    {device.platform === "ios" ? "iPhone ou iPad" : "Android"}
                    {device.appVersion ? ` — version ${device.appVersion}` : ""}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Vu {lastSeen ?? "à l'instant"} · …{device.tokenPreview}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleRemove(device.id)}
                disabled={pending}
              >
                Retirer
              </Button>
            </li>
          );
        })}
      </ul>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
