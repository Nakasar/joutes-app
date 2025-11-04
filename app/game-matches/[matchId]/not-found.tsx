export default function NotFound() {
  return (
    <div className="container max-w-4xl mx-auto px-4 py-8">
      <div className="p-6 bg-destructive/10 border border-destructive rounded-lg">
        <h2 className="text-lg font-semibold mb-2">Partie non trouvée</h2>
        <p className="text-muted-foreground">
          La partie que vous recherchez n&apos;existe pas ou a été supprimée.
        </p>
      </div>
    </div>
  );
}
