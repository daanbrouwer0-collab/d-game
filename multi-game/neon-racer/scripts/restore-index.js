/**
 * Herstelt de modulaire index.html vanuit dist/game-single.html.
 *
 * De css/ modules en js/game.js blijven de bron van waarheid; dit script
 * regenereert alleen de wiring (head-links + importmap + module-tag + markers)
 * en neemt de body-markup over uit de single-file build.
 *
 * Gebruik: node scripts/restore-index.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const single = fs.readFileSync(path.join(root, 'dist', 'game-single.html'), 'utf8');

const cssFiles = ['css/base.css', 'css/hud.css', 'css/menu.css', 'css/world.css'];

const bodyStart = single.indexOf('<body>') + '<body>'.length;
const bodyEnd = single.indexOf('<script', bodyStart);
const bodyInner = single.slice(bodyStart, bodyEnd).replace(/^\r?\n/, '').replace(/\s+$/, '');

const cssLinks = cssFiles.map((n) => `    <link rel="stylesheet" href="${n}">`).join('\n');

const moduleLoader = `    <script src="https://unpkg.com/three@0.156.1/build/three.min.js"></script>
    <script src="js/game.js"></script>`;

const html = `<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Neon Racer 3D - Synthwave Drive</title>

${cssLinks}

    <!-- MERGE-CSS: hier komt de gebundelde <style> in de single-file build -->
</head>

<body>
${bodyInner}

${moduleLoader}

    <!-- MERGE-JS: hier komt het gebundelde <script> in de single-file build -->
</body>

</html>
`;

fs.writeFileSync(path.join(root, 'index.html'), html, 'utf8');
console.log('index.html hersteld vanuit dist/game-single.html');
