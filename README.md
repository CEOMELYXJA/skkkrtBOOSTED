# SKKKRT3D — version 2

Simulateur 3D de trottinette électrique (iScooter i9) : la poignée Bluetooth donne la vitesse, le gyro du téléphone fixé sur le guidon tourne le monde.

## Ce qui a changé
- **Sens corrigé** : accélérer fait maintenant avancer (avant : le mouvement était calculé à l'envers de la caméra). Le guidon à droite tourne aussi à droite.
- **Trottinette 100 % noire** (plateau, tube, guidon, roues, poignées, écran), pilote visible en 2e personne.
- **Mondes plus clairs** : 4 mondes — Ville ensoleillée, Coucher de soleil, Nuit néon, Hiver québécois (neige).
- **Réglages (⚙)** : monde, vue 1re/2e personne, police (6), couleur d'accent, qualité, champ de vision, distance/hauteur de caméra, sensibilité et inversion du guidon, échelle de vitesse, mini-carte, jauge, son, cyclistes. Tout est mémorisé.
- Nouveau décor : fenêtres sur les immeubles, passages piétons, pistes cyclables corrigées, arche de départ, étang, collines, nuages / étoiles / neige.
- HUD refait (jauge en arc, mini-carte qui tourne avec toi), son de moteur, collisions qui glissent le long des murs.

## Déployer sur Netlify
Dans le site complet, le jeu s'ouvre depuis l'application et se trouve à l'adresse `/3d/jeu.html`. Si tu sers seulement le dossier `3d`, ouvre `/jeu.html` dans **Bluefy** (iPhone) ou Chrome (Android).

## Sur le stand
1. Cale la i9, roue arrière dans le vide, téléphone sur le guidon.
2. Choisis ton monde et ta vue, puis **Entrer dans la ville**.
3. **Autoriser gyro** → guidon droit → **Calibrer guidon**.
4. **Connecter i9** (ferme l'app KCQ). La poignée avance, le guidon tourne.

Si le guidon tourne à l'envers : ⚙ → *Inverser le guidon*. Trop mou / trop nerveux : *Sensibilité du guidon*.

## Clavier
Flèches ou W A S D = vitesse et direction · souris = regarder tout autour (clic pour capturer, Échap pour relâcher) · Échap/P = menu · M = mini-carte · V = visière · L = phare · C = calibrer · R = retour au départ.

## Fichiers
`jeu.html`, `style.css`, `sim.js` (boucle de jeu), `world.js` (mondes), `scooter.js` (modèle noir + pilote), `settings.js` / `ui.js` (réglages), `sensors.js` (gyro), `telemetry.js` (Bluetooth i9 ou app), `proto.js` (protocole i9).
Three.js est chargé depuis jsDelivr : il faut une connexion internet au premier chargement.

## Version 3 — capture de drapeaux (v8 : décor haute résolution, voir LISEZ-MOI-3D.md)
Voir `LISEZ-MOI-3D.md` à la racine. Nouveau fichier : `game.js` (drapeaux, pièces, chrono, points). `world.js` : cyclistes percutables (+ 6 sur les pistes des îlots). `sim.js` : chute, remise sur la piste, collisions cyclistes. Touche **G** = nouvelle partie.
