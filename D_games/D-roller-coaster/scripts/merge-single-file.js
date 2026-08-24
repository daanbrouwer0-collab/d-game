/**
 * Voegt alle css/ en js/ bestanden samen tot één standalone HTML-bestand.
 * Gebruik: node scripts/merge-single-file.js
 * Output: dist/game-single.html
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'dist');
const outFile = path.join(outDir, 'game-single.html');

const cssFiles = [
  'css/variables.css',
  'css/base.css',
  'css/nav.css',
  'css/menu.css',
  'css/hud.css',
  'css/controls.css'
];

const jsFiles = [
  'js/config.js',
  'js/storage.js',
  'js/toast.js',
  'js/nav.js',
  'js/menu.js',
  'js/app-menu.js',
  'js/game-sideview.js',
  'js/character.js',
  'js/main.js'
];

function stripMergeMarkers(content) {
  return content
    .replace(/\/\* MERGE-BLOCK:[\s\S]*?\*\/\s*\n?/g, '')
    .replace(/\/\* END-MERGE-BLOCK \*\/\s*\n?/g, '');
}

let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const cssBundle = cssFiles
  .map((f) => stripMergeMarkers(fs.readFileSync(path.join(root, f), 'utf8')))
  .join('\n');

const jsBundle = jsFiles
  .map((f) => stripMergeMarkers(fs.readFileSync(path.join(root, f), 'utf8')))
  .join('\n\n');

html = html.replace(
  /<!-- MERGE: plak css\/\*\.css[\s\S]*?-->\s*[\s\S]*?(?=<\/head>)/,
  `<style>\n${cssBundle}\n</style>`
);

html = html.replace(
  /<!-- MERGE: plak js\/\*\.js[\s\S]*?-->\s*[\s\S]*?(?=<\/body>)/,
  `<script>\n${jsBundle}\n</script>`
);

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, html, 'utf8');
console.log(`Geschreven: ${outFile}`);
