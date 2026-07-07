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

## Limitation de sécurité connue (à corriger avant tout marchand non technique)

Le dashboard stocke l'API Key **et le HMAC Secret** du marchand dans le
`localStorage` du navigateur, pour pouvoir signer les requêtes PATCH côté
client (`src/api.ts`, fonction `hmacSign`, via Web Crypto). C'est le même
HMAC Secret que celui utilisé pour les intégrations serveur-à-serveur
décrites dans le README principal.

Ce n'est **pas** le modèle Stripe : Stripe sépare strictement les clés
d'API d'intégration (jamais exposées à un navigateur) d'une authentification
dashboard dédiée (session cookie après login email/mot de passe + 2FA).

Avant d'ouvrir ce dashboard à des marchands externes non techniques :
1. Ajouter une table `merchant_users` (email + mot de passe haché) distincte
   des credentials d'intégration API.
2. Remplacer l'auth du dashboard par un login classique émettant un cookie
   de session HttpOnly, vérifié par un guard NestJS séparé d'`ApiKeyGuard`.
3. Ne plus jamais transmettre `hmac_secret` au navigateur.

Pour un usage interne (équipe AJV Pay testant ses propres marchands), le
compromis actuel est acceptable et documenté ici en toute transparence.

La vue admin a le même type de compromis (la clé `ADMIN_API_KEY` transite
par un champ du navigateur) mais un profil de risque différent : une seule
clé, un seul utilisateur humain prévu (toi), pas de secret HMAC à protéger
en plus. Acceptable pour l'usage actuel, à revoir si un jour plusieurs
personnes doivent partager l'accès admin (à ce moment-là, même remède que
ci-dessus : vrai login, pas une clé partagée collée dans un champ).
