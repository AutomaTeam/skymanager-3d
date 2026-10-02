/* ============================================================
   rideIK.js — Poser l'avatar sur une monture (phase 40)

   L'avatar est un squelette de type Mixamo dont on ne connait pas les
   axes locaux. Plutot que de tourner chaque os « a l'aveugle », on
   raisonne en espace monde : « cet os doit viser ce point ». Une
   cinematique inverse a deux os (jambe, bras) place le genou ou le coude
   avec un vecteur « pole » et rejoint le pied ou la main cible.

   A appeler APRES mixer.update() : l'animation de repos est reecrite a
   chaque image, la pose de la monture se pose par-dessus.
   ============================================================ */

import * as THREE from 'three';

const _p = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _t = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _pq = new THREE.Quaternion();
const _A = new THREE.Vector3(), _B = new THREE.Vector3(), _C = new THREE.Vector3(), _dir = new THREE.Vector3(), _knee = new THREE.Vector3(), _pp = new THREE.Vector3();

/* Fait pivoter `bone` pour que la direction os -> enfant vise le point monde `target`. */
export function aim(bone, child, target) {
  bone.getWorldPosition(_p); child.getWorldPosition(_c);
  _d.subVectors(_c, _p);
  if (_d.lengthSq() < 1e-10) return;
  _d.normalize();
  _t.subVectors(target, _p);
  if (_t.lengthSq() < 1e-10) return;
  _t.normalize();
  _q.setFromUnitVectors(_d, _t);
  bone.getWorldQuaternion(_q2);
  _q2.premultiply(_q);
  if (bone.parent) { bone.parent.getWorldQuaternion(_pq); _pq.invert(); _q2.premultiply(_pq); }
  bone.quaternion.copy(_q2);
  bone.updateMatrixWorld(true);
}

/* Cinematique inverse a deux os : racine -> milieu -> extremite atteint `target`,
   le coude/genou se plie vers `pole` (vecteur monde). Rend la distance non atteinte (0 = OK). */
export function twoBone(root, mid, end, target, pole) {
  root.getWorldPosition(_A); mid.getWorldPosition(_B); end.getWorldPosition(_C);
  const L1 = _A.distanceTo(_B), L2 = _B.distanceTo(_C);
  _dir.subVectors(target, _A);
  const full = _dir.length();
  const d = Math.min(Math.max(full, Math.abs(L1 - L2) + 1e-3), L1 + L2 - 1e-3);
  if (full < 1e-6) return 0;
  _dir.normalize();
  const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  _pp.copy(pole).addScaledVector(_dir, -pole.dot(_dir));
  if (_pp.lengthSq() < 1e-6) _pp.set(0, 1, 0).addScaledVector(_dir, -_dir.y);
  _pp.normalize();
  _knee.copy(_A).addScaledVector(_dir, a).addScaledVector(_pp, h);
  aim(root, mid, _knee);
  _t.copy(_A).addScaledVector(_dir, d);
  aim(mid, end, _t);
  return Math.max(0, full - d);
}

/* Applique une rotation MONDE (quaternion) a un os, en conservant ses enfants attaches. */
export function rotateWorld(bone, qWorldDelta) {
  bone.getWorldQuaternion(_q2);
  _q2.premultiply(qWorldDelta);
  if (bone.parent) { bone.parent.getWorldQuaternion(_pq); _pq.invert(); _q2.premultiply(_pq); }
  bone.quaternion.copy(_q2);
  bone.updateMatrixWorld(true);
}

/* Les os utiles de l'avatar (null tant que le glb n'est pas charge). */
export function findBones(root) {
  if (!root) return null;
  const g = (n) => root.getObjectByName(n);
  const b = {
    hips: g('Hips'), spine: g('Spine'), spine1: g('Spine1'), spine2: g('Spine2'), neck: g('Neck'), head: g('Head'),
    lUp: g('LeftUpLeg'), lLeg: g('LeftLeg'), lFoot: g('LeftFoot'),
    rUp: g('RightUpLeg'), rLeg: g('RightLeg'), rFoot: g('RightFoot'),
    lArm: g('LeftArm'), lFore: g('LeftForeArm'), lHand: g('LeftHand'),
    rArm: g('RightArm'), rFore: g('RightForeArm'), rHand: g('RightHand')
  };
  return Object.values(b).every(Boolean) ? b : null;
}
