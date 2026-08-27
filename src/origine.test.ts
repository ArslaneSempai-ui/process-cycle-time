/**
 * UNE PAGE QUE CE SERVEUR N'A PAS SERVIE NE DOIT PAS POUVOIR CHANGER SON ÉTAT.
 *
 * Écouter sur la boucle locale met l'outil hors de portée du réseau, pas hors de portée du
 * navigateur. N'importe quelle page ouverte par le lecteur peut POSTer sur `localhost` : en
 * forme simple il n'y a pas de pré-vol, et les en-têtes CORS manquants empêchent seulement
 * l'attaquant de lire la réponse — l'état a déjà changé. Ici un POST déplace le délai promis
 * et les hypothèses, c'est-à-dire les deux chiffres que l'écran existe pour montrer.
 *
 * LE TÉMOIN SE CONNECTE PAR L'HÔTE QU'IL ANNONCE, et ce n'est pas un détail. Un navigateur
 * traite `localhost` et `127.0.0.1` comme deux origines différentes, donc un cas qui annonce
 * l'une en composant l'autre reçoit un 403 parfaitement correct sur un test faux — et la
 * personne suivante « répare » la garde en la relâchant, ce qui remet la faille. Chaque cas
 * ci-dessous construit son `Origin` depuis l'hôte qu'il a réellement composé.
 *
 * LES QUATRE SENS, parce que seuls les deux derniers décident si la garde survit à l'usage :
 * une origine étrangère refusée, l'écran du serveur lui-même accepté sur le port qu'on lui a
 * donné, `localhost` refusé face à `127.0.0.1`, et l'absence d'`Origin` acceptée.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";

const SERVEUR = fileURLToPath(new URL("./server.ts", import.meta.url));

/**
 * UN PORT QUE LE SYSTÈME NOUS DONNE, PAS UN PORT DEVINÉ.
 *
 * Tirer `8300 + hasard(600)` donne un témoin instable : deux cas atterrissent sur le même
 * port, ou sur un port qu'un cas précédent vient de relâcher, et l'échec n'a rien à voir avec
 * la garde. **Un témoin instable est pire que pas de témoin** : il apprend à qui le voit
 * rouge à le relancer plutôt qu'à regarder, et le jour où il est rouge pour une vraie raison
 * personne ne regardera non plus.
 */
async function portLibre(): Promise<number> {
  const { createServer } = await import("node:net");
  return await new Promise((resolve, rejeter) => {
    const s = createServer();
    s.once("error", rejeter);
    s.listen(0, "127.0.0.1", () => {
      const a = s.address();
      const p = typeof a === "object" && a ? a.port : 0;
      s.close(() => (p ? resolve(p) : rejeter(new Error("aucun port attribué"))));
    });
  });
}

/** Lancer le vrai serveur sur un port libre et attendre qu'il réponde. */
async function demarrer(): Promise<{ hote: string; arreter: () => void }> {
  const port = await portLibre();
  const enfant: ChildProcess = spawn(process.execPath, [SERVEUR], {
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore",
  });
  const hote = `127.0.0.1:${port}`;
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(`http://${hote}/api/etat`);
      return { hote, arreter: () => enfant.kill("SIGKILL") };
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  enfant.kill("SIGKILL");
  throw new Error("le serveur n'a pas répondu — rien à conclure, et surtout pas un vert");
}

test("une origine étrangère ne peut pas déclencher une écriture", async () => {
  const s = await demarrer();
  try {
    const r = await fetch(`http://${s.hote}/api/promesse`, {
      method: "POST",
      headers: { origin: "http://evil.example", "content-type": "text/plain" },
      body: JSON.stringify({ jours: 30 }),
    });
    assert.equal(r.status, 403, "une page d'un autre hôte doit être refusée");
    const corps = await r.json() as { erreur?: string };
    assert.equal(corps.erreur, "origine_etrangere",
      "le refus se nomme : un 403 muet envoie chercher au mauvais endroit");

    /* ET L'ÉTAT N'A PAS BOUGÉ. Un 403 rendu APRÈS l'écriture serait un refus décoratif —
       c'est la propriété qui compte, pas le code de retour. */
    const etat = await (await fetch(`http://${s.hote}/api/etat`)).json() as
      { promesse: { jours: number } };
    assert.notEqual(etat.promesse.jours, 30,
      "le refus est arrivé après l'écriture : l'état a changé quand même");
  } finally { s.arreter(); }
});

test("l'écran servi par ce serveur passe, sur le port qu'on lui a donné", async () => {
  const s = await demarrer();
  try {
    /*
     * LE SENS QUI DÉCIDE SI LA GARDE SURVIT. Le port est celui que le noyau a donné et
     * l'hôte celui qu'on a composé — exactement le cas qu'une liste écrite en dur
     * refuserait, et la raison pour laquelle cette garde compare à `req.headers.host`.
     */
    const r = await fetch(`http://${s.hote}/api/promesse`, {
      method: "POST",
      headers: { origin: `http://${s.hote}`, "content-type": "application/json" },
      body: JSON.stringify({ jours: 7 }),
    });
    assert.notEqual(r.status, 403,
      "le serveur refuse son propre écran : une garde qui mord l'usage normal se fait retirer, "
      + "et elle emporte la faille avec elle");
    const etat = await r.json() as { promesse: { jours: number } };
    assert.equal(etat.promesse.jours, 7,
      "l'écran du serveur passe la garde mais son écriture n'atterrit pas");
  } finally { s.arreter(); }
});

test("`localhost` et `127.0.0.1` sont deux origines, et le refus est juste", async () => {
  const s = await demarrer();
  try {
    const r = await fetch(`http://${s.hote}/api/promesse`, {
      method: "POST",
      headers: { origin: `http://localhost:${s.hote.split(":")[1]}`, "content-type": "text/plain" },
      body: JSON.stringify({ jours: 30 }),
    });
    assert.equal(r.status, 403,
      "un navigateur traite ces deux-là comme deux origines : le refus est correct, et ce "
      + "cas est ici pour que personne ne le prenne pour un défaut et ne relâche la garde");
  } finally { s.arreter(); }
});

test("sans en-tête Origin, la requête passe — curl, un test, un formulaire même-origine", async () => {
  const s = await demarrer();
  try {
    const r = await fetch(`http://${s.hote}/api/promesse`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jours: 7 }),
    });
    assert.notEqual(r.status, 403,
      "l'absence d'Origin n'est pas une origine étrangère : les navigateurs l'envoient sur "
      + "toute requête inter-origine, qui est le cas gardé ici");
  } finally { s.arreter(); }
});
