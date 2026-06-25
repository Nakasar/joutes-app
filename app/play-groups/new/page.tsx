import CreatePlayGroupForm from "@/components/play-groups/CreatePlayGroupForm";

export const dynamic = "force-dynamic";

export default function NewPlayGroupPage() {
  return (
    <div className="container mx-auto max-w-7xl px-4 py-8">
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">Créer un groupe</h1>
          <p className="text-xl text-muted-foreground">Créez un nouveau groupe et invitez d&apos;autres joueurs à le rejoindre.</p>
        </div>
        <CreatePlayGroupForm />
      </div>
    </div>
  );
}

