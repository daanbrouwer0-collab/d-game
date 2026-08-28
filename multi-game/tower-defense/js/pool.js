/* MERGE-BLOCK: pool.js */
// --- OBJECT POOLING ---
const Pool = {
    particles: [],
    projs: [],
    units: [],
    getPart(x, y, c, s, sz, l) {
        let p = this.particles.pop() || new Particle(x, y, c, s, sz, l);
        p.reset(x, y, c, s, sz, l);
        return p;
    },
    recycle(p) { this.particles.push(p); },

    getProj(x, y, t, type, lvl) {
        let p = this.projs.pop() || new Proj(x, y, t, type, lvl);
        p.reset(x, y, t, type, lvl);
        return p;
    },
    recycleProj(p) { this.projs.push(p); },

    getUnit(type, wave, lvl) {
        let u = this.units.pop() || new Unit(type, wave, lvl);
        u.reset(type, wave, lvl);
        return u;
    },
    recycleUnit(u) { this.units.push(u); }
};
/* END-MERGE-BLOCK */
