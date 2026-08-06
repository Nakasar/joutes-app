import { NextResponse } from "next/server";
import { getMyPermissions } from "@/lib/db/permissions";

/**
 * Permissions effectives du compte connecté. Les clients s'en servent pour
 * n'afficher que les actions autorisées (publier une policy, modérer…).
 */
export async function GET() {
  try {
    const result = await getMyPermissions();

    if (!result) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Erreur lors de la récupération des permissions:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
