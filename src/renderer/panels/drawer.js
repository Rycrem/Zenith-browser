'use strict';

// Barre du tiroir de discussion : l'appli s'affiche dessous (vue du processus principal).
window.panel.onData((d) => {
  $('#icon').replaceChildren(messengerIcon(d.id));
  $('#name').textContent = d.name;
  $('#reload').title = d.reload;
  $('#close').title = d.close;
});
$('#reload').addEventListener('click', () => window.panel.act('reload'));
$('#close').addEventListener('click', () => window.panel.act('close'));
