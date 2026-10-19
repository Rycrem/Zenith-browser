# dev-brows

Un navigateur basé sur Chromium (Electron) qui se pilote comme un terminal. Les sites s'affichent normalement et restent cliquables à la souris ; le terminal reste en dessous pour taper des commandes.

## Lancer

```bash
npm install
npm start
```

Tests de la logique (favoris, alias, lecture des résultats, extensions) : `npm test`.

## Commandes

| Commande | Effet |
| --- | --- |
| `brows <recherche>` | recherche, résultats numérotés (DuckDuckGo par défaut) |
| `<n>` / `<n>t` | ouvre l'élément n de la liste affichée, `t` pour un nouvel onglet |
| `go <url>` | ouvre une adresse (taper directement une adresse marche aussi) |
| `links` | numérote les liens et boutons de la page, puis tape un numéro |
| `back`, `fwd`, `reload`, `home` | navigation |
| `tab`, `tab <n>`, `tab new [url]`, `close [n]` | onglets |
| `split [off]`, `focus` | deux écrans côte à côte, changer d'écran |
| `fav [dossier]` | favoris en arbre |
| `add [dossier/]nom` | ajoute la page, crée les dossiers manquants |
| `fav rm <chemin\|n>`, `fav mv <chemin> <dest>`, `fav rename <chemin> <nom>`, `undo` | gérer les favoris |
| `hist [texte]` | historique, filtrable |
| `clean`, `clean all` | vide l'historique ; `all` vide aussi cookies et cache (avec confirmation) |
| `find [texte]` | chercher dans la page |
| `ext`, `ext add <lien store \| id \| dossier>`, `ext on/off/rm <n>`, `ext alias <n> <nom>`, `ext <n>` | extensions |
| `dl [n]` | téléchargements (enregistrés directement dans Téléchargements) |
| `alias nom = commande`, `unalias nom` | raccourcis perso |
| `engine ddg\|google\|bing\|qwant`, `theme ambre\|vert\|cyan\|rose` | réglages |
| `devtools`, `term`, `help`, `clear` | divers |

Tout ce qui n'est ni une commande ni une adresse lance une recherche.

## Raccourcis

Ctrl+L terminal · Ctrl+J cacher/montrer le terminal · Échap rendre la main à la page · Ctrl+T / Ctrl+W onglets · Ctrl+Tab, Ctrl+1…9 · Alt+←/→ · F5 · Ctrl+F chercher · Ctrl+D favori · Ctrl+Maj+S split · F6 changer d'écran · F12 ou clic droit › Inspecter pour les DevTools · Alt+1…9 popup d'extension · ↑/↓ historique des commandes · Tab autocomplétion.

À la souris : la barre entre la page et le terminal se glisse pour changer sa hauteur (double-clic pour revenir à la taille par défaut), la barre entre les deux écrans du split aussi. Les onglets, résultats, favoris et pastilles d'extensions sont cliquables (Ctrl+clic pour un nouvel onglet).

## Extensions

`ext add` accepte un lien du Chrome Web Store, un identifiant d'extension ou un dossier d'extension décompressée. Chaque extension a une pastille numérotée dans la barre d'état ; un clic ou Alt+n ouvre sa popup. Electron ne gère qu'une partie des API d'extensions Chrome : les bloqueurs de pub et scripts de contenu fonctionnent bien, certaines extensions plus poussées peuvent ne pas marcher.

## Données

Favoris, historique et réglages sont des fichiers JSON dans le dossier de données d'Electron (`~/.config/dev-brows` sous Linux, `%APPDATA%\dev-brows` sous Windows).
