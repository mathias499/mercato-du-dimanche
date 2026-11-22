# Le Mercato du dimanche

L'appli de tout le club de foot amateur : coachs, joueurs, parents et supporters.
Matchs amicaux, tournois et championnats, convocations et compos, live des matchs, entraînements et séances,
Gazette du club, chat, collectes, trésorerie.

En ligne : https://mercato-du-dimanche.vercel.app

Appli **indépendante** : dépôt, base de données et hébergement séparés de tout autre projet.

## Architecture actuelle

| Brique | Rôle |
|---|---|
| **React 19 + Vite 7** | Appli web installable (PWA) sur iPhone et Android |
| **Supabase** | Comptes (e-mail + mot de passe, confirmation par mail), base de données partagée, temps réel, stockage des photos |
| **Vercel** | Hébergement, mise en ligne automatique à chaque envoi sur `main`, deux fonctions serveur |
| **Brevo** | Envoi des mails de confirmation (réglé dans Supabase) |

### Où sont les données
**Tout ce qui compte est dans Supabase**, pas dans le téléphone :
clubs, équipes, joueurs, matchs (scores, buteurs, live, votes), entraînements et réponses, compos, chats,
articles et commentaires, collectes, trésorerie, événements, tournois, championnats, séances,
coordonnées et messages privés. Les photos vont dans le stockage Supabase (bucket `photos`).

Tables :
- `profiles` : prénom de chaque compte
- `memberships` : qui appartient à quel club, avec quel rôle (responsable, coach, adjoint, joueur, parent, supporter, arbitre) et quel statut (actif, en attente)
- `docs` : toutes les données de l'appli, une ligne par élément, avec sa visibilité (`public`, `supporters`, `club`, `staff`, `prive`)
- `push_subs` : abonnements aux notifications

Les droits sont appliqués **par la base** (règles RLS) : un supporter ne reçoit pas la trésorerie,
un joueur ne reçoit pas les coordonnées des autres. Le coach valide chaque joueur avant qu'il accède au club.

### Ce qui reste sur le téléphone, et pourquoi
- une **copie des données** pour ouvrir l'appli vite et l'afficher avec un mauvais réseau (la base reste la référence) ;
- la **file d'attente** des modifications pas encore envoyées, renvoyées dès que possible et vidée à la déconnexion ;
- des **réglages d'écran** (onglet ouvert, filtres, notifications effacées, annonces masquées).

Changer de téléphone, se déconnecter ou vider le cache ne fait rien perdre : tout revient à la connexion.

### Synchronisation
- Les changements sont envoyés à la base quelques instants après chaque action.
- Les autres appareils les reçoivent en temps réel.
- Quand l'appli revient au premier plan ou retrouve le réseau, elle envoie ce qui attend puis **recharge la base**,
  pour ne pas écrire par-dessus des données plus récentes.

Limite connue : le chat d'une équipe, les réponses à un entraînement et la compo sont enregistrés chacun en un seul bloc.
Deux écritures au même instant peuvent encore se marcher dessus. Passage prévu à « un message = une ligne ».

## Fichiers
- `src/legacy/mercato.js` : toute la logique de l'appli (écrans, actions, synchronisation)
- `src/legacy/cloud.js` : connexion à Supabase, liste des collections synchronisées, envoi des photos
- `src/styles.css` : styles
- `api/notify.js` : envoi des notifications sur les téléphones (Web Push)
- `api/reveil.js` : appelé chaque matin par Vercel pour garder la base Supabase éveillée
- `vercel.json` : planification de `api/reveil.js`
- `public/sw.js` : installation sur l'écran d'accueil et réception des notifications
- `public/villes.json` : 8 900 communes françaises avec coordonnées (GeoNames, CC BY 4.0) pour le calcul des distances
- `supabase/*.sql` : scripts de la base, à exécuter dans l'éditeur SQL de Supabase, dans cet ordre :
  `schema.sql`, `preinscription.sql`, `notifications.sql`, `tresorerie.sql`

## Réglages à fournir sur Vercel
Ces deux valeurs sont secrètes : elles ne sont **jamais** dans le code ni dans ce dépôt.
- `SUPABASE_SERVICE_ROLE_KEY` : clé d'administration Supabase, utilisée seulement par `api/notify.js`
- `VAPID_PRIVATE_KEY` : clé privée des notifications

L'adresse du projet Supabase et sa clé publique sont dans le code : elles sont publiques par nature,
la protection vient des règles de la base.

## Commandes
```bash
npm install
```
```bash
npm run dev
```
```bash
npm run build
```

## Mode démo
L'adresse `?demo` ouvre une démo avec des clubs d'exemple, enregistrée uniquement sur le téléphone.
Elle n'écrit rien dans la base et n'est proposée nulle part dans l'appli.

## À faire
- Mentions légales, conditions d'utilisation, page de confidentialité, accord parental pour les mineurs
- Chat et réponses enregistrés ligne par ligne
- Sauvegarde régulière de la base
- Publication sur l'App Store et Google Play
- Accès officiel aux calendriers et classements de la FFF (demande à faire)
