declare global {
  // eslint-disable-next-line no-var
  var __processErrorHandlersRegistered: boolean | undefined;
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  // register() can run more than once per process (HMR reloads in dev,
  // repeated instrumentation setup, ...). Without this guard, each run adds
  // another pair of listeners, so a single failure gets logged multiple
  // times and listeners pile up indefinitely.
  if (globalThis.__processErrorHandlersRegistered) {
    return;
  }
  globalThis.__processErrorHandlersRegistered = true;

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
