import Link from "next/link";
import { Search } from "lucide-react";
import { requireAdmin } from "@/lib/middleware/admin";
import { searchUsersForAdmin } from "@/lib/db/users";
import { adminUserProfilePath, adminUserTag } from "@/lib/users/admin-search";
import { Button } from "@/components/ui/button";

/**
 * Recherche d'utilisateurs, pour atteindre un profil sans passer par un lien
 * trouvé ailleurs.
 *
 * Formulaire en GET plutôt qu'en composant client : la recherche tient dans
 * l'URL, se partage, se recharge, et fonctionne sans JavaScript — trois
 * propriétés qu'un champ réactif aurait fait perdre pour rien.
 *
 * **Aucune adresse e-mail n'est affichée ni recherchable.** C'est une donnée
 * personnelle : la lecture ne la rapporte même pas de la base
 * (`searchUsersForAdmin`), et chercher par e-mail confirmerait qu'une adresse
 * appartient à un compte, ce qui revient à l'exposer.
 */
export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireAdmin();

  const { q } = await searchParams;
  const term = (q ?? "").trim();
  const users = term.length > 0 ? await searchUsersForAdmin(term) : [];

  return (
    <div className="bg-muted/50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Utilisateurs</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Retrouver un joueur par son pseudonyme, son tag complet «&nbsp;Pseudo#1234&nbsp;» ou
            son identifiant, et ouvrir son profil. Les adresses e-mail ne sont ni affichées ni
            recherchables.
          </p>
        </div>

        <form method="get" className="mb-6 flex flex-wrap items-center gap-2">
          <input
            type="search"
            name="q"
            defaultValue={term}
            autoFocus
            placeholder="Pseudonyme, Pseudo#1234, ou identifiant"
            aria-label="Rechercher un utilisateur"
            className="min-w-0 flex-1 px-4 py-2 border border-input rounded-lg bg-background focus:ring-2 focus:ring-ring focus:border-transparent"
          />
          <Button type="submit">
            <Search className="mr-2 h-4 w-4" />
            Rechercher
          </Button>
        </form>

        {term.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Saisissez une recherche pour afficher des résultats.
          </p>
        ) : users.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun utilisateur ne correspond à «&nbsp;{term}&nbsp;».
          </p>
        ) : (
          <div className="bg-card rounded-lg shadow-md overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Utilisateur
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Identifiant
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Profil
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-card divide-y divide-border">
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap items-center gap-3">
                        {user.avatar ? (
                          <img src={user.avatar} alt="" className="h-9 w-9 rounded-full object-cover" />
                        ) : (
                          <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                            {adminUserTag(user).charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span className="text-sm font-medium text-foreground">
                          {adminUserTag(user)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <code className="text-xs text-muted-foreground">{user.id}</code>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {user.isPublicProfile ? "Public" : "Privé"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={adminUserProfilePath(user)}>Voir le profil</Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {users.length >= 25 && (
          <p className="mt-4 text-xs text-muted-foreground">
            Seuls les 25 premiers résultats sont affichés : précisez la recherche pour la
            resserrer.
          </p>
        )}
      </div>
    </div>
  );
}
