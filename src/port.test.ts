/**
 * LE PORT ANNONCÉ DOIT ÊTRE LE PORT SERVI.
 *
 * `Number(process.env.PORT ?? 4900)` convertissait avant de juger, et rien ne jugeait après.
 * Les entrées franchement fausses sont bruyantes : Node refuse `NaN` et 99999 avec un
 * `ERR_SOCKET_BAD_PORT`. La silencieuse est `PORT=""` — `Number("")` vaut 0, et le port 0
 * demande au noyau un port éphémère. Mesuré : le serveur écoutait sur 49798 en affichant
 * `http://localhost:0`.
 *
 * ─── POURQUOI LE TÉMOIN LANCE LE SERVEUR AU LIEU D'APPELER LA FONCTION ───
 *
 * Éprouver `portValide` ne prouve rien sur l'endroit qui l'appelle : le défaut vivait au
 * POINT D'APPEL — une conversion posée là, sans garde derrière. Un cas qui n'appelle que la
 * fonction resterait vert si quelqu'un remettait `Number(process.env.PORT ?? 4900)` sur la
 * ligne du dessous. Les deux moitiés sont donc éprouvées : la fonction dit oui et non sur des
 * cas choisis, et le PROCESSUS refuse de démarrer sur `PORT=""`.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { portValide } from "./server.ts";

const SERVEUR = fileURLToPath(new URL("./server.ts", import.meta.url));

test("portValide dit oui et non — et « pas de valeur » n'est pas un port", () => {
  assert.equal(portValide(undefined, 4900), 4900, "PORT non défini prend le défaut");
  assert.equal(portValide("4321", 4900), 4321, "un port écrit est lu");
  assert.equal(portValide("1", 4900), 1);
  assert.equal(portValide("65535", 4900), 65535);

  /* Les quatre formes de « pas de valeur » qui atterrissent à 0 après conversion, plus les
     deux bornes. `Number("")`, `Number(" ")` et `Number("0")` valent tous 0. */
  for (const mauvais of ["", " ", "0", "-1", "65536", "99999", "abc", "43.5", "NaN"]) {
    assert.throws(() => portValide(mauvais, 4900), RangeError,
      `PORT=${JSON.stringify(mauvais)} devrait être refusé`);
  }

  /* Le message porte l'issue, sinon la garde se fait commenter à la première rencontre. */
  try {
    portValide("", 4900);
    assert.fail("PORT vide devrait lever");
  } catch (e) {
    const m = (e as Error).message;
    assert.match(m, /localhost:0/, "le message doit dire ce qui se passait sans la garde");
    assert.match(m, /4900/, "le message doit nommer l'issue : ne pas définir PORT");
  }
});

test("le processus refuse de démarrer sur PORT vide, au lieu d'écouter ailleurs", async () => {
  /*
   * ─── L'ÉCHÉANCE N'EST PAS UNE PRÉCAUTION, C'EST LE CŒUR DU CAS ───
   *
   * Le défaut se manifeste par un serveur qui DÉMARRE là où il devrait refuser. Une première
   * version de ce témoin attendait `exit` sans limite : en mutant la ligne gardée pour
   * l'éprouver, le processus a démarré, l'événement n'est jamais venu, et le cas a PENDU au
   * lieu de rougir. Un témoin qui pend est pire qu'un témoin absent — il se fait relancer, et
   * la contre-épreuve qui devait prouver la garde n'a rien prouvé du tout.
   *
   * L'échéance transforme donc le symptôme exact du défaut en un rouge net et nommé.
   */
  const DELAI = 15_000;
  const verdict = await new Promise<{ code: number | null; err: string; pendu: boolean }>((resolve) => {
    const enfant = spawn(process.execPath, [SERVEUR], {
      env: { ...process.env, PORT: "" },
      stdio: ["ignore", "ignore", "pipe"],
    });
    let err = "";
    enfant.stderr!.on("data", (b) => (err += b));
    const minuteur = setTimeout(() => {
      enfant.kill("SIGKILL");
      resolve({ code: null, err, pendu: true });
    }, DELAI);
    enfant.on("exit", (c) => {
      clearTimeout(minuteur);
      resolve({ code: c ?? 0, err, pendu: false });
    });
  });

  assert.equal(verdict.pendu, false,
    `le serveur tourne encore après ${DELAI / 1000} s avec PORT vide : il n'a pas refusé, il `
    + `écoute sur un port éphémère que personne ne connaît, en annonçant localhost:0`);
  assert.notEqual(verdict.code, 0,
    "le serveur s'est terminé sans erreur avec PORT vide : le refus n'a pas eu lieu");
  assert.match(verdict.err, /n'est pas un port/,
    `le refus doit se nommer sur stderr ; reçu : ${verdict.err.slice(0, 300)}`);
});
