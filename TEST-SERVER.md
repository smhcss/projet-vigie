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
- Un client peut créer un compte ou se connecter; une demande envoyée en étant connecté est liée au compte.
- Le panel admin affiche les demandes enregistrées et permet de les prendre en charge, approuver et coordonner.
- Le stockage client est dans le fichier caché `.vigie-test.sqlite3` à côté de `server.py`.

Le serveur écoute uniquement sur `127.0.0.1`, donc il n’est pas partagé sur le réseau local. Les mots de passe sont hachés avec PBKDF2 et les sessions utilisent des cookies HttpOnly. C’est un environnement de développement local, pas un serveur à exposer à Internet ni une configuration de production. Arrête-le avec `Ctrl+C`.

Pour effacer toutes les données de test, arrête le serveur puis supprime `.vigie-test.sqlite3` (et ses éventuels fichiers `-wal` ou `-shm`).
