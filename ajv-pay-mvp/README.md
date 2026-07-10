# AJV Pay — Backend fintech

Backend de paiement mobile money (NestJS + PostgreSQL, sans ORM) pour AJV
Global Holdings — hub central de paiement destiné à être réutilisé par
plusieurs produits (Mavahi en premier, d'autres à suivre), pas une
intégration ad hoc par projet.

## Stack et architecture

- Node.js / NestJS, PostgreSQL via `pg` direct (voir `src/database/database.service.ts`).
- Deux processus séparés partageant le même code, déployés comme deux
  services Railway distincts à partir du même dépôt :
  - **API** (`src/main.ts`, `npm run start` / `start:prod`) — répond aux
    requêtes HTTP.
  - **Worker** (`src/worker.ts`, `npm run start:worker`) — boucle de fond en
    continu (`@Cron` toutes les 10s) qui traite l'outbox et rattrape toute
    livraison de webhook marchand qui aurait échoué. L'API elle-même
    déclenche déjà une livraison immédiate best-effort juste après
    confirmation d'un paiement — le Worker n'est qu'un filet de sécurité,
    pas le chemin principal.
- Quatre providers de paiement, routés par `payment.method` (voir
  `src/connectors/connectors.module.ts`) :
  - `moov` — Moov Money (Moov Africa, ex-Flooz). Stub générique en attente
    de credentials marchand réels.
  - `mixx` — Mixx by Yas (Togocom, ex-T-Money). Stub générique, même
    remarque.
  - `manual` — paiement vérifié à la main : le client envoie l'argent
    lui-même vers un numéro marchand fixe (un par réseau, syntaxe USSD
    différente pour chacun — voir `ManualPaymentsService`) et soumet son ID
    de transaction ; un admin plateforme unique (pas un compte par
    marchand) le confirme ou le rejette depuis une file d'attente
    centralisée regroupant tous les marchands connectés. Ne dépend
    d'aucune API tierce, fonctionne dès aujourd'hui.
  - `cinetpay` — carte bancaire (Visa/Mastercard) via l'agrégateur CinetPay,
    en redirection (`redirect_url`) : le client saisit sa carte sur une page
    hébergée par CinetPay, jamais sur nos serveurs. Contrat d'API confirmé
    via leur documentation officielle (contrairement à moov/mixx, pas un
    stub) mais **pas encore testé en conditions réelles** — nécessite de
    vraies clés `CINETPAY_API_KEY`/`CINETPAY_SITE_ID` (voir `.env.example`)
    obtenues à l'ouverture d'un compte marchand CinetPay.
- Aucune queue externe : pattern Outbox (table `outbox_events` +
  `OutboxProcessorService`) qui transforme chaque transition finale de
  paiement en notification webhook marchand (table `webhook_attempts`,
  retry avec backoff exponentiel).
- Durcissement production : rate limiting (`@nestjs/throttler`), headers de
  sécurité (`helmet`), vérification de signature HMAC des webhooks
  providers/manuels, ledger comptable en partie double append-only,
  idempotence stricte, journal d'audit (`audit_logs`).
- Dashboard séparé (React + TypeScript) dans `../dashboard/` — voir
  `docs/dashboard.md`. Deux vues : marchand (paiements, solde, webhook) et
  admin plateforme (file d'attente des paiements manuels).

## Installation

```bash
npm install
cp .env.example .env
# éditer .env : DATABASE_URL, MOOV_*/MIXX_* (credentials en attente),
# MANUAL_PAYMENT_NUMBER_MOOV/MIXX, ADMIN_API_KEY

npm run migrate     # applique migrations/*.sql dans l'ordre

node scripts/create-merchant.js "Mon Produit" contact@example.com https://mon-produit.example.com/webhooks/ajvpay
# → conserver l'API Key et le HMAC Secret affichés (non récupérables ensuite)

npm run start:dev   # API en local, avec rechargement à chaud
```

Pour lancer le Worker en local (rarement nécessaire en dev — la livraison
immédiate suffit la plupart du temps) : `npm run build && npm run start:worker`.

## Authentification

Deux modèles d'authentification distincts, jamais mélangés :

**Marchand** (routes `/payments/*`, `/merchants/me*`) :
- `Authorization: Bearer <api_key>`
- `X-Signature: <hmac_sha256(hmac_secret, JSON.stringify(body))>` (obligatoire dès qu'il y a un corps de requête)
- `Idempotency-Key: <clé unique côté marchand>` (obligatoire pour `POST /payments`)

## Mode test / sandbox

Chaque marchand reçoit DEUX paires de clés à l'inscription (`POST /merchants/register`
ou `scripts/create-merchant.js`) — même principe que Stripe :

| | Préfixe clé API | Effet |
|---|---|---|
| **live** | `ajvpay_live_...` | Paiement réel, écrit dans le ledger, passe par les vrais providers (moov/mixx) ou la revue admin (manual). |
| **test** | `ajvpay_test_...` | Paiement simulé (`TestModeAdapter`), résolu **instantanément**, **jamais** d'écriture ledger, **jamais** visible dans la file d'admin. |

Le mode est déterminé automatiquement par la clé API utilisée — jamais un champ que le marchand choisit dans le corps de la requête.

**Convention de test** (comme les cartes de test Stripe) : en mode test, un
paiement réussit toujours, **sauf** si `phoneNumber` se termine par `9999`,
auquel cas il échoue instantanément — utile pour tester la gestion d'échec
côté marchand.

Le webhook de notification part normalement en mode test (c'est ce qui
permet de tester une intégration de bout en bout) ; seule la comptabilité
(ledger) est ignorée. Une `Idempotency-Key` peut être réutilisée en live et
en test sans conflit — ce sont deux univers de données séparés.

**Admin plateforme** (routes `/admin/manual-payments/*`) :
- `Authorization: Bearer <ADMIN_API_KEY>` — une seule clé partagée, pas de
  signature. Un seul admin humain pour l'instant, voit et décide pour tous
  les marchands connectés.

## Endpoints principaux

### `POST /payments`
```json
{
  "amount": 5000,
  "currency": "XOF",
  "method": "manual",
  "phoneNumber": "+22890123456",
  "metadata": { "network": "mixx", "order_id": "CBK-1234" }
}
```
Pour `method: "manual"`, `metadata.network` (`"moov"` ou `"mixx"`) précise
quel réseau le client va utiliser — c'est une information d'affichage, pas
une donnée métier séparée en base.

### `GET /payments/:id`
Statut courant du paiement.

### `GET /payments/manual/info`
Numéro marchand + gabarit de syntaxe USSD pour chacun des deux réseaux
(`moov`, `mixx`) — à afficher au client, jamais généré côté marchand.

### `POST /payments/:id/submit-proof`
Le marchand transmet l'ID de transaction que son client lui a communiqué
(`{ "reference": "...", "note": "..." }`). Ne change pas le statut du
paiement — reste `processing` jusqu'à la revue admin.

### `GET /admin/manual-payments/pending` / `POST .../:id/confirm` / `.../:id/reject`
File d'attente et décision admin (voir plus haut).

### `POST /webhooks/moov`, `POST /webhooks/mixx`, `POST /webhooks/cinetpay`
Endpoints publics recevant les notifications des providers une fois leurs
credentials réels obtenus (pas d'auth marchand ici — authenticité vérifiée
par signature HMAC générique, voir les adapters). Pour CinetPay, la
notification elle-même n'est jamais fiable (contenu minimal, pas de
signature) : l'adapter rappelle systématiquement leur endpoint de
vérification avant toute transition (`confirmViaStatusCheck`).

### Webhook sortant (vers le marchand)
`POST <merchant.webhook_url>` avec `{ event, payment_id, merchant_id,
amount, currency, status, provider_reference, metadata }`, signé
`X-Signature: hmac_sha256(hmac_secret, JSON.stringify(body))`. `metadata`
est l'écho exact de ce que le marchand a fourni à la création — c'est ce
qui lui permet de retrouver sa propre commande sans qu'AJV Pay ait besoin
de connaître son schéma.

## Commission plateforme

`PLATFORM_FEE_BPS` (points de base, ex: `200` = 2%) — **désactivée par
défaut (0)**, choix explicite à activer, jamais une commission qui
commencerait à être prélevée silencieusement sur un marchand déjà
connecté. Une fois activée, un paiement `live` réussi écrit une 3ᵉ ligne
`fees` dans le ledger (voir `LedgerService.buildSuccessEntries`) et réduit
d'autant le montant crédité à `merchant_payable`. **Décision assumée** :
un remboursement ne rend jamais la commission (comme la plupart des
processeurs réels) — voir `LedgerService.buildRefundEntries`. Aucun effet
en mode test (le ledger y est de toute façon entièrement ignoré).
`LedgerService.getFeesBalance()` donne le total collecté.

## Surveillance et alertes

- `GET /health` (voir `health.controller.ts`) : file outbox non traitée,
  livraisons webhook en attente, battement de cœur du Worker.
- `ALERT_WEBHOOK_URL` (optionnel, désactivé si absent) : le Worker envoie
  un webhook JSON générique (compatible Slack/Discord/tout récepteur HTTP)
  si la file outbox ou les livraisons webhook dépassent un seuil
  (`ALERT_OUTBOX_BACKLOG_THRESHOLD`/`ALERT_WEBHOOK_BACKLOG_THRESHOLD`,
  défaut 20), avec un cooldown (`ALERT_COOLDOWN_MINUTES`, défaut 15) pour
  ne pas spammer — voir `src/worker/alerting.service.ts`.

## Mot de passe oublié (dashboard)

Pas d'infrastructure e-mail dans ce projet, donc pas de lien de
réinitialisation automatique : un marchand qui oublie son mot de passe
contacte l'admin plateforme, qui le réinitialise via
`POST /admin/merchant-users/reset-password` (`ADMIN_API_KEY`,
`{ email, newPassword }`) — invalide au passage toutes ses sessions en
cours. Un marchand déjà connecté peut aussi changer son mot de passe
lui-même via `POST /dashboard/change-password` (`{ currentPassword,
newPassword }`).

## Garanties de correctness financière

- **Idempotency stricte** : `merchant_id + Idempotency-Key` ne peut jamais créer deux paiements.
- **Ledger en partie double, append-only** : `LedgerService.assertBalanced` avant toute écriture ; trigger PostgreSQL interdisant physiquement tout UPDATE/DELETE sur `ledger_entries` et `payment_events`.
- **Une seule transaction SQL par transition finale** : `PaymentOrchestrator.commitFinalState` couvre statut + ledger + événement outbox ensemble, ou pas du tout — jamais de paiement `succeeded` sans trace comptable.
- **Aucun appel réseau externe dans une transaction SQL ouverte** : connector et webhook marchand toujours hors transaction.

## Déploiement (Railway)

Deux services Railway construits depuis ce même dépôt (monorepo — bien
régler **Root Directory = `ajv-pay-mvp`** dans les Settings de chaque
service) :
- Service API : `npm run start:prod` (migrations + démarrage HTTP).
- Service Worker : Custom Start Command = `npm run start:worker`.
- Un service Postgres Railway (ou une base externe compatible via
  `DATABASE_URL`).

Le dashboard (`../dashboard/`) se déploie séparément (Vercel/Netlify) — voir
`docs/dashboard.md`.
