import { useState } from "react";
import { Pause, Play } from "lucide-react";
import { useMotion } from "../motion";
import { seasonFor } from "../experience";
import {
  localCivilDate,
  particlesEnabled,
  seasonNames,
  type ParticleLevel,
  type Season,
  type SeasonMode,
} from "../seasonal";
import SeasonalParticles from "./SeasonalParticles";

const captions: Record<Season, [string, string]> = {
  spring: [
    "Una pioggia di sakura",
    "Petali rosa, portati da un vento leggero.",
  ],
  summer: [
    "Un battito d’estate",
    "Piccole farfalle di carta, leggere nell’aria calda.",
  ],
  autumn: [
    "Il vento tra le foglie",
    "Ocra, rame e rosso, con il passo lento dell’autunno.",
  ],
  winter: [
    "Il silenzio della neve",
    "Fiocchi leggeri, come una giornata da ricordare.",
  ],
};
export default function SeasonalParticleSettings() {
  const motion = useMotion();
  const [season, setSeason] = useState<Season>(
      () => seasonFor(localCivilDate()) as Season,
    ),
    [paused, setPaused] = useState(false);
  const enabled = particlesEnabled(
    motion.particles,
    motion.effective,
    motion.seasons,
    motion.systemReduced,
  );
  const reason = motion.systemReduced
    ? "Anteprima sospesa: sul dispositivo è attivo il movimento ridotto."
    : !motion.seasons
      ? "Attiva l’atmosfera stagionale per vedere le particelle."
      : motion.effective === "off"
        ? "Attiva gli effetti generali per vedere le particelle."
        : "Le particelle sono disattivate. Scegli Delicate o Immersive per provarle.";
  return (
    <section
      className="paper form-paper particle-settings"
      aria-labelledby="particle-settings-title"
    >
      <span className="eyebrow">LE QUATTRO STAGIONI</span>
      <h2 id="particle-settings-title">Un soffio tra le pagine</h2>
      <p>
        Petali, farfalle, foglie e neve accompagnano i ricordi, lasciando spazio
        alle fotografie.
      </p>
      <div className="particle-preferences">
        <label>
          Particelle stagionali
          <select
            value={motion.particles}
            onChange={(event) =>
              motion.setParticles(event.target.value as ParticleLevel)
            }
          >
            <option value="off">Disattivate</option>
            <option value="delicate">Delicate</option>
            <option value="immersive">Immersive</option>
          </select>
        </label>
        <label>
          Modalità stagionale
          <select
            value={motion.particleSeason}
            onChange={(event) =>
              motion.setParticleSeason(event.target.value as SeasonMode)
            }
          >
            <option value="auto">Automatico · segue il ricordo</option>
            <option value="current">Stagione attuale</option>
          </select>
        </label>
      </div>
      <p className="particle-settings-help">
        Si salvano su questo dispositivo. Con effetti ridotti, le particelle
        sono ancora più leggere.
      </p>
      <div className="particle-preview-heading">
        <h3>Anteprima delle stagioni</h3>
        <button
          className="button secondary"
          type="button"
          disabled={!enabled}
          aria-pressed={paused}
          onClick={() => setPaused(!paused)}
        >
          {paused ? <Play size={14} /> : <Pause size={14} />}
          {paused ? "Riprendi anteprima" : "Pausa anteprima"}
        </button>
      </div>
      <div
        className="particle-season-buttons"
        role="group"
        aria-label="Stagione dell’anteprima"
      >
        {(Object.keys(seasonNames) as Season[]).map((value) => (
          <button
            key={value}
            type="button"
            className="button secondary"
            aria-pressed={season === value}
            onClick={() => setSeason(value)}
          >
            {seasonNames[value]}
          </button>
        ))}
      </div>
      <div className="particle-preview-scene" data-preview-season={season}>
        {enabled && (
          <SeasonalParticles
            season={season}
            level={motion.particles}
            preview
            paused={paused}
          />
        )}
        <div className="particle-preview-caption" aria-live="polite">
          <span className="eyebrow">{seasonNames[season]}</span>
          <strong>{captions[season][0]}</strong>
          <p>{captions[season][1]}</p>
        </div>
      </div>
      {!enabled && (
        <p className="particle-preview-status" role="status">
          {reason}
        </p>
      )}
      <p className="particle-settings-help">
        Questa finestra cambia solo l’anteprima. Nel diario resta la modalità
        che hai scelto.
      </p>
    </section>
  );
}
