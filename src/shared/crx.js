'use strict';

// Un fichier .crx (Chrome Web Store) est une archive zip précédée d'un en-tête.
// CRX2 : "Cr24", version 2, longueur de la clé, longueur de la signature.
// CRX3 : "Cr24", version 3, longueur de l'en-tête.
function crxToZip(buf) {
  if (buf.length >= 4 && buf.readUInt32LE(0) === 0x04034b50) return buf; // déjà un zip
  if (buf.length < 16 || buf.toString('ascii', 0, 4) !== 'Cr24') {
    throw new Error('ce fichier n\'est pas une extension Chrome (.crx)');
  }
  const version = buf.readUInt32LE(4);
  let offset;
  if (version === 2) offset = 16 + buf.readUInt32LE(8) + buf.readUInt32LE(12);
  else if (version === 3) offset = 12 + buf.readUInt32LE(8);
  else throw new Error(`version de crx inconnue : ${version}`);
  if (offset >= buf.length) throw new Error('fichier crx tronqué');
  return buf.subarray(offset);
}

// Identifiant d'extension Chrome : 32 lettres de a à p, éventuellement dans une URL du store.
function extensionIdFrom(text) {
  const m = String(text).match(/(?:^|[/=])([a-p]{32})(?:$|[/?#&])/);
  return m ? m[1] : null;
}

module.exports = { crxToZip, extensionIdFrom };
