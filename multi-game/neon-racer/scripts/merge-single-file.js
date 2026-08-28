/**
 * Voegt css/ en js/game.js samen tot één standalone HTML-bestand.
 * Gebruik: node scripts/merge-single-file.js
 * Output: dist/game-single.html
 *
 * Three.js wordt als globale build (build/three.min.js) via CDN geladen, en de
 * game-code is een klassiek <script> (werkt ook via file://).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'dist');
const outFile = path.join(outDir, 'game-single.html');

const cssFiles = ['css/base.css', 'css/hud.css', 'css/menu.css', 'css/world.css'];

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

const sectorGen = stripMergeMarkers(fs.readFileSync(path.join(root, 'js', 'sector-generator.js'), 'utf8'));
const gameJs = stripMergeMarkers(fs.readFileSync(path.join(root, 'js', 'game.js'), 'utf8'));
const jsBundle = `${sectorGen}\n\n${gameJs}`;

// Verwijder de losse <link>/<script src=js> verwijzingen (worden nu inline).
// De three.min.js CDN-tag blijft staan.
html = html.replace(/^[ \t]*<link rel="stylesheet" href="css\/[^"]+">\s*\n/gm, '');
html = html.replace(/^[ \t]*<script src="js\/sector-generator\.js"><\/script>\s*\n/gm, '');
html = html.replace(/^[ \t]*<script src="js\/game\.js"><\/script>\s*\n/gm, '');

// Functie-vervanging zodat $-tekens in de code (template literals e.d.) niet als
// speciaal vervangingspatroon worden geïnterpreteerd.
html = html.replace(
  /[ \t]*<!-- MERGE-CSS:[\s\S]*?-->/,
  () => `<style>\n${cssBundle}\n    </style>`
);
html = html.replace(
  /[ \t]*<!-- MERGE-JS:[\s\S]*?-->/,
  () => `<script>\n${jsBundle}\n    </script>`
);

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, html, 'utf8');
console.log(`Geschreven: ${path.relative(root, outFile)}`);
