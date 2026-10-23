# Rapport Encombrants Soir

PWA (iPhone + Android) de contrôle des points de collecte. Génère un Excel au format de la fiche « Contrôle encombrants soir » et l'envoie par mail (partage natif).

## Lancer en local
    python3 -m http.server 8080   # puis http://localhost:8080

Installer sur le téléphone : servir en HTTPS (ex. GitHub Pages), puis « Ajouter à l'écran d'accueil ».
Données stockées localement (localStorage) sur chaque téléphone.

## Mise en ligne
Le workflow `.github/workflows/pages.yml` déploie le site sur GitHub Pages à chaque push sur `main`.
Activer une fois : Settings > Pages > Source : « GitHub Actions ».
