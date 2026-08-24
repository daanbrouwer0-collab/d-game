/**
 * Herstelt de modulaire index.html opzet vanuit dist/game-single.html.
 *
 * Let op: de css/ en js/ modules blijven de bron van waarheid. Dit script
 * regenereert alleen de wiring (head-links + script-tags + MERGE-markers)
 * en neemt de body-markup over uit de single-file build. Bewerk code dus in
 * de modules, niet in het single-file bestand.
 *
 * Gebruik: node scripts/restore-index.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const single = fs.readFileSync(path.join(root, 'dist', 'game-single.html'), 'utf8');

const cssFiles = ['css/variables.css', 'css/base.css', 'css/hud.css', 'css/menu.css'];
const jsFiles = ['js/config.js', 'js/utils.js', 'js/pool.js', 'js/engine.js', 'js/game.js', 'js/main.js'];

// Body-markup tussen <body> en het eerste <script>/<style>/MERGE-blok
const bodyStart = single.indexOf('<body>') + '<body>'.length;
let bodyEnd = single.indexOf('<script', bodyStart);
const styleInBody = single.indexOf('<style', bodyStart);
if (styleInBody !== -1 && styleInBody < bodyEnd) bodyEnd = styleInBody;
const bodyInner = single.slice(bodyStart, bodyEnd).trim();

const cssLinks = cssFiles.map((n) => `    <link rel="stylesheet" href="${n}">`).join('\n');
const jsTags = jsFiles.map((n) => `    <script src="${n}"></script>`).join('\n');

const html = `<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport"
        content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    <title>D_Tower</title>
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">

${cssLinks}

    <!-- MERGE-CSS: hier komt de gebundelde <style> in de single-file build -->
</head>

<body>
${bodyInner}

${jsTags}

    <!-- MERGE-JS: hier komt het gebundelde <script> in de single-file build -->
</body>

</html>
`;

fs.writeFileSync(path.join(root, 'index.html'), html, 'utf8');
console.log('index.html hersteld vanuit dist/game-single.html');
