import Link from "next/link";

export default async function AvatarPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="space-y-8">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold">Avatar</h1>
          <p className="text-sm text-muted-foreground">
            Explorez Joutes avec votre avatar personnalisé, propulsé par <Link
            href="https://breign.eu"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            https://breign.eu
          </Link> et <Link
            href="https://avatar.lu"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            https://avatar.lu
          </Link>.
          </p>

          <p className="italic text-muted">Les conversations avec l&apos;avatar sont conservées par le fournisseur Breign. Vérifiez toujours les informations fournies.</p>
        </div>

        <script
          src="https://web.avatar.lu/widget-avatar.js"
          data-client-id="avatar-riftbound-1871"
          data-agent-id="154a62ef-2e09-4beb-ab88-f66eee4550ee"
          data-lang="fr"
          async>
        </script>
      </div>
    </div>
  )
}