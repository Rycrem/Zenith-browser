'use strict';

// ------------------------------------------------ écrans internes

const click = (cmd) => (e) => {
  e.preventDefault();
  const newTab = e.ctrlKey || e.metaKey || e.button === 1;
  run(newTab && /^\d+$/.test(cmd) ? `${cmd}t` : cmd);
};

function item(cls, cmd, ...children) {
  return h('button', { type: 'button', class: `item ${cls}`, 'data-n': /^\d+$/.test(cmd) ? cmd : null, onclick: click(cmd), onauxclick: click(cmd) }, ...children);
}

// Clic droit sur un lien numéroté : l'ouvrir dans un nouvel onglet ou copier son adresse.
document.addEventListener('contextmenu', (e) => {
  const el = e.target.closest('.screen [data-n]');
  if (!el) return;
  e.preventDefault();
  e.stopPropagation();
  api.linkMenu(Math.max(0, panesEl.indexOf(el.closest('.pane'))), Number(el.dataset.n));
}, { capture: true });

function head(text, extra) {
  return h('h2', {}, h('span', { class: 'prompt-sign' }, '❯ '), text, extra ? h('span', { class: 'dim' }, ` · ${extra}`) : null);
}

const LOGO = String.raw` _____          _ _   _
|__  /___ _ __ (_) |_| |__
  / // _ \ '_ \| | __| '_ \
 / /|  __/ | | | | |_| | | |
/____\___|_| |_|_|\__|_| |_|`;

const HOME_COMMANDS = [
  ['brows', mark('<recherche>'), mark('lancer une recherche')],
  ['ia', '<question>', mark('réponse courte d\'une IA (« ia » pour la choisir)')],
  ['nadir', '<question>', mark('l\'assistant sur ton ordinateur, qui agit dans Zenith')],
  ['go', '<url>', mark('ouvrir une adresse')],
  ['fav', '', mark('liste des favoris')],
  ['add', mark('[dossier/]nom'), mark('ajouter la page aux favoris')],
  ['hist', '', mark('historique')],
  ['clean', '[all]', mark('vider l\'historique (+ cookies)')],
  ['split', '[off [1|2]]', mark('deux écrans côte à côte ; off ferme un écran')],
  ['ext', '', 'extensions'],
  ['lang', '[fr | en]', mark('langue de l\'interface (français ou anglais)')],
  ['update', '', mark('mises à jour')],
  ['help', '', mark('toutes les commandes et raccourcis')],
];

function cmdLine([name, args, desc]) {
  return h('div', {}, h('span', { class: 'acc' }, name), ` ${t(args)}`.padEnd(20 - name.length), h('span', { class: 'dim' }, t(desc)));
}

const screens = {
  home(s) {
    return [
      h('pre', { class: 'logo-art', 'aria-label': 'Zenith' }, LOGO),
      h('div', { class: 'dim' }, t('Bonjour {user}. Tape ', { user: s.user }), h('span', { class: 'acc' }, 'help'), t(' pour la liste des commandes, ou directement une recherche ou une adresse.')),
      h(
        'div',
        { class: 'cols' },
        h('div', { class: 'cmd-list' }, h('h3', {}, t('Commandes')), HOME_COMMANDS.map(cmdLine)),
        h(
          'div',
          {},
          h('h3', {}, t('Favoris récents')),
          s.recent.length
            ? s.recent.map((r) => item('', String(r.n), h('span', { class: 'dim' }, `[${r.n}]`), r.path))
            : h('div', { class: 'dim' }, t('Aucun favori. Sur un site, tape « add dossier/nom ».')),
          s.recent.length ? h('div', { class: 'hint' }, t('Tape un numéro pour ouvrir.')) : null,
        ),
      ),
      s.changes ? h('div', { class: 'changes' },
        h('h3', {}, t('Nouveautés de la version {version}', { version: s.changes.version })),
        h('ul', {}, s.changes.notes.map((n) => h('li', {}, n)))) : null,
    ];
  },

  ai(s) {
    // Une discussion : les échanges précédents, la réponse en cours, puis la ligne pour répondre.
    const reply = h('textarea', {
      rows: '1',
      spellcheck: 'false',
      'aria-label': t('Répondre à {name}', { name: s.provider }),
      oninput: (e) => grow(e.target),
      onkeydown: (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          activeCol().input.focus();
        } else if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          const text = e.target.value.trim();
          if (text) api.aiReply(text);
        }
      },
    });
    return [
      s.turns.map((x) => [
        head(x.q),
        h('div', { class: 'ai-text' }, x.a),
      ]),
      head(s.turns.length ? s.question : `ia ${s.question}`, s.done ? s.provider : t('{name} réfléchit…', { name: s.provider })),
      s.text ? h('div', { class: 'ai-text' }, s.text, s.done ? null : h('span', { class: 'acc' }, ' ▍')) : (s.done ? null : h('div', { class: 'dim' }, '…')),
      s.error ? h('div', { class: 'err' }, s.error) : null,
      s.done && !s.error ? h('form', { class: 'ai-reply', onsubmit: (e) => e.preventDefault() }, h('span', { class: 'acc' }, '> '), reply) : null,
      s.sources.length ? [
        h('h3', { class: 'sources' }, 'Sources'),
        s.sources.map((r) => item('result', String(r.n), h('span', { class: 'badge' }, r.n), h('span', { class: 'body' }, h('span', { class: 'title' }, r.title), h('span', { class: 'link' }, r.short)))),
        h('div', { class: 'hint' }, t('Tape un numéro pour ouvrir une source · '), h('b', {}, '2t'), t(' nouvel onglet · '), h('b', {}, 'brows'), t(' pour une recherche classique')),
      ] : null,
    ];
  },

  aiproviders(s) {
    return [
      head('ia', t('choisir l\'IA qui répond à « ia <question> »')),
      h(
        'table',
        {},
        h('tr', {}, ['#', t('IA'), t('modèle'), t('clé'), ''].map((c) => h('th', {}, c))),
        s.rows.map((r) => h(
          'tr',
          { class: r.current ? 'current' : '' },
          h('td', { class: 'dim' }, `[${r.n}]`),
          h('td', {}, h('button', { type: 'button', class: 'link-btn', onclick: () => run(String(r.n)) }, r.name), r.current ? h('span', { class: 'acc' }, t(' ● actuelle')) : null),
          h('td', { class: 'dim' }, r.model),
          h('td', { class: r.ready ? 'ok' : 'dim' }, r.key),
          h('td', {}, r.free ? h('span', { class: 'pill ok' }, t('gratuit')) : h('span', { class: 'pill dim' }, t('payant')), r.web ? h('span', { class: 'pill' }, 'web') : null),
        )),
      ),
      h(
        'div',
        { class: 'hint' },
        t('Tape un numéro pour choisir · '), h('b', {}, 'ia key'), t(' <clé> pour connecter l\'IA actuelle · '),
        h('b', {}, 'ia logout'), t(' retire sa clé · '), h('b', {}, 'ia model'), t(' <id> change de modèle'),
      ),
      h('div', { class: 'hint' }, t('Les clés restent sur cet ordinateur, chiffrées par le système. Gratuit : Gemini, Mistral, Groq et OpenRouter (avec des limites par jour), Ollama (en local).')),
    ];
  },

  results(s) {
    return [
      head(`brows ${s.query}`, t('{engine} · {count} résultats · page {page}', { engine: s.engine, count: s.results.length, page: s.page })),
      s.results.map((r) => item(
        'result',
        String(r.n),
        h('span', { class: 'badge' }, r.n),
        h('span', { class: 'body' }, h('span', { class: 'title' }, r.title), h('span', { class: 'link' }, r.short), r.desc ? h('span', { class: 'desc' }, r.desc) : null),
      )),
      h(
        'div',
        { class: 'hint' },
        t('Tape un numéro pour ouvrir · '), h('b', {}, '3t'), t(' nouvel onglet (ou Ctrl+clic)'),
        s.next ? [' · ', h('b', {}, 'n'), t(' page suivante')] : null,
        s.prev ? [' · ', h('b', {}, 'p'), t(' page précédente')] : null,
      ),
    ];
  },

  fav(s) {
    const open = []; // pour chaque profondeur : reste-t-il des frères en dessous ?
    return [
      head(`fav${s.folder ? ` ${s.folder}` : ''}`, t('{links} favoris, {folders} dossiers', { links: s.counts.links, folders: s.counts.folders })),
      h('h3', {}, `~/${t('favoris')}${s.folder ? `/${s.folder}` : ''}`),
      s.rows.length ? h('div', { class: 'tree' }, s.rows.map((r) => {
        open[r.depth] = !r.last;
        const prefix = open.slice(0, r.depth).map((o) => (o ? '│  ' : '   ')).join('') + (r.last ? '└─ ' : '├─ ');
        if (r.type === 'folder') {
          return item('', `fav ${r.path}`, h('span', { class: 'branch' }, prefix), h('span', { class: 'folder' }, `${r.name}/`));
        }
        return h(
          'div',
          { class: 'item' },
          h('span', { class: 'branch' }, prefix),
          h('button', { type: 'button', onclick: click(String(r.n)), onauxclick: click(String(r.n)) }, h('span', { class: 'num' }, `[${r.n}]`), r.name),
          h('span', { class: 'site' }, r.url.replace(/^https?:\/\/(www\.)?/, '')),
          h('button', { type: 'button', class: 'rm', 'aria-label': t('Supprimer {path}', { path: r.path }), title: t('Supprimer'), onclick: () => run(`fav rm ${r.path}`) }, '✕'),
        );
      })) : h('div', { class: 'dim' }, t('Aucun favori ici. Sur un site, tape « add dossier/nom ».')),
      h('div', { class: 'hint' }, h('b', {}, 'fav rm'), t(' chemin|n · '), h('b', {}, 'fav mv'), t(' chemin destination/ · '), h('b', {}, 'fav rename'), t(' chemin nom · '), h('b', {}, 'undo')),
    ];
  },

  hist(s) {
    let day = null;
    const rows = [];
    for (const r of s.rows) {
      const d = dayLabel(r.time);
      if (d !== day) {
        day = d;
        rows.push(h('div', { class: 'day' }, d));
      }
      const time = new Date(r.time).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
      rows.push(item('', String(r.n), h('span', { class: 'time' }, `[${r.n}] ${time}`), r.label, h('span', { class: 'title' }, r.title)));
    }
    return [
      head(`hist${s.filter ? ` ${s.filter}` : ''}`, t('{count} entrées', { count: s.total })),
      h('div', { class: 'rows' }, rows.length ? rows : h('div', { class: 'dim' }, t('Historique vide.'))),
      h('div', { class: 'hint' }, h('b', {}, 'hist'), t(' texte pour filtrer · '), h('b', {}, 'clean'), t(' vide l\'historique · '), h('b', {}, 'clean all'), t(' vide aussi les cookies')),
    ];
  },

  tabs(s) {
    return [
      head('tab', t('{count} onglets', { count: s.rows.length })),
      h('div', { class: 'rows' }, s.rows.map((r) => item('', String(r.n), h('span', { class: 'time' }, `[${r.n}]`), r.title, h('span', { class: 'title' }, r.url), r.pane >= 0 ? h('span', { class: 'acc' }, t('écran {n}', { n: r.pane + 1 })) : null))),
      h('div', { class: 'hint' }, h('b', {}, 'tab new'), ' [url] · ', h('b', {}, 'close'), ' n'),
    ];
  },

  ext(s) {
    return [
      head('ext', t('{count} extensions', { count: s.rows.length })),
      s.rows.length ? h(
        'table',
        {},
        h('tr', {}, ['#', 'alias', t('nom'), t('état'), t('raccourci'), ''].map((c) => h('th', {}, c))),
        s.rows.map((r) => h(
          'tr',
          {},
          h('td', { class: 'dim' }, `[${r.n}]`),
          h('td', { class: 'acc' }, r.alias),
          h('td', {}, r.name),
          h('td', {}, h('button', { type: 'button', class: `pill ${r.enabled ? 'ok' : 'dim'}`, onclick: () => run(`ext ${r.enabled ? 'off' : 'on'} ${r.n}`) }, r.enabled ? t('actif') : 'pause')),
          h('td', { class: 'dim' }, `Alt+${r.n}`),
          h('td', {}, r.popup ? h('button', { type: 'button', class: 'pill', onclick: () => run(`ext ${r.n}`) }, 'popup') : null, r.error ? h('span', { class: 'err' }, ` ${r.error}`) : null, r.dnrOnly ? h('span', { class: 'warn' }, t(' ne bloque rien ici (ext add ublock)')) : null),
        )),
      ) : h('div', { class: 'dim' }, t('Aucune extension.')),
      h(
        'div',
        { class: 'hint' },
        h('b', {}, 'ext add'), t(' lien du Chrome Web Store, identifiant, dossier ou « ublock » · '),
        h('b', {}, 'ext off|on|rm'), ' n · ', h('b', {}, 'ext alias'), t(' n nom · '), h('b', {}, 'ext n'), t(' ou Alt+n ouvre la popup'),
      ),
    ];
  },

  dl(s) {
    return [
      head('dl', t('{count} téléchargements', { count: s.rows.length })),
      h('div', { class: 'rows' }, s.rows.length ? s.rows.map((r) => item(
        '',
        String(r.n),
        h('span', { class: 'time' }, `[${r.n}]`),
        r.name,
        h('span', { class: r.state === 'completed' ? 'ok' : r.state === 'progressing' ? 'acc' : 'err' }, dlState(r)),
      )) : h('div', { class: 'dim' }, t('Aucun téléchargement.'))),
      h('div', { class: 'hint' }, t('Tape un numéro pour ouvrir le fichier · '), h('b', {}, '3t'), t(' l\'affiche dans son dossier')),
    ];
  },

  help(s) {
    return [
      head('help'),
      h('div', { class: 'cols' },
        h('div', { class: 'cmd-list' }, h('h3', {}, t('Commandes')), s.commands.map(([n, a, d]) => h('div', {}, h('span', { class: 'acc' }, n), ` ${t(a)}`, '\n', h('span', { class: 'dim' }, `    ${t(d)}`)))),
        h('div', { class: 'cmd-list' }, h('h3', {}, t('Raccourcis')), s.shortcuts.map(([k, d]) => h('div', {}, h('span', { class: 'acc' }, t(k)), '\n', h('span', { class: 'dim' }, `    ${t(d)}`))))),
      h('div', { class: 'hint' }, t('Taper autre chose qu\'une commande lance une recherche, ou ouvre l\'adresse si ça en est une.')),
    ];
  },

  tty(s) {
    // Les espaces autour du texte d'un lien restent hors du soulignement.
    const link = (p) => {
      const [, before, text, after] = p.text.match(/^(\s*)([\s\S]*?)(\s*)$/);
      return [before, h('span', { class: 'tty-link', role: 'link', 'data-n': p.link, title: t('ouvrir (Ctrl+clic : nouvel onglet)'), onclick: click(String(p.link)), onauxclick: click(String(p.link)) }, text || '↗', h('span', { class: 'tty-n' }, `[${p.link}]`)), after];
    };
    const parts = (b) => b.parts.flatMap((p) => (p.link ? link(p) : p.text));
    return [
      head(`tty ${s.host}`, s.loading ? t('chargement…') : s.error ? s.error : t('{count} liens', { count: s.links })),
      s.title ? h('h3', {}, s.title) : null,
      h('div', { class: 'tty' }, s.blocks.map((b) => {
        if (b.type === 'pre') return h('pre', {}, b.parts[0].text);
        if (b.type === 'h') return h('div', { class: 'tty-h' }, parts(b));
        if (b.type === 'li') return h('div', { class: 'tty-li' }, '• ', parts(b));
        return h('div', { class: 'tty-p' }, parts(b));
      })),
      h('div', { class: 'hint' }, t('Tape un numéro ou clique un lien · '), h('b', {}, '3t'), t(' nouvel onglet · '), h('b', {}, 'tty off'), t(' revient à la page')),
    ];
  },

  alias(s) {
    return [
      head('alias', `${s.rows.length} alias`),
      s.rows.length ? h('div', { class: 'cmd-list' }, s.rows.map((r) => h('div', {}, h('span', { class: 'acc' }, r.name), ' = ', r.value))) : h('div', { class: 'dim' }, t('Aucun alias.')),
      h('div', { class: 'hint' }, h('b', {}, 'alias yt = brows youtube'), ' · ', h('b', {}, 'unalias yt')),
    ];
  },
};

function renderScreen(s) {
  return (screens[s.kind] || (() => [h('div', {}, s.kind)]))(s);
}

function dayLabel(time) {
  const d = new Date(time);
  const today = new Date();
  const diff = Math.round((new Date(today.toDateString()) - new Date(d.toDateString())) / 86400000);
  if (diff === 0) return t('aujourd\'hui');
  if (diff === 1) return t('hier');
  return d.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' });
}

function dlState(r) {
  if (r.state === 'completed') return t('terminé');
  if (r.state === 'progressing') return r.total ? `${Math.round((r.received / r.total) * 100)} %` : t('{size} Ko', { size: Math.round(r.received / 1024) });
  return r.state === 'cancelled' ? t('annulé') : t('interrompu');
}
