/* ============================================================
   voice.js — Lecture a voix haute (F01)
   Une seule file d'attente pour toutes les voix du jeu (Coco, objectifs, tuto).
   - choisit une voix francaise si le navigateur en a une ;
   - priorite : une phrase de priorite plus haute coupe celle en cours ;
     a priorite egale elle attend son tour (3 en attente au maximum) ;
   - debit reglable (setRate), jamais d'exception si la synthese manque.
   ============================================================ */

const clean = (t) => String(t).replace(/<[^>]*>/g, ' ').replace(/[^\p{L}\p{N}\s.,!?'-]/gu, '').replace(/\s+/g, ' ').trim();

export class Voice {
  constructor() {
    this.synth = (typeof window !== 'undefined' && window.speechSynthesis) || null;
    this.rate = 1.0;
    this.queue = [];
    this.current = null;      // { prio }
    this._voice = null;
    this.volume = 0.9;         // J02 : volume des voix
    this.onSpeak = null;       // appele (true/false) au debut et a la fin d'une phrase : le jeu baisse la musique
    if (this.synth && this.synth.addEventListener) this.synth.addEventListener('voiceschanged', () => { this._voice = null; });
  }

  get available() { return !!this.synth; }

  setRate(r) { this.rate = Math.max(0.6, Math.min(1.5, r)); }

  _pickVoice() {
    if (this._voice) return this._voice;
    let list = [];
    try { list = this.synth.getVoices() || []; } catch (e) { list = []; }
    this._voice = list.find(v => /^fr(-|_)FR/i.test(v.lang)) || list.find(v => /^fr/i.test(v.lang)) || null;
    return this._voice;
  }

  /* opts : { prio = 1, pitch = 1.3 } */
  speak(text, { prio = 1, pitch = 1.3 } = {}) {
    if (!this.synth) return;
    const t = clean(text);
    if (!t) return;
    if (this.current && prio > this.current.prio) { this.queue.length = 0; this._cancel(); }
    if (this.current) {
      if (this.queue.length < 3 && !this.queue.some(q => q.t === t)) this.queue.push({ t, prio, pitch });
      return;
    }
    this._say({ t, prio, pitch });
  }

  stop() { this.queue.length = 0; this._cancel(); }

  _cancel() { try { this.synth.cancel(); } catch (e) { /* ignore */ } this.current = null; if (this.onSpeak) this.onSpeak(false); }

  _say(item) {
    try {
      const u = new SpeechSynthesisUtterance(item.t);
      const v = this._pickVoice();
      if (v) u.voice = v;
      u.lang = (v && v.lang) || 'fr-FR';
      u.pitch = item.pitch; u.rate = this.rate; u.volume = this.volume;
      this.current = { prio: item.prio };
      if (this.onSpeak) this.onSpeak(true);
      const next = () => {
        this.current = null;
        const n = this.queue.shift();
        if (n) this._say(n);
        else if (this.onSpeak) this.onSpeak(false);
      };
      u.onend = next; u.onerror = next;
      this.synth.speak(u);
    } catch (e) { this.current = null; }
  }
}
