/* K03 : le systeme de particules unique (js/particles.js). */
import * as THREE from 'three';
import { Particles } from '../js/particles.js';
let bad = 0;
const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ' - ' + m); if (!c) bad++; };

const scene = new THREE.Group();
const P = new Particles(scene, 8);
ok(scene.children.length === 1, 'un seul objet de dessin ajoute a la scene');

/* fumee : immobile, grossit, s'estompe, meurt */
const i = P.spawn(1, 2, 3, 0xffffff, { size: 2, life: 1, grow: 1.5 });
P.update(0.5);
ok(P.pos[i * 3] === 1 && P.pos[i * 3 + 1] === 2, 'fumee : ne bouge pas');
ok(Math.abs(P.size[i] - 2 * (1 + 0.5 * 1.5)) < 1e-6, 'fumee : grossit');
ok(P.alpha[i] > 0 && P.alpha[i] < 0.85, 'fumee : devient transparente');
P.update(0.6);
ok(P.alpha[i] === 0, 'fumee : disparue apres sa duree');

/* etincelle : retombe et rebondit sur le sol */
const j = P.spawn(0, 1, 0, 0xffaa00, { vy: 0, life: 5, gravity: 9, floor: 0.02, size: 0.3 });
for (let k = 0; k < 30; k++) P.update(0.05);
ok(P.pos[j * 3 + 1] >= 0.0199, 'etincelle : ne passe pas sous le sol');
ok(P.pos[j * 3 + 1] < 1, 'etincelle : est retombee');

/* tampon circulaire : on ne depasse jamais la taille */
for (let k = 0; k < 50; k++) P.spawn(0, 0, 0, 0xffffff, { life: 1 });
ok(P.head < 8 && P.pos.length === 24, 'tampon circulaire : pas de debordement');
P.burst(0, 1, 0, 5, 0xffffff);
ok(P.head >= 0 && P.head < 8, 'gerbe : ok');
P.clear();
P.update(0.01);
ok(Array.from(P.alpha).every(a => a === 0), 'clear : tout eteint');
if (bad) process.exit(1);
console.log('Tout est bon (particules).');
