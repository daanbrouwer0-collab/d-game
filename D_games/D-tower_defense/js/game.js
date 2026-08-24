/* MERGE-BLOCK: game.js */
// --- GAME ---
const G = {
    run: false, money: CFG.SYS.startMoney, lvl: 1, wave: 1, tPoints: 0,
    sessionMeta: null,
    castleColor: CFG.CASTLE.color,
    castle: null, map: new Map(), flow: {}, spatial: new Map(),
    enemies: [], builds: [], projs: [], fx: [], pops: [],
    sel: null, ms: new Vec(0, 0), tmr: 0, st: 0, wTmr: 0,
    dpr: window.devicePixelRatio || 1,
    w: 0, h: 0, offX: 0, offY: 0,
    gameSpeed: 1,

    getGameSpeed() {
        const speed = Number(Storage.readSettings().gameSpeed) || 1;
        return speed === 2 ? 2 : 1;
    },

    setGameSpeed(speed) {
        const next = speed === 2 ? 2 : 1;
        this.gameSpeed = next;
        Storage.writeSettings({ ...Storage.readSettings(), gameSpeed: next });
        this.st = Date.now();
        this.syncSpeedButton();
    },

    resetRunSpeed() {
        this.gameSpeed = 1;
        Storage.writeSettings({ ...Storage.readSettings(), gameSpeed: 1 });
        this.syncSpeedButton();
    },

    toggleGameSpeed() {
        this.setGameSpeed(this.gameSpeed === 2 ? 1 : 2);
        Toast.show(this.gameSpeed === 2 ? 'Snelheid 2×' : 'Snelheid 1×');
    },

    syncSpeedButton() {
        const navBtn = document.querySelector('[data-tab="play"]');
        const icon1x = navBtn?.querySelector('.nav-speed-icon-1x');
        const icon2x = navBtn?.querySelector('.nav-speed-icon-2x');
        const settingsBtn = document.getElementById('toggle-game-speed');
        const fast = this.gameSpeed === 2;

        if (navBtn) {
            navBtn.classList.toggle('nav-speed-fast', fast);
            navBtn.setAttribute('aria-label', fast ? 'Speelsnelheid 2×' : 'Speelsnelheid 1×');
            navBtn.setAttribute('aria-pressed', fast ? 'true' : 'false');
        }
        icon1x?.classList.toggle('hidden', !fast);
        icon2x?.classList.toggle('hidden', fast);

        if (settingsBtn) {
            settingsBtn.classList.toggle('active', fast);
            settingsBtn.setAttribute('aria-pressed', fast ? 'true' : 'false');
            settingsBtn.textContent = `Snelheid: ${this.gameSpeed}×`;
        }
    },

    init() {
        this.gameSpeed = this.getGameSpeed();
        // Build Menu
        const menu = $('build-menu');
        menu.innerHTML = '';
        for (let k in CFG.BUILDINGS) {
            const b = CFG.BUILDINGS[k];
            const btn = document.createElement('button');
            btn.id = `btn-${k}`;
            btn.className = 'build-btn';
            if (b.btnColor) btn.style.setProperty('--prim', b.btnColor);
            btn.innerHTML = `${b.name.toUpperCase()}<span class="cost">${b.cost}</span>`;
            btn.addEventListener('click', () => G.setSel(k));
            menu.appendChild(btn);
        }

        const wrap = $('game-wrap');
        if (wrap && typeof ResizeObserver !== 'undefined') {
            this._resizeObs = new ResizeObserver(() => this.resize());
            this._resizeObs.observe(wrap);
        }

        setTimeout(() => this.resize(), 50);
        requestAnimationFrame(() => this.resize());

        $('btn-over-retry')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.retryLvl();
        });
        $('btn-over-menu')?.addEventListener('click', (e) => {
            e.stopPropagation();
            $('over').style.display = 'none';
            Nav.openStartScreen();
        });

        this.castle = {
            pos: new Vec(0, 0), // Will be fixed by resize
            hp: CFG.CASTLE.hp, max: CFG.CASTLE.hp,
            size: CFG.SYS.hexSize * 2, hit: 0,
            takeDmg: (a) => {
                G.castle.hp -= a; G.castle.hit = 0.2; G.ui();
                for (let i = 0; i < 5; i++) G.fx.push(Pool.getPart(G.castle.pos.x, G.castle.pos.y, G.getCastleColor(), Rnd(2, 5), 3, 0.5));
                if (G.castle.hp <= 0) G.over();
            }
        };

        window.addEventListener('resize', () => this.resize());

        const updateMs = e => {
            const rect = cvs.getBoundingClientRect();
            let cx, cy;
            if (e.touches && e.touches.length > 0) {
                cx = e.touches[0].clientX;
                cy = e.touches[0].clientY;
            } else if (e.changedTouches && e.changedTouches.length > 0) {
                cx = e.changedTouches[0].clientX;
                cy = e.changedTouches[0].clientY;
            } else {
                cx = e.clientX;
                cy = e.clientY;
            }
            G.ms.x = cx - rect.left;
            G.ms.y = cy - rect.top;
        };

        cvs.addEventListener('mousemove', e => { updateMs(e); });
        cvs.addEventListener('touchmove', e => { e.preventDefault(); updateMs(e); }, { passive: false });
        cvs.addEventListener('touchstart', e => {
            e.preventDefault();
            updateMs(e);
        }, { passive: false });
        cvs.addEventListener('touchend', e => {
            e.preventDefault();
            G.click(e);
        }, { passive: false });
        cvs.addEventListener('click', e => G.click(e));

        this.syncSpeedButton();

        this.st = Date.now();
        this.loop();
    },

    setSessionMeta(meta) {
        this.sessionMeta = {
            sessionName: meta.sessionName || 'Session',
            characterName: meta.characterName || 'Operator',
            difficulty: meta.difficulty || 'normal',
            vip: !!meta.vip,
            maxCompletedLevel: meta.maxCompletedLevel || 0,
            stats: meta.stats || { wavesSurvived: 0, sectorsSecured: 0, totalEarned: 0 }
        };
        this.setCastleColor(meta.castleColor);
    },

    getCastleColor() {
        return this.castleColor || CFG.CASTLE.color;
    },

    setCastleColor(color) {
        this.castleColor = color || CFG.CASTLE.color;
        if (this.map?.size > 0) this.renderGridToCache();
    },

    getDifficultyMult() {
        const diff = GameConfig.difficulty[this.sessionMeta?.difficulty] || GameConfig.difficulty.normal;
        return diff;
    },

    applyDifficultyMoney(base) {
        const diff = this.getDifficultyMult();
        return Math.floor(base * (diff.moneyMult || 1));
    },

    startFresh(level = 1) {
        this.lvl = Math.max(1, level);
        this.money = this.applyDifficultyMoney(CFG.SYS.startMoney + (this.lvl * CFG.SYS.lvlMoney));
        $('over').style.display = 'none';
        this.restart();
    },

    startAtLevel(level) {
        this.lvl = Math.max(1, level);
        this.money = this.applyDifficultyMoney(CFG.SYS.startMoney + (this.lvl * CFG.SYS.lvlMoney));
        $('over').style.display = 'none';
        this.startLvl();
        this.run = true;
        Character.refresh?.();
    },

    stopGame() {
        this.run = false;
        this.map = new Map();
        this.builds = [];
        this.enemies = [];
        this.sessionMeta = null;
        this.castleColor = CFG.CASTLE.color;
        $('over').style.display = 'none';
    },

    pauseForMenu() {
        this.run = false;
    },

    resumeFromMenu() {
        this.resetRunSpeed();
        if (this.map.size > 0) {
            this.run = true;
            this.st = Date.now();
        }
        document.body.classList.toggle('game-active', true);
    },

    pauseForOverlay() {
        this.run = false;
    },

    resumeFromOverlay() {
        if (this.map.size > 0 && !Menu.isVisible?.()) {
            this.run = true;
            this.st = Date.now();
        }
    },

    onTabVisible() {
        this.resize();
        if (this.map.size > 0 && !Menu.isVisible?.() && !Share.isOpen?.()) {
            this.run = true;
            this.st = Date.now();
        }
        document.body.classList.toggle('game-active', !Menu.isVisible?.() && !Share.isOpen?.());
    },

    onTabHidden() {
        this.run = false;
        document.body.classList.toggle('game-active', false);
    },

    exportState() {
        return {
            lvl: this.lvl,
            wave: this.wave,
            money: this.money,
            tPoints: this.tPoints,
            castleHp: this.castle?.hp ?? CFG.CASTLE.hp,
            wTmr: this.wTmr,
            tmr: this.tmr,
            sel: this.sel,
            mapCols: CFG.SYS.mapCols,
            mapRows: CFG.SYS.mapRows,
            castleColor: this.getCastleColor(),
            map: [...this.map.entries()].map(([k, tile]) => ({
                k, q: tile.h.q, r: tile.h.r, type: tile.type
            })),
            builds: this.builds.map((b) => ({
                type: b.type,
                q: b.hex.q,
                r: b.hex.r,
                lvl: b.lvl,
                hp: b.hp,
                maxHp: b.maxHp,
                dmg: b.dmg,
                range: b.range,
                cd: b.cd,
                cdTimer: b.cdTimer,
                splash: b.splash
            }))
        };
    },

    importState(save) {
        if (!save) return;

        this.lvl = save.lvl || 1;
        this.wave = save.wave || 1;
        this.money = save.money ?? CFG.SYS.startMoney;
        this.tPoints = save.tPoints || 0;
        this.wTmr = save.wTmr || 0;
        this.tmr = save.tmr || 0;
        this.sel = save.sel || 'turret';
        if (this.castle) this.castle.hp = save.castleHp ?? CFG.CASTLE.hp;
        if (save.castleColor) this.setCastleColor(save.castleColor);

        this.enemies = [];
        this.projs = [];
        this.fx = [];
        this.pops = [];
        this.builds = [];

        this.resize();

        this.map = new Map();
        for (const entry of save.map || []) {
            const h = new Hex(entry.q, entry.r);
            const k = entry.k || Hex.key(h);
            const tile = { h, type: entry.type };
            if (this.center) tile.pos = Hex.toPixel(h, CFG.SYS.hexSize).addMut(this.center.copy());
            this.map.set(k, tile);
        }

        for (const data of save.builds || []) {
            const h = new Hex(data.q, data.r);
            const b = new Building(h, data.type);
            b.lvl = data.lvl || 1;
            b.hp = data.hp ?? b.hp;
            b.maxHp = data.maxHp ?? b.maxHp;
            b.dmg = data.dmg ?? b.dmg;
            b.range = data.range ?? b.range;
            b.cd = data.cd ?? b.cd;
            b.cdTimer = data.cdTimer || 0;
            if (data.splash != null) b.splash = data.splash;
            this.builds.push(b);
        }

        this.renderGridToCache();
        this.calcFlow();
        this.updateUnlocked();
        this.ui();
        this.setSel(this.sel || 'turret', true);
        this.run = true;
        this.st = Date.now();
    },

    calcGridPixelBounds(hexSize = 1) {
        const cols = CFG.SYS.mapCols;
        const rowsAbove = CFG.SYS.rowsAboveCenter ?? Math.floor(CFG.SYS.mapRows / 2);
        const rowsBelow = CFG.SYS.rowsBelowCenter ?? Math.floor(CFG.SYS.mapRows / 2);
        const colStart = -Math.floor(cols / 2);
        const colEnd = Math.floor(cols / 2);
        const rowStart = -rowsAbove;
        const rowEnd = rowsBelow;
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

        for (let c = colStart; c <= colEnd; c++) {
            for (let r_off = rowStart; r_off <= rowEnd; r_off++) {
                const q = c;
                const r = r_off - Math.floor((c - (c & 1)) / 2);
                const p = Hex.toPixel(new Hex(q, r), hexSize);
                minX = Math.min(minX, p.x - hexSize);
                maxX = Math.max(maxX, p.x + hexSize);
                minY = Math.min(minY, p.y - hexSize);
                maxY = Math.max(maxY, p.y + hexSize);
            }
        }

        return {
            minX, maxX, minY, maxY,
            width: maxX - minX,
            height: maxY - minY
        };
    },

    resize() {
        const wrap = $('game-wrap');
        const rect = wrap?.getBoundingClientRect();
        this.w = Math.max(1, Math.floor(rect?.width || window.innerWidth));
        this.h = Math.max(1, Math.floor(rect?.height || window.innerHeight));
        this.dpr = window.devicePixelRatio || 1;

        cvs.width = Math.floor(this.w * this.dpr);
        cvs.height = Math.floor(this.h * this.dpr);

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(this.dpr, this.dpr);

        if (!this.gridCvs) {
            this.gridCvs = document.createElement('canvas');
            this.gridCtx = this.gridCvs.getContext('2d', { alpha: false });
        }
        this.gridCvs.width = cvs.width;
        this.gridCvs.height = cvs.height;
        this.gridCtx.setTransform(1, 0, 0, 1, 0, 0);
        this.gridCtx.scale(this.dpr, this.dpr);

        const hudTop = document.querySelector('#ui .hud-top-block')?.offsetHeight || 52;
        const hudBtm = document.querySelector('#ui .hud-btm')?.offsetHeight || 96;
        const marginH = 0;
        const marginV = CFG.SYS.playMargin ?? 6;

        if (wrap) {
            wrap.style.setProperty('--hud-top', `${hudTop}px`);
            wrap.style.setProperty('--hud-btm', `${hudBtm}px`);
        }

        const availW = this.w - marginH * 2;

        const unitBounds = this.calcGridPixelBounds(1);
        const zoom = CFG.SYS.gridZoom ?? 1;
        const sFromW = availW / unitBounds.width;

        // Volle breedte — nooit smaller maken voor hoogte (bovenkant mag onder HUD)
        const s = Math.max(8, Math.floor(sFromW * zoom));
        const shiftRows = CFG.SYS.gridShiftUpRows ?? 0;

        CFG.SYS.hexSize = s;
        G.scale = s / 22;

        this.renderEnemiesToCache();

        const bounds = this.calcGridPixelBounds(s);
        const hexRowH = s * Math.sqrt(3);
        const gridH = bounds.height;
        const gridBottomY = this.h - hudBtm - marginV - shiftRows * hexRowH;
        const gridTopY = gridBottomY - gridH;
        const visualCenterY = gridTopY + gridH / 2;

        this.offX = 0; // Horizontally centered (relative to w/2)
        this.offY = visualCenterY - (this.h / 2); // Shift from center
        this.center = new Vec(this.w / 2 + this.offX, this.h / 2 + this.offY);

        // Update Castle Position
        if (this.castle) {
            const targetY = gridTopY + gridH * 0.82;
            this.castle.pos = new Vec(this.w / 2 + this.offX, targetY);
            this.castle.size = CFG.SYS.hexSize * 2;
            const center = this.center;
            const localCastle = this.castle.pos.copy().subMut(center);
            const castleHex = Hex.fromPixel(localCastle, CFG.SYS.hexSize);

            // Snap castle pos to exact hex center to align visual elements
            const snappedLocal = Hex.toPixel(castleHex, CFG.SYS.hexSize);
            this.castle.pos = snappedLocal.addMut(center);

            const castleKey = Hex.key(castleHex);
            G.castleHexKey = castleKey;
            G.castleZoneKeys = [castleKey];
            for (let i = 0; i < 6; i++) {
                const n = Hex.neighbor(castleHex, i);
                G.castleZoneKeys.push(Hex.key(n));
            }
            if (this.map && this.map.size > 0) {
                // Sync castle tile color (type 3) to the current castle hex
                this.map.forEach((t, k) => { t.type = (G.castleZoneKeys.includes(k) ? 3 : (t.type === 3 ? 0 : t.type)); });
            }
        }

        // Update Entities
        if (this.map.size > 0) {
            const center = new Vec(G.w / 2 + G.offX, G.h / 2 + G.offY);
            this.map.forEach(t => {
                t.pos = Hex.toPixel(t.h, CFG.SYS.hexSize).addMut(center);
            });

            this.builds.forEach(b => {
                const p = Hex.toPixel(b.hex, CFG.SYS.hexSize).addMut(center);
                b.pos = p;
                b.size = 12 * G.scale;
                b.range = CFG.BUILDINGS[b.type].range * G.scale;
                if (b.splash) b.splash = CFG.BUILDINGS[b.type].splash * G.scale;
            });

            if (this.run) this.calcFlow();
            this.renderGridToCache();
        }
    },

    // toggleFS removed

    restart() {
        this.startLvl();
        $('over').style.display = 'none';
        this.run = true;
        this.st = Date.now();
    },

    retryLvl() {
        this.money = this.applyDifficultyMoney(CFG.SYS.startMoney + (this.lvl * CFG.SYS.lvlMoney));
        this.startLvl();
        $('over').style.display = 'none';
        this.run = true;
        this.st = Date.now();
        Menu.autoSave?.();
    },

    startLvl() {
        this.resetRunSpeed();
        this.tPoints = 0; // Reset T-Points
        this.wave = 1; this.wTmr = 0;
        this.enemies = []; this.builds = [];
        this.projs.forEach(p => Pool.recycleProj(p)); this.projs = [];
        this.fx.forEach(p => Pool.recycle(p)); this.fx = [];
        this.castle.hp = CFG.CASTLE.hp;
        this.genMap();
        this.calcFlow();
        this.msg(`LEVEL ${this.lvl} INITIALIZED`, CFG.COLORS.p);
        this.updateUnlocked();
        this.ui();
        this.setSel('turret', true);
    },

    getUnlockedList() {
        const l = this.lvl;
        const unlocks = ['turret'];
        if (l >= 2) unlocks.push('generator', 'fill');
        if (l >= 3) unlocks.push('sniper');
        if (l >= 4) unlocks.push('wall');
        if (l >= 5) unlocks.push('jam');
        if (l >= 6) unlocks.push('tech');
        if (l >= 7) unlocks.push('heal');
        return unlocks;
    },

    updateUnlocked() {
        const unlocks = this.getUnlockedList();
        for (let k in CFG.BUILDINGS) {
            const btn = document.getElementById(`btn-${k}`);
            if (btn) {
                if (unlocks.includes(k)) {
                    btn.disabled = false;
                    btn.style.opacity = 1;
                    btn.style.filter = 'none';
                    btn.style.pointerEvents = 'auto';
                } else {
                    btn.disabled = true;
                    btn.style.opacity = 0.3;
                    btn.style.filter = 'grayscale(100%)';
                    btn.style.pointerEvents = 'none';
                }
            }
        }
    },

    nextLvl() {
        if (this._levelTransitioning || Share.isOpen?.()) return;
        this._levelTransitioning = true;

        const clearedLevel = this.lvl;
        this.run = false;
        Menu.recordLevelComplete(clearedLevel);

        const commander = this.sessionMeta?.characterName || 'Operator';
        const proceed = () => {
            this._levelTransitioning = false;
            this.lvl++;
            this.money = this.applyDifficultyMoney(CFG.SYS.startMoney);
            this.startLvl();
            this.run = true;
            this.st = Date.now();
            Menu.autoSave();
            Character.refresh?.();
        };

        requestAnimationFrame(() => {
            Share.offerVictory(cvs, clearedLevel, commander, proceed);
        });
    },

    genMap() {
        this.map = new Map();
        const cols = CFG.SYS.mapCols;
        const colStart = -Math.floor(cols / 2);
        const colEnd = Math.floor(cols / 2);
        const rowStart = -(CFG.SYS.rowsAboveCenter ?? Math.floor(CFG.SYS.mapRows / 2));
        const rowEnd = CFG.SYS.rowsBelowCenter ?? Math.floor(CFG.SYS.mapRows / 2);

        for (let c = colStart; c <= colEnd; c++) {
            for (let r_off = rowStart; r_off <= rowEnd; r_off++) {
                const q = c;
                const r = r_off - Math.floor((c - (c & 1)) / 2);
                const h = new Hex(q, r);
                const k = Hex.key(h);
                const dist = Hex.dist(h, new Hex(0, 0));
                let type = 0;
                if (G.castleZoneKeys && G.castleZoneKeys.includes(k)) type = 3;
                else {
                    // Water chance: base + inc per level
                    if (Math.random() < CFG.LEVEL.baseWater + (this.lvl * CFG.LEVEL.inc.water)) type = 1;
                    else if (Math.random() < CFG.LEVEL.baseNode + (this.lvl * CFG.LEVEL.inc.node)) type = 2;
                    else if (Math.random() < CFG.LEVEL.baseRuin + (this.lvl * CFG.LEVEL.inc.ruin)) type = 4; // Ruin
                }
                const tile = { h, type };
                if (this.center) tile.pos = Hex.toPixel(h, CFG.SYS.hexSize).addMut(this.center);
                this.map.set(k, tile);
            }
        }
        this.renderGridToCache();
    },

    renderGridToCache() {
        const ctx = this.gridCtx;
        // Clear and Fill Background
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = CFG.COLORS.bg;
        ctx.fillRect(0, 0, this.gridCvs.width, this.gridCvs.height);
        ctx.scale(this.dpr, this.dpr);

        const s = CFG.SYS.hexSize;
        const drawS = s * (CFG.SYS.hexTileScale ?? 1);

        this.map.forEach((tile, key) => {
            if (!tile.pos) return;
            const x = tile.pos.x, y = tile.pos.y;
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const ang = 2 * Math.PI / 6 * i;
                const vx = x + drawS * Math.cos(ang);
                const vy = y + drawS * Math.sin(ang);
                if (i === 0) ctx.moveTo(vx, vy); else ctx.lineTo(vx, vy);
            }
            ctx.closePath();

            if (tile.type === 3) {
                ctx.fillStyle = CFG.COLORS.v;
                ctx.fill();
                // Inset castle outline so it doesn't get covered by neighbours
                const outlineS = s * 0.92;
                ctx.beginPath();
                const nMap = [0, 5, 4, 3, 2, 1]; // Maps edge i to neighbor dir
                for (let i = 0; i < 6; i++) {
                    // Check neighbor across this edge
                    const dir = nMap[i];
                    const nHex = Hex.neighbor(tile.h, dir);
                    const nKey = Hex.key(nHex);

                    // If neighbor is castle, skip this edge
                    if (G.castleZoneKeys && G.castleZoneKeys.includes(nKey)) continue;

                    const ang1 = 2 * Math.PI / 6 * i;
                    const ang2 = 2 * Math.PI / 6 * ((i + 1) % 6);

                    const p1x = x + outlineS * Math.cos(ang1);
                    const p1y = y + outlineS * Math.sin(ang1);
                    const p2x = x + outlineS * Math.cos(ang2);
                    const p2y = y + outlineS * Math.sin(ang2);

                    ctx.moveTo(p1x, p1y);
                    ctx.lineTo(p2x, p2y);
                }
                // No closePath() to avoid closing disjoint segments
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.strokeStyle = G.getCastleColor();
                ctx.lineWidth = 2;
                ctx.stroke();
            } else if (tile.type === 1) {
                ctx.fillStyle = CFG.COLORS.water;
                ctx.fill();
            } else if (tile.type === 2) {
                ctx.fillStyle = CFG.COLORS.node;
                ctx.fill();
            } else if (tile.type === 4) { // Ruin
                ctx.fillStyle = CFG.COLORS.ruin;
                ctx.fill();
            } else {
                ctx.fillStyle = CFG.COLORS.v;
                ctx.fill();
            }
            // Inset outline for all non-castle tiles
            if (!(G.castleZoneKeys && G.castleZoneKeys.includes(key))) {
                const outlineS = s * 0.92;
                ctx.beginPath();
                for (let i = 0; i < 6; i++) {
                    const ang = 2 * Math.PI / 6 * i;
                    const vx = x + outlineS * Math.cos(ang);
                    const vy = y + outlineS * Math.sin(ang);
                    if (i === 0) ctx.moveTo(vx, vy); else ctx.lineTo(vx, vy);
                }
                ctx.closePath();
                ctx.lineJoin = 'round';
                ctx.strokeStyle = 'rgba(0, 243, 255, 0.18)';
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }
        });
        ctx.restore();
    },

    renderEnemiesToCache() {
        this.sprites = {};
        for (let k in CFG.ENEMIES) {
            const data = CFG.ENEMIES[k];
            const s = G.scale || 1;
            const sz = data.size * s;

            const cvs = document.createElement('canvas');
            const ctx = cvs.getContext('2d', { alpha: true });
            const drawSz = (k === 'tank') ? 20 * s : sz;
            const dim = Math.ceil(drawSz * 2.5);

            cvs.width = dim * this.dpr;
            cvs.height = dim * this.dpr;
            ctx.scale(this.dpr, this.dpr);
            ctx.translate(dim / 2, dim / 2);

            ctx.fillStyle = data.color;

            if (k === 'tank') {
                const tSz = 10 * s;
                ctx.fillRect(-tSz, -tSz, tSz * 2, tSz * 2);
                ctx.fillStyle = '#000';
                ctx.fillRect(-tSz / 2, -tSz / 2, tSz, tSz);
            } else {
                // Triangle
                ctx.beginPath();
                ctx.moveTo(sz, 0);
                ctx.lineTo(-sz * 0.7, -sz * 0.7);
                ctx.lineTo(-sz * 0.3, 0);
                ctx.lineTo(-sz * 0.7, sz * 0.7);
                ctx.fill();
            }
            this.sprites[k] = cvs;
        }
    },

    calcFlow() {
        this.flow = {};
        const q = [];
        const visited = new Set();
        const s = CFG.SYS.hexSize;
        const center = new Vec(this.w / 2 + this.offX, this.h / 2 + this.offY);
        const localCastle = this.castle.pos.copy().subMut(center);
        const castleHex = Hex.fromPixel(localCastle, s);
        const castleKey = Hex.key(castleHex);
        G.castleHexKey = castleKey;
        G.castleZoneKeys = [castleKey];
        for (let i = 0; i < 6; i++) {
            const n = Hex.neighbor(castleHex, i);
            const nk = Hex.key(n);
            G.castleZoneKeys.push(nk);
        }
        // Seed BFS from all castle zone tiles
        for (let k of G.castleZoneKeys) {
            const qh = k === castleKey ? castleHex : this.map.get(k)?.h;
            if (qh && !visited.has(k)) { q.push({ h: qh, d: 0 }); visited.add(k); }
        }

        while (q.length > 0) {
            const cur = q.shift();
            for (let i = 0; i < 6; i++) {
                const n = Hex.neighbor(cur.h, i);
                const k = Hex.key(n);
                if (this.map.has(k) && !visited.has(k)) {
                    const tile = this.map.get(k);
                    let blocked = tile.type === 1;
                    if (!blocked) for (let b of this.builds) if (b.hex && Hex.key(b.hex) === k) { blocked = true; break; }
                    if (!blocked) {
                        visited.add(k);
                        const p1 = Hex.toPixel(n, CFG.SYS.hexSize);
                        const p2 = Hex.toPixel(cur.h, CFG.SYS.hexSize);
                        const v = p2.sub(p1).norm();
                        this.flow[k] = v;
                        q.push({ h: n, d: cur.d + 1 });
                    }
                }
            }
        }
    },

    spawn() {
        const w = this.w, h = this.h;
        if (this.wave > CFG.SYS.maxWaves) { this.nextLvl(); return; }
        let t = 'drone', r = Math.random();
        if (this.wave > CFG.SPAWN.tankStart && r < CFG.SPAWN.tankChance) t = 'tank';
        else if (this.wave > CFG.SPAWN.kamiStart && r < CFG.SPAWN.kamiChance) t = 'kamikaze';
        else if (this.wave > CFG.SPAWN.swarmStart && r < CFG.SPAWN.swarmChance) t = 'swarm';

        const c = CFG.ENEMIES[t].count || 1;
        for (let i = 0; i < c; i++) this.enemies.push(Pool.getUnit(t, this.wave, this.lvl));
    },

    click(e) {
        if (!this.run) return;
        const rect = cvs.getBoundingClientRect();
        let cx, cy;
        if (e.touches && e.touches.length > 0) {
            cx = e.touches[0].clientX;
            cy = e.touches[0].clientY;
        } else if (e.changedTouches && e.changedTouches.length > 0) {
            cx = e.changedTouches[0].clientX;
            cy = e.changedTouches[0].clientY;
        } else {
            cx = e.clientX;
            cy = e.clientY;
        }
        const x = cx - rect.left;
        const y = cy - rect.top;

        if (G.center) Vec.tmp1.setXY(x, y).subMut(G.center);
        else Vec.tmp1.setXY(0, 0);

        const h = Hex.fromPixelToTmp(Vec.tmp1, CFG.SYS.hexSize);
        const k = Hex.key(h);

        if (!this.map.has(k)) return;
        const tile = this.map.get(k);
        const existing = this.builds.find(b => Hex.key(b.hex) === k);

        if (existing) {
            if (this.sel && this.sel === existing.type) {
                if (existing.type === 'generator' || existing.type === 'tech') {
                    this.msg("MAX LEVEL REACHED", CFG.COLORS.w);
                    return;
                }
                if (existing.lvl >= 3) {
                    this.msg("MAX LEVEL REACHED", CFG.COLORS.w);
                    return;
                }

                if (this.money >= existing.cost * 0.5 * existing.lvl) {
                    existing.upgrade();
                    this.ui();
                } else this.msg("INSUFFICIENT DATA", CFG.COLORS.w);
            }
            return;
        }

        if (!this.sel) return;
        const bData = CFG.BUILDINGS[this.sel];

        if (this.money < bData.cost) { this.msg("INSUFFICIENT DATA", CFG.COLORS.w); return; }

        if (this.sel === 'fill') {
            if (tile.type !== 1 && tile.type !== 2 && tile.type !== 4) { this.msg("MUST PLACE ON WATER, NODE OR RUIN", CFG.COLORS.w); return; }
            this.money -= bData.cost;
            tile.type = 0;
            this.calcFlow();
            this.renderGridToCache();
            this.ui();
            const pixel = Hex.toPixel(h, CFG.SYS.hexSize).addMut(new Vec(this.w / 2 + this.offX, this.h / 2 + this.offY));
            for (let i = 0; i < 8; i++) G.fx.push(Pool.getPart(pixel.x, pixel.y, '#888888', 1, 3, 0.4));
            return;
        }

        if (tile.type === 1) { this.msg("CANNOT BUILD ON WATER", CFG.COLORS.d); return; }
        if (tile.type === 4) { this.msg("CANNOT BUILD ON RUINS", CFG.COLORS.d); return; }
        if (G.castleZoneKeys && G.castleZoneKeys.includes(k)) { this.msg("PROTECT THE CASTLE", CFG.COLORS.p); return; }
        if (this.sel === 'generator' && tile.type !== 2) { this.msg("NEEDS RESOURCE NODE", CFG.COLORS.w); return; }
        if (this.sel !== 'generator' && this.sel !== 'tech' && tile.type === 2) { this.msg("SAVE NODES FOR MINERS", CFG.COLORS.w); return; }

        this.money -= bData.cost;
        this.builds.push(new Building(new Hex(h.q, h.r), this.sel));
        this.calcFlow();
        this.ui();
        const pixel = Hex.toPixel(h, CFG.SYS.hexSize).addMut(new Vec(this.w / 2 + this.offX, this.h / 2 + this.offY));
        for (let i = 0; i < 8; i++) this.fx.push(Pool.getPart(pixel.x, pixel.y, CFG.COLORS.p, 1, 3, 0.4));
    },

    setSel(t, force = false) {
        const unlocks = this.getUnlockedList();
        if (!unlocks.includes(t)) {
            this.msg("LOCKED", CFG.COLORS.w);
            return;
        }
        if (force) this.sel = t;
        else if (this.sel === t) this.sel = null;
        else this.sel = t;
        document.querySelectorAll('.build-btn').forEach(b => b.classList.remove('active'));
        if (this.sel) {
            const idx = Object.keys(CFG.BUILDINGS).indexOf(t);
            const btns = document.querySelectorAll('.build-btn');
            if (btns[idx]) btns[idx].classList.add('active');
        }
    },

    addMoney(a) {
        this.money += a;
        if (a > 0 && this.sessionMeta?.stats) {
            this.sessionMeta.stats.totalEarned = (this.sessionMeta.stats.totalEarned || 0) + a;
        }
        this.ui();
    },

    addTPoints(a) {
        this.tPoints += a;
        this.ui();
    },

    getDmgMult() {
        let mult = 1;
        this.builds.forEach(b => {
            if (b.type === 'tech') mult += CFG.BUILDINGS.tech.dmgBoost * b.lvl;
        });
        return mult;
    },

    msg(t, c) {
        const el = $('center-msg');
        if (!el) return;
        el.textContent = t;
        el.style.color = c || '#fff';
        el.classList.add('active');
        clearTimeout(this._msgTimer);
        this._msgTimer = setTimeout(() => {
            el.classList.remove('active');
            el.textContent = '';
        }, 2000);
    },

    over() {
        this.run = false;
        $('score').innerText = `LVL ${this.lvl} - WAVE ${this.wave}`;
        $('over').style.display = 'flex';
        Menu.autoSave?.();
    },
    ui() {
        $('hp').innerText = `HP: ${Math.floor(this.castle.hp)}`;
        $('wave').innerText = `LVL: ${this.lvl} | WAVE: ${this.wave}/${CFG.SYS.maxWaves}`;
        $('money').innerText = `$: ${Math.floor(this.money)}`;
        $('t-points').innerText = `T: ${Math.floor(this.tPoints)}%`;
    },

    loop() {
        requestAnimationFrame(() => this.loop());
        const now = Date.now();
        if (!this.run || Menu.isVisible?.() || Share.isOpen?.()) {
            this.st = now;
            return;
        }

        let dt = (now - this.st) / 1000;
        this.st = now;
        if (dt > 0.1) dt = 0.1;
        dt *= this.gameSpeed || 1;
        if (dt > 0.12) dt = 0.12;

        this.tmr += dt;
        this.wTmr += dt;

        if (this.wTmr > CFG.WAVE.time) {
            this.wave++; this.wTmr = 0; this.ui();
            if (this.sessionMeta?.stats) this.sessionMeta.stats.wavesSurvived = (this.sessionMeta.stats.wavesSurvived || 0) + 1;
            if (this.wave > CFG.SYS.maxWaves) this.nextLvl();
        }

        let rate = Math.max(CFG.SPAWN.minRate, CFG.SPAWN.baseRate - (this.wave * CFG.WAVE.inc.rate) - (this.lvl * CFG.LEVEL.inc.rate));
        if (this.tmr > rate) { this.spawn(); this.tmr = 0; }

        // Update Spatial Grid
        this.spatial.clear();
        if (this.center) {
            for (let e of this.enemies) {
                Vec.tmp1.set(e.pos).subMut(this.center);
                const h = Hex.fromPixelToTmp(Vec.tmp1, CFG.SYS.hexSize);
                const k = Hex.key(h);
                if (!this.spatial.has(k)) this.spatial.set(k, []);
                this.spatial.get(k).push(e);
                e._hexKey = k;
            }
        }

        // Optimized Update & Remove Loop (No new arrays)
        // Enemies
        let i = 0;
        while (i < this.enemies.length) {
            this.enemies[i].up(dt);
            if (this.enemies[i].dead) {
                Pool.recycleUnit(this.enemies[i]);
                this.enemies[i] = this.enemies[this.enemies.length - 1];
                this.enemies.pop();
            } else {
                i++;
            }
        }

        // Projectiles
        i = 0;
        while (i < this.projs.length) {
            this.projs[i].up(dt);
            if (this.projs[i].dead) {
                Pool.recycleProj(this.projs[i]);
                this.projs[i] = this.projs[this.projs.length - 1];
                this.projs.pop();
            } else {
                i++;
            }
        }

        // Buildings
        i = 0;
        while (i < this.builds.length) {
            this.builds[i].up(dt);
            if (this.builds[i].dead) {
                this.builds[i] = this.builds[this.builds.length - 1];
                this.builds.pop();
            } else {
                i++;
            }
        }

        // FX
        i = 0;
        while (i < this.fx.length) {
            this.fx[i].up(dt);
            if (this.fx[i].l <= 0) {
                Pool.recycle(this.fx[i]);
                this.fx[i] = this.fx[this.fx.length - 1];
                this.fx.pop();
            } else {
                i++;
            }
        }

        this.pops.forEach(p => { p.l -= dt; p.p.y -= 10 * dt; });
        this.pops = this.pops.filter(p => p.l > 0);

        if (this.gridCvs) {
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.drawImage(this.gridCvs, 0, 0);
            ctx.restore();
        }

        const cPos = this.castle.pos;
        const cSize = CFG.SYS.hexSize * 1.8;

        // Castle Core
        ctx.beginPath(); ctx.arc(cPos.x, cPos.y, cSize * 0.4, 0, 6.28);
        ctx.fillStyle = (this.castle.hit > 0) ? '#ff0000' : G.getCastleColor();
        ctx.fill();
        if (this.castle.hit > 0) this.castle.hit -= dt;

        // Castle HP Ring
        ctx.beginPath(); ctx.arc(cPos.x, cPos.y, cSize * 0.5, 0, 6.28 * (this.castle.hp / this.castle.max));
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();

        // Optimized Draw Loop (No array creation)
        for (let e of this.builds) e.draw(ctx);
        for (let e of this.enemies) e.draw(ctx);
        for (let e of this.projs) e.draw(ctx);
        for (let e of this.fx) e.draw(ctx);

        for (let p of this.pops) { ctx.globalAlpha = p.l; ctx.fillStyle = p.c; ctx.font = '12px Orbitron'; ctx.fillText(p.t, p.p.x, p.p.y); }
        ctx.globalAlpha = 1;

        if (this.sel) {
            if (G.center) Vec.tmp1.set(this.ms).subMut(G.center);
            else Vec.tmp1.setXY(0, 0);

            const h = Hex.fromPixelToTmp(Vec.tmp1, CFG.SYS.hexSize);
            const k = Hex.key(h);

            if (this.map.has(k)) {
                const tile = this.map.get(k);
                const bData = CFG.BUILDINGS[this.sel];
                let ok = this.money >= bData.cost && tile.type !== 1 && tile.type !== 4 && !(G.castleZoneKeys && G.castleZoneKeys.includes(k));

                const needsNode = (this.sel === 'generator' || this.sel === 'tech');
                if (needsNode && tile.type !== 2) ok = false;
                if (!needsNode && tile.type === 2) ok = false;

                const existing = this.builds.find(b => Hex.key(b.hex) === k);
                if (existing) {
                    if (this.sel === existing.type) ok = true;
                    else ok = false;
                }

                const center = Hex.toPixel(h, CFG.SYS.hexSize).addMut(new Vec(this.w / 2 + this.offX, this.h / 2 + this.offY));
                const s = CFG.SYS.hexSize;

                ctx.beginPath();
                for (let i = 0; i < 6; i++) {
                    const ang = 2 * Math.PI / 6 * i;
                    const vx = center.x + s * Math.cos(ang);
                    const vy = center.y + s * Math.sin(ang);
                    if (i === 0) ctx.moveTo(vx, vy); else ctx.lineTo(vx, vy);
                }
                ctx.closePath();

                if (existing && ok) {
                    ctx.fillStyle = 'rgba(255,255,0,0.3)'; ctx.strokeStyle = '#ffff00';
                } else {
                    ctx.fillStyle = ok ? 'rgba(0,255,0,0.15)' : 'rgba(255,0,0,0.15)';
                    ctx.strokeStyle = ok ? '#03ff03' : '#ff0303';
                }
                ctx.fill(); ctx.lineWidth = 2; ctx.stroke();

                if (ok && bData.range > 0) {
                    ctx.beginPath(); ctx.strokeStyle = 'rgba(255,255,255,0.2)';
                    ctx.arc(center.x, center.y, bData.range * (G.scale || 1), 0, 6.28); ctx.stroke();
                }
            }
        }
    }
};
/* END-MERGE-BLOCK */
