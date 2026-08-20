import { Suspense } from "react";
import { Bell } from "lucide-react";
import { AccountPanelSkeleton } from "@/components/AccountPanelSkeleton.tsx";
import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getNotificationsAction } from "./actions.ts";
import { NotificationsList } from "./NotificationsList.tsx";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Notifications",
  robots: { index: false, follow: false },
};

type NotificationsPageProps = {
  searchParams: Promise<{
    page?: string;
  }>;
};

async function NotificationsPageContent({ searchParams }: NotificationsPageProps) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/login");
  }

  const params = await searchParams;
  const page = parseInt(params.page || '1', 10);
  const limit = 20;

  const result = await getNotificationsAction(page, limit);

  if (!result.success || !result.notifications) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-lg shadow-sm p-6">
            <p className="text-red-600">
              Erreur lors de la récupération des notifications : {result.error}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <Bell className="w-8 h-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900">Notifications</h1>
          </div>
          <p className="text-gray-600">
            Retrouvez ici toutes vos notifications concernant vos événements, lieux et jeux.
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6">
          <NotificationsList
            initialNotifications={result.notifications}
            userId={session.user.id}
            initialPage={page}
            initialTotal={result.total || 0}
            limit={limit}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Tout cet écran est derrière la porte. La coquille ne garde que le conteneur
 * et la silhouette : ce que l'écran contient n'a pas à s'afficher avant que la
 * porte ait répondu.
 */
export default function NotificationsPage(props: Parameters<typeof NotificationsPageContent>[0]) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 p-6">
          <AccountPanelSkeleton cards={2} label="Chargement de vos notifications" />
        </div>
      }
    >
      <NotificationsPageContent {...props} />
    </Suspense>
  );
}
