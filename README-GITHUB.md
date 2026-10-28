# Publier Dash sur GitHub et Netlify

## Important : le ZIP doit d'abord être extrait

GitHub garde un fichier `.zip` comme une pièce jointe; il ne le décompresse pas pour publier le site. Dans Windows, faites un clic droit sur `dash-v9-37-un-seul-index-github-pages.zip`, puis **Extraire tout**.

## Un seul fichier `index.html`

Ce paquet contient un seul fichier `index.html` : celui de l'application Dash. Le jeu 3D porte un nom distinct pour éviter toute confusion : `3d/jeu.html`.

La racine du dépôt doit ressembler à ceci après l'envoi :

```text
index.html
game.js
proto.js
sw.js
manifest.webmanifest
icon.png
netlify.toml
_headers
3d/
  jeu.html
  style.css
  sim.js
  ... les autres fichiers 3D
netlify/
  functions/
    osm.js
```

## Envoi avec le site GitHub

1. Ouvrez le dépôt GitHub, puis **Add file → Upload files**.
2. Ouvrez le dossier créé par **Extraire tout**. Sélectionnez son contenu de premier niveau : les fichiers et les dossiers `3d` et `netlify`.
3. Glissez cette sélection dans GitHub. **Glissez le dossier `3d` comme un dossier complet; ne l'ouvrez pas et ne déplacez pas ses fichiers à la racine.** Ne glissez pas le dossier extérieur d'extraction lui-même : sinon, `index.html` serait enfoui dans un sous-dossier et l'adresse principale pourrait afficher une 404.
4. Confirmez l'envoi avec **Commit changes**.

Après l'envoi, vérifiez que GitHub montre `index.html`, `3d/` et `netlify/` côte à côte à la racine du dépôt. Le seul `index.html` doit être celui de l'application; le jeu est `3d/jeu.html`.

Si la page d'accueil ouvre le jeu 3D directement, remplacez le `index.html` de la racine par celui de ce paquet. Ne déposez pas le contenu de `3d/` à la racine.

## Netlify

Connectez Netlify au dépôt et gardez le dossier de publication à la racine (`.`), comme indiqué dans `netlify.toml`. L'adresse principale ouvre l'application Dash; le jeu est servi sous le chemin `3d/jeu.html`.

## GitHub Pages, si Netlify ne peut pas publier

Pour un dépôt public (ou un compte GitHub dont le forfait autorise Pages avec un dépôt privé), ouvrez **Settings → Pages**. Dans **Build and deployment**, choisissez **Deploy from a branch**, puis la branche `main` et le dossier `/(root)`, et cliquez **Save**. GitHub Pages prend `index.html` à la racine comme page d'accueil; le jeu est à `3d/jeu.html`.

GitHub Pages héberge les fichiers statiques, pas les fonctions Netlify. La carte v9.35 appelle directement les services cartographiques depuis le navigateur; Pages permet donc de publier cette version sans crédits Netlify, mais ne peut pas réparer une panne d'un fournisseur de carte.
