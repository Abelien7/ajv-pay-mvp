# AJV Pay — MVP Backend

Backend de paiement fintech (monolithe modulaire, NestJS + PostgreSQL), conforme à l'ADR V3
(MVP construisible par un développeur solo, évolutif vers la vision fintech complète).

## Stack
- Node.js / NestJS
- PostgreSQL (accès direct via `pg`, pas d'ORM — voir `src/database/database.service.ts`)
- 3 connectors actifs simultanément, routés par `payment.method` : Flooz, Moov
  (mobile money, push USSD) et CinetPay (carte bancaire + mobile money
  multi-opérateurs, par redirection) — voir `src/connectors/connectors.module.ts`
- Aucune queue externe : pattern Outbox simplifié (table `webhook_attempts` + cron)
- Durcissement production : rate limiting (`@nestjs/throttler`), headers de
  sécurité (`helmet`), vérification de signature HMAC des webhooks
  providers, journal d'audit append-only (`audit_logs`) — voir
  `docs/architecture.md`.
- Dashboard marchand séparé (React + TypeScript) dans `../dashboard/` — voir
  `docs/dashboard.md`.

## Installation

```bash
npm install
cp .env.example .env
# éditer .env : DATABASE_URL, credentials Flooz/Moov, etc.

npm run migrate     # applique migrations/*.sql dans l'ordre
node scripts/create-merchant.js "CBK Restaurant" cbk@example.com https://cbk.example.com/webhooks/ajvpay
# → conserver l'API Key et le HMAC Secret affichés (non récupérables ensuite)

npm run start:dev
```

## Authentification des requêtes marchand

Chaque requête doit inclure :
- `Authorization: Bearer <api_key>`
- `X-Signature: <hmac_sha256(hmac_secret, JSON.stringify(body))>` (obligatoire pour POST/PUT)
- `Idempotency-Key: <clé unique côté marchand>` (obligatoire pour `POST /payments`)

## Endpoints

### `POST /payments`
```json
{
  "amount": 5000,
  "currency": "XOF",
  "method": "flooz",
  "phoneNumber": "+22890123456",
  "metadata": { "order_id": "CBK-1234" }
}
```

### `GET /payments/:id`
Retourne le statut courant du paiement.

### `POST /webhooks/flooz` et `POST /webhooks/moov`
Endpoints publics recevant les notifications des providers (pas d'auth marchand ici —
authenticité à vérifier selon le mécanisme propre à chaque provider, voir TODO dans
`src/connectors/adapters/`).

## Points d'intégration restants (TODO explicites dans le code)

1. **`src/connectors/adapters/flooz.adapter.ts`** et **`moov.adapter.ts`** : les appels HTTP
   sont désormais réellement implémentés (axios, auth Bearer, mapping de statuts, signature
   webhook HMAC générique configurable). Ce qui reste à confirmer avec chaque provider à
   l'onboarding marchand : les chemins d'URL exacts (`FLOOZ_COLLECT_PATH`, etc.), les noms de
   champs JSON exacts, et le nom réel du header de signature webhook — tout est piloté par
   `.env`, aucune modification de code ne sera nécessaire une fois ces détails confirmés.
2. **`src/connectors/adapters/cinetpay.adapter.ts`** : utilise l'API CinetPay publique et
   documentée (https://docs.cinetpay.com/api/1.0-fr/checkout). Fonctionne par redirection
   (`redirectUrl` retourné par `POST /payments`, à afficher/rediriger côté marchand) et
   confirmation systématique par `checkStatus()` après chaque webhook (CinetPay ne garantit
   pas l'authenticité du contenu de ses notifications HTTP).
3. **Vérification d'authenticité des webhooks Flooz/Moov** : le mécanisme générique (HMAC-SHA256
   du corps brut, header configurable via `FLOOZ_WEBHOOK_SIGNATURE_HEADER` /
   `MOOV_WEBHOOK_SIGNATURE_HEADER`) est implémenté et actif dès que `*_WEBHOOK_SECRET` est
   configuré. Si Flooz/Moov utilisent un mécanisme différent (header propriétaire, IP
   whitelist), ajuster `verifyWebhookSignature()` dans l'adapter concerné — `ProviderWebhooksController`
   journalise explicitement (WARNING + `audit_logs`) tout webhook reçu sans vérification
   configurée, ce n'est jamais un échec silencieux.

## Garanties de correctness financière (non négociables, même au MVP)

- **Idempotency stricte** : `merchant_id + Idempotency-Key` ne peut jamais créer deux paiements
  (contrainte UNIQUE en base + vérification applicative avant toute écriture).
- **Ledger en partie double, append-only** : toute écriture de `ledger_entries` est vérifiée
  équilibrée avant insertion (`LedgerService.assertBalanced`) ; un trigger PostgreSQL interdit
  physiquement tout UPDATE/DELETE sur `ledger_entries` et `payment_events`.
- **Aucune transition de statut silencieuse** : `PaymentsService.transitionStatus` est le seul
  point d'entrée pour changer le statut d'un paiement, et journalise systématiquement un
  `payment_event`.
- **Aucun appel réseau externe dans une transaction SQL ouverte** : les appels au connector et
  aux webhooks marchand sont toujours faits hors transaction, avec leur état persisté avant et
  après, pour ne jamais tenir de lock pendant un appel HTTP potentiellement lent.

## Architecture interne (mise à jour : PaymentOrchestrator + Outbox formalisé)

```
Controller
   ↓
PaymentOrchestrator ⭐ (unique point d'entrée logique du cycle de vie)
   ↓                              ↓
PaymentsService (state only)   OutboxService.record() (publication de faits)
   ↓                              ↓
ConnectorService / LedgerService   OutboxProcessorCron (consumer)
                                    ↓
                                 WebhooksService.enqueue() → webhook_attempts → WebhooksCron (delivery + retry)
```

`PaymentOrchestrator` ne connaît plus `WebhooksService` : il publie des événements (`payment.succeeded`, `payment.failed`, ...) dans `outbox_events` via `OutboxService`, avec un **snapshot complet** du paiement dans le payload. `OutboxProcessorCron` consomme ces événements et décide d'en faire (ou non) une notification webhook marchand. C'est la même séparation publication/consommation qu'un vrai bus d'événements (SNS/SQS) — seul `OutboxService` change d'implémentation le jour de la bascule vers la vision Future, `PaymentOrchestrator` reste identique.

## Validation effectuée sans environnement complet (sandbox sans réseau)

En l'absence d'accès réseau et de PostgreSQL réel, le code a été validé en trois passes
réelles (pas seulement une relecture) :

1. **Type-check complet** : `npx tsc -p tsconfig.typecheck.json` — vérifie que tout le code
   de `src/` compile sans erreur, avec des déclarations de types minimales pour les
   dépendances externes (`typecheck/shims.d.ts`, à supprimer une fois `npm install` exécuté).
   Plusieurs vrais bugs ont été trouvés et corrigés à cette étape (voir historique) :
   header HTTP `string | string[]` non géré dans `ApiKeyGuard`, propriété `pool` non
   définitivement assignée dans `DatabaseService`, propriétés de DTO sans assertion
   d'assignation définitive.

2. **Smoke test d'exécution réelle** : `npx ts-node typecheck/smoke-test.ts` — exécute pour
   de vrai (pas juste compile) la logique de `LedgerService` (équilibre des écritures,
   rejet d'écritures déséquilibrées), `IdempotencyService` (replay vs conflit) et `hmac.util`
   (signature/comparaison), avec une base PostgreSQL mockée. Ce test s'appuie sur de petits
   stubs runtime de `@nestjs/common`/`@nestjs/config`/`pg` placés directement dans
   `node_modules/` (de vrais fichiers `.js` minimaux, pas des mocks de test) pour permettre
   l'exécution sans `npm install`. **Ces stubs doivent être supprimés avant tout `npm install`
   réel** (`rm -rf node_modules` puis `npm install`) — ils ne sont là que pour ce diagnostic
   hors-ligne.

3. **Correction d'atomicité (suite à une revue "Production Hardening Checklist" fintech)** :
   pour toute transition vers un état final (succeeded/failed/expired/refunded),
   `PaymentOrchestrator.commitFinalState()` ouvre désormais **une seule transaction SQL**
   couvrant la mise à jour du statut, l'écriture du ledger et la publication de l'événement
   outbox. Avant cette correction, ces trois écritures se faisaient dans des transactions
   séparées — un crash entre deux d'entre elles pouvait laisser un paiement marqué `succeeded`
   sans aucune trace comptable ni notification, sans aucun moyen de rattraper ça ensuite
   (l'état final bloque toute nouvelle transition). Vérifié par un test runtime dédié
   (`typecheck/smoke-test.ts`, section 4) qui confirme qu'une seule transaction couvre bien
   les quatre écritures (statut, payment_events, ledger_entries, outbox_events).

démarrage effectif du serveur NestJS, exécution des migrations SQL, appels HTTP de bout en
bout, vrais appels à l'API Flooz/Moov.

## Trajectoire vers la vision Future (ADR V2)


Cette base est volontairement structurée pour permettre la bascule décrite dans l'ADR V3 sans
réécriture :
- Le contrat `PaymentProviderAdapter` permet d'ajouter un deuxième provider en ajoutant un seul
  fichier adapter, sans toucher à `PaymentsService`.
- Le pattern Outbox est désormais un vrai composant (`OutboxService` + `OutboxProcessorCron`,
  table `outbox_events`), pas une logique enfouie dans `WebhooksService`. Remplacer la
  persistance SQL par un `publish()` SNS dans `OutboxService` suffira à migrer vers la vision
  Future, sans toucher à `PaymentOrchestrator` ni à `WebhooksService`.
- `LedgerService` est déjà conçu comme un module isolé : son extraction en service réseau séparé
  (vision Future) ne nécessite pas de changer son modèle de données.
