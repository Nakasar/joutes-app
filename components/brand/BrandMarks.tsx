/**
 * Les marques que `lucide-react` ne porte pas.
 *
 * La bibliothèque d'icônes du dépôt couvre Twitch, YouTube, Instagram et
 * Facebook, mais pas Bluesky, X, TikTok ni Mastodon — et `SocialLinkIcon` s'en
 * tirait jusqu'ici par une arobase. C'était défendable pour une liste de liens,
 * où le libellé dit déjà tout. Ça ne l'est plus pour une grille de vignettes,
 * où le logo est ce qui se lit d'un coup d'œil et où trois plateformes
 * différentes porteraient le même symbole.
 *
 * Ces glyphes suivent la convention des SVG maison du dépôt
 * (`components/WinterSVGs.tsx`) : un `viewBox`, `fill="currentColor"` pour que
 * la couleur vienne du texte environnant, `aria-hidden` parce qu'ils décorent
 * un libellé qui, lui, est lisible, et une seule prop `className` pour la
 * taille.
 *
 * Les tracés sont les marques officielles, reprises telles quelles. Elles
 * servent ici à **désigner la plateforme d'origine d'un contenu**, ce que les
 * chartes de marque autorisent explicitement ; elles ne sont ni recolorées, ni
 * déformées, ni employées comme logo de Joutes.
 */

type MarkProps = { className?: string };

/** Le papillon de Bluesky. */
export function BlueskyMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 600 530" fill="currentColor" className={className} aria-hidden>
      <path d="M135.72 44.03C202.216 93.951 273.74 195.17 300 249.49c26.262-54.316 97.782-155.54 164.28-205.46C512.26 8.009 590-19.862 590 68.825c0 17.712-10.155 148.79-16.111 170.07-20.703 73.984-96.144 92.854-163.25 81.433 117.3 19.964 147.14 86.092 82.697 152.22-122.39 125.59-175.91-31.511-189.63-71.766-2.514-7.38-3.69-10.832-3.708-7.896-.017-2.936-1.193.516-3.707 7.896-13.714 40.255-67.233 197.36-189.63 71.766-64.444-66.128-34.605-132.26 82.697-152.22-67.108 11.421-142.55-7.449-163.25-81.433C20.156 217.616 10 86.536 10 68.825c0-88.687 77.742-60.816 125.72-24.795z" />
    </svg>
  );
}

/** Le glyphe de X, anciennement Twitter. */
export function XMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 1200 1227" fill="currentColor" className={className} aria-hidden>
      <path d="M714.163 519.284 1160.89 0h-105.86L667.137 450.887 357.328 0H0l468.492 681.821L0 1226.37h105.866l409.625-476.152 327.181 476.152H1200L714.137 519.284h.026ZM569.165 687.828l-47.468-67.894-377.686-540.24h162.604l304.797 435.991 47.468 67.894 396.2 566.721H892.476L569.165 687.854v-.026Z" />
    </svg>
  );
}

/** La note de musique de TikTok. */
export function TikTokMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
    </svg>
  );
}

/** L'éléphant de Mastodon. */
export function MastodonMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M23.268 5.313c-.35-2.578-2.617-4.61-5.304-5.004C17.51.242 15.792 0 11.813 0h-.03c-3.98 0-4.835.242-5.288.309C3.882.692 1.496 2.518.917 5.127.64 6.412.61 7.837.661 9.143c.074 1.874.088 3.745.26 5.611.118 1.24.325 2.47.62 3.68.55 2.237 2.777 4.098 4.96 4.857 2.336.792 4.849.923 7.256.38.265-.061.527-.132.786-.213.585-.184 1.27-.39 1.774-.753a.057.057 0 0 0 .023-.043v-1.809a.052.052 0 0 0-.02-.041.053.053 0 0 0-.046-.01 20.282 20.282 0 0 1-4.709.545c-2.73 0-3.463-1.284-3.674-1.818a5.593 5.593 0 0 1-.319-1.433.053.053 0 0 1 .066-.054c1.517.363 3.072.546 4.632.546.376 0 .75 0 1.125-.01 1.57-.044 3.224-.124 4.768-.422.038-.008.077-.015.11-.024 2.435-.464 4.753-1.92 4.989-5.604.008-.145.03-1.52.03-1.67.002-.512.167-3.63-.024-5.545zm-3.748 9.195h-2.561V8.29c0-1.309-.55-1.976-1.67-1.976-1.23 0-1.846.79-1.846 2.35v3.403h-2.546V8.663c0-1.56-.617-2.35-1.848-2.35-1.112 0-1.668.668-1.669 1.977v6.218H4.822V8.102c0-1.31.337-2.35 1.011-3.12.696-.77 1.608-1.164 2.74-1.164 1.311 0 2.302.5 2.962 1.498l.638 1.06.638-1.06c.66-.999 1.65-1.498 2.96-1.498 1.13 0 2.043.395 2.74 1.164.675.77 1.012 1.81 1.012 3.12z" />
    </svg>
  );
}

/** Le vaisseau de Reddit. */
export function RedditMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 0C5.373 0 0 5.373 0 12c0 3.314 1.343 6.314 3.515 8.485l-2.286 2.286A.72.72 0 0 0 1.738 24H12c6.627 0 12-5.373 12-12S18.627 0 12 0Zm4.388 3.199a1.999 1.999 0 1 1-1.947 2.46v.002a2.37 2.37 0 0 0-2.032 2.341v.007c1.464.043 2.8.457 3.861 1.11a2.888 2.888 0 1 1 3.201 4.72c-.36 3.011-3.786 5.36-7.933 5.36-4.14 0-7.562-2.34-7.93-5.345a2.888 2.888 0 1 1 3.18-4.732c1.055-.65 2.38-1.063 3.83-1.11v-.031a3.36 3.36 0 0 1 2.79-3.303 2 2 0 0 1 1.98-1.48ZM9.44 12.352a1.128 1.128 0 0 0-.798 1.926 1.128 1.128 0 1 0 1.596-1.596 1.128 1.128 0 0 0-.798-.33Zm5.13 0a1.128 1.128 0 1 0 0 2.256 1.128 1.128 0 0 0 0-2.256Zm-4.05 4.28a.343.343 0 0 0-.244.588c.688.688 2.022.744 2.412.744.389 0 1.723-.056 2.411-.744a.34.34 0 0 0 .097-.243.343.343 0 0 0-.341-.345.34.34 0 0 0-.24.098c-.435.434-1.365.589-1.927.589-.562 0-1.492-.155-1.928-.59a.34.34 0 0 0-.24-.096Z" />
    </svg>
  );
}
