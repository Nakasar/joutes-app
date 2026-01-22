# Notes particulières

- Dans les composants (JSX), assure toi de bien escape tous les caractères spéciaux dans les chaînes de caractères hors quotes (par exemple `'` doit être escape en `&apos`, `"` en `&quot;`, mais `"l'événement"` reste tel quel car entouré de "").
- Utilise la librairie `luxon` pour gérer les dates et leurs formats (object `DateTime`).
- N'utilise pas d'imports dynamique.
