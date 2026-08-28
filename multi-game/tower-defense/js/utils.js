/* MERGE-BLOCK: utils.js */
// --- UTILS ---
const $ = id => document.getElementById(id);
const Rnd = (min, max) => Math.random() * (max - min) + min;

// Axial Hex Coordinates
class Hex {
    constructor(q, r) { this.q = q; this.r = r; }
    static add(a, b) { return new Hex(a.q + b.q, a.r + b.r); }
    static sub(a, b) { return new Hex(a.q - b.q, a.r - b.r); }
    static scale(a, k) { return new Hex(a.q * k, a.r * k); }
    static neighbor(hex, dir) {
        return Hex.add(hex, Hex.DIRS[dir]);
    }
    static dist(a, b) { return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2; }
    static toPixel(hex, size) {
        const x = size * (3 / 2 * hex.q);
        const y = size * (Math.sqrt(3) / 2 * hex.q + Math.sqrt(3) * hex.r);
        return new Vec(x, y);
    }
    static fromPixel(p, size) {
        const q = (2 / 3 * p.x) / size;
        const r = (-1 / 3 * p.x + Math.sqrt(3) / 3 * p.y) / size;
        return Hex.round(q, r);
    }
    static fromPixelToTmp(p, size) {
        const q = (2 / 3 * p.x) / size;
        const r = (-1 / 3 * p.x + Math.sqrt(3) / 3 * p.y) / size;
        return Hex.roundToTmp(q, r);
    }
    static round(q, r) {
        let s = -q - r;
        let rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
        const q_diff = Math.abs(rq - q), r_diff = Math.abs(rr - r), s_diff = Math.abs(rs - s);
        if (q_diff > r_diff && q_diff > s_diff) rq = -rr - rs;
        else if (r_diff > s_diff) rr = -rq - rs;
        return new Hex(rq, rr);
    }
    static roundToTmp(q, r) {
        let s = -q - r;
        let rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
        const q_diff = Math.abs(rq - q), r_diff = Math.abs(rr - r), s_diff = Math.abs(rs - s);
        if (q_diff > r_diff && q_diff > s_diff) rq = -rr - rs;
        else if (r_diff > s_diff) rr = -rq - rs;
        Hex.tmp.q = rq; Hex.tmp.r = rr;
        return Hex.tmp;
    }
    static key(h) { return `${h.q},${h.r}`; }
}
Hex.DIRS = [new Hex(1, 0), new Hex(1, -1), new Hex(0, -1), new Hex(-1, 0), new Hex(-1, 1), new Hex(0, 1)];
Hex.tmp = new Hex(0, 0);

class Vec {
    constructor(x, y) { this.x = x; this.y = y; }
    add(v) { return new Vec(this.x + v.x, this.y + v.y); }
    sub(v) { return new Vec(this.x - v.x, this.y - v.y); }
    mult(s) { return new Vec(this.x * s, this.y * s); }
    mag() { return Math.sqrt(this.x ** 2 + this.y ** 2); }
    magSq() { return this.x ** 2 + this.y ** 2; }
    norm() { const m = this.mag(); return m === 0 ? new Vec(0, 0) : new Vec(this.x / m, this.y / m); }
    dist(v) { return Math.sqrt((this.x - v.x) ** 2 + (this.y - v.y) ** 2); }
    distSq(v) { return (this.x - v.x) ** 2 + (this.y - v.y) ** 2; }
    limit(m) { const ms = this.magSq(); return ms > m * m ? this.norm().mult(m) : this; }

    // Mutable methods to reduce GC
    addMut(v) { this.x += v.x; this.y += v.y; return this; }
    subMut(v) { this.x -= v.x; this.y -= v.y; return this; }
    multMut(s) { this.x *= s; this.y *= s; return this; }
    normMut() { const m = this.mag(); if (m !== 0) { this.x /= m; this.y /= m; } else { this.x = 0; this.y = 0; } return this; }
    limitMut(m) { const ms = this.magSq(); if (ms > m * m) { this.normMut().multMut(m); } return this; }
    copy() { return new Vec(this.x, this.y); }
    set(v) { this.x = v.x; this.y = v.y; return this; }
    setXY(x, y) { this.x = x; this.y = y; return this; }
}
Vec.tmp1 = new Vec(0, 0);
Vec.tmp2 = new Vec(0, 0);
Vec.tmp3 = new Vec(0, 0);
/* END-MERGE-BLOCK */
