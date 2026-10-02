# Serveur local de test Vigie

Ce serveur permet de tester les inscriptions client, les demandes invité/client et leur traitement dans le panel administrateur. Il utilise uniquement Python et SQLite, sans dépendance externe.

## Démarrer

Dans un terminal :

```sh
cd "/Users/sidimohamedcisse/Documents/Codex/2026-10-01/l/outputs"
python3 server.py
```

Ouvre ensuite <http://127.0.0.1:8765>. Il faut utiliser cette adresse plutôt que d’ouvrir `index.html` directement : les formulaires contactent le serveur local.

## Créer l’accès initial du propriétaire

Avant le premier démarrage, génère le lien privé d’activation :

```sh
cd "/Users/sidimohamedcisse/Documents/Codex/2026-10-01/l/outputs"
python3 server.py --create-admin-link
```

Le terminal affiche un lien à usage unique, valable 24 heures. Remets-le au propriétaire par un canal privé. Démarre ensuite `python3 server.py`, puis ouvre ce lien pour créer le premier compte administrateur. Ce lien n’apparaît pas sur le site public. Une fois le compte créé, le propriétaire se connecte sur <http://127.0.0.1:8765/admin-login.html>.

## Parcours de test

- Le formulaire public permet une demande comme invité.
- Un client peut créer un compte ou se connecter; une demande envoyée en étant connecté est liée au compte. Après connexion, `/client.html` présente son historique et l’état de chaque demande.
- Le panel admin affiche les demandes enregistrées et permet de les prendre en charge, approuver, refuser avec un motif obligatoire et coordonner.
- Le stockage client est dans le fichier caché `.vigie-test.sqlite3` à côté de `server.py`.

Le serveur écoute uniquement sur `127.0.0.1`, donc il n’est pas partagé sur le réseau local. Les mots de passe sont hachés avec PBKDF2 et les sessions utilisent des cookies HttpOnly. C’est un environnement de développement local, pas un serveur à exposer à Internet ni une configuration de production. Arrête-le avec `Ctrl+C`.

Pour effacer toutes les données de test, arrête le serveur puis supprime `.vigie-test.sqlite3` (et ses éventuels fichiers `-wal` ou `-shm`).

## Partager un essai sans domaine

Un tunnel Cloudflare Quick Tunnel peut donner temporairement une adresse HTTPS publique sans domaine ni serveur d’hébergement. Il n’y a **aucune protection par adresse courriel** : toute personne qui possède l’adresse temporaire peut ouvrir le site. Cette adresse change au prochain démarrage et cesse de fonctionner quand le tunnel est arrêté. C’est pour les essais seulement, avec des données fictives.

Installe `cloudflared` depuis la [page officielle de téléchargement](https://developers.cloudflare.com/tunnel/downloads/), puis ouvre deux terminaux.

Dans le premier terminal, démarre l’instance séparée de partage :

```sh
cd "/Users/sidimohamedcisse/Documents/Codex/2026-10-01/l/outputs"
sh start-share-server.sh
```

Dans le deuxième terminal, démarre le tunnel :

```sh
cd "/Users/sidimohamedcisse/Documents/Codex/2026-10-01/l/outputs"
sh start-share-tunnel.sh
```

Le terminal affiche une adresse `https://….trycloudflare.com`. Envoie cette adresse au testeur. Il pourra créer un compte client et faire des demandes; le propriétaire les verra dans le panel administrateur à `<adresse-du-tunnel>/admin-login.html`.

Pour initialiser l’accès propriétaire de cette instance de partage, génère un lien à usage unique en remplaçant l’exemple par l’adresse affichée par le tunnel :

```sh
sh create-share-admin-link.sh https://exemple.trycloudflare.com
```

Le lien généré n’est valable qu’une fois et mène au compte administrateur de l’instance de partage. Remets-le directement au propriétaire. Cette base est distincte de la base locale principale. Arrête le tunnel avec `Ctrl+C` dans le deuxième terminal; le site distant n’est alors plus accessible. Le serveur local sur le port 8765 peut continuer à fonctionner indépendamment.

## Environnement distant avec domaine

Les fichiers `Dockerfile`, `compose.yaml` et `Caddyfile` préparent un deuxième environnement HTTPS avec un volume SQLite distinct. Il ne partage pas la base locale. Pour le rendre accessible à distance, il faut un serveur d’hébergement, un nom de domaine dont le DNS pointe vers ce serveur, et les ports 80/443 ouverts. Ces ressources ne sont pas encore configurées.

Sur l’hôte de staging, copier `.env.example` vers `.env`, y inscrire le vrai nom de domaine, puis lancer :

```sh
docker compose up -d --build
docker compose run --rm app python server.py --create-admin-link
```

Le deuxième commande affiche l’URL HTTPS d’activation du propriétaire. Remettre ce lien privé au propriétaire. Le site distant et son panel seront alors accessibles par le domaine de staging. Ne jamais copier la base de test locale vers le serveur distant.

Le staging et le serveur local restent indépendants : le premier utilise le volume Docker `vigie_staging_data`, le second le fichier `.vigie-test.sqlite3`. Le fichier SQLite est adapté à un petit essai à faible trafic; avant une utilisation réelle avec des données clients, remplacer ce serveur de test par une pile applicative et base de données de production, puis effectuer une revue de sécurité.
