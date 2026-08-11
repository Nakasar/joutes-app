# Notes particulières

- Dans les composants html (JSX) uniquement, assure toi de bien escape tous les caractères spéciaux dans les chaînes de caractères dans les balises HTML (par exemple `'` doit être escape en `&apos`, `"` en `&quot;`, mais `"l'événement"` reste tel quel car entouré de ""). N'escape pas les chaînes templates ou en JS/TS.
- Utilise la librairie `luxon` pour gérer les dates et leurs formats (object `DateTime`).
- N'utilise pas d'imports dynamique.
- Les composants `Button` et `Badge` portent `whitespace-nowrap shrink-0` : ils ne se coupent ni ne rétrécissent. Une rangée `flex` qui en aligne plusieurs doit porter `flex-wrap`, faute de quoi elle élargit **le document entier** sur un téléphone — ce n'est pas la rangée qui déborde, c'est toute la page qui se décale. `node scripts/check-flex-rows.mjs` relève les rangées à risque (il sort en erreur s'il en trouve).
