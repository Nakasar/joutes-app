export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  // Without these, an unhandled rejection anywhere in the app (e.g. a
  // MongoDB query that fails while the database is unreachable) crashes the
  // whole Node process instead of just failing the request that caused it,
  // taking every other in-flight request down with it.
  process.on("unhandledRejection", (reason) => {
    console.error("Unhandled promise rejection:", reason);
  });

  process.on("uncaughtException", (error) => {
    console.error("Uncaught exception:", error);
  });
}
