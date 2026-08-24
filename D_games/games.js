// Hier kun je voor elke game de instellingen aanpassen en eventueel wachtwoorden/namen toevoegen.
// Als de passwords lijst leeg is [], kan iedereen de game zien.
// Als je er namen/wachtwoorden inzet, moet de speler die naam hebben (of in zijn naam hebben) om de game te zien.
// mode / modes: "single" = Single Device, "multi" = Multi Device.
// Optioneel descByMode: { single, multi } voor verschillende teksten per hub.
const GAMES_DATA = [
  {
    "id": "neon-racer",
    "title": "Neon Racer",
    "tag": "Arcade",
    "desc": "Snelle race gameplay in een korte loop.",
    "link": "./D-Neon_racer/index.html",
    "image": "./D-Neon_racer/img/D-Racer.jpg",
    "folder": "D-Neon_racer/",
    "mode": "single",
    "passwords": []
  },
  {
    "id": "tower-defense",
    "title": "Tower Defense",
    "tag": "Defense",
    "desc": "Tower gameplay met waves en upgrades.",
    "link": "./D-tower_defense/index.html",
    "image": "./D-tower_defense/img/D-Tower.jpg",
    "folder": "D-tower_defense/",
    "mode": "single",
    "passwords": []
  },
  {
    "id": "robotrally",
    "title": "D-RobotRally",
    "tag": "Boardgame",
    "desc": "Samen op één toestel (hotseat): programmeer om de beurt en race over het bord.",
    "link": "./D-robotrally/index.html",
    "image": "./D-robotrally/img/D-RobotRally.jpg",
    "folder": "D-robotrally/",
    "modes": ["single", "multi"],
    "descByMode": {
      "single": "Samen op één toestel (hotseat): programmeer om de beurt en race over het bord.",
      "multi": "Multi Device via Matrix: speel RobotRally met vrienden op aparte toestellen."
    },
    "passwords": []
  },
  {
    "id": "tic-tac-too",
    "title": "MD-Tic-Tac-Too",
    "tag": "Matrix",
    "desc": "Boter-kaas-en-eieren tegen iemand op een ander toestel (Matrix).",
    "link": "./MD-tic-tac-too/index.html",
    "image": "./MD-tic-tac-too/img/MD-tic-tac-too.svg",
    "folder": "MD-tic-tac-too/",
    "mode": "multi",
    "passwords": []
  },
  {
    "id": "md-robot",
    "title": "MD-robot",
    "tag": "Matrix",
    "desc": "RoboRally-lite via Matrix: 5 registers, hand/deck, conveyors & lasers. Iedereen programmeert tegelijk.",
    "link": "./MD-robot/index.html",
    "image": "./MD-robot/img/MD-robot.svg",
    "folder": "MD-robot/",
    "mode": "multi",
    "passwords": []
  },
  {
    "id": "tower-builder",
    "title": "Tower Builder",
    "tag": "Builder",
    "desc": "Bouw je toren met balken, loopplanken en touw.",
    "link": "./D-Tower_builder/index.html",
    "image": "./D-Tower_builder/img/D-Tower_builder.jpg",
    "folder": "D-Tower_builder/",
    "mode": "single",
    "passwords": ["beta", "Riszy"]
  },
  {
    "id": "d-mine",
    "title": "D-Mine",
    "tag": "Voxel",
    "desc": "Klik Start om te beginnen. Bouw en breek blokken in een voxelwereld.",
    "link": "./D-Mine/index.html",
    "image": "./D-Mine/img/Screenshot 2026-06-08 085028.png",
    "folder": "D-Mine/",
    "mode": "single",
    "passwords": ["beta", "Riszy"]
  },
  {
    "id": "vis",
    "title": "Vis 3D",
    "tag": "Beta",
    "desc": "Hengelen, magneet en net in een 3D viswater.",
    "link": "./D-Vis/index.html",
    "image": "./D-Vis/img/D-Vis.jpg",
    "folder": "D-Vis/",
    "mode": "single",
    "passwords": ["beta"]
  },
  {
    "id": "team-battle",
    "title": "Team Battle",
    "tag": "Beta",
    "desc": "Auto battler: stel je team samen en vecht het uit.",
    "link": "./D-Team _Battle/index.html",
    "image": "./D-Team _Battle/img/D-Team_Battle.jpg",
    "folder": "D-Team _Battle/",
    "mode": "single",
    "passwords": ["beta"]
  },
  {
    "id": "dobble",
    "title": "D-Dobble Casino",
    "tag": "Casino",
    "desc": "Het ultieme gokcasino met 6 unieke spellen.",
    "link": "./D-dobble/index.html",
    "image": "./D-dobble/img/D-Dobble.jpg",
    "folder": "D-dobble/",
    "mode": "single",
    "passwords": []
  },
  {
    "id": "nachtjacht",
    "title": "Nachtjacht",
    "tag": "Survival",
    "desc": "Vecht door het bos en overleef de nacht.",
    "link": "./D-Matthijs/index.html",
    "image": "./D-Matthijs/img/D-Matthijs.png",
    "folder": "D-Matthijs/",
    "mode": "single",
    "passwords": []
  },
  {
    "id": "kirby",
    "title": "Kirby",
    "tag": "Voxel",
    "desc": "Een rond roze held in een Minecraft-achtige wereld.",
    "link": "./D-Milo/index.html",
    "image": "./D-Milo/img/D-Milo.png",
    "folder": "D-Milo/",
    "mode": "single",
    "passwords": []
  },
  {
    "id": "roller-coaster",
    "title": "D-Roller-Coaster",
    "tag": "Builder",
    "desc": "Bouw je eigen 3D achtbaan en maak een duizelingwekkende rit!",
    "link": "./D-roller-coaster/index.html",
    "image": "./D-roller-coaster/img/bg.jpg",
    "folder": "D-roller-coaster/",
    "mode": "single",
    "passwords": []
  }
];

function gameModes(game) {
  if (Array.isArray(game.modes) && game.modes.length) return game.modes;
  if (game.mode) return [game.mode];
  return ['single'];
}

function getGamesByMode(mode) {
  return GAMES_DATA.filter((game) => gameModes(game).includes(mode));
}

function gameDescForMode(game, mode) {
  if (game.descByMode && game.descByMode[mode]) return game.descByMode[mode];
  return game.desc || '';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderGameCards(container, mode) {
  if (!container) return [];
  const games = getGamesByMode(mode);
  container.innerHTML = games.map((game) => `
    <a class="card" href="${escapeHtml(game.link)}" data-game-id="${escapeHtml(game.id)}">
      <img class="thumb" src="${escapeHtml(game.image)}" alt="${escapeHtml(game.title)} preview" loading="lazy" />
      <div class="body">
        <div class="titleRow">
          <div class="title">${escapeHtml(game.title)}</div>
          <div class="tag">${escapeHtml(game.tag)}</div>
        </div>
        <p class="desc">${escapeHtml(gameDescForMode(game, mode))}</p>
        <div class="meta">
          <div class="play"></div>
          <div class="file"></div>
        </div>
      </div>
    </a>
  `).join('');
  return games;
}
