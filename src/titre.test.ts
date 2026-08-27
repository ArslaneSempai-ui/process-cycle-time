/**
 * LE TITRE EST UNE MESURE, ET RIEN NE LE TENAIT.
 *
 * Ce dépôt s'est intitulé « Eleven days, and nobody worked on it for nine of them » sur cinq
 * surfaces à la fois : le H1 du README, la description de `package.json`, le `<title>` et le
 * `h1` de l'écran, et la page publiée qui en est construite. Le log, lui, n'a jamais produit
 * onze jours — `src/events.ts` n'a pas bougé depuis le commit qui a écrit ce titre, et le
 * bloc engendré placé DEUX LIGNES sous le H1 annonçait déjà autre chose. Le premier chiffre
 * que voit un lecteur contredisait le deuxième, sur le même écran, et rien ne levait.
 *
 * Le « onze » venait d'un commentaire de `events.ts` où il illustre ce qu'un rapport de
 * processus vous tend — une valeur inventée, promue en titre. C'est le défaut ordinaire du
 * chiffre écrit à la main : il ne naît pas faux, il l'est ou le devient en silence, sur la
 * ligne la plus lue du document.
 *
 * ─── CE QUE CE CAS VÉRIFIE, ET POURQUOI SOUS CETTE FORME ───
 *
 * Pas « le titre contient six ». Il EXTRAIT les nombres écrits en toutes lettres de chaque
 * titre et exige que ce soit EXACTEMENT la paire mesurée. Les deux dérives sont alors
 * couvertes par la même assertion : le jour où le log change, un titre resté en arrière
 * tombe ; et un titre auquel on ajoute un chiffre de plus tombe aussi. Une simple recherche
 * de sous-chaîne aurait laissé passer « Eleven days, and six hours ».
 *
 * LA PAGE PUBLIÉE EST UNE SURFACE À PART ENTIÈRE. `docs/index.html` est ce qu'un lecteur
 * reçoit ; il est construit depuis `src/ui.html` mais commité séparément, donc il peut rester
 * en arrière d'une reconstruction oubliée. Le contrôler ici est le seul moyen de savoir que
 * la correction est arrivée jusqu'au lecteur.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { generate } from "./events.ts";
import { perCase, overall } from "./time.ts";

const racine = fileURLToPath(new URL("..", import.meta.url));

/** Les nombres écrits en toutes lettres, dans l'ordre où ils valent. */
const MOTS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight",
  "nine", "ten", "eleven", "twelve"];

/** Les nombres-mots d'une phrase, dans l'ordre, en minuscules. */
function nombresEcrits(phrase: string): string[] {
  return [...phrase.toLowerCase().matchAll(/[a-z]+/g)]
    .map((m) => m[0]!)
    .filter((m) => MOTS.includes(m));
}

test("le titre publié porte les chiffres que le log mesure, et pas d'autres", () => {
  /*
   * Le témoin, AVANT le verdict. Un extracteur qui ne rend jamais rien rendrait ce cas vert
   * sur n'importe quel titre — c'est la forme la plus pure du vert vide, et elle vit
   * précisément dans les cas qui comparent une liste à une autre.
   */
  assert.deepEqual(nombresEcrits("Six days end to end, and two hours of work in them"),
    ["six", "two"], "l'extracteur doit voir les deux nombres du titre attendu");
  assert.deepEqual(nombresEcrits("Eleven days, and nobody worked on it for nine of them"),
    ["eleven", "nine"], "l'extracteur doit voir l'ancien titre tel qu'il était");
  assert.deepEqual(nombresEcrits("A process, measured"), [],
    "une phrase sans nombre n'en rend aucun");
  /* « nine » vit à l'intérieur de « nineteen » : un jeton court ne doit pas être trouvé dans
     un mot composé, sinon l'ancien titre pourrait revenir déguisé. */
  assert.deepEqual(nombresEcrits("Nineteen days"), [],
    "un nombre-mot ne se trouve pas à l'intérieur d'un autre mot");

  const o = overall(perCase(generate()));
  const mot = (x: number): string => {
    const n = Math.round(x);
    const m = MOTS[n];
    assert.ok(m, `${x} arrondi à ${n} sort de la table des nombres écrits — `
      + `le titre ne peut plus s'écrire en toutes lettres, l'écrire en chiffres`);
    return m!;
  };
  const attendu = [mot(o.meanLeadDays), mot(o.meanTouchHours)];

  /**
   * Les surfaces, et le titre qu'on lit sur chacune. Une surface qui n'existe pas est un
   * REFUS, jamais un saut : la page publiée absente voudrait dire que le lecteur reçoit
   * autre chose que ce qui est contrôlé ici.
   */
  const surfaces: [string, string][] = [];
  const prendre = (nom: string, chemin: string, motif: RegExp): void => {
    assert.ok(existsSync(chemin), `${nom} : ${chemin} est absent — la surface n'a pas été lue`);
    const m = motif.exec(readFileSync(chemin, "utf8"));
    assert.ok(m, `${nom} : le titre ne se lit plus dans ${chemin} — le motif est périmé, `
      + `et un cas qui ne trouve pas son entrée rend rouge, jamais « rien à signaler »`);
    surfaces.push([nom, m![1]!]);
  };

  prendre("README (H1)", racine + "README.md", /^#\s+(.+)$/m);
  prendre("package.json (description)", racine + "package.json", /"description"\s*:\s*"([^"]+)"/);
  prendre("écran (<title>)", racine + "src/ui.html", /<title>([^<]+)<\/title>/);
  prendre("écran (h1)", racine + "src/ui.html", /\bh1:\s*"([^"]+)"/);
  prendre("page publiée (<title>)", racine + "docs/index.html", /<title>([^<]+)<\/title>/);
  prendre("page publiée (h1)", racine + "docs/index.html", /\bh1:\s*"([^"]+)"/);

  assert.equal(surfaces.length, 6,
    `${surfaces.length} surface(s) lues au lieu de 6 : le relevé ne porte pas sur ce qu'il annonce`);

  const fautives = surfaces
    .filter(([, titre]) => nombresEcrits(titre).join(" ") !== attendu.join(" "))
    .map(([nom, titre]) => `${nom} → « ${titre} »`);

  assert.deepEqual(fautives, [],
    `le titre annonce des chiffres que le log ne mesure pas. Mesuré : `
    + `${o.meanLeadDays.toFixed(1)} jours ouvrés de bout en bout et ${o.meanTouchHours.toFixed(1)} h `
    + `de travail dedans, soit « ${attendu.join(" / ")} ». Surfaces fautives : ${fautives.join(" ; ")}. `
    + `Si la page publiée est la seule fautive, elle n'a pas été reconstruite : `
    + `\`npm run pages\`. Sinon, le titre est à réécrire — sur TOUTES les surfaces, `
    + `parce qu'un titre corrigé à un seul endroit se contredit lui-même.`);
});
