# Mes Comptes — gestion bancaire personnelle

Application mobile (PWA installable) pour gérer **tous vos comptes bancaires personnels** : opérations, budgets, échéances, objectifs d'épargne et rapports.
Elle fonctionne **hors-ligne**, sans serveur ni inscription : **vos données restent sur votre appareil**.

## Fonctionnalités

| Domaine | Ce que vous pouvez faire |
|---|---|
| **Comptes** | Comptes courants, épargne, cartes de crédit, espèces, investissements, prêts. Solde initial, couleur, banque, IBAN, archivage. Patrimoine net, avoirs et dettes. |
| **Opérations** | Dépenses, revenus et virements entre comptes. Tiers, catégorie, moyen de paiement, étiquettes (#vacances…), notes. Duplication, opérations futures. |
| **Rapprochement** | Mode *pointage* pour cocher les opérations présentes sur le relevé, **solde pointé** et **ajustement de solde** en un geste. |
| **Recherche** | Recherche plein texte (libellé, note, étiquette, montant) et filtres : période, compte, catégorie, type, pointage, étiquette. Export CSV de la sélection. |
| **Budgets** | Plafond mensuel par catégorie, barres de progression, trait « rythme attendu », alertes à 80 % et en cas de dépassement, reste à dépenser par jour, dépenses hors budget, **propositions automatiques** d'après la moyenne des 3 derniers mois. |
| **Échéancier** | Opérations récurrentes (jour, semaine, mois, an, avec intervalle et date de fin), saisie **automatique** ou **à valider**, revenus et charges fixes, reste à vivre. |
| **Prévisions** | Solde prévu en fin de mois (global et par compte) en tenant compte des échéances à venir. |
| **Objectifs** | Objectifs d'épargne avec échéance et montant mensuel nécessaire, suivis manuellement (versements et retraits) ou via le solde d'un compte. |
| **Rapports** | Revenus et dépenses par mois (graphique et tableau), évolution du patrimoine, dépenses et revenus par catégorie, principaux bénéficiaires, taux d'épargne. Cliquez sur une catégorie pour voir ses opérations. |
| **Automatisation** | Règles « si le libellé contient… alors catégorie… », avec reprise de la dernière catégorie utilisée pour un tiers. |
| **Import / export** | Import des **relevés CSV** de votre banque (détection des colonnes, format débit/crédit ou montant signé, encodage Latin-1, **anti-doublons**), export CSV compatible Excel, sauvegarde et restauration JSON complètes. |
| **Sécurité et confort** | Code PIN avec reverrouillage automatique, mode discret (montants floutés), thème clair / sombre / auto, 13 devises, fonctionnement hors-ligne, installation sur l'écran d'accueil. |

## Lancer l'application

Aucune dépendance ni compilation. Il suffit de servir le dossier en HTTP :

```bash
python3 -m http.server 8080
# puis ouvrir http://localhost:8080
```

Pour la tester sans rien saisir : **Accueil → « Essayer avec des données de démonstration »**.

### L'installer sur votre téléphone

1. Hébergez le dossier en HTTPS (GitHub Pages, Netlify, Vercel… : c'est un site statique).
2. Ouvrez l'adresse sur votre téléphone :
   - **Android / Chrome** : menu ⋮ → *Installer l'application* (ou le bouton « Installer » dans *Plus*) ;
   - **iPhone / Safari** : bouton Partager → *Sur l'écran d'accueil*.
3. L'application se lance alors en plein écran et fonctionne hors-ligne.

## Vos données

- Elles sont stockées dans le navigateur de l'appareil (`localStorage`) et ne sont jamais envoyées sur Internet.
- **Faites des sauvegardes régulières** (*Plus → Import, export et sauvegarde*) : effacer les données du navigateur efface aussi vos comptes. Le fichier de sauvegarde sert aussi à transférer vos données vers un autre appareil.
- Le code PIN protège l'accès à l'interface ; il ne chiffre pas les données stockées.

## Structure du code

```
index.html            Page unique et barre de navigation
css/styles.css        Styles (mobile d'abord, thèmes clair et sombre)
js/utils.js           Dates, montants (en centimes), formatage, SHA-256
js/store.js           Données, persistance, soldes, statistiques, échéances, règles, démo
js/csv.js             Lecture et écriture CSV, reconnaissance des dates
js/charts.js          Graphiques SVG (courbe, barres) avec info-bulles
js/app.js             Écrans, formulaires, routeur, verrouillage
sw.js                 Service worker (hors-ligne)
manifest.webmanifest  Manifeste PWA
```
