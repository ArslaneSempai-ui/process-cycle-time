/*
 * « PAS DE VALEUR » NE DOIT PAS DEVENIR LA PROMESSE LA PLUS COURTE.
 *
 * `/api/promesse` convertissait avant de juger — `Number(recu.jours)` puis
 * `Number.isFinite` — or `Number(null)`, `Number("")`, `Number([])` et
 * `Number(false)` valent tous `0`, que la borne remonte à `PROMESSE.bas`, un
 * jour. Mesuré le 23 août 2026 sur le serveur en marche : promesse posée à
 * douze jours, un `{"jours": null}`, et elle valait un jour, avec un 200.
 *
 * La conformité affichée ensuite est celle d'un délai que personne n'a promis —
 * et c'est le seul chiffre que cet écran existe pour montrer.
 *
 * `/api/hypotheses`, vingt lignes plus haut dans le même fichier, exigeait déjà
 * `typeof v === "number"`. Le défaut n'était pas dans la règle : il était dans
 * sa portée.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawn, type ChildProcess } from "node:child_process";

const ICI = fileURLToPath(new URL(".", import.meta.url));
const PORT = 4729;

function demarrer(): Promise<ChildProcess> {
  const fils = spawn(process.execPath, [`${ICI}server.ts`], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return new Promise((resoudre, rejeter) => {
    const minuteur = setTimeout(() => rejeter(new Error("serveur muet après 20 s")), 20_000);
    fils.stdout.on("data", (b) => {
      if (String(b).includes("http://localhost")) { clearTimeout(minuteur); resoudre(fils); }
    });
    fils.on("exit", (c) => { clearTimeout(minuteur); rejeter(new Error(`serveur mort (${c})`)); });
  });
}

const poster = (route: string, corps: string) =>
  fetch(`http://127.0.0.1:${PORT}${route}`,
    { method: "POST", headers: { "content-type": "application/json" }, body: corps });

type Etat = { promesse: { jours: number }; assumptions: Record<string, number> };
const etat = async (): Promise<Etat> =>
  (await (await fetch(`http://127.0.0.1:${PORT}/api/etat`)).json()) as Etat;

test("aucune route ne prend « pas de valeur » pour un nombre", async () => {
  let fils: ChildProcess | undefined;
  const VIDES = ["null", '""', "[]", "false", '"7"'];
  try {
    fils = await demarrer();

    /* Le témoin d'abord, dans les deux sens : les vrais nombres doivent passer,
       sinon une garde qui refuse tout ferait passer tout le reste. */
    await poster("/api/promesse", JSON.stringify({ jours: 12 }));
    assert.equal((await etat()).promesse.jours, 12, "un vrai nombre doit être accepté");
    const coutDepart = (await etat()).assumptions.costPerDayOfDelay;
    assert.ok(typeof coutDepart === "number", "l'hypothèse lue n'est pas un nombre");

    for (const vide of VIDES) {
      assert.equal((await poster("/api/promesse", `{"jours":${vide}}`)).status, 200);
      assert.equal((await etat()).promesse.jours, 12,
        `${vide} n'est pas un nombre JSON et ne doit pas déplacer la promesse`);

      await poster("/api/hypotheses", `{"costPerDayOfDelay":${vide}}`);
      assert.equal((await etat()).assumptions.costPerDayOfDelay, coutDepart,
        `${vide} ne doit pas déplacer une hypothèse non plus`);
    }

    /* Et les deux routes restent réglables après coup : la garde ne fige rien. */
    await poster("/api/promesse", JSON.stringify({ jours: 7 }));
    assert.equal((await etat()).promesse.jours, 7);
    await poster("/api/hypotheses", JSON.stringify({ costPerDayOfDelay: 250 }));
    assert.equal((await etat()).assumptions.costPerDayOfDelay, 250);
  } finally {
    fils?.kill();
  }
});

/*
 * L'écran a deux implémentations : le serveur local et le shim de la démo publiée.
 * Elles se corrigent ensemble ou divergent au premier correctif — celle-ci portait
 * la même faute, mot pour mot, et personne n'aurait vu la démo garder le défaut.
 *
 * CE QUE CE CAS COUVRE : que chaque branche de route des deux copies exige le TYPE
 * avant de convertir. Il ne prouve pas qu'elles calculent pareil — `demo.test.ts`
 * s'occupe des champs et des routes. C'est un plancher sur une faute précise, pas
 * une preuve d'équivalence, et le témoin de non-vacuité est ce qui l'empêche de
 * passer au vert le jour où le motif ne trouve plus les branches.
 */
test("les deux copies d'une route gardent le type de la même façon", () => {
  const fichiers = { "server.ts": readFileSync(ICI + "server.ts", "utf8"),
                     "pages.ts": readFileSync(ICI + "pages.ts", "utf8") };
  const fautifs: string[] = [];
  let branchesVues = 0;

  for (const [nom, source] of Object.entries(fichiers)) {
    /* Chaque branche va de sa route jusqu'à la route suivante. */
    const routes = [...source.matchAll(/"(\/api\/[a-z-]+)"/g)];
    for (let i = 0; i < routes.length; i++) {
      const debut = routes[i]!.index!;
      const fin = i + 1 < routes.length ? routes[i + 1]!.index! : source.length;
      const branche = source.slice(debut, fin);
      /* Seules les branches qui lisent une valeur et la bornent sont concernées. */
      if (!/Math\.(min|max)\(/.test(branche)) continue;
      branchesVues++;
      if (!/typeof\s+\w+\s*===\s*"number"/.test(branche)) {
        fautifs.push(`${nom} — ${routes[i]![1]}`);
      }
    }
  }

  assert.ok(branchesVues >= 4,
    `seulement ${branchesVues} branche(s) de route trouvée(s) : le motif ne lit plus `
    + `les deux copies, et un zéro rendu ici ne prouverait rien`);
  assert.deepEqual(fautifs, [],
    `${fautifs.join(", ")} : la valeur reçue est bornée sans que son type soit exigé.\n`
    + `  → Number(x) convertit avant que Number.isFinite puisse juger, et Number(null), `
    + `Number(""), Number([]) et Number(false) valent tous 0.`);
});
