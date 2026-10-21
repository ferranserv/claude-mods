// @ts-nocheck
// Clawd, drawn by code on his 12 x 8 cell grid (a cell is 2 x 2 pixels, the canvas 34 x 28, shown at 2x).
// Ported from the drawing sheet (docs/mascot/clawd-sheet.html). The drawing code is loose on purpose (it is
// a long list of pixel rectangles); what keeps it honest is cockpit.test.ts: every state must render, no pixel
// may fall outside the canvas, and every state must fit the Svg size limit.
// The character belongs to Anthropic: personal use only (docs/MASCOT.md).

const ART = ['..########..', '..#O####O#..', '############', '############', '..########..', '..########..', '..#.#..#.#..', '..#.#..#.#..'];
const PAL = {
  c: '#DA7758', k: '#b5593d', f: '#f0a07c', e: '#0b0705', w: '#ffffff', L: '#9aa1aa', M: '#6b727c', g: '#8a8f98', d: '#2b2f38',
  s: '#ffd24a', y: '#ffd24a', b: '#e6b52e', B: '#a37716', q: '#4aa8f2', Q: '#a9dcff', z: '#7a96ec', h: '#e0526c', r: '#ef5a3c', i: '#bfe6ff',
  n: '#5b3fa0', N: '#3d2a7a', p: '#f7a8c4', P: '#d9487e', l: '#7ddc6a', G: '#2f9e44', t: '#d9c8a0', T: '#b89860', u: '#4f7cff', U: '#9db8ff', v: '#cfd6e0',
  x: '#8d5b34', X: '#5f3a1e', a: '#8dff6a', m: '#3b2f6b', o: '#e8e2c8', O: '#b9b295', j: '#46b0e8', J: '#2b7fb8', K: '#f4d79a', E: '#f2c230', D: '#c99a10'
};
const W0 = 34, H0 = 28, OX = 5, OY = 8;
const PAT = {
  STAR: ['..#..', '..#..', '#####', '..#..', '..#..'],
  Z: ['###', '..#', '.#.', '#..', '###'],
  HEART: ['.#.#.', '#####', '#####', '.###.', '..#..'],
  BANG: ['#', '#', '#', '#', '.', '#'],
  FLAKE: ['#.#.#', '.###.', '#####', '.###.', '#.#.#'],
  FLAME: [['...#...', '..##...', '..###..', '.#####.', '.#####.', '#######', '#######'], ['..#....', '..###..', '.####..', '.#####.', '#######', '#######', '#######'], ['....#..', '...##..', '..###..', '.#####.', '#######', '#######', '#######']],
  NOTE: [['.#', '.#', '.#', '##', '##'], ['.##', '.#.', '.#.', '##.', '##.']],
  BULB: ['.###.', '#####', '#####', '#####', '.###.'],
  COIN: ['.###.', '#sss#', '#s#s#', '#sss#', '.###.'],
  SPIRAL: ['#######', '#.....#', '#.###.#', '#.#.#.#', '#.#...#', '#.#####', '#......'],
  SPIRAL2: ['#######', '#.....#', '#.###.#', '#.#.#.#', '#...#.#', '#####.#', '......#'],
  BOLT: ['..##', '.##.', '###.', '.##.', '.#..'],
  CHECK: ['......#', '.....#.', '#...#..', '.#.#...', '..#....'],
  HAND: ['.##.', '####', '####', '.##.'],
  DIG: { 0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'], 2: ['###', '..#', '###', '#..', '###'], 3: ['###', '..#', '###', '..#', '###'], 4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '###', '..#', '###'], 6: ['###', '#..', '###', '#.#', '###'], 7: ['###', '..#', '..#', '..#', '..#'], 8: ['###', '#.#', '###', '#.#', '###'], 9: ['###', '#.#', '###', '..#', '###'], ':': ['.', '#', '.', '#', '.'], '-': ['...', '...', '###', '...', '...'] }
};
// Small versions of what he wears or holds, shown in his hand while a prop is taken away or fetched.
const MINI = {
  shades: ['ddddd', '.d.d.'], glasses: ['nnnnn', 'n.n.n'], laptop: ['LLLLL', 'LdddL', 'LLLLL'],
  book: ['XXXXX', 'XoooX', 'XXXXX'], stack: ['hhhhh', 'lllll', 'uuuuu'], scroll: ['ooooo', 'OOOOO', 'ooooo'], clipboard: ['.gg.', 'KKKK', 'KwwK', 'KwwK'],
  cup: ['www', 'w.w', 'www'], flask: ['.q.', 'qqq', 'qqq'], bell: ['.bb.', 'bbbb', '.bb.'], paper: ['wwww', 'wOOw', 'wwww'], bulb: ['.s.', 'sss', '.s.'],
  'hat-hard': ['.EEE.', 'EEEEE'], 'hat-fedora': ['.XXX.', 'XXXXX'], 'hat-wizard': ['..n..', '.nnn.', 'NNNNN'],
  wrench: ['ggg', '.x.', '.x.'], wand: ['..s', '.w.', 'w..'], glass: ['ggg', 'gig', 'ggg', '..X'], browser: ['GGGG', 'ybbb', 'ybbb'],
  thing: ['ggg', 'ggg'],
};
const SPIN = [[0, -3], [2, -2], [3, 0], [2, 2], [0, 3], [-2, 2], [-3, 0], [-2, -2]];


function kit(W, H) {
  const g = Array.from({ length: H }, () => Array(W).fill(null));
  const oob = [];
  const set = (x, y, c) => { if (x >= 0 && x < W && y >= 0 && y < H) g[y][x] = c; else if (c) oob.push([x, y]); };
  const fill = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(x + i, y + j, c); };
  const stamp = (pat, x0, y0, c) => pat.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.' && ch !== ' ') set(x0 + i, y0 + j, ch === '#' ? c : ch); }));
  return { W, H, g, oob, set, fill, stamp };
}

function clawd(o) {
  const OYv = OY - (o.lift || 0);   // lift raises the whole figure, legs too (asleep: the alarm clock goes under him)
  const W = o.w || W0, H = H0, k = kit(W, H), { set, fill, stamp } = k;
  const by = o.dy || 0, X = OX + (o.dx || 0), Y = OYv + by, F = OYv + 16;   // F = floor row under the feet
  const px = (pat, x, y, c) => stamp(pat, x, y, c);
  // ---- scenery behind him
  if (o.beach !== undefined) {
    const w = o.beach;
    for (let y = 9; y < F; y++) fill(y < 13 ? 4 : y < 18 ? 3 : 2, y, 3, 1, y % 3 === 0 ? 'X' : 'x');   // curved trunk
    const frond = (pts) => { for (let i = 0; i < pts.length - 1; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); for (let t = 0; t <= n; t++) { const x = Math.round(x0 + ((x1 - x0) * t) / n), y = Math.round(y0 + ((y1 - y0) * t) / n); fill(x, y, 2, 2, 'G'); if ((x + y) % 2 === 0) set(x, y, 'l'); } } };
    frond([[4, 7], [3, 5], [1, 4], [0, 5], [0, 8]]);
    frond([[5, 6], [5, 3], [7, 1], [10, 1]]);
    frond([[6, 7], [9, 5], [12, 5], [13, 8]]);
    frond([[3, 8], [1, 10], [0, 13]]);
    frond([[6, 8], [9, 10], [10, 13]]);
    fill(4, 8, 3, 2, 'X');   // coconuts
    fill(X + 21, 1, 5, 5, 's'); if (w % 2) { set(X + 20, 3, 's'); set(X + 26, 3, 's'); set(X + 23, 0, 's'); set(X + 23, 6, 's'); }
  }
  if (o.spinner !== undefined) { const cx = X + 12, cy = Y - 5, t = o.spinner; SPIN.forEach(([dx, dy], i) => { const a = (i - t + 8) % 8; set(cx + dx, cy + dy, a === 0 ? 'u' : a === 1 ? 'u' : a === 2 ? 'U' : a < 5 ? 'v' : null); }); }
  // ---- body from the canonical grid
  ART.forEach((row, cy) => [...row].forEach((ch, cx) => {
    if (ch === '.') return;
    if (cy >= 6) { if (o.noLegs) return; if (o.legsUp?.includes(cx) && cy === 7) return; fill(OX + cx * 2, OYv + cy * 2, 2, 2, 'c'); }
    else fill(X + cx * 2, Y + cy * 2, 2, 2, 'c');
  }));
  const clearArm = (side) => { const x0 = side === 'L' ? X : X + 20; for (let j = 4; j < 8; j++) for (let i = 0; i < 4; i++) set(x0 + i, Y + j, null); return x0; };
  const arm = (side, kind) => {
    if (!kind || kind === 'rest') return;
    const x0 = clearArm(side), put = (dx, dy, w, h, c) => fill(side === 'L' ? x0 + dx : x0 + 4 - dx - w, Y + dy, w, h, c);
    if (kind === 'up') { put(0, 0, 4, 4, 'c'); put(0, 3, 4, 1, 'k'); }
    if (kind === 'high') { put(0, -3, 4, 4, 'c'); put(0, 0, 3, 5, 'c'); put(0, 3, 3, 1, 'k'); }
    if (kind === 'half') { put(0, 2, 4, 4, 'c'); put(0, 5, 4, 1, 'k'); }
    if (kind === 'out') { put(-2, 4, 6, 3, 'c'); put(-2, 6, 6, 1, 'k'); }
    if (kind === 'type0') { put(1, 8, 4, 2, 'f'); put(0, 4, 3, 4, 'c'); }
    if (kind === 'type1') { put(1, 7, 4, 2, 'f'); put(0, 4, 3, 3, 'c'); }
    if (kind === 'cross') { put(3, 5, 8, 3, 'c'); put(3, 7, 8, 1, 'k'); put(10, 5, 3, 3, 'f'); }
    if (kind === 'chin') { put(3, 5, 6, 3, 'c'); put(3, 7, 6, 1, 'k'); put(8, 4, 3, 3, 'f'); }
    if (kind === 'hold') { put(0, 4, 4, 4, 'c'); put(0, 7, 4, 1, 'k'); put(1, 6, 3, 2, 'f'); }
  };
  arm('L', o.armL); arm('R', o.armR);
  fill(X + 4, Y + 10, 16, 2, 'c'); fill(X + 4, Y + 11, 16, 1, 'k');
  // ---- eyes
  const eye = (ex, kind, mirror) => {
    const ey = Y + 2, sx = o.look === 'right' ? 1 : o.look === 'left' ? -1 : 0, sy = o.look === 'up' ? -1 : o.look === 'down' ? 1 : 0;
    const x = ex + sx, y = ey + sy;
    if (kind === 'open') fill(x, y, 2, 2, 'e');
    if (kind === 'wide') fill(x, y - 1, 2, 3, 'e');
    if (kind === 'blink') fill(x, y + 1, 2, 1, 'e');
    if (kind === 'half') { fill(x, y + 1, 2, 1, 'e'); fill(x, y, 2, 1, 'k'); }
    if (kind === 'happy') { set(x - 1, y + 1, 'e'); set(x, y, 'e'); set(x + 1, y, 'e'); set(x + 2, y + 1, 'e'); }
    if (kind === 'angry') { fill(x, y, 2, 2, 'e'); if (!mirror) { set(x - 1, y - 2, 'e'); set(x, y - 1, 'e'); set(x + 1, y - 1, 'e'); } else { set(x + 2, y - 2, 'e'); set(x + 1, y - 1, 'e'); set(x, y - 1, 'e'); } }
    if (kind === 'x') { [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]].forEach(([a, b]) => set(x + a, y + b, 'e')); }
    if (kind === 'dizzy') { [[0, -1], [-1, 0], [0, 0], [1, 0], [0, 1]].forEach(([a, b]) => set(x + a, y + b, 'e')); }
    if (kind === 'sad') { fill(x, y, 2, 2, 'e'); set(x + (mirror ? 2 : -1), y - 1, 'e'); }
    if (kind === 'mask') { /* drawn as a prop */ }
  };
  const ek = o.eyes || 'open';
  eye(X + 6, o.eyeL || ek, false); eye(X + 16, o.eyeR || ek, true);
  if (o.blush) { fill(X + 4, Y + 5, 3, 1, 'p'); fill(X + 17, Y + 5, 3, 1, 'p'); }
  // little white mouth (the shape seen on the reference sheet)
  const mc = X + 10, my = Y + 5;
  if (o.mouth === 'smile') { fill(mc, my, 4, 1, 'w'); set(mc - 1, my - 1, 'w'); set(mc + 4, my - 1, 'w'); }
  if (o.mouth === 'open') { fill(mc, my - 1, 4, 3, 'w'); fill(mc + 1, my + 1, 2, 1, 'h'); }
  if (o.mouth === 'o') fill(mc + 1, my - 1, 2, 2, 'k');
  if (o.mouth === 'yawn') { fill(mc, my - 2, 4, 5, 'k'); fill(mc + 1, my + 1, 2, 1, 'h'); }
  if (o.mouth === 'flat') fill(mc + 1, my, 2, 1, 'w');
  if (o.mouth === 'grim') { fill(mc, my, 4, 1, 'w'); set(mc - 1, my + 1, 'w'); set(mc + 4, my + 1, 'w'); }
  // a curled moustache between the eyes and the mouth (the painter)
  if (o.stache) { fill(X + 8, Y + 4, 8, 1, 'X'); fill(X + 9, Y + 3, 6, 1, 'X'); set(X + 7, Y + 5, 'X'); set(X + 6, Y + 4, 'X'); set(X + 6, Y + 3, 'X'); set(X + 16, Y + 5, 'X'); set(X + 17, Y + 4, 'X'); set(X + 17, Y + 3, 'X'); }
  // ---- face props
  if (o.shades) { fill(X + 5, Y + 2, 5, 3, 'd'); fill(X + 14, Y + 2, 5, 3, 'd'); fill(X + 10, Y + 2, 4, 1, 'd'); set(X + 6, Y + 2, 'w'); set(X + 15, Y + 2, 'w'); }
  if (o.glasses) { for (const gx of [X + 4, X + 14]) { fill(gx, Y + 1, 6, 1, 'n'); fill(gx, Y + 5, 6, 1, 'n'); fill(gx, Y + 1, 1, 5, 'n'); fill(gx + 5, Y + 1, 1, 5, 'n'); } fill(X + 10, Y + 3, 4, 1, 'n'); }
  if (o.mask) { fill(X + 3, Y + 1, 18, 5, 'm'); fill(X + 2, Y + 3, 1, 1, 'm'); fill(X + 21, Y + 3, 1, 1, 'm'); fill(X + 5, Y + 4, 4, 1, 'z'); fill(X + 15, Y + 4, 4, 1, 'z'); }
  if (o.forehead !== undefined) { const t = o.forehead; [X + 8, X + 12, X + 17].forEach((x, i) => { const yy = Y + ((t + i) % 2); set(x, yy, 'q'); if ((t + i) % 2 === 0) set(x + 1, yy, 'Q'); }); }
  // ---- hats
  if (o.hat === 'hard') { fill(X + 4, Y - 3, 16, 3, 'E'); fill(X + 7, Y - 4, 10, 1, 'E'); fill(X + 2, Y, 20, 1, 'D'); fill(X + 11, Y - 4, 2, 4, 'D'); }
  if (o.hat === 'fedora') { fill(X + 6, Y - 4, 12, 4, 'X'); fill(X + 6, Y - 1, 12, 1, 'B'); fill(X + 2, Y, 20, 1, 'X'); set(X + 7, Y - 5, 'X'); fill(X + 8, Y - 5, 8, 1, 'X'); }
  if (o.hat === 'wizard') { fill(X + 3, Y, 18, 1, 'N'); fill(X + 6, Y - 1, 12, 1, 'n'); fill(X + 7, Y - 2, 10, 1, 'n'); fill(X + 8, Y - 3, 8, 1, 'n'); fill(X + 9, Y - 4, 6, 1, 'n'); fill(X + 10, Y - 5, 4, 1, 'n'); fill(X + 11, Y - 6, 3, 1, 'n'); fill(X + 12, Y - 7, 2, 1, 'n'); set(X + 14, Y - 7, 'n'); set(X + 15, Y - 6, 'n'); set(X + 9, Y - 2, 's'); set(X + 13, Y - 4, 's'); set(X + 11, Y - 1, 's'); fill(X + 6, Y - 1, 12, 1, 'N'); }
  if (o.hat === 'beret') { fill(X + 4, Y - 2, 15, 2, 'P'); fill(X + 6, Y - 3, 11, 1, 'P'); fill(X + 8, Y - 4, 7, 1, 'P'); fill(X + 11, Y - 5, 2, 1, 'N'); fill(X + 4, Y, 17, 1, 'h'); }
  // ---- hand props
  if (o.coat) {
    if (!o.armL || o.armL === 'rest') fill(X, Y + 4, 4, 4, 'w'); if (!o.armR || o.armR === 'rest') fill(X + 20, Y + 4, 4, 4, 'w'); fill(X + 4, Y + 4, 16, 8, 'w'); fill(X + 4, Y + 11, 16, 1, 'v');
    fill(X + 10, Y + 4, 4, 1, 'c'); fill(X + 11, Y + 5, 2, 3, 'c'); fill(X + 9, Y + 4, 1, 2, 'v'); fill(X + 14, Y + 4, 1, 2, 'v');
    fill(X + 5, Y + 8, 3, 2, 'v'); fill(X + 16, Y + 8, 3, 2, 'v'); fill(X + 12, Y + 8, 1, 3, 'v'); set(X + 11, Y + 9, 'g'); set(X + 11, Y + 6, 'g');
  }
  if (o.flask) { const t = o.flask, one = (fx, fy, liquid) => { fill(fx + 2, fy, 3, 3, 'i'); fill(fx + 1, fy + 3, 5, 1, 'i'); fill(fx, fy + 4, 7, 3, 'i'); fill(fx + 1, fy + 5, 5, 3, liquid); fill(fx + 2, fy + 8, 3, 1, liquid); fill(fx + 1, fy + 3, 1, 4, 'v'); set(fx + 3 - (t % 2), fy - 1 - t % 3, liquid); set(fx + 4, fy - 3 + (t % 2), liquid); set(fx + 2, fy + 5, 'w'); set(fx + 4, fy + 6, 'w'); }; one(X + 22, Y - 3, 'l'); one(X - 5, Y - 3, 'h'); }
  if (o.tubes) { const tx = X - 4; for (let i = 0; i < 3; i++) { fill(tx + i * 3, Y + 6, 2, 7, 'i'); fill(tx + i * 3, Y + 9 - (i % 2), 2, 4 + (i % 2), ['q', 'h', 'y'][i]); } fill(tx - 1, Y + 13, 9, 1, 'X'); }
  if (o.laptop) { fill(X + 3, OYv + 11, 18, 8, 'L'); fill(X + 3, OYv + 11, 18, 1, 'M'); fill(X + 11, OYv + 14, 2, 2, 'M'); }
  if (o.canvas !== undefined) {   // a painting in front of him, coming together: sky, hill, sun, a flower (0 to 3)
    const cx = X + 3, cy = OYv + 10, p = o.canvas;
    fill(cx, cy, 18, 9, 'X'); fill(cx + 1, cy + 1, 16, 7, 'o');
    if (p >= 1) fill(cx + 1, cy + 1, 16, 3, 'q');
    if (p >= 2) { fill(cx + 1, cy + 5, 9, 3, 'l'); fill(cx + 1, cy + 4, 5, 1, 'l'); }
    if (p >= 3) { fill(cx + 12, cy + 2, 3, 3, 's'); set(cx + 8, cy + 5, 'h'); set(cx + 8, cy + 4, 'G'); }
  }
  if (o.brush !== undefined) {   // the brush from his raised hand to a stroke on the canvas
    const tips = [[X + 6, OYv + 12], [X + 10, OYv + 13], [X + 14, OYv + 12], [X + 16, OYv + 14], [X + 8, OYv + 15]], [tx, ty] = tips[o.brush % tips.length], hx = X + 21, hy = Y + 6;
    const n = Math.max(Math.abs(tx - hx), Math.abs(ty - hy));
    for (let i = 0; i <= n; i++) set(Math.round(hx + ((tx - hx) * i) / n), Math.round(hy + ((ty - hy) * i) / n), i >= n - 1 ? ['h', 'q', 'l', 's', 'P'][o.brush % 5] : 'x');
  }
  if (o.bell !== undefined) {
    const s2 = o.bell, bx = X + 23 + s2;
    set(bx, Y + 4, 'B'); fill(bx - 1, Y + 5, 3, 1, 'b'); fill(bx - 2, Y + 6, 5, 1, 'b'); fill(bx - 3, Y + 7, 7, 2, 'b'); fill(bx - 4, Y + 9, 9, 1, 'b'); fill(bx - 4, Y + 10, 9, 1, 'B'); fill(bx - 1, Y + 11, 3, 2, 'B');
    set(bx - 1, Y + 6, 'w'); set(bx - 2, Y + 7, 'w'); set(bx - 2, Y + 8, 'w');
    if (s2 > 0) { set(bx - 7, Y + 7, 's'); set(bx - 8, Y + 8, 's'); } if (s2 < 0) { set(bx + 6, Y + 7, 's'); set(bx + 6, Y + 8, 's'); }
  }
  if (o.notes !== undefined) { const t = o.notes; px(PAT.NOTE[0], X + 26, Y - 6 + (t % 3) * 2, 'z'); px(PAT.NOTE[1], X - 3, Y - 6 + ((t + 1) % 3) * 2, 'h'); px(PAT.NOTE[0], X + 6, Y - 7 + ((t + 2) % 3) * 2, 'u'); }
  if (o.bottle) { const bx = X + 22 + (o.bottle > 1 ? 1 : 0), by2 = Y - 1; fill(bx + 1, by2, 2, 3, 'G'); fill(bx, by2 + 3, 4, 8, 'G'); fill(bx + 1, by2 + 6, 2, 3, 'K'); set(bx + 1, by2 + 4, 'l'); fill(bx + 1, by2 - 1, 2, 1, 'X'); }
  if (o.bubbles !== undefined) { const t = o.bubbles; [[X + 20, Y - 2 - (t % 3) * 2], [X + 23, Y - 3 - ((t + 1) % 3) * 2], [X + 18, Y - 4 - ((t + 2) % 3) * 2]].forEach(([x, y], i) => { set(x, y, 'v'); if (i === 0) set(x + 1, y, 'v'); }); }
  if (o.hourglass) {
    const hx = X + 20, hy = Y + 4, up = [7, 7, 5, 3, 1], sd = o.sand || 0;
    fill(hx, hy, 9, 2, 'X'); fill(hx, hy + 14, 9, 2, 'X');
    up.forEach((w, r) => { fill(hx + 1 + (7 - w) / 2, hy + 2 + r, w, 1, 'i'); fill(hx + 1 + (7 - w) / 2, hy + 11 + (4 - r), w, 1, 'i'); });
    fill(hx + 1, hy + 2, 1, 2, 'v'); fill(hx + 7, hy + 2, 1, 2, 'v'); fill(hx + 1, hy + 12, 1, 2, 'v'); fill(hx + 7, hy + 12, 1, 2, 'v');
    const top = [[0, 7], [1, 7], [2, 5], [3, 3]], lo = [[3, 3], [4, 5], [4, 7]];
    top.forEach(([r, w]) => { if (r >= sd) fill(hx + 1 + (7 - w) / 2, hy + 2 + r, w, 1, 'y'); });
    set(hx + 4, hy + 6, 'y'); set(hx + 4, hy + 7, 'y'); set(hx + 4, hy + 8, 'y');
    [[1, 3], [2, 5], [3, 7], [4, 7]].forEach(([r, w]) => { if (r >= 4 - sd) fill(hx + 1 + (7 - w) / 2, hy + 9 + r, w, 1, 'y'); });
  }
  if (o.handkerchief !== undefined) {
    const t = o.handkerchief, hx = X + 5 + t * 5;
    fill(hx, Y, 6, 2, 'w'); set(hx + 2, Y + 1, 'v'); set(hx + 4, Y, 'v'); fill(hx - 2, Y, 2, 2, 'f');
  }
  if (o.magnifier) {
    const mx = X + 22, my2 = Y - 3;
    fill(mx + 1, my2, 5, 1, 'g'); fill(mx + 1, my2 + 6, 5, 1, 'g'); fill(mx, my2 + 1, 1, 5, 'g'); fill(mx + 6, my2 + 1, 1, 5, 'g'); fill(mx + 1, my2 + 1, 5, 5, 'i');
    set(mx + 2, my2 + 2, 'w'); set(mx + 3, my2 + 2, 'w'); set(mx + 2, my2 + 3, 'w');
    for (let i = 0; i < 4; i++) fill(mx + 1 - i, my2 + 7 + i, 2, 1, 'X');
  }
  if (o.wand) { for (let i = 0; i < 7; i++) fill(X + 21 + i, Y + 5 - i, 2, 1, i < 6 ? 'w' : 'w'); px(PAT.STAR, X + 24, Y - 7, 's'); }
  if (o.cup) { const cx = X + 21, cy = Y + 4; fill(cx, cy, 6, 7, 'w'); fill(cx + 1, cy, 4, 1, 'X'); fill(cx, cy + 2, 6, 3, 'G'); fill(cx + 6, cy + 2, 1, 3, 'w'); const t = o.cup; set(cx + 1, cy - 3 - (t % 2), 'v'); set(cx + 3, cy - 4 + (t % 2), 'v'); set(cx + 4, cy - 2, 'v'); }
  if (o.drink) { const dx = X + 21, dy2 = Y + 3 - (o.drink - 1) * 2; fill(dx, dy2 + 3, 5, 6, 'P'); fill(dx + 1, dy2 + 4, 3, 4, 'p'); fill(dx, dy2 + 3, 5, 1, 'v'); fill(dx + 3, dy2, 1, 4, 'w'); set(dx + 4, dy2, 'w'); fill(dx - 1, dy2 + 2, 3, 1, 'h'); set(dx, dy2 + 1, 'h'); }
  if (o.clipboard) {
    const t = o.clipboard - 1, bx = X + 5, by = Y + 8
    fill(bx, by, 14, 10, 'x'); fill(bx + 1, by + 1, 12, 8, 'w'); fill(bx + 4, by - 1, 6, 2, 'g'); set(bx + 6, by - 2, 'g'); set(bx + 7, by - 2, 'g')
    for (const [i, yy] of [[0, 2], [1, 4], [2, 6]]) { fill(bx + 2, by + yy, 2, 2, 'g'); fill(bx + 5, by + yy, 6 - (i % 2) * 2, 1, 'O'); if (i < t) { set(bx + 2, by + yy + 1, 'G'); set(bx + 3, by + yy, 'G'); } }
    const px0 = X + 21 - (t % 2), py0 = Y + 12 - t
    for (let i = 0; i < 6; i++) fill(px0 + i, py0 - i, 2, 1, i === 0 ? 'd' : i === 5 ? 'h' : 'y')
  }
  if (o.paper) {
    const n = o.paper, bx = X + 4, by = Y + 8
    fill(bx, by, 16, 10, 'o'); fill(bx, by + 9, 16, 1, 'O')
    for (let i = 0; i < 4; i++) fill(bx + 2, by + 2 + i * 2, i < n ? 4 + ((i * 3) % 7) + (i === n - 1 ? 2 : 0) : 0, 1, 'O')
    const qx = X + 12 + (o.paper % 2), qy = Y + 1
    stamp(['......ww', '.....www', '....wwwK', '...wwwK.', '..wwKK..', '.wKK....', 'XX......'], qx, qy, 'w')
  }
  if (o.scroll) { fill(X + 3, Y + 8, 18, 9, 'o'); fill(X + 3, Y + 16, 18, 1, 'O'); for (const [yy, ww] of [[10, 12], [12, 14], [14, 9]]) fill(X + 5, Y + yy, ww, 1, 'O'); fill(X + 2, Y + 7, 20, 1, 'O'); }
  if (o.book) {   // an open book held in front of him: brown cover, two pages, a spine, lines of text; 2 and 3 turn a page
    const bx = X + 2, by = Y + 8, st = o.book;
    fill(bx, by, 20, 10, 'X'); fill(bx + 1, by + 1, 9, 8, 'o'); fill(bx + 11, by + 1, 9, 8, 'o');
    for (const yy of [2, 4, 6]) { fill(bx + 2, by + yy, 6, 1, 'O'); if (st !== 2) fill(bx + 13, by + yy, 6, 1, 'O'); }
    if (st === 2) { fill(bx + 9, by - 2, 2, 9, 'o'); fill(bx + 8, by - 2, 1, 9, 'O'); fill(bx + 11, by + 1, 9, 8, 'O'); }   // the page stands up on the spine, the page under it is bare
    if (st === 3) { fill(bx + 9, by + 1, 1, 8, 'O'); fill(bx + 10, by + 1, 1, 8, 'O'); }   // it lands: a thicker stack on the left
    fill(bx, by + 9, 20, 1, 'x');
  }
  if (o.stack) {   // a short stack of books on the ground beside him (right side, fixed: does not move with the body)
    for (const [bxx, byy, bw, c] of [[OX + 24, F - 3, 5, 'h'], [OX + 25, F - 6, 4, 'l'], [OX + 24, F - 9, 5, 'u']]) { fill(bxx, byy, bw, 3, c); fill(bxx, byy + 2, bw, 1, 'o'); }
  }
  if (o.browser) { if (o.glass) { const gx = X + 21, gy = Y - 1; fill(gx + 1, gy, 5, 1, 'g'); fill(gx + 1, gy + 6, 5, 1, 'g'); fill(gx, gy + 1, 1, 5, 'g'); fill(gx + 6, gy + 1, 1, 5, 'g'); fill(gx + 1, gy + 1, 5, 5, 'i'); set(gx + 2, gy + 2, 'w'); set(gx + 3, gy + 2, 'w'); for (let i = 0; i < 3; i++) fill(gx - i, gy + 7 + i, 2, 1, 'X'); }  const bx = X + 16, byy = Y + 3; fill(bx, byy, 13, 11, 'y'); fill(bx, byy, 13, 3, 'G'); for (let i = 0; i < 3; i++) set(bx + 1 + i * 2, byy + 1, 'w'); fill(bx + 1, byy + 4, 4, 5, 'n'); for (const yy of [4, 6, 8]) fill(bx + 6, byy + yy, 6, 1, o.browser === 2 && yy === 6 ? 'h' : 'b'); }
  if (o.wrench) { const t = o.wrench, hx = X + 21; if (t > 1) { fill(hx + 2, Y - 3, 2, 8, 'x'); fill(hx - 1, Y - 5, 8, 3, 'g'); fill(hx - 1, Y - 5, 8, 1, 'v'); set(hx - 3, Y - 6, 's'); set(hx - 3, Y - 4, 's'); } else { fill(hx + 2, Y - 1, 2, 8, 'x'); fill(hx - 1, Y - 3, 8, 3, 'g'); fill(hx - 1, Y - 3, 8, 1, 'v'); } }
  if (o.plug !== undefined) {
    const t = o.plug; fill(X + 1, Y - 8, 7, 4, 'j'); fill(X + 8, Y - 7, 2, 1, 'g'); fill(X + 8, Y - 5, 2, 1, 'g');
    fill(X + 17, Y - 8, 7, 4, 'n'); fill(X + 15, Y - 7, 2, 1, 'g'); fill(X + 15, Y - 5, 2, 1, 'g');
    set(X + 4, Y - 4, 'g'); set(X + 4, Y - 3, 'g'); set(X + 20, Y - 4, 'g'); set(X + 20, Y - 3, 'g');
    if (t) { set(X + 11, Y - 7, 's'); set(X + 12, Y - 6, 's'); set(X + 13, Y - 5, 's'); set(X + 12, Y - 4, 's'); }
  }
  if (o.bulb) {
    const bx = X + 10, by2 = 2, g = o.bulb, cx = bx + 2;
    px(PAT.BULB, bx, by2, 'y'); set(bx + 1, by2 + 1, 'w'); set(bx + 1, by2 + 2, 'w');
    const ray = (pts, c) => pts.forEach(([x, y]) => set(x, y, c));
    ray([[cx, 0], [cx, 1], [bx - 3, 4], [bx - 2, 4], [bx + 6, 4], [bx + 7, 4], [bx - 2, 2], [bx - 1, 1], [bx + 6, 2], [bx + 5, 1]], g > 1 ? 's' : 'K');
    if (g > 1) ray([[bx - 5, 4], [bx - 4, 4], [bx + 8, 4], [bx + 9, 4], [bx - 2, 6], [bx - 1, 7], [bx + 6, 6], [bx + 5, 7]], 'y');
  }
  if (o.coins !== undefined) { const t = o.coins; px(PAT.COIN, X + 21, Y - 5 + (t % 2), 's'); px(PAT.COIN, X - 2, Y - 3 - (t % 2) * 1, 's'); fill(X + 8, F - 1, 8, 1, 'B'); fill(X + 9, F - 2, 6, 1, 'b'); fill(X + 10, F - 3, 4, 1, 'b'); }
  if (o.spiral) px(o.spiral === 1 ? PAT.SPIRAL : PAT.SPIRAL2, X + 9, Y - 8, 'n');
  if (o.bolt) { px(PAT.BOLT, X + 3, Y - 8, 'y'); px(PAT.BOLT, X + 17, Y - 8, 'y'); }
  if (o.flexbolt) px(PAT.BOLT, X + 10, Y - 8, 'l');
  if (o.check) px(PAT.CHECK, X + 17, Y - 8, 'G');
  if (o.heart !== undefined) px(PAT.HEART, X + 22, Y - 5 - o.heart, 'h');
  if (o.zzz !== undefined) { px(PAT.Z, X + 24, Y + 5 - (o.zzz % 4), 'z'); px(PAT.Z, X + 26, Y + 2 - ((o.zzz + 2) % 4), 'z'); }
  if (o.z !== undefined) px(PAT.Z, X + 24, Y - 8 - o.z + 4, 'z');
  if (o.z2 !== undefined) px(PAT.Z, X + 20, Y - 10 + o.z2 * 0 - o.z2 + 4, 'z');
  if (o.bang) px(PAT.BANG, o.bangX ?? X + 2, Y - 8, 'r');
  if (o.bangC) px(['##', '##', '##', '##', '..', '##'], X + 11, Y - 8 + (o.bangC - 1), 'r');   // 1, 2, 3: the mark sinks a pixel at a time, so it bobs   // a two-wide exclamation mark, centered above his head (his body is 24 wide)
  if (o.star) { px(PAT.STAR, X - 4, Y - 6, 's'); px(PAT.STAR, X + 23, Y - 4, 's'); }
  if (o.flame !== undefined) { const f = PAT.FLAME[o.flame], g2 = PAT.FLAME[(o.flame + 1) % 3]; px(f, X - 3, F - 7, 'r'); px(g2, X + 3, F - 6, 'y'); px(f, X + 9, F - 7, 'r'); px(g2, X + 15, F - 6, 'y'); px(f, X + 21, F - 7, 'r'); [[X + 5, Y - 3], [X + 18, Y - 2], [X + 11, Y - 5]].forEach(([x, y], i) => set(x, y - (o.flame + i) % 3, i % 2 ? 'y' : 'r')); }
  if (o.steam !== undefined) { const t = o.steam; [[6, 2], [11, 0], [16, 2]].forEach(([x, , ], i) => fill(X + x, Y - 4 - ((t + i) % 3) * 2, 2, 2, 'v')); }
  if (o.snow) { const t = o.snow - 1; px(PAT.FLAKE, X + 23 - (t % 2), Y - 6 + t * 3, 'i'); px(PAT.FLAKE, X - 4 + (t % 2), Y - 1 + ((t + 1) % 3) * 3, 'i'); set(X + 20, Y - 3 + ((t + 2) % 3) * 4, 'i'); set(X + 1, Y - 2 + ((t + 1) % 3) * 4, 'i'); }
  if (o.ice) { fill(X - 1, F - 1, 26, 4, 'i'); fill(X - 1, F - 1, 26, 1, 'w'); fill(X + 1, F + 3, 22, 1, 'Q'); for (const x of [X + 1, X + 8, X + 15, X + 21]) { fill(x, F - 3, 2, 2, 'i'); } }
  if (o.sweat !== undefined) px(['.#.', '###', '###'], X + 22, Y + 1 + o.sweat, 'q');
  if (o.gauge !== undefined) { fill(X + 6, Y - 7, 12, 4, 'g'); fill(X + 7, Y - 6, 10, 2, 'd'); fill(X + 7, Y - 6, o.gauge, 2, 'r'); }
  if (o.carry) {   // the prop in his hand: at 1 above the raised hand, at 3 just under the arm that swings out to put it behind him
    const [cxo, cyo] = o.at === 3 ? [X + 22, Y + 7] : [X + 19, Y - 5];
    stamp(MINI[o.carry] || MINI.thing, cxo, cyo, 'g');
  }
  if (o.clock) {   // under him, inside the normal canvas: he sits raised (lift) and the alarm clock is below. Drawn clipped, so it can rise into view from the bottom edge
    const cx = OX, cy = o.clockY ?? OYv + 14, t = o.clock;   // clockY: where its top is while it rises; resting, it is right under his body (no legs)
    const cf = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const xx = x + i, yy = y + j; if (xx >= 0 && xx < W && yy >= 0 && yy < H) k.g[yy][xx] = c; } };
    cf(cx + 2, cy - 2, 3, 1, 'g'); cf(cx + 18, cy - 2, 3, 1, 'g');
    cf(cx, cy - 1, 23, 9, 'g'); cf(cx + 1, cy, 21, 7, 'd');
    let x = cx + 3; [...t].forEach(ch => { const p = PAT.DIG[ch]; p.forEach((row, j) => [...row].forEach((c2, i) => { if (c2 === '#') cf(x + i, cy + 1 + j, 1, 1, 'a'); })); x += p[0].length + 1; });
  }
  if (false) { fill(X - 3, Y + 9, 30, 8, 'u'); fill(X - 3, Y + 9, 30, 1, 'U'); for (let x = X - 1; x < X + 26; x += 6) fill(x, Y + 11, 3, 5, 'J'); }
  return k;
}


export type Pose = Record<string, any>

export { clawd, PAL, W0, H0 }

/** One color at a time, one run of pixels per segment: small enough for the Svg limit (131072 characters). */
function pathsOf(grid, pal) {
  const by = {}
  grid.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const c = row[x]
      if (!c) {
        x++
        continue
      }
      let n = 1
      while (row[x + n] === c) n++
      ;(by[c] ??= []).push(`M${x} ${y}h${n}v1h-${n}z`)
      x += n
    }
  })
  return Object.entries(by)
    .map(([c, d]) => `<path fill="${pal[c]}" d="${d.join('')}"/>`)
    .join('')
}

/** The frames of one state, swapped by SMIL opacity (a sandboxed Svg with isInteractive plays it; elsewhere frame one shows). */
export function renderFrames(frames: Pose[], fd: number, w: number, drift: boolean, scale = 2, delay = 0): string {
  const n = frames.length
  const keyTimes = frames.map((_, i) => (i / n).toFixed(4)).join(';')
  const dur = (n * fd).toFixed(2)
  // A delay starts the loop after a move that plays first in the same drawing: nothing shows until then.
  const begin = delay > 0 ? ` begin="${delay.toFixed(2)}s"` : ''
  const groups = frames
    .map((o, i) => {
      const k = clawd({ w, ...o })
      const anim = n > 1 ? `<animate attributeName="opacity" values="${frames.map((_, j) => (j === i ? 1 : 0)).join(';')}" keyTimes="${keyTimes}" dur="${dur}s" calcMode="discrete"${begin} repeatCount="indefinite"/>` : delay > 0 ? `<set attributeName="opacity" to="1"${begin}/>` : ''
      return `<g opacity="${delay > 0 ? 0 : i === 0 ? 1 : 0}">${anim}${pathsOf(k.g, { ...PAL, ...(o.pal || {}) })}</g>`
    })
    .join('')
  const move = drift ? `<animateTransform attributeName="transform" type="translate" values="-4 0;4 0;-4 0" dur="${(n * fd * 4).toFixed(2)}s"${begin} repeatCount="indefinite"/>` : ''
  return `<g shape-rendering="crispEdges" transform="scale(${scale})"><g>${move}${groups}</g></g>`
}

/** Frames that play once, in order, then hold the last one: a move between two states. */
/** How long a move plays, in seconds (to the millisecond). A frame's `hold` stretches or shortens its share of the time. */
export function onceSeconds(frames: Pose[], fd: number): number {
  return Math.round(frames.reduce((a, f) => a + (f.hold ?? 1), 0) * fd * 1000) / 1000
}

export function renderOnce(frames: Pose[], fd: number, w: number, scale = 2): string {
  const total = frames.reduce((a, f) => a + (f.hold ?? 1), 0)
  let acc = 0
  const keyTimes = frames.map(f => { const t = (acc / total).toFixed(4); acc += f.hold ?? 1; return t }).join(';')
  const dur = onceSeconds(frames, fd).toFixed(2)
  const groups = frames
    .map((o, i) => {
      const k = clawd({ w, ...o })
      const anim = `<animate attributeName="opacity" values="${frames.map((_, j) => (j === i ? 1 : 0)).join(';')}" keyTimes="${keyTimes}" dur="${dur}s" calcMode="discrete" repeatCount="1" fill="freeze"/>`
      return `<g opacity="${i === 0 ? 1 : 0}">${anim}${pathsOf(k.g, { ...PAL, ...(o.pal || {}) })}</g>`
    })
    .join('')
  // Once the move is over the whole group is hidden for good, so the loop that follows has the drawing to itself.
  return `<g shape-rendering="crispEdges" transform="scale(${scale})"><g><set attributeName="display" to="none" begin="${dur}s"/>${groups}</g></g>`
}

/** Pixels any frame of the state draws outside the canvas (must be none). */
export function pixelsOutside(frames: Pose[], w: number): number {
  return frames.reduce((a, o) => a + clawd({ w, ...o }).oob.length, 0)
}
