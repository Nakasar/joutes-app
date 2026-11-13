import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
 
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Le lint ne tournait plus depuis le passage à ESLint 10 : à sa remise en
    // route, ces règles relèvent près de 240 cas dans du code qui fonctionne.
    // Elles restent visibles en avertissement, le temps de les traiter par
    // lots ; les autres erreurs, elles, font échouer la vérification.
    rules: {
      // 148 liens `<a href="/…">` vers nos pages : à passer au `Link` de
      // `@/i18n/navigation`, qui garde la langue et évite un rechargement.
      '@next/next/no-html-link-for-pages': 'warn',
      // Les règles du compilateur React, arrivées avec eslint-plugin-react-hooks 7.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/error-boundaries': 'warn',
      'react/display-name': 'warn',
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'scripts/**',
    // Fichiers produits par scripts/build-mcp-apps.mjs.
    'app/mcp/apps/*.generated.ts',
    'design/**',
    // Moteur de jeu compilé (dépôt joutes-engine) et son binaire en base64.
    'lib/engine/pkg/**',
    'lib/engine/wasm.generated.ts',
    'lib/engine/swu/pkg/**',
    'lib/engine/swu/wasm.generated.ts',
  ]),
])
 
export default eslintConfig