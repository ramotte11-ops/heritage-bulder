#!/usr/bin/env node
// Brouillon de test — prépare UNE clé d'activation de test, sans jamais
// se connecter à quoi que ce soit.
//
// Affiche :
//   1. la clé brute (HH1-…), à remettre à la personne qui testera ;
//   2. l'instruction SQL qui crée le droit correspondant (seule
//      l'empreinte sha256 de la clé y figure, jamais la clé).
//
// Ce script n'exécute RIEN : ni SQL, ni appel réseau, ni écriture de
// fichier. L'instruction SQL ne doit être exécutée sur le Supabase
// hébergé qu'avec une autorisation QG explicite et nommée (AGENTS.md).
// Mode d'emploi complet : docs/brouillon-de-test.md
//
// Usage : node --experimental-strip-types scripts/db/test-activation-key.mjs [libellé]
//   (Node 24 retire les types par défaut : le drapeau y est inutile.)

import { randomBytes } from "node:crypto";
import { generateActivationKey } from "../../lib/entitlement/activation-key.ts";

const label = (process.argv[2] ?? "po").replace(/[^a-z0-9-]/gi, "").slice(0, 24) || "po";
// Seconds + a random suffix: two keys prepared in the same minute never
// collide on (source, external_order_id).
const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
const externalOrderId = `qg-test-${label}-${stamp}-${randomBytes(2).toString("hex")}`;
const { rawKey, hash } = generateActivationKey();

console.log(`Clé d'activation de test (à transmettre, affichée une seule fois) :

  ${rawKey}

Instruction SQL — À N'EXÉCUTER QU'AVEC UNE AUTORISATION QG EXPLICITE :

  insert into entitlements (offer_id, source, external_order_id, activation_key_hash)
  values ('intemporel', 'direct', '${externalOrderId}', '${hash}');

Elle crée un droit « disponible » repérable (external_order_id = ${externalOrderId}).
Elle ne touche à aucun mémorial ni brouillon existant.`);
