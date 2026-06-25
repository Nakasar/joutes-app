import PlayGroupsPageClient from "@/components/play-groups/PlayGroupsPageClient";

export const dynamic = "force-dynamic";

export default function PlayGroupsPage() {
  return (
    <div className="container mx-auto max-w-7xl px-4 py-8">
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">Groupes de jeu</h1>
          <p className="text-xl text-muted-foreground">
            Gérez vos groupes, vos invitations et les membres de votre équipe.
          </p>
        </div>
        <PlayGroupsPageClient />
      </div>
    </div>
  );
}
