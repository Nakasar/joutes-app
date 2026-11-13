import init, * as engine from "@/lib/engine/cyberpunk/pkg/joutes_cyberpunk.js";

export type CpBrowserEngine = typeof engine;

let loading: Promise<CpBrowserEngine> | undefined;

/**
 * Le moteur de Cyberpunk TCG dans le navigateur. Comme ceux des autres jeux,
 * son binaire n'est téléchargé qu'au premier appel.
 */
export function loadCpEngine(): Promise<CpBrowserEngine> {
  loading ??= init().then(() => engine);
  loading.catch(() => {
    loading = undefined;
  });
  return loading;
}
