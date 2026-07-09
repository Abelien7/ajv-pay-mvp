# Dashboard (marchand + admin plateforme)

Petite application React + TypeScript (`ajv-pay-mvp/dashboard/`, séparée du
backend), deux vues distinctes :

- **Marchand** : solde à reverser, configuration de l'URL de webhook, liste
  des paiements récents, remboursement.
- **Admin plateforme** (accessible via le lien "Vous êtes l'admin
  plateforme ?" sur l'écran de connexion marchand) : file d'attente
  centralisée des paiements manuels de TOUS les marchands connectés, avec
  actions Confirmer/Rejeter — voir `AdminDashboard.tsx`.

## Lancer en local

```bash
cd dashboard
npm install
npm run dev   # http://localhost:5174
```

**Marchand** : connecte-toi avec l'API Key et le HMAC Secret affichés lors
de la création du marchand (`node scripts/create-merchant.js ...`).

**Admin** : connecte-toi avec `ADMIN_API_KEY` (celle configurée côté
backend) — pas de secret HMAC nécessaire pour cette vue.

Dans les deux cas, l'URL de l'API backend est éditable dans le formulaire ;
`VITE_API_BASE_URL` (voir `.env.production`) fixe la valeur par défaut au
moment du build.

## Endpoints utilisés

- `GET /merchants/me` — solde (`LedgerService.getMerchantBalance`), statut, URL webhook actuelle.
- `PATCH /merchants/me/webhook-url` — met à jour l'URL de notification.
- `GET /payments?limit=&offset=` — liste paginée, triée par date décroissante.
- `GET /admin/manual-payments/pending`, `POST .../:id/confirm`, `POST .../:id/reject` — vue admin.

## Authentification dashboard marchand — RÉSOLU (2026-07-09)

Le dashboard marchand utilise désormais un vrai login (email + mot de passe,
table `merchant_users`) émettant un cookie de session HttpOnly
(`merchant_sessions`, voir `migrations/010_merchant_dashboard_auth.sql`),
vérifié par `SessionGuard` — un guard NestJS séparé d'`ApiKeyGuard`. Le
marchand n'a plus jamais besoin de connaître son `hmac_secret` pour utiliser
le dashboard : ce secret reste réservé à l'intégration serveur-à-serveur
(voir README, section Authentification).

Le cookie de session est `SameSite=None; Secure` en production (déploiement
réellement cross-origin : dashboard sur Vercel, API sur Railway) — protection
CSRF par header personnalisé (`X-Ajvpay-Dashboard`) sur toute requête
mutante, voir `src/common/auth/session.guard.ts`. `CORS_ORIGIN` doit être
une origine **exacte** côté Railway (jamais un wildcard) pour que les
cookies fonctionnent — l'API refuse de démarrer en production sans cette
variable.

Nouvelle surface `/dashboard/*` (login/logout, profil, webhook, paiements,
remboursement) — distincte de `/payments/*`/`/merchants/me*` (clé API,
intégration serveur-à-serveur), qui restent inchangées.

Hors scope, décidé explicitement : l'admin plateforme (`ADMIN_API_KEY`)
garde son modèle actuel (clé partagée unique) — un seul utilisateur humain
de confiance aujourd'hui, profil de risque différent. Réinitialisation de
mot de passe : pas encore construite.

La vue admin a le même type de compromis (la clé `ADMIN_API_KEY` transite
par un champ du navigateur) mais un profil de risque différent : une seule
clé, un seul utilisateur humain prévu (toi), pas de secret HMAC à protéger
en plus. Acceptable pour l'usage actuel, à revoir si un jour plusieurs
personnes doivent partager l'accès admin (à ce moment-là, même remède que
ci-dessus : vrai login, pas une clé partagée collée dans un champ).
