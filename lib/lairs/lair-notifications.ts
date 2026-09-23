import "server-only";

import type { Lair, LairNewsItem } from "@/lib/types/Lair";
import { notifyLairFollowers } from "@/lib/services/notifications";

/**
 * Les notifications d'un lieu à ceux qui le suivent : une annonce épinglée,
 * un direct qui commence. Aucune ne lève : elles accompagnent une écriture
 * qui doit réussir sans elles.
 *
 * Une notification de lieu mène d'elle-même à la page du lieu
 * (`lib/notifications/deeplink.ts`), où l'annonce épinglée et le direct sont
 * en tête.
 */

function truncate(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

export async function notifyLairPinnedNews(lair: Pick<Lair, "id" | "name">, item: LairNewsItem): Promise<void> {
  try {
    const summary = item.summary?.trim();
    await notifyLairFollowers(
      lair.id,
      `📌 ${lair.name}`,
      summary ? `${item.title} — ${truncate(summary, 200)}` : item.title
    );
  } catch (error) {
    console.error(`Notification d'annonce épinglée du lieu ${lair.id} échouée`, error);
  }
}

export async function notifyLairLive(lair: Pick<Lair, "id" | "name">, title?: string): Promise<void> {
  try {
    await notifyLairFollowers(
      lair.id,
      `🔴 ${lair.name} est en direct`,
      title?.trim() ? truncate(title.trim(), 200) : "Le direct vient de commencer : retrouvez-le en tête de la page du lieu."
    );
  } catch (error) {
    console.error(`Notification de direct du lieu ${lair.id} échouée`, error);
  }
}
