import { betterAuth } from "better-auth";
import { emailOTP } from "better-auth/plugins";
import { Resend } from "resend";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { getAuthDatabaseSync } from "@/lib/mongodb";

const resend = new Resend(process.env.RESEND_API_KEY);

export const auth = betterAuth({
  database: mongodbAdapter(getAuthDatabaseSync()),
  emailAndPassword: {
    enabled: false, // Désactivé car on utilise uniquement emailOTP
  },
  plugins: [
    emailOTP({
      async sendVerificationOTP({ email, otp }: { email: string; otp: string }) {
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
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 jours
    updateAge: 60 * 60 * 24, // 1 jour
  },
});

export type Session = typeof auth.$Infer.Session.session;
export type User = typeof auth.$Infer.Session.user;
