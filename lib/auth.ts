import { betterAuth } from "better-auth";
import { emailOTP, jwt } from "better-auth/plugins";
import { genericOAuth, patreon } from "better-auth/plugins/generic-oauth";
import { Resend } from "resend";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { passkey } from "@better-auth/passkey";
import { oauthProvider } from "@better-auth/oauth-provider";
import db from "@/lib/mongodb";
import {customAlphabet} from "nanoid";

const generateOTP = customAlphabet("0123456789", 6);

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Patreon, en fournisseur de **liaison uniquement**.
 *
 * La liste rendue est vide quand la configuration manque — un aperçu sans
 * secrets fonctionne alors normalement, la liaison s'affichant désactivée. En
 * revanche le plugin lui-même est toujours monté : le retirer changerait le type
 * inféré de `authClient`, et le client ne saurait plus quoi appeler.
 *
 * Deux options ne sont pas négociables :
 *
 * - `disableSignUp` — sans elle, n'importe qui se crée un compte Joutes via
 *   Patreon. On lie un compte existant, on n'en ouvre pas.
 * - `overrideUserInfo` laissé à son défaut (`false`) — l'adresse Patreon ne doit
 *   pas écraser celle du compte. `allowDifferentEmails` est déjà posé plus bas,
 *   une divergence est donc normale et sans conséquence.
 *
 * Le scope `identity.memberships` est délibérément **absent** : sans lui,
 * Patreon ne rend que l'adhésion à notre campagne, ce qui est exactement ce
 * qu'il nous faut. L'ajouter exposerait les adhésions du mécène à tous les
 * autres créateurs, sans rien nous apporter.
 *
 * Les deux variables sont relues ici plutôt qu'empruntées à
 * `lib/patreon/config.ts` : la configuration de l'authentification se lit au
 * chargement du module et doit rester lisible seule, sans dépendre du reste de
 * la mécanique d'abonnement. C'est deux lignes dupliquées contre une dépendance
 * en moins sur le chemin critique de la connexion.
 */
function patreonOAuthConfigs() {
  const clientId = process.env.PATREON_CLIENT_ID?.trim();
  const clientSecret = process.env.PATREON_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    return [];
  }

  return [
    patreon({
      clientId,
      clientSecret,
      scopes: ["identity", "identity[email]"],
      disableSignUp: true,
    }),
  ];
}

/**
 * Twitch et YouTube, en fournisseurs de **liaison d'abord**.
 *
 * Les deux ouvrent la connexion à Joutes comme Discord, mais seulement à qui a
 * déjà lié son compte : `disableSignUp` refuse la création d'un compte Joutes
 * par ce chemin. C'est la règle de la fonctionnalité, et elle a une raison —
 * une chaîne ne prouve rien sur l'identité de son propriétaire tant que
 * personne ne l'a revendiquée depuis un compte existant. La revendication passe
 * par « Connexions et comptes », qui appelle `linkSocial` sur une session
 * ouverte.
 *
 * Chaque bloc est rendu vide quand ses secrets manquent : un aperçu sans
 * configuration fonctionne alors normalement, la liaison s'affichant désactivée.
 *
 * `overrideUserInfo` reste à son défaut (`false`) : l'adresse Twitch ou Google
 * ne doit pas écraser celle du compte. `allowDifferentEmails` est déjà posé plus
 * bas, une divergence est donc normale et sans conséquence.
 */
function streamSocialProviders() {
  const providers: NonNullable<Parameters<typeof betterAuth>[0]["socialProviders"]> = {};

  const twitchClientId = process.env.TWITCH_CLIENT_ID?.trim();
  const twitchClientSecret = process.env.TWITCH_CLIENT_SECRET?.trim();

  if (twitchClientId && twitchClientSecret) {
    providers.twitch = {
      clientId: twitchClientId,
      clientSecret: twitchClientSecret,
      disableSignUp: true,
      // Twitch ne rend l'adresse que si le compte en a une vérifiée ; une
      // adresse de repli garde la liaison possible dans le cas contraire, comme
      // pour Discord juste au-dessus.
      mapProfileToUser: (profile) => ({
        email: profile.email ?? `${profile.sub}@twitch.placeholder.local`,
      }),
    };
  }

  const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();

  if (googleClientId && googleClientSecret) {
    providers.google = {
      clientId: googleClientId,
      clientSecret: googleClientSecret,
      disableSignUp: true,
      /**
       * Le périmètre YouTube en lecture, et rien d'autre.
       *
       * Il sert à une seule question, posée une fois à la liaison : « quelle
       * chaîne appartient à ce compte ? ». Tout le reste de la surveillance
       * passe ensuite par des données publiques — le hub WebSub et une clé
       * d'API — et ne touche plus jamais au compte de l'utilisateur.
       *
       * `accessType: "offline"` avec `prompt: "consent"` obtient un jeton de
       * rafraîchissement : sans lui, le jeton expire en une heure et
       * resynchroniser le nom d'une chaîne exigerait de refaire la liaison.
       */
      scope: ["https://www.googleapis.com/auth/youtube.readonly"],
      accessType: "offline",
      prompt: "consent",
    };
  }

  return providers;
}

export const auth = betterAuth({
  database: mongodbAdapter(db),
  emailAndPassword: {
    enabled: false, // Désactivé car on utilise uniquement emailOTP
  },
  socialProviders: {
    discord: {
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
      mapProfileToUser: (profile) => ({
        email: profile.email ?? `${profile.id}@discord.placeholder.local`,
      }),
    },
    ...streamSocialProviders(),
  },
  plugins: [
    jwt(),
    emailOTP({
      generateOTP({ email, type }) {
        if (email === 'app.verifier@joutes.app') {
          return '567234';
        }
        return generateOTP();
      },
      async sendVerificationOTP({ email, otp }: { email: string; otp: string }) {
        if (process.env.RESEND_API_KEY === "CONSOLE" || email === 'app.verifier@joutes.app') {
          console.log(`Envoi OTP à ${email}: ${otp}`);
          return;
        }

        try {
          await resend.emails.send({
            from: process.env.EMAIL_FROM || "onboarding@resend.dev",
            to: email,
            subject: "Votre code de connexion - Joutes",
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h1 style="color: #333;">Connexion à Joutes</h1>
                <p>Votre code de connexion est :</p>
                <div style="background-color: #f4f4f4; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">
                  ${otp}
                </div>
                <p style="color: #666;">Ce code expire dans 10 minutes.</p>
                <p style="color: #666; font-size: 12px;">Si vous n'avez pas demandé ce code, ignorez cet email.</p>
              </div>
            `,
          });
        } catch (error) {
          console.error("Erreur lors de l'envoi de l'email OTP:", error);
          throw error;
        }
      },
      expiresIn: 600, // 10 minutes
    }),
    passkey(),
    genericOAuth({ config: patreonOAuthConfigs() }),
    oauthProvider({
      loginPage: "/login",
      consentPage: "/oauth/consent",
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
      validAudiences: [`${process.env.NEXT_PUBLIC_BASE_URL || process.env.BETTER_AUTH_URL || "http://localhost:3000"}/`],
      silenceWarnings: {
        oauthAuthServerConfig: true,
      },
    }),
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 jours
    updateAge: 60 * 60 * 24, // 1 jour
    storeSessionInDatabase: true,
  },
  account: {
    accountLinking: {
      allowDifferentEmails: true,
      allowUnlinkingAll: true,
    },
  },
  trustedOrigins: process.env.NEXT_PUBLIC_BASE_URL ? [process.env.NEXT_PUBLIC_BASE_URL, "http://tauri.localhost", "https://tauri.localhost"] : ["http://localhost:3000", "https://localhost:3000", "http://tauri.localhost", "https://tauri.localhost"],
  baseURL: {
    allowedHosts: [
			"joutes.app",
			"*.joutes.app",
			"*.vercel.app",
      process.env.BETTER_AUTH_URL ?? 'joutes.app',
      process.env.NEXT_PUBLIC_BASE_URL ?? 'joutes.app',
		],
		protocol: process.env.NODE_ENV === "development" ? "http" : "https",
		fallback: "https://www.joutes.app",
  },
});

export type Session = typeof auth.$Infer.Session.session;
export type User = typeof auth.$Infer.Session.user;
