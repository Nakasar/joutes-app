// Détecteur de rangées incompressibles — `node scripts/check-flex-rows.mjs`.
//
// Trois débordements horizontaux sur téléphone ont eu la même cause : une
// rangée `flex` à laquelle on ajoute un bouton de plus. Ce script répond à la
// question « où cela peut-il se reproduire ? » sans avoir à relire l'application.
//
// Dans ce dépôt, `Button` et `Badge` portent `whitespace-nowrap shrink-0` : ils
// ne se coupent pas et ne rétrécissent pas. Deux d'entre eux **enfants directs**
// d'une rangée `flex` sans `flex-wrap` peuvent donc élargir le document entier
// sur un écran étroit, au lieu de passer à la ligne.
//
// L'analyse passe par le compilateur TypeScript plutôt que par une expression
// régulière : seule une vraie lecture de l'arbre JSX distingue un enfant direct
// d'un descendant enfoui dans une boîte de dialogue.
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";

const roots = ["app", "components"];
const RIGID_TAGS = new Set(["Button", "Badge"]);

/**
 * Un composant maison rend souvent un bouton sans le dire dans son nom
 * (`ExportWishlistDialog`). Deux indices le trahissent, et il faut les deux
 * faute de quoi la moitié des barres d'actions passe entre les mailles :
 * un nom qui l'annonce, ou une définition locale dont le corps contient un
 * `<Button>`.
 */
const CONTROL_NAME = /Button|Dialog|Action|Selector|Toggle|Switch|Picker|Menu/;
const files = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith(".tsx")) files.push(full);
  }
}
roots.forEach(walk);

function classNameOf(node) {
  const attributes = ts.isJsxElement(node) ? node.openingElement.attributes : node.attributes;
  for (const attr of attributes.properties) {
    if (!ts.isJsxAttribute(attr) || attr.name.getText() !== "className") continue;
    const init = attr.initializer;
    if (init && ts.isStringLiteral(init)) return init.text;
    // `className={`...`}` : on ne lit que la partie littérale.
    if (init && ts.isJsxExpression(init) && init.expression) {
      const text = init.expression.getText();
      return text.replace(/[`"'{}]/g, " ");
    }
  }
  return null;
}

function tagOf(node) {
  const tag = ts.isJsxElement(node) ? node.openingElement.tagName : node.tagName;
  return tag.getText();
}

/**
 * Un enfant est « rigide » s'il ne peut ni se couper ni rétrécir.
 *
 * Seul `flex-1` (`flex: 1 1 0%`) rétablit `flex-shrink: 1` sur un bouton, qui
 * naît `shrink-0` : c'est le cas des pieds de boîte de dialogue, qui ne
 * débordent donc pas. `grow` ne touche qu'à `flex-grow`, et `w-full` qu'à la
 * largeur — un bouton qui les porte reste incompressible, et les compter comme
 * souples ferait manquer des rangées au détecteur.
 */
function isRigid(node, controls) {
  const classes = classNameOf(node) ?? "";
  if (/flex-1|shrink(?!-0)|truncate|min-w-0/.test(classes)) return false;
  const tag = tagOf(node);
  if (RIGID_TAGS.has(tag)) return true;
  if (controls.has(tag)) return true;
  return /whitespace-nowrap/.test(classes);
}

/**
 * Les composants de ce fichier qui rendent un contrôle : ceux dont le nom
 * l'annonce, et ceux dont la définition locale contient un `<Button>`. Les
 * icônes de `lucide-react` sont écartées — elles se compriment sans broncher.
 */
function controlsOf(source) {
  const controls = new Set();
  const icons = new Set();

  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      if (node.moduleSpecifier.text === "lucide-react") {
        const bindings = node.importClause?.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) {
          for (const element of bindings.elements) icons.add(element.name.getText());
        }
      }
    }

    // `function X() { … <Button> … }` ou `const X = () => …`
    const named =
      (ts.isFunctionDeclaration(node) && node.name?.getText()) ||
      (ts.isVariableDeclaration(node) &&
        node.initializer &&
        (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) &&
        node.name.getText());

    if (named && /^[A-Z]/.test(named)) {
      if (CONTROL_NAME.test(named) || /<Button\b/.test(node.getText())) controls.add(named);
    }

    ts.forEachChild(node, visit);
  };

  visit(source);
  for (const icon of icons) controls.delete(icon);
  return controls;
}

/** Les enfants JSX directs, en traversant les expressions `{cond && <X/>}`. */
function directChildren(node) {
  if (!ts.isJsxElement(node)) return [];
  const out = [];

  const collect = (child) => {
    if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) out.push(child);
    else if (ts.isJsxExpression(child) && child.expression) {
      const walkExpr = (expr) => {
        if (ts.isJsxElement(expr) || ts.isJsxSelfClosingElement(expr)) out.push(expr);
        else if (ts.isBinaryExpression(expr)) walkExpr(expr.right);
        else if (ts.isConditionalExpression(expr)) { walkExpr(expr.whenTrue); walkExpr(expr.whenFalse); }
        else if (ts.isParenthesizedExpression(expr)) walkExpr(expr.expression);
        else if (ts.isJsxFragment(expr)) expr.children.forEach(collect);
        else if (ts.isCallExpression(expr)) {
          // `.map(...)`, sous ses deux formes : le corps-expression
          // (`() => <X/>`) et le corps-bloc, de loin le plus répandu ici, dont
          // il faut aller chercher les `return`. S'en tenir au premier ferait
          // manquer au détecteur la moitié des listes du dépôt.
          for (const arg of expr.arguments) {
            if (!ts.isArrowFunction(arg) && !ts.isFunctionExpression(arg)) continue;
            if (ts.isBlock(arg.body)) {
              const findReturns = (child) => {
                if (ts.isReturnStatement(child) && child.expression) walkExpr(child.expression);
                // Sans s'enfoncer dans une fonction imbriquée, qui rend ailleurs.
                if (!ts.isFunctionDeclaration(child) && !ts.isArrowFunction(child) && !ts.isFunctionExpression(child)) {
                  ts.forEachChild(child, findReturns);
                }
              };
              ts.forEachChild(arg.body, findReturns);
            } else {
              walkExpr(arg.body);
            }
          }
        }
      };
      walkExpr(child.expression);
    }
  };

  node.children.forEach(collect);
  return out;
}

const hits = [];

for (const file of files) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  const controls = controlsOf(source);

  const visit = (node) => {
    if (ts.isJsxElement(node)) {
      const classes = classNameOf(node);
      if (classes && /\bflex\b/.test(classes) && !/flex-wrap|flex-col|overflow-x-auto|hidden/.test(classes)) {
        const children = directChildren(node);
        const rigid = children.filter((child) => isRigid(child, controls));
        // Un groupe de boutons compte comme un bloc rigide entier.
        const rigidGroups = children.filter((child) => {
          const cls = classNameOf(child) ?? "";
          return /\bflex\b/.test(cls) && !/flex-wrap|flex-col/.test(cls) && directChildren(child).filter((kid) => isRigid(kid, controls)).length >= 2;
        });

        // Le motif qui a cassé trois fois : un en-tête `justify-between` dont
        // un côté est un groupe de boutons. Le groupe peut n'en contenir qu'un
        // seul rendu par un composant maison (`GameMatchActions`) — que
        // l'analyse ne sait pas reconnaître comme rigide.
        const headerPattern =
          /justify-between/.test(classes) &&
          children.some((child) => {
            const cls = classNameOf(child) ?? "";
            if (!/\bflex\b/.test(cls) || /flex-wrap|flex-col/.test(cls)) return false;
            const kids = directChildren(child);
            if (kids.length < 2) return false;
            // Un groupe d'actions : au moins un bouton, ou un composant maison
            // qui en rend (`GameMatchActions`, `ReportButton`…).
            return kids.some((kid) => {
              const tag = tagOf(kid);
              return tag === "Button" || CONTROL_NAME.test(tag) || controls.has(tag);
            });
          });

        if (rigid.length + rigidGroups.length >= 2 || headerPattern) {
          const { line } = source.getLineAndCharacterOfPosition(node.getStart());
          hits.push({
            file,
            line: line + 1,
            rigides: rigid.length,
            groupes: rigidGroups.length,
            classes: classes.trim().slice(0, 60),
            motif: headerPattern ? "en-tête" : "rangée",
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
}

hits.sort((a, b) => (b.rigides + b.groupes) - (a.rigides + a.groupes));

// Deux catégories ont déjà cassé en production, ce sont celles à corriger :
// l'en-tête `justify-between` doublé d'un groupe d'actions, et la barre de trois
// boutons ou plus. Une rangée de deux boutons courts tient sur un téléphone :
// elle est signalée, pas condamnée.
const risky = hits.filter((hit) => hit.motif === "en-tête" || hit.rigides >= 3);

console.log(`${hits.length} rangées sans flex-wrap, dont ${risky.length} à risque\n`);
for (const hit of hits) {
  const mark = risky.includes(hit) ? "!" : " ";
  console.log(`${mark} ${hit.motif}\t${hit.file}:${hit.line}\trigides=${hit.rigides}\t${hit.classes}`);
}

process.exitCode = risky.length > 0 ? 1 : 0;
