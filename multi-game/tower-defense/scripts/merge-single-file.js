/**
 * Voegt alle css/ en js/ modules samen tot één standalone HTML-bestand.
 * Gebruik: node scripts/merge-single-file.js
 * Output: dist/game-single.html
 *
 * De modulaire index.html blijft de bron van waarheid; dit bestand is het
 * gegenereerde "weer aan elkaar"-resultaat dat los te openen/delen is.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'dist');
const outFile = path.join(outDir, 'game-single.html');

// Volgorde is belangrijk: zelfde volgorde als de <link>/<script> tags.
const cssFiles = [
  'css/variables.css',
  'css/base.css',
  'css/hud.css',
  'css/menu.css'
];

const jsFiles = [
  'js/config.js',
  'js/utils.js',
  'js/pool.js',
  'js/engine.js',
  'js/game.js',
  'js/main.js'
];

function stripMergeMarkers(content) {
  return content
    .replace(/\/\* MERGE-BLOCK:[\s\S]*?\*\/\s*\n?/g, '')
    .replace(/\/\* END-MERGE-BLOCK \*\/\s*\n?/g, '')
    .replace(/\s+$/, '');
}

let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const cssBundle = cssFiles
  .map((f) => stripMergeMarkers(fs.readFileSync(path.join(root, f), 'utf8')))
  .join('\n\n');

const jsBundle = jsFiles
  .map((f) => stripMergeMarkers(fs.readFileSync(path.join(root, f), 'utf8')))
  .join('\n\n');

// Verwijder de losse <link>/<script src> verwijzingen (worden nu inline)
html = html.replace(/^[ \t]*<link rel="stylesheet" href="css\/[^"]+">\s*\n/gm, '');
html = html.replace(/^[ \t]*<script src="js\/[^"]+"><\/script>\s*\n/gm, '');

// Plak de gebundelde CSS/JS op de plek van de MERGE-markers.
// Functie-vervanging i.p.v. string, zodat $-tekens in de code (bv. fillText('$'))
// niet als speciaal vervangingspatroon worden geïnterpreteerd.
html = html.replace(
  /[ \t]*<!-- MERGE-CSS:[\s\S]*?-->/,
  () => `<style>\n${cssBundle}\n</style>`
);
html = html.replace(
  /[ \t]*<!-- MERGE-JS:[\s\S]*?-->/,
  () => `<script>\n${jsBundle}\n</script>`
);

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, html, 'utf8');
console.log(`Geschreven: ${path.relative(root, outFile)}`);
