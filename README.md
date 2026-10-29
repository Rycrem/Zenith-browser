# Zenith

**English** · [Français](README.fr.md)

A Chromium-based browser (Electron) that you drive like a terminal. Websites display normally and stay clickable with the mouse; the terminal stays below the page for typing commands.

![Home screen](docs/screenshots/home.png)

| | |
| --- | --- |
| ![Bookmarks](docs/screenshots/fav.png) | ![AI](docs/screenshots/ai.png) |
| `fav`: bookmarks as a tree, type a number to open one | `ia`: pick the AI that answers `ia <question>` |

![Help](docs/screenshots/help.png)

## Install

Installers are on the [Releases](https://github.com/Rycrem/Zenith-browser/releases/latest) page:

- Windows: `Zenith-Setup-x.y.z.exe`. The installer asks for the app's language (English or French) and, on its Privacy page, whether the app may check for updates on its own. The installer is not signed: Windows SmartScreen shows "Windows protected your PC": click "More info" › "Run anyway". Windows 11 Smart App Control blocks unsigned installers with no way around it.
- macOS: `.dmg` (`arm64` for Apple Silicon Macs, `x64` for Intel Macs). The app is not signed: on first launch, right-click the app › Open.
- Linux: `.AppImage` (make it executable, then run it) or `.deb`.

**Uninstall:** on Windows, Settings › Apps › Installed apps › Zenith › Uninstall. On macOS, drag Zenith from Applications to the Trash. On Linux, delete the `.AppImage`, or `sudo apt remove zenith` for the `.deb`. Your data stays in the folder listed under "Data" until you delete it.

## Language

Zenith speaks English and French. `lang` shows the current language, `lang en` or `lang fr` switches it right away. The first time, the app uses the language picked in the Windows installer, or else the system language (French if the system is in French, English otherwise).

## Run from source

```bash
npm install
npm start
```

Logic tests (bookmarks, aliases, result parsing, extensions, translations): `npm test`. `npm run ublock` downloads uBlock Origin into `vendor/` so it is preinstalled at launch. `npm run dist` does that too, then builds the installer for the current OS into `dist/`.

## Commands

| Command | What it does |
| --- | --- |
| `brows <search>` | search, numbered results (DuckDuckGo by default) |
| `ia <question>` | short answer from the chosen AI (Claude with web search and numbered sources); the `>` line under the answer carries on the conversation |
| `ia`, `ia use <ai>`, `ia key <key>`, `ia logout`, `ia model [id]` | choose and connect the AI |
| `nadir [question]` | opens the chat with Nadir, the assistant that runs on your computer (see [Nadir](#nadir)) |
| `nadir level [light \| normal \| strong]`, `nadir stop`, `nadir clear` | Nadir's level, free its memory, new conversation |
| `<n>` / `<n>t` | opens item n of the list on screen, `t` for a new tab |
| `go <url>` | opens an address (typing an address directly works too) |
| `clicks` | numbers the page's links, buttons and input fields; a number clicks the link or button, or puts the cursor in the field |
| `tty [on\|off]` | shows pages as plain text, like a terminal: links are underlined in blue and numbered, type the number or click them (stays on while you browse) |
| `back`, `fwd`, `reload`, `reload hard`, `home` | navigation (`reload hard` reloads without the cache; `back` goes through the search results the page came from) |
| `tab`, `tab <n>`, `tab new [url…]`, `tab save <name>`, `close [n]` | tabs (`tab new` with several addresses opens a tab for each) |
| `popback` | reopens the tabs from last time (those open when Zenith was closed) |
| `split`, `split off [1\|2]`, `focus` | two panes side by side, close a pane (the other one by default, or the ✕ at the top of the pane), switch pane; each pane has its own terminal below it, and Ctrl+Shift+N makes only the active pane private |
| `fav [folder]` | bookmarks as a tree |
| `add [folder/]name` | bookmarks the page, creating missing folders |
| `fav rm <path\|n>`, `fav mv <path> <dest>`, `fav rename <path> <name>`, `undo` | manage bookmarks |
| `fav import [chrome\|edge\|brave\|vivaldi\|opera\|firefox\|file\|<file>]` | imports bookmarks from another browser on this computer, or from an HTML export (`fav import file` opens a file picker); they land in a folder named after the browser, without duplicates |
| `hist [text]` | history, filterable |
| `clean`, `clean all` | clears history; `all` also clears cookies and cache (asks first) |
| `find [text]` | find in page; `find` alone (or Ctrl+F) opens the find bar at the top right: Enter goes to the first result then the next, ↓ ↑, the count (1/42), Esc closes |
| `ext`, `ext add <store link \| id \| folder>`, `ext on/off/rm <n>`, `ext alias <n> <name>`, `ext <n>`, `ext log <n>` | extensions (`ext log` shows an extension's errors and warnings since launch, to find out why it does not work) |
| `dl [n]` | downloads (saved straight to Downloads) |
| `dl cancel n` / `dl rm n` | stops download n (partial file deleted) / removes it from the list (the file stays) |
| `alias name = command [; command…]`, `unalias name` | your own shortcuts, which can chain commands |
| `engine ddg\|google\|bing\|qwant`, `theme ambre\|vert\|cyan\|rose\|violet`, `lang [en\|fr]` | settings |
| `config export [file]`, `config import [file]` | saves or loads your settings, bookmarks and extensions in a file, to move to another computer (without the AI keys) |
| `default` | makes Zenith the default browser (on Windows, registers it then opens the default apps page to pick it) |
| `perm`, `perm reset [site]` | permissions given to sites |
| `update`, `update install`, `update -v [version]`, `update electron`, `update auto [on\|off]` | updates (see below) |
| `devtools [detach\|close]`, `term`, `fullscreen [on\|off]`, `quit` (or `exit`, `q`), `help`, `clear` | misc (DevTools: next to the page, in a window, or closed; also buttons in the status bar; `quit` closes the browser) |

Anything that is not a command, an alias or an address runs a search; an address (`example.com`, `localhost:3000`) opens directly. A command followed by words it does not expect ("home depot", "close friends") is a search too.

**Tab groups:** `tab save work` creates the alias `work`, which reopens all the open tabs. By hand: `alias work = tab new gmail.com github.com`, or with several commands separated by `;` (`alias morning = tab new weather.com ; split ; ia news`).

Yes/no questions answer yes when you press Enter (`(Y/n)`), except `clean all`, which deletes cookies and cache for good (`(y/N)`). Typing another command means no.

After a command, the keyboard stays in the terminal, even while a page loads; Esc or a click in the page hands it over.

Each tab has its own terminal; command history (↑ ↓) is shared by all of them.

## Shortcuts

Ctrl+K terminal · Ctrl+H history · Ctrl+L clear the terminal · Ctrl+` (the key below Esc) hide/show the terminal · F11 fullscreen · Esc hand over to the page · Ctrl+T / Ctrl+W tabs · Ctrl+Tab / Ctrl+Shift+Tab next / previous tab (the active pane's in split), Ctrl+1…9 · Alt+←/→ · F5 · Ctrl+Shift+R reload without the cache · Ctrl+Shift+T reopen closed tab · Ctrl+F find bar (on a page as well as on history, bookmarks, help…) · Ctrl+D bookmark · Ctrl+Shift+S split · F6 switch pane · F12 or right-click › Inspect for DevTools · Alt+1…9 extension popup · Ctrl+Shift+B bookmarks popup · Ctrl+J downloads popup · Ctrl+Shift+E extensions popup · Ctrl+Shift+A Nadir · Ctrl+Alt+M mobile mode · Ctrl+Shift+N private browsing · Ctrl+Enter run the command in a new tab · Ctrl+C cancel the input · ↑/↓ command history · Tab completion. Shortcuts also work while the cursor is in the terminal.

With the mouse: the address at the top right can be edited by hand (Enter to go, Esc to cancel, ↑/↓ to pick a page from history suggested as you type) the button to its left reloads the page, ☆ adds it to favorites under its title (★ when it is already there, a click removes it) and the last button copies the address, + opens a tab (right-click: recently closed tabs), the zoom level shows in the status bar when it is not 100% (click it to go back to 100%), and the bar above DevTools detaches them (⇱) or closes them (✕). The bar between the page and the terminal can be dragged to change its height (double-click for the default size), and so can the bar between the two split panes. Tabs, results, bookmarks and extension badges are clickable (Ctrl+click for a new tab). In the status bar, ★ bookmarks (bottom left) opens your bookmarks in a popup with a filter (type, ↑/↓, Enter), where drag and drop reorders them (before, after or into a folder) and right-click copies the link, edits the favorite (name and address) or deletes it; open folders close again when the popup closes, and the download button (right of the extension badges) opens the downloads popup (its arrow dives when a download starts, and a green line runs around the button as the latest one progresses), with a progress ring, size, speed and time left for each download; ✕ cancels a download in progress (the partial file is deleted) or removes a finished one from the list (the file stays). A tab playing sound shows a speaker: click it to mute the tab. While music or a video plays, a player appears: play/pause, a slider for the whole browser's volume, its percentage (click to mute or unmute), and ▴ opens a popup to control each tab (play/pause, mute, volume). A fullscreen video takes the whole window, without the tabs or the status bar. A second click on an extension badge closes its popup, and an extension without a popup gets the click itself. The puzzle button opens the extensions popup: ☆/★ pins an extension to the status bar (`ext pin n` does the same). The sun/moon button, at the far right of the status bar, switches between night mode (default) and day mode (`mode nuit|jour`); websites that follow the system theme follow it too. Tabs sit in the black title bar, next to the window buttons, with their site's icon; the one shown is underlined in the accent color. They all have the same width; when there are too many, they shrink together down to a third of their width, then the bar scrolls; the one shown keeps its normal size, and a tab shrunk to its smallest shows only its site icon. A link opened with Ctrl+click (or middle-click, or "Open link in new tab") opens right next to the tab it came from, in click order. Middle-click a tab to close it, drag and drop to reorder (the tab only moves left and right; its neighbours slide apart to open the spot where it will land, and an outline slides to the edges of that spot). The ‹ › arrows, in a small box at the end of the bar next to the address, go to the previous or next page of the tab shown, like `back` and `fwd` (the mouse back / forward buttons do the same, including going back to a results or AI screen), and the wheel scrolls the tabs when they overflow. In split, each pane has its own tabs: the tab bar splits like the terminal, with a + and arrows on each side; a tab dragged onto the other pane's bar moves to that pane, and closing or moving the last tab of a pane ends the split. A tab dragged down leaves for its own window, which follows the mouse (alone in its window, the window itself moves, in any direction); over another window's tab bar, that bar is outlined in the accent color and marks the spot, the dragged window fades by half, and dropped there it joins at that spot, and a window left without tabs closes. Each window has its own tabs, split and terminal. The address box has a fixed width and only shows the site; click it to see the full address. A click anywhere in the terminal puts the cursor in the command line. In the terminal, right-click copies the selected text, or pastes the clipboard into the command line when nothing is selected.

Mobile mode (Ctrl+Alt+M): a popup at the top left offers several phones (iPhone, Pixel, Galaxy, iPad Mini) or a resolution typed by hand, which can be saved under a name (✕ deletes it). Pages reload believing they run on that phone (screen size, density, touch screen, user agent) and show at its size, in the middle of the screen; "desktop" goes back to the normal view.

## Extensions

On the Chrome Web Store, the "Add to Chrome" button works as in Brave: Zenith gives the store the install API Chrome reserves for it, asks for confirmation (with the extension's permissions), then installs it; "Remove from Chrome" uninstalls it. If the store does not use that API, an "Add to Zenith" button appears at the bottom right of the page. Typing `ext add` on the page does the same. `ext add` also takes a Chrome Web Store link, an extension id or an unpacked extension folder. Each extension has a numbered badge in the status bar; a click or Alt+n opens its popup. Electron supports only part of the Chrome extension APIs; the [electron-chrome-extensions](https://github.com/samuelmaddock/electron-browser-shell/tree/master/packages/electron-chrome-extensions) library adds tabs, windows, notifications, cookies and permissions (an extension can open a tab, for instance). Zenith adds what is missing most often: `chrome.storage.sync` (kept on the computer), tab capture, history, bookmarks (read-only), the extension list, search, OAuth sign-in (`identity.launchWebAuthFlow`), the side panel (opened in a narrow window) and downloads; APIs with no equivalent (tab groups, sessions, fonts…) answer empty instead of crashing the extension. Ad blockers and content scripts work well; some more advanced extensions may still not work (`ext log <n>` tells why).

**Ad blocker:** [uBlock Origin](https://github.com/gorhill/uBlock) is preinstalled (badge 1 in the status bar, Alt+1 for its popup). The installer ships the latest version published when it was built; `ext add ublock` replaces it with the very latest. If you remove it with `ext rm`, it is not reinstalled. uBlock Origin Lite, the Chrome Web Store version, blocks with `declarativeNetRequest`, which Electron does not support: it blocks nothing here, and `ext` says so.


## AI

`ia <question>` shows a few sentences written by the chosen AI. `ia` alone lists the AIs: type a number to pick one. If it has no key yet, the page to create one opens; copy the key, then type `ia key <key>`.

| AI | Default model | Price |
| --- | --- | --- |
| Claude (Anthropic) | `claude-opus-5-5`, with web search and numbered sources | pay as you go |
| Gemini (Google AI Studio) | `gemini-3.8-flash` | free, with a daily limit |
| ChatGPT (OpenAI) | `gpt-5-mini` | pay as you go |
| Mistral AI | `mistral-small-latest` | free (Experiment plan) |
| Groq | `openai/gpt-oss-120b` | free, with a daily limit |
| OpenRouter | `openrouter/free` (picks a free model) | free, with a daily limit |
| Ollama | `llama3.2`, on your computer | free, no key ([ollama.com](https://ollama.com), then `ollama pull llama3.2`) |

- `ia connect <ai> <key>` picks the AI and saves its key in one go.
- `ia model <id>` changes the current AI's model (`ia model default` goes back to the default). When an AI retires a model, Zenith switches on its own to the current one (the one the AI recommends, or else the newest version of the same family) and remembers it.
- `ia logout [ai]` deletes the saved key, for example before lending the computer.

Each key stays on this computer, encrypted by the system when possible, and never appears on screen or in the command history. Nobody else who installs the app uses your key. The `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, `MISTRAL_API_KEY`, `GROQ_API_KEY` and `OPENROUTER_API_KEY` variables work too. Only Claude searches the web; the others answer with what they know.

## Nadir

Nadir is Zenith's assistant: an AI model that runs entirely on your computer, without Ollama, without a key and without sending anything over the internet. Click the ✦ star at the bottom right (or Ctrl+Shift+A, or `nadir <question>`) to talk to it.

- It answers about Zenith's features (it knows its commands and shortcuts).
- It answers about the open page: it reads its text, and your selection if you made one.
- It acts in the browser by itself: run a command (open a site, switch tabs, split, bookmarks…), click a link or button on the page, type in a field. Every action shows in the chat, and commands also in the terminal. It asks first for anything that deletes, installs, changes a setting, opens a file, types in a field, quits, pays or sends (including a local or very long address, and any address or search after reading a page), and never fills in passwords. Page text is never taken as an instruction.

| Level | Model | Size | For |
| --- | --- | --- | --- |
| light | Qwen3 1.7B | 1 GB | fast even without a graphics card, less reliable for chained actions |
| normal | Qwen3 4B Instruct | 2.3 GB | the default level (light on a computer with less than 8 GB of memory) |
| strong | Qwen3 8B | 4.7 GB | more accurate, needs a good graphics card or 16 GB of memory |

Pick the level at the top of the chat or with `nadir level <name>`. Each model is downloaded only once (from Hugging Face, after you agree), with the first message at that level, into the `nadir` folder of the data. The model is only loaded with the first message and leaves memory after 5 minutes without a message (or right away with `nadir stop`); a green dot on the star shows it is in memory, and it spins while it thinks. It uses the graphics card when it can (Vulkan, Metal on Mac), otherwise the processor.

## Updates

A check runs at every launch (`update auto off` turns it off); `update` runs it on demand. At the same time, extensions installed from the Chrome Web Store and uBlock Origin update themselves when a new version exists (the terminal says so). Extensions added from a folder are left alone.

**Installed app** (from a Releases installer):

- `update` compares the installed version with the latest GitHub Release and says when a new installer is out, with a recap of what each version since yours brings.
- `update -v` lists the published versions; type a number to read that version's notes in the terminal, then install it if you want (an older one too). `update -v 0.1.12` goes straight to that version.
- `update install` downloads the new installer, applies it and restarts the app. On macOS (unsigned app, where automatic updates are impossible), it opens the Release page to download the `.dmg`.
- Electron and Chromium ship with the installer: each new Release updates them.

**Run from source** (`npm start`):

- `update` checks the Electron (and so Chromium) version and new commits in the repository.
- `update install` pulls the code (`git pull`), then updates dependencies without changing Electron's major version: security fixes, with no risk of breakage.
- `update electron` moves to the very latest major Electron version, to be tested.

The app closes, the update runs with the system's `node` (on Windows, Electron cannot be replaced while it runs), then it restarts and shows the report in the terminal.

## Security

- Each site runs in Chromium's sandbox, with no access to Node or the computer.
- Camera, microphone, location, notifications, clipboard, screen sharing, opening external apps: each request from a site asks in the terminal (Enter or `y` yes, `a` always, `x` never, `n` no). `perm` lists the saved choices.
- The Chromium version is Electron's: run `update install` when the app says so to get security fixes.
- Google sign-in: Google rejects Electron-based browsers ("This browser or app may not be secure"). On `accounts.google.com` only, Zenith therefore presents itself as Firefox; during that sign-in, uBlock Origin is paused (Electron does not let both filter requests at the same time). Google may block this workaround at any time.
- Security keys (YubiKey and other FIDO2 keys): sign-in goes through the system dialog (Windows Hello on Windows). If the key holds several accounts for the site, the terminal asks which one to use.
- No anti-phishing protection (Google Safe Browsing) like in Chrome.

## Data

Bookmarks, history and settings are JSON files in Electron's data folder (`~/.config/Zenith` on Linux, `%APPDATA%\Zenith` on Windows, `~/Library/Application Support/Zenith` on macOS).

The same folder holds `zenith.log`, the log: each launch, the loading of each extension and any crash. If Zenith crashes while starting, the next launch disables the extension at fault (or all of them when it cannot tell which) and says so in the terminal; `ext on <n>` turns them back on.

Run from source, the app uses a separate folder, `Zenith-dev` (copied from `Zenith` the first time): the installed app encrypts its cookies with a key the development version cannot read.

## Privacy

Zenith collects no data about you and has no telemetry. Besides the websites you open yourself, it connects on its own only to:

- GitHub (`github.com`, `api.github.com`), at every launch, to look for a new version of Zenith and of uBlock Origin;
- the Chrome Web Store update service (`clients2.google.com`), at every launch, to look for new versions of the extensions installed from the store.

Those automatic checks can be turned off in the Windows installer (the privacy page, shown during installation, has a checkbox for them) or at any time with `update auto off`; `update` still works on demand.

Everything else happens only when you ask for it, and then goes to a service you chose, under that service's own privacy policy:

- the search engine you chose (`engine`), when you search;
- the AI you chose (`ia use`), when you type `ia <question>`, with your question;
- Hugging Face, to download Nadir's model (once per level; after that Nadir connects to nothing);
- [uBlock Origin](https://github.com/gorhill/uBlock/wiki/Privacy-policy) downloads its filter lists from the lists' servers;
- the extensions you install, under their own privacy policies.

## License
Emeric Krikor Keskin ([Rycrem](https://github.com/Rycrem)).

GPL-3.0 or later (see [LICENSE](LICENSE)), because of the electron-chrome-extensions library, distributed under GPL-3.0.
