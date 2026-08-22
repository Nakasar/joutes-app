"use client";

import { authClient } from "@/lib/auth-client.ts";
import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation.ts";
import {Button} from "@/components/ui/button.tsx";
import {Key} from "lucide-react";
import {useTranslations} from "next-intl";

/**
 * Les fournisseurs sociaux proposés à la connexion.
 *
 * La liste vient du serveur : Twitch et YouTube ne s'affichent que lorsqu'ils
 * sont configurés sur le déploiement, faute de quoi le bouton mènerait à une
 * erreur d'OAuth que personne ne saurait lire.
 *
 * Les deux ne créent **pas** de compte Joutes : `disableSignUp` est posé sur eux
 * dans `lib/auth.ts`. Un compte non lié qui les tente est refusé, et c'est le
 * comportement voulu — on lie sa chaîne depuis son compte, on n'ouvre pas un
 * compte depuis sa chaîne. Le message le dit plutôt que de laisser deviner.
 */
export type LoginSocialProvider = "discord" | "twitch" | "google";

const SOCIAL_LABELS: Record<LoginSocialProvider, string> = {
  discord: "Discord",
  twitch: "Twitch",
  google: "YouTube",
};

function LoginForm({ socialProviders }: { socialProviders: LoginSocialProvider[] }) {
  const t = useTranslations('Login');

  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"email" | "otp">("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl");
  const redirect = searchParams.get("redirect");
  const from = searchParams.get("from");

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      await authClient.emailOtp.sendVerificationOtp({
        email,
        type: "sign-in",
      });
      setStep("otp");
    } catch (err) {
      setError("Erreur lors de l'envoi du code. Veuillez réessayer.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      await authClient.signIn.emailOtp({
        email,
        otp,
      });
      
      // Rediriger vers l'URL de callback ou vers la page d'accueil
      if (callbackUrl) {
        window.location.href = callbackUrl;
      } else if (redirect) {
        router.push(redirect);
        router.refresh();
      } else if (from) {
        router.push(from);
        router.refresh();
      } else {
        router.push("/");
        router.refresh();
      }
    } catch (err) {
      setError("Code invalide. Veuillez réessayer.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            {t('title')}
          </h2>
        </div>

        {step === "email" ? (
          <div>
            <form className="mt-8 space-y-6" onSubmit={handleSendOTP}>
            <div>
              <label htmlFor="email" className="sr-only">
                {t('emailAddress')}
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder={t('emailAddress')}
              />
            </div>

            {error && (
              <div className="text-red-600 text-sm text-center">{error}</div>
            )}

            <div>
              <button
                type="submit"
                disabled={loading}
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? t('codeSending') : t('sendCode')}
              </button>
            </div>
          </form>
            <Button className="w-full mt-8" onClick={async () => {
              const { data, error } = await authClient.signIn.passkey({
                fetchOptions: {
                  onSuccess(context) {
                    router.push('/');
                  },
                  onError(context) {
                    // Handle authentication errors
                    console.error("Authentication failed:", context.error.message);
                  }
                }
              });
            }}>
              <Key />
              PassKey/WebAuthN
            </Button>
            {socialProviders.map((provider) => (
              <Button key={provider} className="w-full mt-8" onClick={async (event) => {
                event?.preventDefault();

                await authClient.signIn.social({
                  provider,
                  fetchOptions: {
                    onSuccess() {
                      router.push('/');
                    },
                    onError(context) {
                      // Twitch et YouTube refusent la création d'un compte : le
                      // message doit dire quoi faire, pas seulement que cela a
                      // échoué.
                      console.error("Authentication failed:", context.error.message);
                      setError(provider === "discord"
                        ? "Connexion impossible. Veuillez réessayer."
                        : `Aucun compte Joutes n'est lié à ce compte ${SOCIAL_LABELS[provider]}. Connectez-vous autrement, puis liez-le depuis « Connexions et comptes ».`);
                    }
                  }
                });
              }}>
                {SOCIAL_LABELS[provider]}
              </Button>
            ))}
          </div>
        ) : (
          <form className="mt-8 space-y-6" onSubmit={handleVerifyOTP}>
            <div>
              <p className="text-sm text-gray-600 mb-4">
                {t.rich('codeSent', {
                  strong: (c) => <strong>{c}</strong>,
                  email
                })}
                {/*Un code de vérification a été envoyé à{" "}
                <strong>{email}</strong>*/}
              </p>
              <label htmlFor="otp" className="sr-only">
                {t('OTP')}
              </label>
              <input
                id="otp"
                name="otp"
                type="text"
                required
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder={t('OTP')}
                maxLength={6}
              />
            </div>

            {error && (
              <div className="text-red-600 text-sm text-center">{error}</div>
            )}

            <div className="flex flex-col space-y-2">
              <button
                type="submit"
                disabled={loading}
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? t('verifyPending') : t('verifyCode')}
              </button>

              <button
                type="button"
                onClick={() => {
                  setStep("email");
                  setOtp("");
                  setError("");
                }}
                className="text-sm text-indigo-600 hover:text-indigo-500"
              >
                {t('resendCode')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function LoginPanel({ socialProviders }: { socialProviders: LoginSocialProvider[] }) {
  const t = useTranslations('Login');
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div>
            <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
              {t('title')}
            </h2>
          </div>
        </div>
      </div>
    }>
      <LoginForm socialProviders={socialProviders} />
    </Suspense>
  );
}
