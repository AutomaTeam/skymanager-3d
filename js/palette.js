/* ============================================================
   palette.js — Palette « colore doux » du jeu (plan graphisme, etape 2)

   Une seule source pour les couleurs du decor, des modeles 3D et,
   peu a peu, des textures et de l'interface. Valeurs en hexadecimal
   (0xRRGGBB) pour Three.js ; `css()` donne la meme couleur en texte.
   ============================================================ */

export const PALETTE = {
  sky:      0x7cc4f0,
  grass:    0x6cc24a,
  grassDark: 0x4e9e3a,
  leaf:     0x3fa34d,
  sun:      0xffd166,
  coral:    0xff7a70,
  pink:     0xf78fb3,
  violet:   0xa78bfa,
  teal:     0x2dd4bf,
  navy:     0x22345c,
  cream:    0xfff1d6,
  asphalt:  0x59626f,
  concrete: 0xc9cfd6
};

export const css = (c) => '#' + c.toString(16).padStart(6, '0');

/* Reglages communs du rendu « doux » applique aux modeles importes. */
export const SOFT = {
  roughness: 0.72,     // pas de reflets durs
  metalness: 0.0,
  emissiveLift: 0.08,  // eclaircit doucement les zones a l'ombre
  envMapIntensity: 0.65
};

/* Recoloration par nom de materiau (packs Kenney) : verts francs a la place des verts bleutes,
   ecorces chaudes. Les modeles a texture (colormap) ne sont pas touches. */
export const RECOLOR = {
  leafsGreen: 0x5cc24d, leafsDark: 0x2f9a55, leafsFall: 0xf2a03d, grass: 0x6acb4f,
  plant: 0x52c25a, woodBark: 0x9c6b46, woodBarkDark: 0x7c5238, woodBirch: 0xf3ead8
};
