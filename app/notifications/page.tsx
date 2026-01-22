import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getNotificationsAction } from "./actions";
import { NotificationsList } from "./NotificationsList";
import { Bell } from "lucide-react";

export default async function NotificationsPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/login");
  }

  const result = await getNotificationsAction();

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
          />
        </div>
      </div>
    </div>
  );
}
