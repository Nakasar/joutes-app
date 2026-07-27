Lis le contenu des fichiers de règles en PDF dans tmp/rules. A partir de ces fichiers, génère des fichiers JSON au format suivant :

```json
[
  { "id": "001", "content": "<rule content>" },
  { "id": "101.a.3.c", "content": "<rule content>" }
]
```

Garde le formatting markdown (gras, italique) dans content. Garde le content dans la langue source du document, ne fait aucune modification du contenu.

```
Riftbound Core Rules RUP4.pdf => cr.json
Riftbound Core Rules RUP4_FR.pdf => cr_fr.json
Riftbound Tournament Rules RUP4.pdf => tr.json
Riftbound Tournament Rules RUP4_FR.pdf => tr_fr.json
```