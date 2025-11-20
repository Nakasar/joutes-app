import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getEventById } from "@/lib/db/events";
import { getUserById } from "@/lib/db/users";
import { getLairById } from "@/lib/db/lairs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json(
        { error: "Non authentifié" },
        { status: 401 }
      );
    }

    const { eventId } = await params;
    const event = await getEventById(eventId);

    if (!event) {
      return NextResponse.json(
        { error: "Événement introuvable" },
        { status: 404 }
      );
    }

    // Vérifier si l'utilisateur est le créateur de l'événement
    const isCreator = event.creatorId === session.user.id;

    // Vérifier si l'utilisateur est propriétaire du lair
    let isLairOwner = false;
    if (event.lairId) {
      const lair = await getLairById(event.lairId);
      if (lair && lair.owners && lair.owners.includes(session.user.id)) {
        isLairOwner = true;
      }
    }

    // Si l'utilisateur n'est ni créateur ni propriétaire, refuser l'accès
    if (!isCreator && !isLairOwner) {
      return NextResponse.json(
        { error: "Accès non autorisé" },
        { status: 403 }
      );
    }

    // Récupérer les informations des utilisateurs qui ont mis en favori
    const favoritedUsers = event.favoritedBy
      ? await Promise.all(
          event.favoritedBy.map(async (userId) => {
            const user = await getUserById(userId);
            if (user) {
              return {
                id: user.id,
                username: user.username,
                displayName: user.displayName,
                discriminator: user.discriminator,
              };
            }
            return null;
          })
        )
      : [];

    // Filtrer les null values
    const validUsers = favoritedUsers.filter((user) => user !== null);

    return NextResponse.json({ users: validUsers });
  } catch (error) {
    console.error("Erreur lors de la récupération des favoris:", error);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}
