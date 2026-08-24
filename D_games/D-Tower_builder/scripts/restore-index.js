/**
 * Herstelt index.html uit dist/game-single.html + huidige project-HTML.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = fs.readFileSync(path.join(root, 'dist', 'game-single.html'), 'utf8');

const bodyStart = dist.indexOf('<body>') + '<body>'.length;
const bodyEnd = dist.indexOf('<script>', bodyStart);
let body = dist.slice(bodyStart, bodyEnd).trim();

body = body.replace(
  /<button type="button" class="build-btn" data-build="knot"[^>]*>Knoop<\/button>/,
  `$&
            <button type="button" id="btn-build-mode" class="build-btn build-mode-toggle" aria-pressed="false">Bouw mode UIT</button>`
);

const settingsSection = `    <section id="screen-settings" class="view-screen">
      <div class="panel-scroll">
        <div class="menu-page-head">
          <button class="btn-back" type="button" data-menu-back aria-label="Terug">← Terug</button>
          <h2>Instellingen</h2>
        </div>
        <div class="glass-card">
          <div class="setting-row">
            <div class="info">
              <strong>Geluid</strong>
              <span>Effecten en feedback</span>
            </div>
            <button id="toggle-sound-settings" class="toggle" type="button" aria-pressed="false">Geluid: UIT</button>
          </div>
          <div class="setting-row">
            <div class="info">
              <strong>Trillen</strong>
              <span>Haptische feedback op mobiel</span>
            </div>
            <button id="toggle-vibration" class="toggle" type="button" aria-pressed="true">Trillen: AAN</button>
          </div>
          <div class="setting-row">
            <div class="info">
              <strong>Alles wissen</strong>
              <span>Sessions, voortgang en instellingen</span>
            </div>
            <button id="btn-reset-progress" class="btn danger" type="button">Reset</button>
          </div>
        </div>
        <div class="glass-card">
          <h3>Constructie</h3>
          <p class="help-hint">Alleen als bouw mode uit is. Massa, rek en breken via Matter.js.</p>
          <div class="setting-row">
            <div class="info">
              <strong>Jouw gewicht</strong>
              <span>Extra massa op de loopplank waar je op staat</span>
            </div>
            <div class="setting-control">
              <input id="physics-player-weight" type="range" min="25" max="160" step="1" value="72" aria-label="Gewicht poppetje">
              <span id="physics-player-weight-val" class="physics-slider-val">72 kg</span>
            </div>
          </div>
          <div class="setting-row">
            <div class="info">
              <strong>Gewicht balken</strong>
              <span>Zwaarder = meer doorzakken</span>
            </div>
            <div class="setting-control">
              <input id="physics-beam-mass" type="range" min="20" max="200" step="5" value="100" aria-label="Gewicht balken">
              <span id="physics-beam-mass-val" class="physics-slider-val">100%</span>
            </div>
          </div>
          <div class="setting-row">
            <div class="info">
              <strong>Gewicht loopplanken</strong>
              <span>Planken waar je op loopt</span>
            </div>
            <div class="setting-control">
              <input id="physics-walkway-mass" type="range" min="20" max="200" step="5" value="100" aria-label="Gewicht loopplanken">
              <span id="physics-walkway-mass-val" class="physics-slider-val">100%</span>
            </div>
          </div>
          <div class="setting-row">
            <div class="info">
              <strong>Stijfheid</strong>
              <span>Hoger = minder doorbuigen</span>
            </div>
            <div class="setting-control">
              <input id="physics-stiffness" type="range" min="70" max="140" step="1" value="100" aria-label="Stijfheid">
              <span id="physics-stiffness-val" class="physics-slider-val">100%</span>
            </div>
          </div>
          <div class="setting-row">
            <div class="info">
              <strong>Breekgevoeligheid</strong>
              <span>Lager = sneller breken</span>
            </div>
            <div class="setting-control">
              <input id="physics-strength" type="range" min="70" max="150" step="1" value="100" aria-label="Breekgevoeligheid">
              <span id="physics-strength-val" class="physics-slider-val">100%</span>
            </div>
          </div>
          <div class="setting-row">
            <div class="info">
              <strong>Simulatie</strong>
              <span>Meer stappen = stabieler</span>
            </div>
            <div class="setting-control">
              <input id="physics-quality" type="range" min="70" max="140" step="1" value="100" aria-label="Simulatie">
              <span id="physics-quality-val" class="physics-slider-val">100%</span>
            </div>
          </div>
          <div class="setting-row">
            <div class="info">
              <strong>Stress-kleuren</strong>
              <span>Rek in balken (groen → rood)</span>
            </div>
            <button id="toggle-physics-stress" class="toggle" type="button" aria-pressed="true">Stress: AAN</button>
          </div>
        </div>
      </div>
    </section>`;

body = body.replace(
  /<section id="screen-settings"[\s\S]*?<\/section>/,
  settingsSection
);

body = body.replace(
  /<p><strong>Gewicht & breken<\/strong>[\s\S]*?<\/p>/,
  '<p><strong>Gewicht & breken</strong> — Jouw gewicht en materiaalgewicht stel je in via ☰ → <em>Instellingen</em>. Te zware of te zwakke constructies reken rood uit en <em>breekt</em> na korte tijd.</p>'
);

body = body.replace(
  /<p><strong>Bouwtijd<\/strong>[\s\S]*?<\/p>\s*/,
  ''
);

body = body.replace(
  /<p><strong>Verse loopplanken<\/strong>[\s\S]*?<\/p>\s*/,
  '<p><strong>Bouw mode</strong> — Zet <em>Bouw mode AAN</em> in de HUD om te bouwen (physics uit). Zet hem uit om te lopen en de constructie te testen.</p>\n          '
);

const html = `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <title>Tower Build — Bouw je toren</title>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap" rel="stylesheet">

  <link rel="stylesheet" href="css/variables.css">
  <link rel="stylesheet" href="css/base.css">
  <link rel="stylesheet" href="css/nav.css">
  <link rel="stylesheet" href="css/menu.css">
  <link rel="stylesheet" href="css/hud.css">
  <link rel="stylesheet" href="css/controls.css">

  <!-- MERGE: plak css/*.css in één <style> voor single-file build -->
</head>
<body>
  ${body}

  <script src="https://cdn.jsdelivr.net/npm/matter-js@0.19.0/build/matter.min.js"></script>
  <script src="js/config.js"></script>
  <script src="js/storage.js"></script>
  <script src="js/toast.js"></script>
  <script src="js/nav.js"></script>
  <script src="js/menu.js"></script>
  <script src="js/app-menu.js"></script>
  <script src="js/builder-matter.js"></script>
  <script src="js/game-sideview.js"></script>
  <script src="js/character.js"></script>
  <script src="js/main.js"></script>

  <!-- MERGE: plak js/*.js in één <script> voor single-file build -->
</body>
</html>
`;

fs.writeFileSync(path.join(root, 'index.html'), html, 'utf8');
console.log('index.html hersteld');
