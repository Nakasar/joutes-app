import LoginPanel, { type LoginSocialProvider } from "@/app/[locale]/(app)/login/LoginForm.tsx";
import { twitchOAuthConfigured, youtubeOAuthConfigured } from "@/lib/streams/config.ts";

/**
 * La page de connexion, réduite à un choix : quels boutons proposer.
 *
 * Le formulaire lui-même est client — il tient des états, appelle Better Auth,
 * redirige. Ce qu'il ne peut pas faire, c'est lire la configuration du
 * déploiement : un bouton Twitch sur un environnement sans identifiants mènerait
 * à une page d'erreur d'OAuth. D'où cette coquille serveur, qui ne fait que
 * dresser la liste.
 */
export default function LoginPage() {
  const socialProviders: LoginSocialProvider[] = ["discord"];

  if (twitchOAuthConfigured()) {
    socialProviders.push("twitch");
  }

  if (youtubeOAuthConfigured()) {
    socialProviders.push("google");
  }

  return <LoginPanel socialProviders={socialProviders} />;
}
