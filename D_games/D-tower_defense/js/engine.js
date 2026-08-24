/* MERGE-BLOCK: engine.js */
// --- ENGINE ---
const cvs = $('c');
const ctx = cvs.getContext('2d', { alpha: false });

class Obj {
    constructor(x, y) { this.pos = new Vec(x, y); this.dead = false; }
    up(dt) { } draw(ctx) { }
}

class Particle extends Obj {
    constructor(x, y, c, s, sz, l) {
        super(x, y);
        this.reset(x, y, c, s, sz, l);
    }
    reset(x, y, c, s, sz, l) {
        this.pos.x = x; this.pos.y = y;
        const a = Math.random() * 6.28;
        if (this.vel) this.vel.setXY(Math.cos(a) * s, Math.sin(a) * s);
        else this.vel = new Vec(Math.cos(a) * s, Math.sin(a) * s);
        this.c = c; this.sz = sz; this.l = l; this.ml = l;
    }
    up(dt) {
        Vec.tmp1.set(this.vel).multMut(dt * 60);
        this.pos.addMut(Vec.tmp1);
        this.l -= dt; this.sz *= 0.95;
    }
    draw(ctx) {
        ctx.globalAlpha = Math.max(0, this.l / this.ml);
        ctx.fillStyle = this.c;
        ctx.fillRect(this.pos.x - this.sz, this.pos.y - this.sz, this.sz * 2, this.sz * 2);
        ctx.globalAlpha = 1;
    }
}

class Unit extends Obj {
    constructor(type, wave, level) {
        super(0, 0);
        this.vel = new Vec(0, 0);
        this.acc = new Vec(0, 0);
        this.reset(type, wave, level);
    }

    reset(type, wave, level) {
        this.dead = false;
        const data = CFG.ENEMIES[type];
        Object.assign(this, data);
        this.type = type;

        // Scale stats
        const s = G.scale || 1;
        this.spd *= s;
        this.force *= s;
        this.size *= s;

        // Spawn at edge of hex map
        const bBias = CFG.SPAWN.bottomBias || 1;
        const tBias = CFG.SPAWN.topBias || 1;

        const span = Math.PI * 0.5;
        const wBottom = span * bBias;
        const wTop = span * tBias;
        const wOther = Math.PI;
        const totalW = wBottom + wTop + wOther;

        let rndW = Math.random() * totalW;
        let angle;

        if (rndW < wBottom) {
            angle = (Math.PI * 0.25) + (rndW / wBottom) * span;
        } else if (rndW < wBottom + wTop) {
            let localR = (rndW - wBottom);
            angle = (Math.PI * 1.25) + (localR / wTop) * span;
        } else {
            let localR = (rndW - wBottom - wTop);
            if (localR < wOther / 2) {
                angle = (Math.PI * 0.75) + (localR / (wOther / 2)) * (Math.PI * 0.5);
            } else {
                angle = (Math.PI * 1.75) + ((localR - wOther / 2) / (wOther / 2)) * (Math.PI * 0.5);
            }
        }

        const maxDim = Math.max(CFG.SYS.mapCols, CFG.SYS.mapRows);
        let r = (maxDim / 2 + 2) * CFG.SYS.hexSize * 1.7;

        if (!this.pos) this.pos = new Vec(0, 0);
        this.pos.x = (G.w / 2 + G.offX) + Math.cos(angle) * r;
        this.pos.y = (G.h / 2 + G.offY) + Math.sin(angle) * r;

        // HP Calculation
        const hpMult = 1 + (wave * CFG.WAVE.inc.hp) + (level * CFG.LEVEL.inc.hp);
        this.hp *= hpMult;

        // Speed Calculation
        const spdAdd = (wave * CFG.WAVE.inc.spd) + (level * CFG.LEVEL.inc.spd);
        this.spd += spdAdd;

        // Damage Calculation
        const dmgMult = 1 + (wave * CFG.WAVE.inc.dmg) + (level * CFG.LEVEL.inc.dmg);
        this.dmg *= dmgMult;
        this.castleDmg *= dmgMult;

        if (this.vel) { this.vel.x = 0; this.vel.y = 0; } else this.vel = new Vec(0, 0);
        if (this.acc) { this.acc.x = 0; this.acc.y = 0; } else this.acc = new Vec(0, 0);
        this.atkCd = 0;
        this.slowed = 0;
        this.angle = 0;
    }

    takeDmg(a) {
        this.hp -= a;
        if (this.hp <= 0) {
            this.dead = true;
            G.addMoney(this.val);
            for (let i = 0; i < 3; i++) G.fx.push(Pool.getPart(this.pos.x, this.pos.y, this.color, Rnd(1, 3), 2, 0.4));
        }
    }

    up(dt) {
        this.atkCd -= dt;

        let speed = this.spd;
        let wobble = 15;
        if (this.type === 'tank') wobble = 0;
        if (this.slowed > 0) {
            this.slowed -= dt;
            speed *= 0.5;
            if (this.type !== 'tank') wobble = 100;
        }

        // Attack logic
        let target = null;
        const rangeSq = (this.size + CFG.SYS.hexSize) ** 2;
        for (let b of G.builds) {
            if (this.pos.distSq(b.pos) < rangeSq) { target = b; break; }
        }

        if (target) {
            this.vel.multMut(0);
            if (this.type === 'kamikaze') { this.takeDmg(999); target.takeDmg(CFG.ENEMIES.kamikaze.boom); return; }
            if (this.atkCd <= 0) {
                target.takeDmg(this.dmg);
                this.atkCd = 1.0;
                G.fx.push(Pool.getPart(target.pos.x, target.pos.y, '#fff', 2, 2, 0.2));
            }
            return;
        }

        let goal = G.castle;

        // Pathfinding
        let desired = Vec.tmp1.setXY(0, 0);
        if (this.fly) {
            desired.set(goal.pos).subMut(this.pos).normMut().multMut(speed);
        } else {
            // Flow Field
            if (G.center) Vec.tmp2.set(this.pos).subMut(G.center);
            else Vec.tmp2.setXY(0, 0);

            const h = Hex.fromPixelToTmp(Vec.tmp2, CFG.SYS.hexSize);
            const key = Hex.key(h);
            const flowVec = G.flow[key];

            if (flowVec) {
                desired.set(flowVec).multMut(speed);
            } else {
                desired.set(goal.pos).subMut(this.pos).normMut().multMut(speed);
            }
        }

        // Steering
        desired.subMut(this.vel).limitMut(this.force);
        this.acc.addMut(desired);

        // Separation
        let sum = Vec.tmp2.setXY(0, 0);
        let c = 0;

        if (this._hexKey) {
            const checkList = (list) => {
                if (!list) return;
                for (let o of list) {
                    if (o === this || o.dead) continue;
                    let d = this.pos.distSq(o.pos);
                    if (d > 0 && d < (this.size * 2.5) ** 2) {
                        Vec.tmp3.set(this.pos).subMut(o.pos).normMut();
                        sum.addMut(Vec.tmp3);
                        c++;
                    }
                }
            };

            checkList(G.spatial.get(this._hexKey));

            const parts = this._hexKey.split(',');
            const q = parseInt(parts[0]);
            const r = parseInt(parts[1]);
            const nDiffs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
            for (let d of nDiffs) {
                checkList(G.spatial.get(`${q + d[0]},${r + d[1]}`));
            }
        }

        if (c > 0) {
            sum.multMut(1 / c).normMut().multMut(speed).subMut(this.vel).limitMut(this.force * 1.5);
            this.acc.addMut(sum);
        }

        Vec.tmp3.setXY(Rnd(-wobble, wobble), Rnd(-wobble, wobble));
        this.acc.addMut(Vec.tmp3);

        this.vel.x += this.acc.x * dt;
        this.vel.y += this.acc.y * dt;
        this.vel.limitMut(speed);

        if (this.vel.x !== 0 || this.vel.y !== 0) {
            let target = Math.atan2(this.vel.y, this.vel.x);
            if (this.type === 'tank') {
                let diff = target - this.angle;
                while (diff > Math.PI) diff -= Math.PI * 2;
                while (diff < -Math.PI) diff += Math.PI * 2;
                this.angle += diff * 5 * dt;
            } else {
                this.angle = target;
            }
        }

        this.pos.x += this.vel.x * dt;
        this.pos.y += this.vel.y * dt;
        this.acc.multMut(0);

        if (this.pos.distSq(goal.pos) < (goal.size + this.size) ** 2) {
            this.dead = true;
            goal.takeDmg(this.castleDmg);
        }
    }

    draw(ctx) {
        const sprite = G.sprites[this.type];
        if (sprite) {
            ctx.save();
            ctx.translate(this.pos.x, this.pos.y);
            ctx.rotate(this.angle);
            const w = sprite.width / G.dpr;
            const h = sprite.height / G.dpr;
            ctx.drawImage(sprite, -w / 2, -h / 2, w, h);
            ctx.restore();
        }
    }
}

class Building extends Obj {
    constructor(hex, type) {
        const p = Hex.toPixel(hex, CFG.SYS.hexSize).addMut(new Vec(G.w / 2 + G.offX, G.h / 2 + G.offY));
        super(p.x, p.y);
        Object.assign(this, CFG.BUILDINGS[type]);
        this.type = type;
        this.hex = hex;
        this.maxHp = this.hp;
        this.cdTimer = 0;
        this.lvl = 1;
        this.size = 12 * (G.scale || 1);
        this.range *= (G.scale || 1);
        if (this.splash) this.splash *= (G.scale || 1);
    }

    upgrade() {
        this.lvl++;
        if (this.type === 'turret') {
            const increase = CFG.BUILDINGS[this.type].hp * 0.5;
            this.maxHp += increase;
            this.hp += increase;
        } else {
            this.maxHp *= CFG.UPGRADE.hpMult;
            this.hp *= CFG.UPGRADE.hpMult;
        }
        if (this.hp > this.maxHp) this.hp = this.maxHp;

        this.dmg *= CFG.UPGRADE.dmgMult;
        this.range *= CFG.UPGRADE.rangeMult;
        this.cd *= CFG.UPGRADE.cdMult;
        G.addMoney(-Math.floor(this.cost * CFG.UPGRADE.costMult * this.lvl));
        for (let i = 0; i < 10; i++) G.fx.push(Pool.getPart(this.pos.x, this.pos.y, '#fff', Rnd(2, 5), 3, 0.5));
    }

    takeDmg(a) {
        this.hp -= a;
        if (this.hp <= 0) {
            this.dead = true;
            for (let i = 0; i < 5; i++) G.fx.push(Pool.getPart(this.pos.x, this.pos.y, this.color, Rnd(1, 3), 3, 0.4));
        }
    }

    up(dt) {
        this.cdTimer -= dt;

        if (this.type === 'tech' && this.cdTimer <= 0) {
            G.addTPoints(this.amt);
            this.cdTimer = this.cd;
            G.pops.push({ p: new Vec(this.pos.x, this.pos.y - 20), t: 'T+' + this.amt, l: 1, c: '#fff' });
            return;
        }

        if (this.type === 'heal' && this.cdTimer <= 0) {
            let healed = false;
            const rangeSq = this.range ** 2;
            for (let b of G.builds) {
                if (b === this) continue;
                if (b.type === 'heal') continue; // Cannot heal other heal buildings
                if (this.pos.distSq(b.pos) < rangeSq && b.hp < b.maxHp) {
                    b.hp = Math.min(b.maxHp, b.hp + this.amt);
                    healed = true;
                    G.fx.push(Pool.getPart(b.pos.x, b.pos.y, '#00ffaa', 2, 2, 0.5));
                }
            }
            if (healed) this.cdTimer = this.cd;
            return;
        }

        if (this.type === 'jam') {
            const rangeSq = this.range ** 2;
            for (let e of G.enemies) {
                if (e.type !== 'tank' && this.pos.distSq(e.pos) < rangeSq) {
                    e.slowed = 0.1;
                }
            }
            return;
        }

        if (this.cdTimer > 0) return;

        if (this.type === 'generator') {
            G.addMoney(this.amt * this.lvl);
            this.cdTimer = this.cd;
            G.pops.push({ p: new Vec(this.pos.x, this.pos.y - 20), t: '+' + Math.floor(this.amt * this.lvl), l: 1, c: CFG.COLORS.s });
            return;
        }

        let t = null, min = this.range ** 2;
        for (let e of G.enemies) {
            let d = this.pos.distSq(e.pos);
            if (d < min) {
                if (this.type === 'sniper') { if (!t || e.hp > t.hp) t = e; }
                else { min = d; t = e; }
            }
        }

        if (t) {
            G.projs.push(Pool.getProj(this.pos.x, this.pos.y, t, this.type, this.lvl));
            this.cdTimer = this.cd;
        }
    }

    draw(ctx) {
        const s = CFG.SYS.hexSize;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const ang = 2 * Math.PI / 6 * i;
            const x = this.pos.x + s * Math.cos(ang);
            const y = this.pos.y + s * Math.sin(ang);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fill();
        ctx.strokeStyle = this.color; ctx.lineWidth = 2; ctx.stroke();

        ctx.fillStyle = this.color;

        // Scale size based on level (slightly larger per level)
        const lvlScale = 1 + (this.lvl - 1) * 0.3;

        if (this.type === 'turret') {
            const sz = 8 * lvlScale;
            ctx.fillRect(this.pos.x - sz / 2, this.pos.y - sz / 2, sz, sz);
        }
        else if (this.type === 'sniper') {
            ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, 4 * lvlScale, 0, 6.28); ctx.fill();
        }
        else if (this.type === 'wall') {
            ctx.beginPath(); ctx.arc(this.pos.x, this.pos.y, 4 * lvlScale, 0, 6.28); ctx.fill();
        }
        else if (this.type === 'generator') {
            ctx.font = `${10 * lvlScale}px Orbitron`;
            ctx.fillText('$', this.pos.x - 3, this.pos.y + 3);
            ctx.font = '10px Orbitron'; // Reset font
        }
        else if (this.type === 'tech') {
            ctx.font = `${10 * lvlScale}px Orbitron`;
            ctx.fillText('T', this.pos.x - 3, this.pos.y + 3);
            ctx.font = '10px Orbitron';
        }
        else if (this.type === 'heal') {
            ctx.font = `${10 * lvlScale}px Orbitron`;
            ctx.fillText('+', this.pos.x - 3, this.pos.y + 3);
            ctx.font = '10px Orbitron';
        }

        if (this.hp < this.maxHp) {
            ctx.fillStyle = 'red';
            const w = 20 * (G.scale || 1);
            const h = 4 * (G.scale || 1);
            const hpW = w * (this.hp / this.maxHp);
            ctx.fillRect(this.pos.x - w / 2, this.pos.y - h / 2, hpW, h);
        }
    }
}

class Proj extends Obj {
    constructor(x, y, t, type, lvl) {
        super(x, y);
        this.reset(x, y, t, type, lvl);
    }
    reset(x, y, t, type, lvl) {
        this.pos.x = x; this.pos.y = y; this.dead = false;
        this.t = t; this.type = type;
        let spd = CFG.PROJ.baseSpeed;
        if (type === 'sniper' || type === 'wall') spd *= CFG.PROJ.sniperMult;
        this.spd = spd * (G.scale || 1);
        this.c = CFG.BUILDINGS[type].color;
        this.dmg = CFG.BUILDINGS[type].dmg * (1 + (lvl - 1) * 0.2) * G.getDmgMult();
        this.lvl = lvl;
    }
    up(dt) {
        const w = cvs.width / G.dpr, h = cvs.height / G.dpr;
        if (this.pos.x < -100 || this.pos.x > w + 100 || this.pos.y < -100 || this.pos.y > h + 100) this.dead = true;

        if (this.t && !this.t.dead) {
            Vec.tmp1.set(this.t.pos).subMut(this.pos).normMut();
            this.pos.addMut(Vec.tmp1.multMut(this.spd * dt));
            if (this.pos.distSq(this.t.pos) < 225) {
                this.dead = true;
                const d = this.dmg;
                if (this.type === 'wall') {
                    const splashSq = (CFG.BUILDINGS.wall.splash * (G.scale || 1)) ** 2;
                    for (let e of G.enemies) if (e.pos.distSq(this.pos) < splashSq) e.takeDmg(d);
                } else this.t.takeDmg(d);
            }
        } else this.dead = true;
    }
    draw(ctx) {
        ctx.fillStyle = this.c;
        const s = 3 + this.lvl;
        ctx.fillRect(this.pos.x - s, this.pos.y - s, s * 2, s * 2);
    }
}
/* END-MERGE-BLOCK */
