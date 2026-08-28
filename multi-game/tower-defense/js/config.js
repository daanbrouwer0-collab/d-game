/* MERGE-BLOCK: config.js */
// --- COMPLETE CONFIGURATION (INSTELLINGEN) ---
const CFG = {
    // SYSTEEM INSTELLINGEN
    SYS: {
        mapCols: 15,     // Vast raster — zelfde op mobiel en desktop
        mapRows: 18,     // 3 rijen korter aan de bovenkant (was 21)
        rowsAboveCenter: 7,   // was 10 — 3 rijen minder boven het midden
        rowsBelowCenter: 10,
        topGapRows: 1,   // Ruimte tussen HUD en bovenrand van het bord (in hex-rijen)
        gridShiftUpRows: 2, // Heel bord omhoog (in hex-rijen)
        hudOverlapRows: 1.5, // Bord mag iets onder stats-HUD (hex-rijen)
        gridZoom: 0.97,  // <1 = iets smaller dan volle breedte
        hexTileScale: 1,   // 1 = hex vult tot rand (geen zwarte tussenruimte)
        gameSpeeds: [1, 2], // Beschikbare speelsnelheden (alles schaalt via dt)
        hexSize: 22,     // Wordt dynamisch geschaald, topologie blijft gelijk
        maxWaves: 20,    // Totaal aantal waves om te winnen
        startMoney: 700, // Start geld bij begin level/restart
        lvlMoney: 10,    // Extra start geld per level (startMoney + lvl * lvlMoney)
    },

    // KLEUREN
    COLORS: {
        bg: '#020205',          // Achtergrondkleur
        p: '#10f3ff',           // Primair (UI, Speler)
        a: '#ff00ff',           // Accent
        d: '#ff3333',           // Gevaar/Vijand
        s: '#33ff33',           // Succes/Geld
        w: '#ffff33',           // Waarschuwing/Sniper
        v: '#0a0a14',           // Void/Donker
        node: '#4a4a25',        // Donker voor resource nodes
        water: '#002288',       // Water kleur
        waterStroke: '#002255',  // Water rand
        ruin: '#442222'         // Grijs voor ruin/obstakel
    },

    // KASTEEL (De basis die je moet beschermen)
    CASTLE: {
        hp: 20,             // Levenspunten van het kasteel
        color: '#00f3ff'    // Kleur van het kasteel
    },

    // GOLF (WAVE) INSTELLINGEN (Binnen een level)
    WAVE: {
        time: 12,           // Tijd tussen waves in seconden
        inc: {              // Toename per WAVE
            spd: 0.0,       // Snelheid (+0 per wave)
            rate: 0.06,     // Spawn snelheid (sneller spawnen: -0.05s per wave)
            hp: 0.1,        // HP multiplier (+10% per wave)
            dmg: 0.0        // Schade multiplier (+0% per wave)
        }
    },

    // LEVEL INSTELLINGEN (Progressie tussen levels)
    LEVEL: {
        baseWater: 0.12,    // Basis kans op water (5%)
        baseNode: 0.2,     // Basis kans op miner node (20%)
        baseRuin: 0.05,     // Basis kans op ruin/obstakel (5%)
        inc: {              // Toename per LEVEL
            spd: 0.1,       // Snelheid (+5 per level)
            rate: 0.01,      // Spawn snelheid (sneller spawnen: -0.1s per level)
            hp: 0.01,        // HP multiplier (+50% per level)
            dmg: 0.02,       // Schade multiplier (+20% per level)
            water: -0.006,    // Water kans (+2% per level)
            ruin: 0.02,       // Ruin kans (+2% per level)
            node: -0.001        // Node kans (+1% per level)
        }
    },

    // VIJANDEN SPAWN KANSEN (Vanaf welke wave en hoe vaak)
    SPAWN: {
        tankStart: 8, tankChance: 0.15,
        kamiStart: 5, kamiChance: 0.3,
        swarmStart: 3, swarmChance: 0.5,
        baseRate: 2.0,      // Start tijd tussen vijanden (seconden)
        minRate: 0.3,       // Minimum tijd tussen vijanden (sneller kan niet)
        bottomBias: 0.5,      // Hoeveel keer vaker vijanden van onder komen
        topBias: 2          // Hoeveel keer vaker vijanden van boven komen
    },

    // GEBOUWEN / TORENS
    BUILDINGS: {
        turret: {
            name: 'Turret', desc: 'Snelvuur basis verdediging.',
            cost: 100,      // Kosten
            hp: 100,         // Levenspunten (kan kapot)
            range: 90,      // Bereik
            cd: 0.4,        // Cooldown (vuursnelheid: lager is sneller)
            dmg: 30,         // Schade per schot
            color: '#00f3ff'
        },
        sniper: {
            name: 'Sniper', desc: 'Groot bereik, hoge schade.',
            cost: 180, hp: 50, range: 180, cd: 1.5, dmg: 100, color: '#ffff33',
            projSpeed: 1200 // Snelheid van de kogel
        },
        wall: {
            name: 'Wall', desc: 'Sterke barrière met splash schade.',
            cost: 160, hp: 1000, range: 40, cd: 1.0, dmg: 60, splash: 60, color: '#ff3333'
        },
        jam: {
            name: 'Jammer', desc: 'Vertraagt vijanden.',
            cost: 250, hp: 50, range: 150, cd: 0, dmg: 0, color: '#aa00ff',
            slowFactor: 0.5 // Vijand snelheid x 0.5 (50% trager)
        },
        generator: {
            name: 'Miner', desc: 'Genereert DATA. Heeft Node nodig.',
            cost: 110, hp: 50, range: 0, cd: 2.0, amt: 4, color: '#33ff33', btnColor: '#ff9900'
            // amt = hoeveelheid geld per keer
        },
        tech: {
            name: 'Tech', desc: 'Genereert T-Points. Boost globale DMG.',
            cost: 100, hp: 50, range: 0, cd: 7.0, amt: 1, color: '#33ff33', btnColor: '#ff9900',
            dmgBoost: 0.1 // 10% extra schade per level van dit gebouw
        },
        fill: {
            name: 'Fill', desc: 'Verandert WATER in LAND.',
            cost: 100, hp: 0, range: 0, cd: 0, dmg: 0, color: '#3399ff', btnColor: '#3399ff'
        },
        heal: {
            name: 'Heal', desc: 'Repareert gebouwen in de buurt.',
            cost: 210, hp: 50, range: 80, cd: 1.0, amt: 5, color: '#50ff80'
            // amt = hoeveelheid HP herstel
        }
    },

    // UPGRADES
    UPGRADE: {
        costMult: 0.5,   // Kosten upgrade = basis kosten * 0.5 * huidig level
        hpMult: 1.5,     // HP x 1.5 per level
        dmgMult: 1.2,    // Schade x 1.2 per level
        rangeMult: 1.1,  // Bereik x 1.1 per level
        cdMult: 0.9      // Cooldown x 0.9 per level (sneller)
    },

    // PROJECTIELEN ALGEMEEN
    PROJ: {
        baseSpeed: 140,    // Standaard kogelsnelheid (was hardcoded 600)
        sniperMult: 4.0    // Snelheid vermenigvuldiger voor sniper (1200 / 600 = 2)
    },

    // VIJANDEN
    ENEMIES: {
        drone: { hp: 80, spd: 50, val: 15, size: 12, color: '#ff00ff', force: 200, fly: true, dmg: 40, castleDmg: 1 },
        tank: { hp: 300, spd: 20, val: 50, size: 24, color: '#ff9900', force: 100, fly: false, dmg: 30, castleDmg: 3 },
        swarm: { hp: 40, spd: 50, val: 5, size: 8, color: '#6633ff', force: 300, count: 3, fly: true, dmg: 15, castleDmg: 1 },
        kamikaze: { hp: 40, spd: 100, val: 25, size: 12, color: '#ff3333', force: 400, boom: 5, fly: true, dmg: 70, castleDmg: 2 }
    }
};

const GameConfig = {
    slug: 'DTowerDefense',
    title: 'D-Tower',
    subtitle: 'Verdedig het kasteel — hex tower defense',
    version: '2.0.0',

    storageKeys: {
        username: 'game:DTowerDefense:username',
        settings: 'game:DTowerDefense:settings',
        saves: 'game:DTowerDefense:saves',
        sessions: 'game:DTowerDefense:sessions'
    },

    difficulty: {
        easy: { label: 'Easy', moneyMult: 1.25, enemyHpMult: 0.85 },
        normal: { label: 'Normal', moneyMult: 1, enemyHpMult: 1 },
        hard: { label: 'Hard', moneyMult: 0.85, enemyHpMult: 1.2 }
    },

    session: {
        maxCount: 24,
        maxNameLength: 24,
        maxCharacterLength: 18
    },

    vipMaxLevel: 99,

    levelNames: {
        1: 'Perimeter', 2: 'Outpost', 3: 'Relay', 4: 'Bastion', 5: 'Grid',
        6: 'Nexus', 7: 'Core', 8: 'Apex', 9: 'Void Gate', 10: 'Deep Scan',
        11: 'Firewall', 12: 'Cipher', 13: 'Protocol', 14: 'Override', 15: 'Siege',
        16: 'Blackout', 17: 'Terminal', 18: 'Omega', 19: 'Singularity', 20: 'Zenith'
    },

    getLevelName(level) {
        return GameConfig.levelNames[level] || `Sector ${level}`;
    }
};
/* END-MERGE-BLOCK */
