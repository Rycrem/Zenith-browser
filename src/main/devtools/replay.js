'use strict';

const { t } = require('../../shared/i18n');

// Clic droit sur une requête de l'onglet Network des DevTools : « Rejouer la requête (Replay XHR) »
// et « Modifier et rejouer… », qui ouvre un formulaire (méthode, adresse, en-têtes, corps) avant
// de renvoyer. Le script s'ajoute à l'interface des DevTools (ses modules, chargés par adresse) ;
// la requête repart depuis la page, avec ses cookies, et s'affiche dans la liste comme une autre.
const SCRIPT = String.raw`(async (L) => {
  if (window.__zenithReplay) return;
  window.__zenithReplay = true;
  const UI = await import('./ui/legacy/legacy.js');
  const SDK = await import('./core/sdk/sdk.js');
  const NM = SDK.NetworkManager.NetworkManager;
  const SKIP = new Set(['host', 'connection', 'content-length', 'cookie', 'origin', 'referer']);

  // Comme « Resend » des DevTools : un fetch dans la page d'où vient la requête.
  async function send(request, r) {
    const manager = NM.forRequest(request);
    if (!manager) throw new Error(L.noPage);
    const target = manager.target();
    const runtime = target.model(SDK.RuntimeModel.RuntimeModel);
    const ctx = runtime && (runtime.executionContexts().find((c) => c.frameId === request.frameId && c.isDefault) || runtime.defaultExecutionContext());
    if (!ctx) throw new Error(L.noPage);
    const init = { method: r.method, headers: r.headers, credentials: 'include' };
    if (r.body && r.method !== 'GET' && r.method !== 'HEAD') init.body = r.body;
    const expression = 'fetch(' + JSON.stringify(r.url) + ', ' + JSON.stringify(init) + ').then((x) => x.status + " " + x.statusText)';
    const res = await target.runtimeAgent().invoke_evaluate({ expression, ...(ctx.uniqueId ? { uniqueContextId: ctx.uniqueId } : { contextId: ctx.id }), silent: false, awaitPromise: true, returnByValue: true });
    const err = res.getError() || (res.exceptionDetails && ((res.exceptionDetails.exception && res.exceptionDetails.exception.description) || res.exceptionDetails.text));
    if (err) throw new Error(err);
    return res.result && res.result.value;
  }

  const headersOf = (request) => request.requestHeaders().filter((h) => !h.name.startsWith(':') && !SKIP.has(h.name.toLowerCase()));

  function el(tag, props, ...children) {
    const e = document.createElement(tag);
    Object.assign(e, props || {});
    e.append(...children);
    return e;
  }

  async function edit(request) {
    document.querySelector('#zenith-replay')?.remove();
    const body = (await request.requestFormData()) || '';
    const css = 'font: 12px system-ui, sans-serif; color: var(--sys-color-on-surface, #222); background: var(--sys-color-cdt-base-container, #fff); border: 1px solid var(--sys-color-divider, #ccc); border-radius: 4px; padding: 4px 6px; box-sizing: border-box; width: 100%;';
    const mono = css + ' font-family: monospace; resize: vertical;';
    const method = el('input', { value: request.requestMethod, spellcheck: false });
    method.style.cssText = css;
    const url = el('input', { value: request.url(), spellcheck: false });
    url.style.cssText = css;
    const headers = el('textarea', { value: headersOf(request).map((h) => h.name + ': ' + h.value).join('\n'), rows: 7, spellcheck: false });
    headers.style.cssText = mono;
    const payload = el('textarea', { value: body, rows: 9, spellcheck: false });
    payload.style.cssText = mono;
    const status = el('div', {});
    status.style.cssText = 'flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
    const ok = el('button', { type: 'button', textContent: L.send });
    const cancel = el('button', { type: 'button', textContent: L.cancel });
    for (const b of [ok, cancel]) b.style.cssText = 'font: 12px system-ui, sans-serif; padding: 4px 14px; border-radius: 4px; border: 1px solid var(--sys-color-divider, #ccc); background: var(--sys-color-cdt-base-container, #fff); color: var(--sys-color-on-surface, #222); cursor: pointer;';
    ok.style.background = 'var(--sys-color-primary, #1a73e8)';
    ok.style.color = 'var(--sys-color-on-primary, #fff)';
    ok.style.borderColor = 'transparent';
    const label = (text, field) => {
      const l = el('label', {}, el('div', { textContent: text }), field);
      l.style.cssText = 'display: flex; flex-direction: column; gap: 3px; font: 600 11px system-ui, sans-serif;';
      return l;
    };
    const top = el('div', {}, label(L.method, method), label(L.url, url));
    top.style.cssText = 'display: grid; grid-template-columns: 90px 1fr; gap: 8px;';
    const foot = el('div', {}, status, cancel, ok);
    foot.style.cssText = 'display: flex; align-items: center; gap: 8px;';
    const box = el('div', {}, el('div', { textContent: L.title }), top, label(L.headers, headers), label(L.body, payload), foot);
    box.firstChild.style.cssText = 'font: 600 13px system-ui, sans-serif;';
    box.style.cssText = 'width: min(720px, 92vw); max-height: 92vh; overflow: auto; display: flex; flex-direction: column; gap: 10px; padding: 14px 16px; border-radius: 8px; background: var(--sys-color-cdt-base-container, #fff); color: var(--sys-color-on-surface, #222); box-shadow: 0 8px 30px rgba(0, 0, 0, .35);';
    const veil = el('div', { id: 'zenith-replay' }, box);
    veil.style.cssText = 'position: fixed; inset: 0; z-index: 100000; display: grid; place-items: center; background: rgba(0, 0, 0, .35);';
    const close = () => veil.remove();
    cancel.onclick = close;
    veil.addEventListener('mousedown', (e) => { if (e.target === veil) close(); });
    veil.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') close();
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) ok.click();
    });
    ok.onclick = async () => {
      const list = [];
      for (const line of headers.value.split('\n')) {
        const i = line.indexOf(':', line.startsWith(':') ? 1 : 0);
        if (line.trim() && i > 0) list.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]);
      }
      ok.disabled = true;
      status.textContent = L.sending;
      try {
        const res = await send(request, { method: method.value.trim().toUpperCase() || 'GET', url: url.value.trim(), headers: list, body: payload.value });
        status.textContent = L.done + (res ? ' : ' + res : '');
        setTimeout(close, 900);
      } catch (err) {
        status.textContent = L.failed + ' : ' + err.message;
        ok.disabled = false;
      }
    };
    document.body.append(veil);
    payload.focus();
  }

  UI.ContextMenu.registerProvider({
    contextTypes: () => [SDK.NetworkRequest.NetworkRequest],
    loadProvider: async () => ({
      appendApplicableItems(event, menu, request) {
        if (!request || !request.backendRequestId() || request.isRedirect() || !/^https?:/.test(request.url())) return;
        const section = menu.debugSection();
        section.appendItem(L.replay, () => {
          if (NM.canResendRequest(request)) NM.replayRequest(request);
          else send(request, { method: request.requestMethod, url: request.url(), headers: headersOf(request).map((h) => [h.name, h.value]), body: null }).catch(() => {});
        });
        section.appendItem(L.edit, () => edit(request));
      },
    }),
  });
})`;

function replayScript() {
  const labels = {
    replay: t('Rejouer la requête (Replay XHR)'),
    edit: t('Modifier et rejouer…'),
    title: t('Modifier et rejouer la requête'),
    method: t('Méthode'),
    url: t('Adresse'),
    headers: t('En-têtes (un par ligne, « Nom: valeur »)'),
    body: t('Corps de la requête'),
    send: t('Envoyer'),
    cancel: t('Annuler'),
    sending: t('envoi…'),
    done: t('renvoyée'),
    failed: t('échec'),
    noPage: t('la page de cette requête n\'est plus ouverte'),
  };
  return `${SCRIPT}(${JSON.stringify(labels)})`;
}

// Ajouté à chaque chargement de l'interface des DevTools (ouverture, Ctrl+R dans les DevTools).
function setupReplay(devWc) {
  devWc.on('did-finish-load', () => devWc.executeJavaScript(replayScript(), true).catch(() => {}));
}

Object.assign(module.exports, { setupReplay });
