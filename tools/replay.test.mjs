/* G07 : interpolation du rejeu (js/replay.js, fonction pure sampleAt). */
globalThis.document = { getElementById: () => null };
const { sampleAt } = await import('../js/replay.js');
let bad = 0;
const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + m); if (!c) bad++; };
const S = (x) => ({ x, y: x * 2, z: -x, q: [0, 0, 0, 1], roll: x / 10, pitch: 0, yaw: 0 });
const samples = [S(0), S(10), S(20), S(30)];
ok(sampleAt([], 0) === null, 'enregistrement vide : null');
const a = sampleAt(samples, 0);
ok(a.x === 0 && a.y === 0, 'debut');
const mid = sampleAt(samples, 1.5 / 15);
ok(Math.abs(mid.x - 15) < 1e-9 && Math.abs(mid.y - 30) < 1e-9 && Math.abs(mid.roll - 1.5) < 1e-9, 'interpolation entre deux echantillons');
ok(sampleAt(samples, 3 / 15).x === 30, 'dernier echantillon');
ok(sampleAt(samples, 4 / 15) === null && sampleAt(samples, -1) === null, 'hors plage : null');
if (bad) process.exit(1);
console.log('Tout est bon (rejeu).');
