# Notes particulières

- Dans les composants html (JSX) uniquement, assure toi de bien escape tous les caractères spéciaux dans les chaînes de caractères dans les balises HTML (par exemple `'` doit être escape en `&apos`, `"` en `&quot;`, mais `"l'événement"` reste tel quel car entouré de ""). N'escape pas les chaînes templates ou en JS/TS.
- Utilise la librairie `luxon` pour gérer les dates et leurs formats (object `DateTime`).
- N'utilise pas d'imports dynamique.
