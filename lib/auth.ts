import { betterAuth } from "better-auth";
import { emailOTP, jwt } from "better-auth/plugins";
import { Resend } from "resend";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { passkey } from "@better-auth/passkey";
import { oauthProvider } from "@better-auth/oauth-provider";
import db from "@/lib/mongodb";
import {customAlphabet} from "nanoid";

const generateOTP = customAlphabet("0123456789", 6);

const resend = new Resend(process.env.RESEND_API_KEY);

// Le code de revue a la même longueur que les codes envoyés par email : le
// champ de saisie de `/login` est plafonné à 6 caractères, un code plus long y
// serait tronqué.
const REVIEW_OTP_LENGTH = 6;

/**
 * Compte à code fixe utilisé par les validateurs des app stores, qui n'ont pas
 * accès à la boîte mail associée. Il n'est actif que si `APP_REVIEW_EMAIL` et
 * `APP_REVIEW_OTP` sont tous deux configurés : aucune valeur par défaut n'est
 * codée en dur, sans quoi le code serait public avec les sources.
 *
 * Ce code ne tourne pas et tient lieu de mot de passe permanent. Sur 6
 * caractères il reste énumérable, d'autant qu'un nouvel envoi régénère le même
 * code : ne l'activer que le temps d'une revue, et limiter le débit des envois
 * et vérifications sur cette adresse si le compte doit rester ouvert.
 */
function getReviewAccount(): { email: string; otp: string } | null {
  const email = process.env.APP_REVIEW_EMAIL?.trim().toLowerCase();
  const otp = process.env.APP_REVIEW_OTP?.trim();

  if (!email || !otp || otp.length !== REVIEW_OTP_LENGTH) {
    return null;
  }

  return { email, otp };
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
  },
  plugins: [
    jwt(),
    emailOTP({
      generateOTP({ email }) {
        const review = getReviewAccount();
        if (review && email.toLowerCase() === review.email) {
          return review.otp;
        }
        return generateOTP();
      },
      async sendVerificationOTP({ email, otp }: { email: string; otp: string }) {
        // Le compte de revue applicative ne reçoit pas d'email : son code vient
        // de la configuration, et le journaliser le rendrait lisible par
        // quiconque a accès aux logs.
        const review = getReviewAccount();
        if (review && email.toLowerCase() === review.email) {
          return;
        }

        if (process.env.RESEND_API_KEY === "CONSOLE") {
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
