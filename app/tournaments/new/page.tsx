import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { NewTournamentForm } from "./NewTournamentForm";

export const metadata: Metadata = {
  title: "Créer un tournoi",
};

export default async function NewTournamentPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Créer un tournoi</h1>
      <NewTournamentForm />
    </div>
  );
}
