# Essayer Vigie dans le navigateur

Ce mode sert à parcourir le site avec `file://`, sans lancer le serveur et sans envoyer de données en ligne. Les comptes de test et les demandes sont enregistrés dans le stockage local du navigateur.

## Créer le compte administrateur

1. Ouvre `admin-login.html` dans le navigateur.
2. Choisis **Créer le premier compte administrateur pour le test local**.
3. Entre ton nom, un courriel ou un numéro, puis un mot de passe d’au moins 8 caractères.
4. Le panneau admin s’ouvre avec ton nom.

Le lien de création locale disparaît après la création du compte admin. La session admin locale est conservée après actualisation. Pour y revenir après déconnexion, ouvre `admin-login.html` et connecte-toi avec ces identifiants.

## Essayer les parcours

- **Client avec compte :** depuis `index.html`, crée un compte client, puis retourne au site public depuis le panneau client. Envoie une demande : la session reste active et la demande est liée au compte.
- **Invité :** depuis `index.html`, choisis **Continuer comme invité** et envoie une demande avec ses coordonnées. Le lien de confirmation permet de la transférer au panneau admin.
- **Administrateur :** commence par créer les types d’agents et leurs tarifs dans **Types d’agents**. Le catalogue part vide; seuls les types que tu ajoutes sont disponibles dans le formulaire public. Le lien **Voir le site public** transmet ces types au formulaire.
- Depuis le formulaire, envoie une demande comme client ou invité. Le lien affiché après l’envoi l’ouvre dans le panneau admin pour la prendre en charge, l’approuver ou la refuser avec un motif.
- **Retour client :** ouvre l’aperçu du panneau client depuis l’admin pour voir le statut et la facture. Une demande encore en attente peut être modifiée ou annulée.

Pour essayer d’autres clients, crée plusieurs comptes avec des courriels ou numéros différents. Le premier compte admin demeure réservé à l’administrateur.
