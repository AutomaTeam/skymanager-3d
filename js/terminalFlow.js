/* ============================================================
   terminalFlow.js — Les verifications du parcours passager (phases 25-26)

   Un passager suit un circuit logique :

     entree -> ENREGISTREMENT (billet + bagage) -> SURETE (plateau)
            -> commerces / distributeurs -> PORTE (carte d'embarquement)
            -> avion            et, en parallele : bagage -> tri -> soute

   Phase 26 : c'est LE MEME passager d'un poste a l'autre. Son dossier
   (`makePassenger`) le suit, donc une erreur a un poste a une
   consequence plus loin, ET une seconde chance :

     - bagage trop lourd accepte sans surcharge  -> a la porte, on peut
       encore encaisser la surcharge ;
     - objet interdit laisse passer a la surete   -> a la porte le detecteur
       sonne : on renvoie le passager a la surete ;
     - billet d'un autre vol valide               -> sa carte le trahit a la
       porte : on le refuse ;
     - passager refuse a la porte                 -> son bagage devient
       « abandonne » au tri, a retirer de la soute.

   Les regles restent lisibles par un enfant de 12 ans : le probleme est
   ECRIT sur le panneau (billet a cote du vol du jour, poids a cote de la
   limite, note du guichet a la porte).

   Ce module ne connait ni le DOM ni Three.js : il est teste hors
   navigateur (tools/terminal.test.mjs).
   ============================================================ */

/* Le vol du jour : tout billet pour un autre vol doit etre refuse. */
export const TODAY = { flight: 'SKY 214', dest: 'LYON', gate: 'PORTE 3', bagLimit: 20, feePerKg: 4 };

const NAMES = ['Lea M.', 'Tom B.', 'Sarah K.', 'Yanis D.', 'Emma R.', 'Hugo P.', 'Nina C.',
  'Adam F.', 'Zoe L.', 'Lucas T.', 'Ines A.', 'Noah G.', 'Manon V.', 'Jules H.'];
const FACES = ['🧑', '👩', '👨', '👧', '👦', '🧓', '👴', '👵'];
const OTHER_FLIGHTS = ['SKY 145', 'SKY 302', 'SKY 411', 'SKY 219', 'SKY 076'];
const SAFE_ITEMS = ['👕', '👟', '📱', '💻', '🎧', '📚', '🧸', '🧦', '🕶️', '🎮'];
const DANGER_ITEMS = [
  { e: '🔪', n: 'un couteau' }, { e: '✂️', n: 'des ciseaux' }, { e: '🧨', n: 'des petards' },
  { e: '🍾', n: 'une grande bouteille de liquide' }, { e: '🔨', n: 'un marteau' }
];

/* Couleurs de chemise (indices lus par le rendu 3D et par le panneau : on reconnait
   a l'ecran le passager dont on regarde le dossier). */
export const SHIRTS = [
  { name: 'rouge', hex: '#ef4444', dot: '🟥' }, { name: 'bleue', hex: '#3b82f6', dot: '🟦' },
  { name: 'verte', hex: '#22c55e', dot: '🟩' }, { name: 'jaune', hex: '#facc15', dot: '🟨' },
  { name: 'violette', hex: '#a855f7', dot: '🟪' }, { name: 'orange', hex: '#f97316', dot: '🟧' }
];

/* Choix possibles par poste (identifiants stables, libelles dans l'interface). */
export const CHOICES = {
  checkin:  ['ok', 'fee', 'refuse'],       // valider / faire payer la surcharge / refuser
  security: ['pass', 'seize'],             // laisser passer / confisquer
  gate:     ['scan', 'fee', 'refuse']      // scanner / encaisser la surcharge / refuser
};

/* Choix fait quand personne ne s'occupe du poste : on laisse passer. */
export const DEFAULT_CHOICE = { checkin: 'ok', security: 'pass', gate: 'scan' };

const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];
let _id = 1;

/* Dossier d'un passager. Les probabilites de probleme sont reglees pour
   qu'environ un passager sur trois demande une vraie decision. */
export function makePassenger(rng = Math.random) {
  const row = 1 + Math.floor(rng() * 24);
  const p = {
    id: _id++,
    name: pick(NAMES, rng),
    face: pick(FACES, rng),
    shirt: Math.floor(rng() * SHIRTS.length),
    flight: TODAY.flight,
    seat: `${row}${'ABCDEF'[Math.floor(rng() * 6)]}`,
    kg: 8 + Math.floor(rng() * 12),               // 8..19 kg : sous la limite
    tray: [],
    danger: null,                                 // objet interdit dans le plateau
    feePaid: false,                               // surcharge deja payee ?
    dangerSeized: false,                          // objet interdit deja confisque ?
    passFlight: null                              // vol imprime sur la carte d'embarquement
  };
  const r = rng();
  if (r < 0.13) p.flight = pick(OTHER_FLIGHTS, rng);
  else if (r < 0.29) p.kg = TODAY.bagLimit + 2 + Math.floor(rng() * 8);

  /* Plateau du controle de surete : 3 ou 4 objets, un interdit une fois sur cinq. */
  const n = 3 + Math.floor(rng() * 2);
  for (let i = 0; i < n; i++) p.tray.push(pick(SAFE_ITEMS, rng));
  if (rng() < 0.2) {
    const d = pick(DANGER_ITEMS, rng);
    p.tray[Math.floor(rng() * n)] = d.e;
    p.danger = d;
  }
  /* La carte d'embarquement reprend le vol du billet ; une fois sur seize elle est mal imprimee. */
  p.passFlight = p.flight;
  if (p.flight === TODAY.flight && rng() < 0.06) p.passFlight = pick(OTHER_FLIGHTS, rng);
  return p;
}

/* ---- Etat lisible d'un dossier (jamais stocke : toujours recalcule) ---- */
export const isWrongFlight = (p) => p.flight !== TODAY.flight;
export const isHeavy = (p) => p.kg > TODAY.bagLimit;
export const overweightFee = (p) => Math.max(0, p.kg - TODAY.bagLimit) * TODAY.feePerKg;
/* Objet interdit encore dans le sac de ce passager ? */
export const hasDanger = (p) => !!p.danger && !p.dangerSeized;
/* Surcharge due et pas payee ? */
export const feeDue = (p) => isHeavy(p) && !p.feePaid;
/* Carte d'embarquement fausse ? */
export const isWrongPass = (p) => p.passFlight !== TODAY.flight;

/* Ancien vocabulaire (interface, tests) : 'flight' | 'weight' | null au guichet. */
export const issueOf = (p) => (isWrongFlight(p) ? 'flight' : (feeDue(p) ? 'weight' : null));

/* Le bon choix au poste `stage` pour ce dossier (sert aux tests, au mode Pilote et a l'aide). */
export function bestChoice(stage, p) {
  if (stage === 'checkin') return isWrongFlight(p) ? 'refuse' : (feeDue(p) ? 'fee' : 'ok');
  if (stage === 'security') return hasDanger(p) ? 'seize' : 'pass';
  if (stage === 'gate') return (isWrongFlight(p) || isWrongPass(p)) ? 'refuse' : (hasDanger(p) ? 'refuse' : (feeDue(p) ? 'fee' : 'scan'));
  return null;
}

/* Le poste `stage` ('checkin' | 'security' | 'gate'), le passager `p`, le choix `choice`.
   Rend { ok, proceeds, coins, mood, msg, why, fee?, returnTo? } :
     ok        : bonne decision ;
     proceeds  : le passager continue son parcours (sinon il repart ou revient en arriere) ;
     returnTo  : 'security' = il retourne a la surete (detecteur de la porte) ;
     coins     : recompense (pieces Arcade) ;
     mood      : variation d'ambiance du hall ;
     why       : ce qu'il fallait voir (affiche en cas d'erreur, pour apprendre). */
export function evaluate(stage, p, choice) {
  const good = (msg, coins, proceeds = true, extra = {}) => ({ ok: true, proceeds, coins, mood: 0.9, msg, why: '', ...extra });
  const bad = (msg, why, mood = -3, proceeds = true, extra = {}) => ({ ok: false, proceeds, coins: 0, mood, msg, why, ...extra });

  if (stage === 'checkin') {
    if (isWrongFlight(p)) {
      return choice === 'refuse'
        ? good(`Bien vu ! Ce billet est pour ${p.flight}, pas pour ${TODAY.flight}.`, 3, false)
        : bad('Erreur : ce passager n\'est pas sur ce vol !', `Son billet dit ${p.flight}, le vol du jour est ${TODAY.flight}. On le retrouvera a la porte.`, -4);
    }
    if (isHeavy(p) && !p.feePaid) {
      const fee = overweightFee(p);
      if (choice === 'fee') return good(`Surcharge de ${fee} € encaissee (${p.kg} kg).`, 4, true, { fee });
      if (choice === 'refuse') return bad('Inutile de refuser : il fallait faire payer la surcharge.', `${p.kg} kg, la limite est ${TODAY.bagLimit} kg.`, -2, false);
      return bad('Bagage trop lourd accepte sans surcharge.', `${p.kg} kg, la limite est ${TODAY.bagLimit} kg. Tu pourras encore encaisser a la porte !`, -2);
    }
    /* Dossier en regle. */
    if (choice === 'ok') return good('Billet et bagage en regle. Bon voyage !', 2);
    if (choice === 'fee') return bad('Pas de surcharge : le bagage n\'etait pas trop lourd.', `${p.kg} kg, sous la limite de ${TODAY.bagLimit} kg.`, -2);
    return bad('Ce passager avait un billet valide !', `Vol ${p.flight}, bagage ${p.kg} kg : tout etait en regle.`, -3, false);
  }

  if (stage === 'security') {
    if (hasDanger(p)) {
      return choice === 'seize'
        ? good(`Bravo ! Tu as trouve ${p.danger.n} ${p.danger.e}.`, 4)
        : bad('Danger : un objet interdit est passe !', `Il y avait ${p.danger.n} ${p.danger.e} dans le plateau. Le detecteur de la porte peut encore le trouver.`, -3);
    }
    return choice === 'pass'
      ? good('Plateau en ordre, tu peux passer.', 2)
      : bad('Rien d\'interdit dans ce plateau !', 'Aucun couteau, ciseau, petard, marteau ni grande bouteille.', -2);
  }

  if (stage === 'gate') {
    /* Ordre des problemes : mauvais vol > detecteur qui sonne > surcharge oubliee. */
    if (isWrongFlight(p) || isWrongPass(p)) {
      const shown = p.passFlight;
      return choice === 'refuse'
        ? good(`Bien vu ! Cette carte est pour ${shown}.`, 3, false)
        : bad('Erreur : ce passager monterait dans le mauvais avion !', `Sa carte dit ${shown}, ici c'est ${TODAY.flight}.`, -4);
    }
    if (hasDanger(p)) {
      return choice === 'refuse'
        ? good(`Le detecteur sonne ! ${p.danger.e} On le renvoie a la surete.`, 3, false, { returnTo: 'security' })
        : bad('Alerte : le detecteur sonnait et il est monte !', `Il avait ${p.danger.n} ${p.danger.e}. Il fallait le renvoyer a la surete.`, -6);
    }
    if (feeDue(p)) {
      const fee = overweightFee(p);
      if (choice === 'fee') return good(`Rattrape ! Surcharge de ${fee} € encaissee.`, 4, true, { fee });
      if (choice === 'refuse') return bad('Inutile de le refuser : il suffisait d\'encaisser la surcharge.', `${p.kg} kg, la limite est ${TODAY.bagLimit} kg.`, -2, false);
      return bad('Surcharge oubliee : elle n\'a jamais ete payee.', `${p.kg} kg, la limite est ${TODAY.bagLimit} kg.`, -1.5);
    }
    return choice === 'scan'
      ? good('Carte valide. Embarquement !', 2)
      : bad(choice === 'fee' ? 'Il n\'y avait aucune surcharge a payer !' : 'Sa carte etait bonne !',
          `Vol ${p.passFlight}, place ${p.seat}.`, -3, choice !== 'refuse');
  }
  return bad('Poste inconnu', '', 0);
}

/* Notes du guichet affichees a la porte : ce qui s'est passe plus tot pour CE passager
   (le lien entre les postes). Chaque note dit quoi faire. */
export function gateNotes(p) {
  const notes = [];
  if (feeDue(p)) notes.push({ icon: '⚠️', text: `Son bagage pese ${p.kg} kg (limite ${TODAY.bagLimit} kg) et la surcharge n'a pas ete payee.` });
  if (hasDanger(p)) notes.push({ icon: '🔔', text: 'Le detecteur de la porte sonne quand il passe !' });
  return notes;
}
