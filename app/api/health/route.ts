import db from "@/lib/mongodb";

/**
 * État de santé de l'API, vers lequel pointe la relation `status` du catalogue
 * (RFC 9727). Un agent qui reçoit une erreur a besoin de savoir si c'est lui ou
 * nous : c'est la seule chose que cette route répond.
 *
 * Le format est celui du « Health Check Response Format for HTTP APIs »
 * (`application/health+json`), le même vocabulaire `pass` / `fail` que les
 * superviseurs savent déjà lire.
 */

/** MongoDB porte toutes les lectures : l'API sans elle ne sert rien. */
async function checkDatabase(): Promise<{ ok: boolean; error?: string }> {
  try {
    // Le client échoue en 5 s quand le serveur est injoignable
    // (`serverSelectionTimeoutMS`), plutôt que de tenir la requête ouverte.
    await db.command({ ping: 1 });
    return { ok: true };
  } catch (error) {
    console.error("Health check: MongoDB ping failed:", error);
    return { ok: false, error: error instanceof Error ? error.message : "unknown error" };
  }
}

/**
 * Sans cela, Next servirait une réponse figée au build : un état de santé mis
 * en cache ne dit plus rien de l'état présent.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const database = await checkDatabase();
  const healthy = database.ok;

  const body = {
    status: healthy ? "pass" : "fail",
    checks: {
      "database:ping": [
        {
          componentType: "datastore",
          status: database.ok ? "pass" : "fail",
          ...(database.error ? { output: database.error } : {}),
        },
      ],
    },
  };

  return new Response(JSON.stringify(body, null, 2), {
    // 503 plutôt que 200 : un agent qui n'inspecte que le code doit voir la
    // panne, sinon la sonde ment à ceux qui ne lisent pas le corps.
    status: healthy ? 200 : 503,
    headers: {
      "Content-Type": "application/health+json",
      // Une sonde relue depuis un cache décrit un passé, pas l'instant.
      "Cache-Control": "no-store",
    },
  });
}
