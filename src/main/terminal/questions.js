'use strict';

const { t } = require('../../shared/i18n');
const state = require('../state');

const YES = /^(o|oui|y|yes)$/i;
const ANSWER = /^(o|oui|y|yes|n|non|no|t|toujours|j|jamais|a|always|x|never)?$/i;

// Met une question en file ; renvoie les lignes à afficher si c'est la seule en attente.
// accept : réponses valables (les autres comptent comme « non » et s'exécutent comme commande).
function enqueue(question, answer, accept = ANSWER) {
  state.prompts.push({ question, answer, accept });
  return state.prompts.length === 1 ? [{ t: `  ? ${question}`, c: 'warn' }] : [];
}

// Entrée vide répond oui, sauf pour une question irréversible (yes = false).
function confirm(question, run, yes = true) {
  return enqueue(`${question} ${yes ? t('(O/n)') : t('(o/N)')}`, async (input, say) => {
    if (YES.test(input) || (yes && !input)) await run(say);
    else say(t('  annulé'), 'dim');
  });
}

function ask(say, question, run, yes) {
  for (const l of confirm(question, run, yes)) say(l.t, l.c);
}

Object.assign(module.exports, { enqueue, confirm, ask });
