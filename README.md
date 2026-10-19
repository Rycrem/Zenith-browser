# dev-brows

Un navigateur basé sur Chromium (Electron) qui se pilote comme un terminal. Les sites s'affichent normalement et restent cliquables à la souris ; le terminal reste en dessous pour taper des commandes.

## Installer

Les installateurs sont sur la page [Releases](https://github.com/Rycrem/dev-brows/releases/latest) :

- Windows : `dev-brows-Setup-x.y.z.exe`. L'appli n'est pas signée : Windows SmartScreen affiche « Windows a protégé votre ordinateur », cliquer sur « Informations complémentaires » › « Exécuter quand même ».
- macOS : `.dmg` (`arm64` pour les Mac Apple Silicon, `x64` pour les Mac Intel). L'appli n'est pas signée : au premier lancement, clic droit sur l'appli › Ouvrir.
- Linux : `.AppImage` (le rendre exécutable puis le lancer) ou `.deb`.

## Lancer depuis le code

```bash
npm install
npm start
```

Tests de la logique (favoris, alias, lecture des résultats, extensions) : `npm test`. `npm run dist` construit l'installateur du système courant dans `dist/`.

## Publier une version

1. Changer `version` dans `package.json` (par exemple `0.2.0`) et pousser sur `main`.
2. Lancer le workflow GitHub Actions « Installateurs » (onglet Actions › Installateurs › Run workflow), ou pousser le tag correspondant (`git tag v0.2.0 && git push origin v0.2.0`).

Le workflow construit les installateurs Windows, macOS et Linux, les joint à une Release `v0.2.0` puis la publie. C'est cette Release que l'appli installée détecte avec `update`.

## Commandes

| Commande | Effet |
| --- | --- |
| `brows <recherche>` | recherche, résultats numérotés (DuckDuckGo par défaut) |
| `ia <question>` | réponse courte de l'IA choisie (Claude avec recherche web et sources numérotées) |
| `ia`, `ia use <ia>`, `ia key <clé>`, `ia logout`, `ia model [id]` | choisir et connecter l'IA |
| `<n>` / `<n>t` | ouvre l'élément n de la liste affichée, `t` pour un nouvel onglet |
| `go <url>` | ouvre une adresse (taper directement une adresse marche aussi) |
| `links` | numérote les liens et boutons de la page, puis tape un numéro |
| `back`, `fwd`, `reload`, `home` | navigation |
| `tab`, `tab <n>`, `tab new [url]`, `close [n]` | onglets |
| `split`, `split off [1\|2]`, `focus` | deux écrans côte à côte, fermer un écran (l'autre par défaut, ou le ✕ en haut de l'écran), changer d'écran |
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
| `perm`, `perm reset [site]` | autorisations données aux sites |
| `update`, `update install`, `update electron` | mises à jour (voir plus bas) |
| `devtools`, `term`, `help`, `clear` | divers |

Tout ce qui n'est ni une commande ni une adresse lance une recherche.

## Raccourcis

Ctrl+L terminal · Ctrl+J cacher/montrer le terminal · Échap rendre la main à la page · Ctrl+T / Ctrl+W onglets · Ctrl+Tab, Ctrl+1…9 · Alt+←/→ · F5 · Ctrl+F chercher · Ctrl+D favori · Ctrl+Maj+S split · F6 changer d'écran · F12 ou clic droit › Inspecter pour les DevTools · Alt+1…9 popup d'extension · ↑/↓ historique des commandes · Tab autocomplétion.

À la souris : la barre entre la page et le terminal se glisse pour changer sa hauteur (double-clic pour revenir à la taille par défaut), la barre entre les deux écrans du split aussi. Les onglets, résultats, favoris et pastilles d'extensions sont cliquables (Ctrl+clic pour un nouvel onglet).

## Extensions

`ext add` accepte un lien du Chrome Web Store, un identifiant d'extension ou un dossier d'extension décompressée. Chaque extension a une pastille numérotée dans la barre d'état ; un clic ou Alt+n ouvre sa popup. Electron ne gère qu'une partie des API d'extensions Chrome : les bloqueurs de pub et scripts de contenu fonctionnent bien, certaines extensions plus poussées peuvent ne pas marcher.

## IA

`ia <question>` affiche une réponse de quelques phrases écrite par l'IA choisie. `ia` tout seul affiche la liste des IA : tape un numéro pour en choisir une. Si elle n'a pas encore de clé, la page où la créer s'ouvre ; copie la clé puis tape `ia key <clé>`.

| IA | Modèle par défaut | Prix |
| --- | --- | --- |
| Claude (Anthropic) | `claude-opus-5-5`, avec recherche web et sources numérotées | payant à l'usage |
| Gemini (Google AI Studio) | `gemini-2.5-flash` | gratuit, avec une limite par jour |
| ChatGPT (OpenAI) | `gpt-5-mini` | payant à l'usage |
| Mistral AI | `mistral-small-latest` | gratuit (offre Experiment) |
| Groq | `openai/gpt-oss-120b` | gratuit, avec une limite par jour |
| OpenRouter | `openrouter/free` (choisit un modèle gratuit) | gratuit, avec une limite par jour |
| Ollama | `llama3.2`, sur ton ordinateur | gratuit, sans clé ([ollama.com](https://ollama.com), puis `ollama pull llama3.2`) |

- `ia connect <ia> <clé>` choisit l'IA et enregistre sa clé en une fois.
- `ia model <id>` change le modèle de l'IA actuelle (`ia model default` revient au modèle par défaut).
- `ia logout [ia]` supprime la clé enregistrée, par exemple avant de prêter l'ordinateur.

Chaque clé reste sur cet ordinateur, chiffrée par le système quand c'est possible, et n'apparaît ni à l'écran ni dans l'historique des commandes. Personne d'autre qui installe l'appli n'utilise ta clé. Les variables `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, `MISTRAL_API_KEY`, `GROQ_API_KEY` et `OPENROUTER_API_KEY` marchent aussi. Seul Claude fait des recherches web ; les autres répondent avec ce qu'ils savent.

## Mises à jour

Une vérification se fait toute seule une fois par jour au démarrage ; `update` la lance à la demande.

**Appli installée** (depuis un installateur des Releases) :

- `update` compare la version installée avec la dernière Release GitHub et signale quand un nouvel installateur est publié.
- `update install` télécharge le nouvel installateur, l'applique et relance l'appli. Sur macOS (appli non signée, la mise à jour automatique y est impossible), il ouvre la page de la Release pour télécharger le `.dmg`.
- Electron et Chromium sont livrés avec l'installateur : chaque nouvelle Release les met à jour.

**Lancée depuis le code** (`npm start`) :

- `update` vérifie la version d'Electron (et donc de Chromium) et les nouveaux commits du dépôt.
- `update install` récupère le code (`git pull`), puis met à jour les dépendances sans changer de version majeure d'Electron : ce sont les correctifs de sécurité, sans risque de casse.
- `update electron` passe à la toute dernière version majeure d'Electron, à tester.

L'appli se ferme, la mise à jour se fait avec le `node` du système (sous Windows, Electron ne peut pas être remplacé pendant qu'il tourne), puis elle se relance et affiche le compte rendu dans le terminal.

## Sécurité

- Chaque site tourne dans le bac à sable de Chromium, sans accès à Node ni à l'ordinateur.
- Caméra, micro, position, notifications, presse-papier, partage d'écran, ouverture d'applications externes : chaque demande d'un site pose la question dans le terminal (`o` oui, `t` toujours, `j` jamais, `N` non). `perm` liste les choix enregistrés.
- La version de Chromium est celle d'Electron : faire `update install` quand l'appli le signale pour recevoir les correctifs de sécurité.
- Connexion Google : Google refuse les navigateurs basés sur Electron (« Ce navigateur ou cette application ne sont peut-être pas sécurisés »). Sur `accounts.google.com` uniquement, dev-brows se présente donc comme Firefox. Google peut bloquer cette parade à tout moment.
- Pas de protection anti-hameçonnage (navigation sécurisée de Google) comme dans Chrome.

## Données

Favoris, historique et réglages sont des fichiers JSON dans le dossier de données d'Electron (`~/.config/dev-brows` sous Linux, `%APPDATA%\dev-brows` sous Windows, `~/Library/Application Support/dev-brows` sous macOS).

Lancée depuis le code, l'appli utilise un dossier à part, `dev-brows-dev` (copié depuis `dev-brows` la première fois) : l'appli installée chiffre ses cookies avec une clé que la version de développement ne peut pas relire.
