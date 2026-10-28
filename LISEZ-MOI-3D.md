## v9.37 : un seul index, chemin 3D sans ambiguïté
- L'application garde l'unique `index.html` à la racine. La page du jeu s'appelle maintenant `3d/jeu.html`; le bouton 3D et le service worker pointent vers ce chemin.
- URL d'accueil `/`, jeu `/3d/jeu.html`.
- Le service worker passe à `dash-v937`.

## v9.36 : retour au rendu vectoriel et correction du paquet GitHub
- Retrait du décor 3D expérimental qui tentait d'extruder routes et bâtiments depuis les couleurs des tuiles raster de la minimap. Il produisait des routes en carrés, des contours imprécis et des bâtiments inventés.
- Les routes et bâtiments en 3D reviennent aux objets vectoriels OpenStreetMap; si les morceaux vectoriels manquent, le jeu ne les remplace plus par des formes raster approximatives. La minimap 2D et ses tuiles de secours restent actives, avec leurs reprises; le cache durable des morceaux cartographiques reste en place.
- Le ZIP garde l'application à la racine et le jeu dans le dossier `3d`. Le service worker passe à `dash-v936`; le nom de la page du jeu est simplifié en v9.37.

## v9.35 : secours cartographiques et ville 3D de repli
- La carte réelle essaie maintenant plusieurs sources Overpass mondiales, en changeant d'opérateur après une panne, avec un délai court par tentative, des reprises supplémentaires et une pause plus longue après une limite 429. Les miroirs d'un même opérateur ne sont plus comptés comme des serveurs indépendants; Kumi/Private.coffee ne provoque donc plus de doublons.
- La minimap essaie aussi deux styles de tuiles OSM de secours si la source principale ne répond pas. Une tuile en panne est redemandée après une courte pause; seules les tuiles visibles à l'écran sont demandées et leurs crédits restent affichés.
- Si les morceaux vectoriels n'arrivent pas, les tuiles déjà visibles sont interprétées en géométrie 3D : chaussées texturées, bâtiments extrudés avec façades/toits, et arbres dans les zones vertes. Aucun grand tapis d'image n'est posé sur le terrain. Le décor de secours suit le joueur et se renouvelle quand la minimap avance, même après avoir quitté la zone du premier point GPS.
- Si aucune route vectorielle n'est disponible et qu'une chaussée 3D reconstruite est assez proche du GPS, le départ s'y replace.
- Les hauteurs exactes, les feux et panneaux non dessinés sur la minimap ne peuvent pas être déduits fidèlement de ses pixels; les objets OSM détaillés continuent d'être utilisés quand les morceaux vectoriels les fournissent.
- GPS, satellites de navigation et 4G/5G servent à obtenir la position et transporter les données; ils ne sont pas des serveurs de rues ou de bâtiments. Les services publics mondiaux sans clé sont limités, donc les reprises restent espacées pour ne pas saturer les serveurs bénévoles.
- Le service worker passe en `dash-v935`.

## v9.34 : zone locale plus légère et départ sur une route
- La zone mémorisée de 3 km est ramenée une fois à 800 m; le choix élargi est limité à 1,5 km. Ça évite de lancer les 210 requêtes visibles dans la capture. Les secteurs gardent leur petite taille pour rester rapides à interroger.
- Le chargement donne la priorité aux secteurs les plus proches et attend jusqu'à quatre secteurs avec des données routières avant le départ; secours après 12 secondes. Le reste de la zone continue de se charger en arrière-plan.
- Si le GPS est imprécis, la trottinette démarre sur la route la plus proche dans la marge d'erreur mesurée, avec un message qui indique le déplacement.
- Les zones déjà gardées en mémoire restent réutilisables.
- Le service worker passe en `dash-v934`.

## v9.33 : scène 3D sans tapis de carte
- Le fond raster plaqué sur le terrain est retiré. Les routes, bâtiments, espaces verts, feux et panneaux sont des objets de la scène; la minimap reste dans son coin et garde le crédit OpenStreetMap.
- La carte vectorielle demande maintenant aussi les panneaux d'arrêt et de cédez-le-passage lorsqu'ils sont répertoriés dans OpenStreetMap. Ils sont dessinés en 3D près des routes; les feux réels restent disponibles dans les réglages.
- Le départ rapide attend jusqu'à quatre secteurs proches (au lieu du tout premier secteur), avec un départ de secours après 8 secondes. Le reste de la zone continue de se compléter pendant le jeu.
- Les zones de la mémoire précédente sont réutilisées immédiatement, puis actualisées en arrière-plan avec les données des panneaux. Les nouvelles données actualisées sont conservées durablement.
- Le relief et les textures sont générés séparément des images raster. La carte ne peut inventer que les objets et détails présents dans les données OpenStreetMap; la couverture varie selon les lieux.
- Le service worker passe en `dash-v933`.

## v9.31 : départ plus rapide et mémoire durable des zones
- Le morceau situé sous le GPS est téléchargé en premier ; il n'y a plus de requête de départ supplémentaire qui doublait le travail et mettait les serveurs en concurrence. Les autres morceaux se chargent ensuite autour, en arrière-plan.
- Si le réseau ne répond toujours pas, le jeu démarre après 18 s et continue de compléter la carte pendant la partie.
- Les morceaux réussis sont conservés dans IndexedDB, sans expiration automatique de 30 jours. Le stockage persistant du navigateur est demandé quand il est disponible ; CacheStorage et l'ancien cache servent de reprise si IndexedDB n'est pas accessible.
- Le cache garde les zones visitées jusqu'à ce que le navigateur manque d'espace ; dans ce cas, il libère les morceaux les moins récemment utilisés.
- Le service worker passe en `dash-v931` pour charger cette version.

## v9.30 : la carte passe par TON site Netlify (relais)
- Nouveau fichier `netlify/functions/osm.js` + `netlify.toml` : le téléphone demande la carte à ton propre site (même adresse, donc plus de « Load failed »), et c'est le serveur Netlify qui interroge OpenStreetMap en essayant 7 miroirs, avec une limite de 9 s par morceau.
- IMPORTANT : déposer TOUT le dossier (pas seulement `3d`) sur Netlify, avec `netlify/` et `netlify.toml` à la racine. Si Netlify n'accepte pas la fonction, le jeu retombe tout seul sur le téléchargement direct (comme avant) : rien ne casse.
- Morceaux de ~445 m (≈ 16 à 25 morceaux pour 800 m de rayon), reprises automatiques conservées. Le message de chargement indique « N via ton site Netlify » quand le relais fonctionne.
- Le service worker ignore `/.netlify/` (pas de cache des réponses du relais).

## v9.29 : téléchargement de la carte plus rapide et fiable
- Morceaux de ~278 m au lieu de 757 m (≈ 49 à 64 morceaux pour 800 m de rayon) : chaque réponse est petite, donc rapide et rarement refusée par les serveurs Overpass.
- Un morceau refusé n'est plus abandonné : il est redemandé automatiquement (jusqu'à 4 tours), puis la carte se complète pendant que tu joues.
- Plus de téléchargements en parallèle (6 au départ, jusqu'à 8), pénalités plus courtes pour un serveur qui échoue.
- Les morceaux réellement vides (champs, lacs) confirmés par deux serveurs sont gardés en mémoire au lieu d'être redemandés à chaque fois.
- Mémoire de tuiles `v6` (la carte se retélécharge une fois), jusqu'à 1200 morceaux gardés. Rayon de carte inchangé.

## v9.28 : erreurs masquées, haut du corps noir, bâtiments et stationnements fidèles
- Les messages d'erreur rouges ne cachent plus le bouton « Entrer dans la ville » : ils sont consignés en silence (visibles avec `?debug` à la fin de l'adresse, ou si le jeu ne démarre pas du tout).
- Joueur : tronc et bras noirs, mains couleur peau (la couleur d'accent ne teinte plus le chandail).
- Carte réelle : la requête demande maintenant aussi les bâtiments mappés en relation (grands bâtiments, cours intérieures) et les stationnements en surface (asphalte, sans arbres ni gazon dessus, dessinés sur la mini-carte).
- Les tuiles gardées en mémoire passent en `v5` : la carte se retélécharge une fois pour avoir les nouveaux éléments.

# Dash + SKKRT3D

Nouvel onglet **3D** dans l'app : il ouvre le simulateur en plein écran (dossier `3d/`), en réutilisant la connexion Bluetooth déjà faite dans l'onglet Tableau (pas de double connexion).

Déploiement : déposer tout ce dossier sur Netlify. Le service worker passe en `dash-v912c` : recharge la page deux fois (ou vide le cache Bluefy) pour obtenir la nouvelle version.
Le jeu reste aussi utilisable seul : `https://ton-site/3d/`.

## v9.27 : fusion v9.26 (tes 8 demandes) + « Nature réaliste » v9.25c (gazon, arbres, textures)
- Le gazon, les arbres et les textures étaient absents de la v9.26 : le fichier `3d/nature.js` y manquait. Il est de retour, avec la v9.26 par-dessus.
- Le service worker passe en `dash-v927` : recharge la page deux fois (ou vide le cache Bluefy).

## v9.26
- **Journal des parties** (en arrière-plan, sur l'appareil) : réglages, fluidité, chargement de la carte, coupures Bluetooth, chutes, erreurs. Réglages → « Copier le rapport de mes parties ».
- **Bluetooth plus stable** : reconnexion automatique après une coupure (8 essais), et téléchargements de carte/relief plus doux tant que la i9 est connectée.
- **Après une chute** : on est replacé à au moins 12 m de tout véhicule/piéton, avec 3 s d'immunité.
- **Gazon et bois visibles 2× plus loin** (réglage « Distance de vue du gazon et des bois »).
- Option « pixels par pixel d'écran » retirée (résolution toujours automatique). Champ de vision de base : 100°.
- **Cycliste** tout en noir, bras beige moins jaune.
- **Mode criminel** : 5 grosses étoiles rouges en haut ; un contact avec la police en enlève une ; à zéro : arrêté, et on recommence à 5.

## v9.25 : « Nature réaliste » (gazon, arbres, textures, ciel)
Nouveau fichier `3d/nature.js` ; tout est calculé sur place (rien de plus à télécharger). Le reste du jeu n'a pas changé.
- **Gazon** : des touffes de brins (3 à 5 brins chacune) autour de toi seulement, avec un léger vent. Jamais sur les routes, trottoirs, bâtiments ni dans l'eau ; elles rétrécissent en s'éloignant (aucun « pop »). Pas de gazon en hiver (neige) ; au printemps il suit les plaques de neige.
- **Arbres** : le feuillage est fait de cartes de feuilles (texture dessinée par le code) sur un cœur plein, avec formes différentes feuillus / épinettes, couleurs de saison (automne, printemps…) et vent. Au loin, les cartes rétrécissent en douceur et il ne reste qu'un feuillage simple (économie de puissance).
- **Textures** : herbe en plaques (grasse / sèche, brins fins de près), asphalte avec fissures, plaques réparées, gravillons et taches, murs en briques (joints en creux, relief), béton des trottoirs, ponts et bordures avec grain et taches.
- **Ciel et lumière** : la brume d'horizon rejoint exactement la couleur du brouillard, halo du soleil, voile de nuages fins qui dérive.
- **Réglages** (⚙ → Résolution & performance) : « Nature réaliste » (on/off) et « Gazon » (Aucun / Auto / Moyen / Dense / Très dense). Si ça saccade : baisse « Gazon » d'abord, puis la qualité. Adresse `/3d/?nature=off` pour tout couper d'un coup.
- Le service worker passe en `dash-v925` : recharge la page deux fois (ou vide le cache Bluefy).

## v9.23 : correctif « terrain plat sans routes ni bâtiments » sur la carte réelle
- **Cause probable** : un serveur de carte pouvait répondre « rien ici » (réponse vide, sans erreur) ; comme c'est la réponse la plus rapide, il devenait le serveur préféré, et ces morceaux vides étaient gardés 30 jours en mémoire.
- **Correctif** : une réponse sans aucune route/bâtiment est vérifiée par un autre exploitant (le fautif est mis de côté 10 min) ; les serveurs aux données périmées (> 60 jours) sont refusés ; un morceau vide n'est plus jamais gardé en mémoire ; l'ancienne mémoire (v3) est effacée ; si la carte arrive quand même vide, elle est re-téléchargée automatiquement (2 essais max) ; un morceau de carte qui planterait ne bloque plus les autres.

## v9.22 : commandes ordinateur — flèches ou WASD conduisent, la souris regarde

- **Plus de rechargements en pleine partie** : le rechargement « la route a disparu » est supprimé (il bouclait). La carte ne se recharge plus que tout près de son bord (moins de 100 m), jamais dans les 90 s après un chargement, au plus une fois aux 3 minutes, jamais sur une carte de secours ; désactivable dans les réglages (« Carte réelle : se recharger toute seule… »).

## v9.21 : récompenses de loterie, rose des vents, orage, tornade, urgences, ponts solides
- **Récompenses** : sons de machine à sous (cloches, fanfare de cuivres, pluie de pièces) + **confettis** ; beaucoup plus de **drapeaux et d'anneaux**, nettement moins de pièces (aussi dans la capture de drapeaux : 6 / 9 / 12 drapeaux et des anneaux le long du chemin).
- **Rose des vents** minuscule et semi-transparente (haut à droite) : suit le nord (N, NE, E, SE, S, SO, O, NO) selon là où tu regardes. Désactivable.
- **Clavier + souris (ordinateur)** : les **flèches ET W A S D** (touches physiques, ZQSD en AZERTY) conduisent (accélérer, freiner, tourner) ; la **souris** oriente la vue tout autour (clique sur l'écran pour la capturer, Échap pour la relâcher et mettre en pause). Réglage optionnel : le regard revient au centre quand on arrête de bouger la souris.
- **Circulation** : quantité réglable (peu / moyenne / dense, « peu » par défaut), **feux aux carrefours** (Arcade = partout, Réels = ceux d'OpenStreetMap, Aucun), **urgences** (police, ambulances, pompiers avec gyrophares et sirènes ; Auto = en difficile) et **mode criminel** (ils te poursuivent : fuis !).
- **10 chansons de 15 s** enchaînées (la première est l'originale).
- **Oiseaux** qui volent autour et chantent (pas la nuit, pas pendant l'orage).
- **Orage** : pluie, éclairs, tonnerre, secousses, route glissante, **visière** (bouton 🥽 ou touche V) avec gouttes. **Tornade** : un entonnoir géant te « magnétise » même guidon droit.
- **Carte réelle** : près des limites (≈ 250 m) ou si la route disparaît, petite pause et re-téléchargement centré sur l'endroit où tu es.
- **Ponts** : points tous les ~5 m (tablier fidèle), **garde-corps infranchissables** (on ne peut quitter le tablier que vers le sol à la même hauteur), piétons / cyclistes / voitures **posés sur le tablier** (avant ils étaient sous le pont, d'où les chutes « sans raison »).
- **Porte-gobelet noir** à droite du guidon (retirable dans les réglages). Les feux réels demandent « Tout re-télécharger » (la mémoire des cartes est passée à la v3).

## v9.20 : saisons / moment / néon aussi sur la ville imaginaire, menu et pause sur ordinateur
- **Ville imaginaire = mêmes réglages que la carte réelle** : Été / Hiver / Printemps / Automne × Jour / Soir / Nuit × Lumière normale ou Néon (écran d'accueil et ⚙). Les anciens mondes « Coucher de soleil », « Nuit néon » et « Hiver québécois » sont convertis automatiquement en réglages (ex. Nuit néon = Été + Nuit + Néon).
- **Menu / pause** : bouton ☰ en haut à droite, ou touche **Échap** / **P**. Reprendre, Réglages, Écran d'accueil (changer de monde, vue, jeu), Nouvelle partie, Quitter. Le jeu est vraiment figé pendant la pause.
- **Mini-carte** : couche d'affichage corrigée (l'interface passe devant la vue 3D), plus grande sur ordinateur, touche **M** pour l'afficher / la cacher.

## v9.19 : saisons, néon, pont unique, points en balade libre, trajets enregistrés, opacité 3D
- **Saison × moment × lumière** (⚙ → Monde, carte réelle) : Été / Hiver / Printemps / Automne × Jour / Soir / Nuit × Lumière normale (discrète) ou Néon (fenêtres, vitrines, lampadaires et pistes très éclairés, façades néon). Hiver de jour, de soir et de nuit ; **printemps** : neige par plaques (fondue par endroits, toits encore enneigés) sous le soleil ; **automne** : arbres rouges / jaunes / orangés + feuilles qui tombent. L'ancien réglage « Ambiance » est converti automatiquement.
- **Un pont = un seul tablier** : quand la carte dessine piste cyclable au centre et trottoirs sur les côtés, l'espace entre les voies est comblé (un seul grand chemin, jamais d'eau entre les rangées), parapets seulement à l'extérieur, et on ne tombe plus entre les voies.
- **Balade libre avec points** : pièces dorées (60 m), anneaux (180 m) et drapeaux (360 m) à positions fixes sur les routes et pistes ; points de la balade + total à vie (⚙ → *Mes trajets et mes points*).
- **Trajets enregistrés en arrière-plan** (sur ton appareil seulement) : à chaque sortie, le jeu note par où tu passes. Les endroits où tu es passé lors d'au moins 3 trajets deviennent des **favoris** (pièce en or +50 et drapeau +150, ré-apparaissent à chaque balade). Ces trajets servent aussi à affiner le GPS : côté de la route où tu roules d'habitude, position fiable là où la carte n'a pas de route. Effacer : ⚙ → *Effacer l'historique des trajets*.
- **Opacité de la vue 3D** (⚙ → Vue) : de 100 % à 20 % ; en dessous de 100 %, la caméra arrière du téléphone apparaît derrière la 3D (comme la carte de la 2D).

## v9.18 : arbres / lampadaires bien placés, écran épuré
- **Plus aucun arbre ni lampadaire sur une chaussée, une piste cyclable, un sentier ou un trottoir** (ni sur une rue qui en croise une autre) : chaque position est vérifiée contre toutes les routes autour ; les lampadaires sont posés juste après le trottoir, les arbres d'alignement 1 m plus loin.
- Le bouton « Clavier » n'est plus à l'écran : il est dans ⚙ réglages (« Clavier toujours actif, même avec la i9 » ; sans la i9, le clavier est déjà actif).
- Titre en haut à gauche : « i9 » remplacé par un « w4r3z » très discret, comme dans les autres sections.

## v9.17 : fin des refus « Load failed » (limite des serveurs Overpass)
- Les serveurs de carte n'acceptent que ~2 requêtes à la fois par personne ; au-delà ils refusent sans détail (« Load failed » sur iPhone). Mes relances en double dépassaient cette limite et se bloquaient elles-mêmes. Maintenant : **2 places maximum par exploitant**, jamais la même requête sur deux serveurs à la fois, un serveur qui vient d'échouer est mis en pause 15–30 s, et on attend au lieu de marteler.
- 6 exploitants différents (Allemagne ×3 instances, kumi, private.coffee, openstreetmap.fr, mail.ru, Taïwan).
- **Départ de secours** : si après 45 s la zone de départ n'est toujours pas arrivée, le jeu démarre avec ce qu'il a (morceaux déjà en mémoire, relief) et la carte s'ajoute ensuite toute seule.
- L'écran de chargement affiche l'état de chaque serveur (« refusé (serveur saturé) », « trop lent »…).

## v9.16 : départ en quelques secondes, même quand les serveurs de carte sont lents
- **Étape 1 « départ »** : UNE seule petite requête autour de toi (450 m) : c'est elle qui lance le jeu, au lieu d'attendre 9 morceaux. **Étape 2** : les morceaux proches (~1,3 km). **Étape 3** : toute la zone demandée (mêmes données, même rayon qu'avant). Chaque étape remplace la précédente quand tu t'arrêtes (ou après 75 s si tu roules), position et cap conservés ; le journal annonce chaque étape.
- Le **relief ne bloque plus le jeu** : s'il tarde plus de 20 s, on démarre à plat et il s'installe tout seul à son arrivée.
- 7 serveurs au lieu de 4 (instances officielles supplémentaires), une tentative lente est abandonnée après 22 s (avant 45 s) et relancée sur un autre serveur ; 4 tentatives par morceau.
- L'écran de chargement montre un chronomètre, l'état de la zone de départ (… ✓ ✗), « morceaux proches x / y » et le dernier incident (ex. HTTP 429) pour savoir ce qui se passe.

## v9.15 : correction de la lenteur de téléchargement introduite en v9.13–9.14
- Le relief va de nouveau chercher ses tuiles sur le serveur principal (rapide) ; les autres ne servent qu'en secours (j'avais mis les trois en rotation, dont un serveur d'Europe, plus lent, et des connexions supplémentaires à ouvrir).
- Téléchargement de la carte : 4 en parallèle au départ (comme quand ça allait vite), jusqu'à 6 si les serveurs répondent sans erreur ; 8 + relances rapides dépassaient la limite d'Overpass et provoquaient refus/attentes.
- Les serveurs sont classés selon leur rapidité mesurée ; un serveur en panne est évité 45 s ; les relances simultanées sont plafonnées.
- Requête plus légère (rivières/canaux en égalité exacte), cache de tuiles qui garde 320 morceaux (une carte de 6 km en compte 72) et n'est plus trié à chaque morceau.
- Le journal indique la durée réelle : « téléchargée en X s (N morceaux en mémoire) ».

## v9.14 : carte et relief beaucoup plus rapides à télécharger (rien de retiré)
- Le **relief** se télécharge maintenant **en même temps** que la carte (avant : l'un après l'autre) et chaque tuile d'altitude est gardée dans le navigateur : aux lancements suivants, plus aucune requête pour le relief.
- **8 téléchargements en parallèle** (avant 4) répartis sur les 4 serveurs, relance d'un autre serveur plus tôt (3,5 s).
- **Départ progressif** : le jeu démarre dès que les morceaux proches (~1,3 km) sont arrivés ; le reste de la zone (même rayon, mêmes données) se télécharge en arrière-plan puis remplace la carte de départ **quand tu es arrêté** (position et cap conservés). Message dans le journal à chaque étape.

## v9.13 : clavier fluide, musique d'arcade, GPS beaucoup plus précis
- **Ordinateur** : flèches *ou* W A S D (aussi Z Q S D) : avant / freiner / gauche / droite, les deux fonctionnent ensemble ; Espace = frein. L'accélération était très lente (double lissage, ~0,45 m/s²) : maintenant 0 → 25 km/h en ~2 s, progressive, et roue libre naturelle.
- **Musique d'arcade** (course aux pièces dorées) : boucle de 8 mesures synthétisée, bouton 🎵 dans la barre du bas + réglages (activer, volume).
- **GPS** : filtre de Kalman (position + vitesse) alimenté par chaque fix et par la vitesse/cap Doppler de l'appareil ; vrai retard du fix pris en compte ; cap = direction réelle du déplacement (N/S/E/O), puis aimantation à la route ; alignement rapide au départ ; vitesse de la roue **apprise automatiquement** à partir du GPS (échelle sauvegardée dans « Échelle de vitesse ») ; boussole 🧭 en haut quand tu roules pour vrai (cap du jeu, cap GPS, précision, échelle).

## v9.12c : routes bien posées, aimant à la route (GPS), ponts et rivières réalistes
- **Routes toujours par-dessus le terrain** : le gazon et les bois sont maintenant 10 cm *sous* le niveau de la route (avant : 2,6 cm, trop peu quand le terrain est irrégulier), le sol 30 cm sous la route, et les triangles de gazon sont plus fins (≤ 5 m) ; la route est découpée tous les 3 m. Plus de route qui passe sous la pelouse dans les pentes.
- **Roule pour vrai = le GPS a raison** : dès que le GPS bouge (> 1,6 m/s), le cap vient de ta vraie trajectoire (cap GPS ou droite ajustée sur tes dernières positions) et de la route la plus proche, **sans utiliser le guidon ni la boussole** ; ta position est ramenée sur la route (forte en travers, douce en avant, avec compensation du retard du GPS). Résultat : en ligne droite dans la vraie vie = en ligne droite dans le jeu, et dans les virages la trottinette suit la route. Sans la i9 connectée, la vitesse vient du GPS. Sur le stand (GPS immobile) tout fonctionne comme avant, guidon compris. Plus de murs invisibles quand tu roules pour vrai. Réglage : ⚙ → *Aimant à la route* (le recalage GPS reste dans *Recaler sur le GPS*). **Calibre le guidon à l'arrêt, guidon droit.**
- **Ponts** : le tablier ne suit plus le sol (qui plonge dans la vallée) ; il relie les deux rives, avec flancs en béton, parapets, dessous et piliers tous les ~40 m. Sur un pont, la trottinette roule à la hauteur du tablier.
- **Eau réaliste** : chaque plan d'eau est *plat* (niveau de l'eau) et le sol est creusé de 2,5 m dessous ; une rivière a donc une vraie profondeur sous le pont. Les rivières et canaux tracés seulement comme une ligne dans OpenStreetMap sont maintenant dessinés (nouvelle donnée : la carte se retélécharge une fois). L'eau est infranchissable (hors pont) : « Plan d'eau : on ne roule pas dessus ».

## Nouveautés v7 : jeu de capture de drapeaux
- **Capture de drapeaux 🚩** : des drapeaux avec balise lumineuse sont posés aux intersections des pistes cyclables. Roule dedans pour les capturer, dans l'ordre que tu veux (la flèche en haut indique le prochain).
- **Pièces dorées 🪙** : +10 points chacune (grosses pièces du parc : +50). Elles dessinent le chemin d'un drapeau au suivant.
- **Chrono** : compte à rebours (Facile 2:30 · Moyen 2:30 · Difficile 2:10) ; chaque drapeau rajoute du temps (+20 / +15 / +10 s). Tous les drapeaux = victoire + 5 points par seconde restante.
- **Points** : popups « +10 🪙 », « +100 🚩 », « −30 CHUTE », « −20 CYCLISTE » et bilan final (points, drapeaux, pièces, chutes, cyclistes percutés, temps, records par difficulté).
- **Chute** : percuter un bâtiment (au-dessus de ~5 km/h) te fait tomber, puis tu es remis sur la piste cyclable la plus proche.
- **Cyclistes percutables** : les 6 du parc + 6 nouveaux qui font le tour des îlots sur les pistes. Ils tombent quand tu les touches ; au-dessus de ~14 km/h tu tombes aussi.
- Mini-carte : drapeaux, pièces et cyclistes. Réglages ⚙ → *Jeu* : mode (drapeaux / balade libre), difficulté, chute, collision cyclistes, records.
- Touches : **G** nouvelle partie (en plus de Z/S, Q/D, L, C, R).

## v9.12 : Rendu Premium (lumière, matières, détails) — le jeu ne change pas
Interrupteur : ⚙ → Résolution & performance → **Rendu Premium** (activé par défaut). Pour revenir à l'ancien rendu : le désactiver, ou ouvrir `/3d/?gfx=classic`. Recharge la page deux fois (ou vide le cache Bluefy). La trottinette prend le nouveau rendu au rechargement de la page.
- **Ciel réaliste comme lumière** : les reflets viennent maintenant du ciel du monde choisi (soleil, horizon, lueurs néon) et non plus d'une pièce de studio. Les vitres, l'asphalte et la trottinette reflètent le vrai ciel ; le bas des objets prend la couleur du sol.
- **Façades en relief** : fenêtres en retrait avec cadre et appui, verre très lisse qui reflète le ciel, bandeaux d'étage, crépi granuleux.
- **Asphalte à gravillons** avec traces de roues plus lisses ; **sol** (herbe / neige) avec relief fin et rugosité variable.
- **Arbres** : couronnes irrégulières à plusieurs lobes, ombrées du bas (sombre) vers le haut (clair) ; épicéas en trois étages festonnés.
- **Trottinette** : peinture à vernis (clearcoat), pneus sculptés, plateau antidérapant en relief, faisceau de câbles, disque et étrier de frein ; casque verni, blouson satiné.
- **Ombres stables** : la carte d'ombres est aimantée à ses pixels, les bords ne grouillent plus quand tu roules.
- **Résolution** : sur écran dense (iPhone), le mode Ultra rend en résolution native (×3) au lieu de ×4 : environ 45 % de pixels en moins, sans différence visible, pour payer les nouvelles matières.
- Aucune règle, commande, donnée ni collision n'est touchée. Nouveaux fichiers : `3d/gfx.js`, `3d/gfx-math.js`.

## v9.11 : rendu cinéma (façon jeu AAA)
- Nouveau pipeline d'image : **ombrage ambiant** (profondeur dans les recoins, sous les bâtiments, les arbres et la trottinette), **halo lumineux** (phares, lampadaires, ciel), **reflets** réalistes sur la trottinette noire, **étalonnage** (contraste, couleurs, vignette), antialiasing 4x sur l'image finale.
- La trottinette a maintenant des **bords arrondis** (plus de blocs anguleux).
- ⚙ → Résolution & performance : deux interrupteurs (Effets cinéma, Ombrage ambiant). Si l'écran est trop lent, l'ombrage ambiant se coupe tout seul, puis les effets.
- Ces effets chargent des modules three.js depuis internet au premier lancement.

## v9.10 : rendu Ultra
- Nouveau niveau ⚙ → Qualité → **Ultra** (activé par défaut, une seule fois) : image suréchantillonnée à 1,5x la résolution de l'écran, textures ×4, ombres 4096, collines et ciel plus fins, neige plus dense, roues, pneus, arbres, lampadaires et personnages à 2,5x plus de facettes.
- Nouveaux réglages : résolution ×4, textures Extrême ×8, ombres 8192. Un plafond de ~16 millions de pixels évite que le téléphone plante.
- Si ça saccade : Qualité Haute, ou résolution ×2. Recharge la page deux fois (ou vide le cache Bluefy).

## v8 : paysages 3D en haute résolution
Le jeu est identique ; seul le rendu du décor a été affiné.
- **Collines de l'horizon** : les cônes anguleux sont remplacés par un vrai relief continu (maillage fin, crêtes, ombrage lisse, couleur qui varie avec l'altitude).
- **Sol / pelouse** : texture de détail sans couture (fini l'aplat uni), nette de près grâce au filtrage anisotrope.
- **Textures x2 à x4** : fenêtres des immeubles, piste cyclable, icône vélo, bannière de départ.
- **Ciel** : plus de segments + tramage anti-bandes ; nuages, arbres, lampadaires, étang et cyclistes avec beaucoup plus de facettes (plus de silhouettes en polygones).
- **Étoiles et flocons** ronds au lieu de carrés.
- **Rendu** : résolution d'écran Moyenne = 2x (avant 1,5x), Haute = 3x (avant 2x) ; ombres plus nettes (2048 / 4096).
- ⚙ → Qualité : **Haute** pour le maximum. Si ça saccade, repasse sur Moyenne.
- Recharge la page deux fois (ou vide le cache Bluefy) pour obtenir la v8.

## v9 : tableau de bord, jeu GPS et carte 3D réelle
**Tableau**
- Le bouton « Régulateur automatique » du haut est retiré (les infos utiles remontent). Le bouton « Régulateur » des Commandes affiche maintenant l'état : « Régulateur en marche ✓ », « Régulateur : 3 / 5 s » ou « roule pour l'armer ».
  Le protocole de la trottinette n'a qu'un bit « activer » : l'enclenchement après 5 s à vitesse constante est fait par le contrôleur, l'app ne peut pas le forcer.
- « Fait à date » et « Il me reste » : le **pourcentage de batterie** est en gros ; la durée et la distance passent en petit dessous.
**Jeu (GPS)**
- Historique des parties tout en bas de la page (points, durée, pièces, anneaux, drapeaux, km), 100 dernières parties.
- Les pointillés gris d'adresses d'OpenStreetMap (et les numéros de maisons) sont effacés des tuiles. Réglage ⚙ « Pointillés d'adresses » pour les remettre.
- Rotation de la carte avec deux doigts (en plus du zoom) ; bouton 🧭 : la carte tourne toute seule pour que la flèche pointe toujours vers le haut (re-touche pour revenir nord en haut).
**3D : monde « 📍 Ma position (carte réelle) »**
- Au choix du monde, la position GPS est lue, puis bâtiments, routes, pistes cyclables, parcs, forêts, eau et arbres d'OpenStreetMap sont chargés sur 3 km × 3 km (constante HALF dans real-core.js) et construits par morceaux autour de toi.
- Tu démarres sur la route la plus proche (jamais dans un bâtiment), orienté selon le cap GPS.
- Si tu roules pour de vrai (GPS > 2 m/s), la position et le cap du jeu se recalent doucement sur le GPS (réglage « Recaler sur le GPS »). Sur la béquille, aucun recalage.
- Drapeaux aux vraies intersections, pièces le long du vrai chemin. Pas de cyclistes ni de relief (terrain plat).
- Internet requis (Overpass). La dernière carte est gardée en mémoire si tu restes dans les 500 m.

## v9.4 : « Dash », ville imaginaire aléatoire, circulation, carte réelle fiable
- **Titre** : « i9 Dash » devient « Dash » (en-tête, onglet, nom de l'app installée, fichier GPX).
- **Ville imaginaire** (Ville ensoleillée, Coucher de soleil, Nuit néon, Hiver) : fini le quadrillage. Routes courbes (arcs et S), rues sans issue, bâtiments de formes variées (rectangles, L, tours rondes) placés au hasard le long des routes et dans les îlots, plus hauts vers le centre, parcs, étangs, forêts, lampadaires. Bouton **🎲 Nouvelle ville aléatoire** (accueil et réglages) ; la même ville revient tant que tu n'en demandes pas une autre.
- **Piétons, voitures et cyclistes** qui suivent les routes (ville imaginaire ET carte réelle). Voitures qui freinent devant un obstacle. Les percuter = chute (piéton −20, cycliste −20, véhicule −30) ; ils tombent aussi.
- **Arbres** : les troncs sont solides (chute au-dessus de ~5 km/h), comme les bâtiments.
- **Carte réelle** : GPS lu en continu ~14 s pour garder le meilleur point (la précision ± est affichée dans les messages) ; la zone est téléchargée en tuiles d'environ 750 m, 4 à la fois, chaque tuile en course sur 4 serveurs Overpass, avec nouvelles tentatives ; chaque tuile réussie est gardée en mémoire (30 jours). Si quelques tuiles échouent, tu joues quand même et « Recharger » ne redemande que celles qui manquent. Réglage de taille : 1,5 km de rayon (rapide) ou 3 km de rayon (complet).
- **Correctif** : le jeu de drapeaux ne pouvait pas se lancer sur la carte réelle (mauvais objet passé à la mise en place des drapeaux).

## v9.5 : mini-carte réelle identique à la 2D
- **Mini-carte du monde 📍** : elle affiche maintenant les vraies tuiles OpenStreetMap, avec la même projection, le même zoom et les mêmes pointillés d'adresses effacés que la carte 2D. Réglage ⚙ → Monde → « Mini-carte : vraies tuiles OpenStreetMap » (le dessin vectoriel reste en secours tant que les tuiles arrivent ou hors connexion).
- **Départ** : tu démarres exactement sur ta position GPS (avant : déplacé jusqu'à 250 m vers la route la plus proche). Le déplacement sur la route n'a lieu que si ton point tombe dans un bâtiment. Le cap GPS, s'il existe, donne l'orientation de départ.
- **Position à jour** : quand tu reviens au monde 📍 depuis un autre monde, le GPS est relu (avant : l'ancienne position de la session était réutilisée).

## v9.6 : relief réel et sons séparés
- **Pentes réelles (monde 📍)** : les altitudes de ta région (tuiles « Terrarium » du jeu de données public AWS Terrain Tiles, chargées en arrière-plan avec la carte) donnent du relief à la 3D : sol, routes, pistes, bâtiments, parcs, eau, arbres, circulation, pièces et drapeaux suivent le terrain. La trottinette s'incline dans les pentes, la caméra suit, et une puce « ▲ 4 % » / « ▼ 3 % » affiche la pente. Un sol lointain remplit l'horizon.
- Réglage ⚙ → Monde → **Relief du terrain** : Plat · Réel · Accentué ×2. Altitudes affichées par rapport à ton point de départ. Si les altitudes sont indisponibles (réseau), le terrain reste plat et le journal l'indique ; « Recharger la carte » réessaie.
- La vitesse du jeu vient toujours de la poignée : le relief change l'image, pas la vitesse.
- **Sons séparés** : ⚙ → Affichage & son : « Son du moteur » + « Volume du moteur », et « Sons du jeu (pièces, drapeaux, chute, choc) » + « Volume des sons du jeu » : indépendants (tu peux couper le moteur et garder les sons du jeu, ou l'inverse).

## v9.7 : joystick tactile
- Quand la trottinette n'est **pas connectée en Bluetooth**, un petit joystick semi-transparent apparaît en bas au milieu de l'écran, pour le pouce : **haut** = accélérer (plus tu pousses, plus c'est vite, jusqu'à ~43 km/h), **bas** = freiner, **gauche / droite** = diriger. Il disparaît dès que la trottinette se connecte.
- Réglage ⚙ → Affichage & son → « Joystick tactile » pour l'enlever. Le clavier marche toujours.

## v9.8 : asphalte toujours visible dans les pentes, bâtiments plus précis
**Asphalte (relief)**
- Cause : le sol (maillage de 10 m) et les parcs / forêts / eau (triangles jusqu'à 16 m) coupaient la route (rubans de 5 m, à 3,5 cm au-dessus du sol) dès que la pente n'était pas régulière ; en plus, le plan proche de la caméra à 0,1 m rendait la profondeur trop imprécise au loin (scintillement).
- Sol enfoncé de 30 cm sous toutes les couches et maillage de 5 m (avant : 10 m, au niveau du sol).
- Parcs, forêts et eau découpés tous les ~6 m (avant 16 m) ; routes tous les ~4 m (avant 5 m).
- Écarts entre couches augmentés (route 4 cm, sentier 5,5 cm, piste 7 cm) et `polygonOffset` renforcé pour routes / sentiers / pistes.
- Plan proche de la caméra 0,1 → 0,3 m : précision de profondeur ×3 au loin.
**Bâtiments (×2 à ×4)**
- Altitudes du terrain en zoom 15 (≈ 3 m par pixel, avant ≈ 6 m) : ×2 en précision, ×4 en nombre de points.
- Murs découpés en tronçons (≥ 3 m) qui suivent le terrain : plus de murs qui flottent ou s'enfoncent sur une pente ; fondations plus profondes (50 cm).
- Collision : un grand bâtiment est enregistré dans toutes les cases de carte qu'il touche (avant : seulement celle de son centre, donc un grand entrepôt pouvait se traverser).
- Recharge la page deux fois (ou vide le cache Bluefy) ; « Recharger la carte » n'est pas nécessaire.

## v9.9 : routes, bâtiments, résolution et beaucoup plus de réglages
**Routes (carte réelle 📍 et ville imaginaire)**
- Asphalte texturé (grain, traces de roues) au lieu d'un aplat gris.
- Marquage : ligne jaune pointillée au centre des rues (≥ 6,4 m), double ligne jaune + lignes blanches de bord sur les routes larges (≥ 9 m). Les lignes s'arrêtent à 7 m des carrefours.
- Passages piétons (bandes de zèbre) à l'entrée des carrefours.
- Trottoirs et bordures le long des rues (sous l'asphalte : ils ne recouvrent jamais une rue qui croise).
- Lampadaires le long des rues de la carte réelle.
**Bâtiments**
- Maisons à 4 coins : toits en pente (2 pans ou 4 pans, selon `roof:shape` d'OpenStreetMap, sinon au hasard), couleurs de toit variées (blanc l'hiver), cheminées en brique.
- Ombre au pied des murs, motif de fenêtres décalé d'un bâtiment à l'autre.
**Nouveaux réglages (⚙)**
- *Résolution & performance* : résolution de l'image (Auto, ×1, ×1,5, ×2, ×3), netteté des textures (×1, ×2, ×4), filtrage anisotrope (×4 à ×16), ombres (auto / aucune / 1024 / 2048 / 4096), distance des ombres, distance de vue (brouillard), luminosité, compteur FPS.
- *Routes & bâtiments* : marquage, trottoirs, toits en pente, lampadaires, densité des arbres, distance d'affichage des bâtiments (500 m à 1,5 km).
- *Vue* : secousses de la caméra, inclinaison de la trottinette dans les pentes.
- *Affichage* : taille et portée de la mini-carte.
- Les réglages qui changent la construction du monde le reconstruisent aussitôt (quelques secondes) ; luminosité, distance de vue, ombres (distance), mini-carte et FPS s'appliquent en direct.
- Recharge la page deux fois (ou vide le cache Bluefy).

