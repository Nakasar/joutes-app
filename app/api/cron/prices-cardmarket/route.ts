import { NextResponse } from "next/server";
import { importAllPrices } from "@/lib/services/price-imports";

/**
 * L'import quotidien des prix Cardmarket, pour chaque jeu qu'il sait coter.
 *
 * `?game=<slug>` limite l'import à un jeu, pour la main. Un import dont le
 * nombre de cartes cotées s'effondre n'est pas écrit (cf.
 * `lib/prices/import-guard.ts`) : il se rattrape avec le script, `--force`.
 * Cf. docs/CARD_PRICES.md.
 */
export const maxDuration = 300;

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || req.headers.get("Authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const game = new URL(req.url).searchParams.get("game");
  const runs = await importAllPrices("cardmarket", game ? [game] : undefined);

  // Un import refusé ou en échec rend le passage rouge dans les journaux de
  // Vercel : c'est le seul endroit où quelqu'un le verra.
  const ok = runs.every((run) => run.status !== "failed" && run.status !== "rejected");

  return NextResponse.json({ ok, runs }, { status: ok ? 200 : 500 });
}
