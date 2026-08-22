import { AccountPanelSkeleton } from "@/components/AccountPanelSkeleton.tsx";
import { Suspense } from "react";
import { Link } from "@/i18n/navigation.ts";
import {Button} from "@/components/ui/button.tsx";
import {ArrowLeft, Key} from "lucide-react";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "@/components/ui/card.tsx";
import {auth} from "@/lib/auth.ts";
import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {AddPassKeyButton, LinkProviderButton} from "@/app/[locale]/(app)/account/security/components.tsx";
import StreamAccountCard from "@/app/[locale]/(app)/account/security/StreamAccountCard.tsx";
import {readStreamAccountViews} from "@/lib/streams/account-view.ts";

async function AccountSecurityContent() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/login");
  }

  const passKeys = await auth.api.listPasskeys({
    headers: await headers(),
  });
  const socialAccounts = await auth.api.listUserAccounts({
    headers: await headers(),
  });
  const discordSocialAccount = socialAccounts.find(a => a.providerId === 'discord');
  const discordInfo = discordSocialAccount ? await auth.api.accountInfo({
    query: {
      accountId: discordSocialAccount.accountId,
    },
    headers: await headers(),
  }).catch(err => {
    console.debug(err);
    return null;
  }) : null;

  /**
   * Twitch et YouTube arrivent en un bloc, et pas seulement pour la liaison :
   * chaque carte porte aussi les endroits où le direct de la personne
   * s'annoncera. Le réglage vit ici parce que c'est ici qu'on relie le compte —
   * ailleurs, il faudrait expliquer de quelle chaîne on parle.
   */
  const streamAccounts = await readStreamAccountViews(session.user.id, socialAccounts);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 py-8">
      <div className="container mx-auto px-4 max-w-5xl">
        <div className="space-y-8">
          {/* Header avec retour */}
          <div className="flex items-center gap-4">
            <Link href="/account">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2"/>
                Retour
              </Button>
            </Link>
            <div className="flex-1 space-y-2">
              <h1 className="text-4xl font-bold tracking-tight">Sécurité</h1>
              <p className="text-muted-foreground">
                Configurez la sécurité de votre compte.
              </p>
            </div>
          </div>

          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5"/>
                Connexions et comptes
              </CardTitle>
              <CardDescription>
                Gérez vos connexions tierces.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                className="flex items-center justify-between border-b py-4 last:border-0"
              >
                <div>
                  <p className="font-medium">Discord</p>
                  <p className="text-sm text-muted-foreground">
                    {discordSocialAccount ? (<>
                      Connecté en tant que {discordInfo?.user?.name ?? discordSocialAccount.accountId}.
                    </>) : "Non connecté."}
                  </p>
                  {discordInfo?.user.image && <img src={discordInfo.user.image} alt={discordInfo.user.name ?? "Avatar"}
                                                   className="h-8 w-8 rounded-full mt-2"/>}
                </div>
                <form>
                  {discordSocialAccount ?
                    <Button variant="destructive" size="sm" formAction={async () => {
                      'use server';

                      await auth.api.unlinkAccount({
                        body: {
                          providerId: 'discord',
                        },
                        headers: await headers(),
                      })
                    }}>
                      Délier
                    </Button>
                    : <LinkProviderButton provider="discord"/>
                  }
                </form>
              </div>
            </CardContent>
          </Card>

          {streamAccounts.map((account) => (
            <StreamAccountCard key={account.platform} {...account} />
          ))}

          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5"/>
                Clés de connexion (PassKeys)
              </CardTitle>
              <CardDescription>
                Gérez vos clés de connexion WebAuthN/PassKeys pour une authentification sécurisée et sans mot de passe
                rapide sur vos appareils.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AddPassKeyButton/>
              {passKeys.map((key, index) => (
                <div
                  key={key.id}
                  className="flex items-center justify-between border-b py-4 last:border-0"
                >
                  <div>
                    <p className="font-medium">{key.name || `Clé ${index + 1}`}</p>
                    <p className="text-sm text-muted-foreground">
                      Enregistrée le {new Date(key.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Button variant="destructive" size="sm">
                    Supprimer
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

/**
 * Tout cet écran est derrière la porte, titre compris : on ne montre pas la
 * mise en page d'un espace personnel avant de savoir à qui il appartient. La
 * coquille ne garde que le conteneur et la silhouette.
 */
export default function AccountSecurity() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 py-8">
      <div className="container mx-auto px-4 max-w-5xl">
          <AccountPanelSkeleton cards={4} label="Chargement des réglages de sécurité" />
        </div>
    </div>
      }
    >
      <AccountSecurityContent />
    </Suspense>
  );
}
