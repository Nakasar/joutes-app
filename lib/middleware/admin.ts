import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/config/admins";
import { headers } from "next/headers";

export async function requireAdmin() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.email || !isAdmin(session.user.email)) {
    throw new Error("Accès non autorisé");
  }

  return session;
}

export async function checkAdmin() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return session?.user?.email ? isAdmin(session.user.email) : false;
}
