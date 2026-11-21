# Le Mercato du dimanche

Le réseau tout-en-un du foot amateur : trouver des matchs amicaux, organiser des tournois et des championnats, live des matchs, convocations, espace joueurs, parents et supporters, vie du club.

Appli **indépendante** (dépôt, base et hébergement séparés de tout autre projet).

## Stack
- React + Vite, appli installable (PWA) sur iPhone et Android
- Version 1 : données enregistrées sur le téléphone (démo de test)
- Prochaine étape : Supabase (comptes, base partagée, temps réel)

## Commandes
```bash
npm install
npm run dev
npm run build
```

## Fichiers
- `src/legacy/mercato.js` : logique complète de l'appli (version 1)
- `src/styles.css` : styles
- `public/villes.json` : 8 900 communes françaises avec coordonnées (GeoNames, CC BY 4.0) pour le calcul des distances
- `public/manifest.webmanifest`, `public/sw.js`, icônes : installation sur l'écran d'accueil
