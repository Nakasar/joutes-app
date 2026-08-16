import { Badge } from "@/components/ui/badge";
import { AchievementIcon } from "@/components/AchievementIcon";
import { statusBadgeClass } from "@/lib/achievements/status-tone";
import type { StatusView } from "@/lib/achievements/status";
import { cn } from "@/lib/utils";

/**
 * Un statut accordé par l'équipe, affiché à côté d'un pseudonyme.
 *
 * Purement présentationnel, comme `PlanBadge` : il reçoit le statut, il ne le
 * cherche pas. Les deux se côtoient dans le même titre, et ne disent pas la
 * même chose — l'un est acheté, l'autre accordé.
 */
export function StatusBadge({ status, className }: { status: StatusView; className?: string }) {
  return (
    <Badge variant="outline" className={cn(statusBadgeClass(status.tone), className)}>
      {(status.icon || status.iconImage) && (
        <AchievementIcon
          icon={status.icon}
          iconImage={status.iconImage}
          name={status.name}
          size={14}
          className="mr-1"
        />
      )}
      {status.name}
    </Badge>
  );
}
