import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getEventById } from "@/lib/db/events";
import { joinEventAction } from "../../actions";

type JoinPageProps = {
  params: Promise<{
    eventId: string;
  }>;
};

export default async function JoinPage({ params }: JoinPageProps) {
  const { eventId } = await params;
  
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  // Si l'utilisateur n'est pas connecté, rediriger vers la page de login
  if (!session?.user) {
    redirect(`/login?redirect=/events/${eventId}/join`);
  }

  // Vérifier que l'événement existe
  const event = await getEventById(eventId);
  if (!event) {
    redirect("/events");
  }

  // Tenter d'inscrire l'utilisateur
  const result = await joinEventAction(eventId);

  // Rediriger vers la page de l'événement avec un message
  if (result.success) {
    redirect(`/events/${eventId}?joined=true`);
  } else {
    redirect(`/events/${eventId}?error=${encodeURIComponent(result.error || "Erreur")}`);
  }
}
