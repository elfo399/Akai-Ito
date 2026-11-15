# Akai Ito — Immersive Experience

Revisione successiva: **particelle stagionali** su `feat/seasonal-particles`, con petali, farfalle estive, foglie e neve, selezione del ricordo visibile e anteprima in Impostazioni → Aspetto. Architettura, preferenze e budget in [SEASONAL-PARTICLES.md](SEASONAL-PARTICLES.md); stato reale e verifiche aggiornate in `HANDOFF.md`. Le indicazioni sotto sull'assenza di particelle descrivono la revisione precedente. Dopo la preview l'utente ha autorizzato push e merge della versione finale.

Revisione successiva al feedback: gli album sono ora organizzati come **capitolo → singolo viaggio → diario/foto**, con persistenza e gestione dedicate. La foto del ricordo viene mostrata prima dei comandi; nodi, apertura, click e stagioni sono più visibili. Architettura, nuove API/migrazione e verifiche aggiornate sono in [ALBUMS.md](ALBUMS.md). Le sezioni di collaudo sotto descrivono il primo intervento; il totale aggiornato è 71 test.

## Preview locale

Sviluppo e collaudo sul branch `feat/immersive-experience`, inizialmente solo locali. Per la consegna con handoff l'utente ha poi autorizzato commit, push e merge su `main`, che può attivare Jenkins. Contesto aggiornato in `HANDOFF.md`.

La preview Docker ascolta soltanto su **http://localhost:3000**. Il database e i media sono nel volume locale del progetto Compose `akai-ito-scrapbook-preview`. Contiene ricordi dimostrativi e coordinate manuali dimostrative, separati dai dati di produzione. Account locale: `demo`, password `DiarioLocale2026!`.

```powershell
docker compose --env-file docker/preview.env.example build
docker compose --env-file docker/preview.env.example up -d --no-build --wait --wait-timeout 90
docker compose --env-file docker/preview.env.example ps
```

L'immagine si chiama `akai-ito:immersive-local`. Per fermarla conservando dati e fotografie:

```powershell
docker compose --env-file docker/preview.env.example stop
```

## P0 — Interazioni fondamentali

- **Filo originale:** `TimelineThread` in `scrapbook.tsx` e la progressione CSS durante lo scroll sono conservati. Un `IntersectionObserver` aggiunge una pulsazione finita ai nodi esistenti quando entrano nell'area di lettura. Nessun secondo filo verticale; nessuna nuova animazione continua o modifica al layout.
- **Navigazione:** React Router usa `createBrowserRouter` e la sua integrazione con le View Transitions native. `MemoryLink` prepara il dato del ricordo prima di cambiare pagina e trasmette fotografia selezionata e provenienza. La foto della card e la protagonista nel dettaglio condividono un nome di transizione. Il ritorno conserva filtri in URL e scroll; anche la cronologia del browser è gestita. La mappa riceve l'ID della foto e raggiunge le sue coordinate reali. Nei browser senza questa API rimangono routing normale e apertura CSS della pagina.
- **Polaroid:** sollevamento di 4 px, ombra, easing con ritorno elastico, nastro che si solleva; feedback di pressione touch senza catturare lo scroll. Lo sviluppo fotografico avviene al caricamento della prima visualizzazione della card nella sessione dell'app e sulle nuove anteprime di upload.

## P1 — Modalità immersive

### Rivivi la nostra storia

`useMapJourney` deriva le tappe dai dati di `/api/world`, senza scrivere coordinate. Esclude date non valide/future e coordinate non finite o fuori intervallo. Il backend mantiene il fallback già esistente dalla data EXIF alla data del ricordo. Nessuna coordinata mancante viene inventata.

Ogni tappa raggruppa foto dello stesso ricordo nello stesso luogo; ritorni successivi nello stesso posto restano ricordi distinti. Ordinamento cronologico stabile. Telecamera Leaflet con movimento di 1,6 s, fino a 2,2 s per spostamenti molto lontani e zoom limitato. Più foto della tappa si sfogliano con frecce dedicate. Il filo geografico cresce solo tra luoghi visitati e dichiara esplicitamente di essere simbolico, non un itinerario stradale. La linea gestisce il passaggio dell'antimeridiano e le copie della mappa.

La sosta dura 5,4 s; sono disponibili pausa/ripresa, riavvio, tappa successiva ed uscita. Al termine la riproduzione si ferma. Una data manuale chiude il viaggio. Trascinare la mappa o nascondere la scheda mette in pausa. Smontare la pagina cancella timer e movimento. Una sola tappa funziona senza collegamenti fittizi; senza GPS il lancio è disabilitato. Con movimento ridotto si visitano le tappe manualmente, senza voli automatici.

Su desktop la scheda sta sulla mappa; sotto 800 px sta subito sotto, per lasciare consultabile la cartografia e non coprire i pin. L'avvio porta al contenitore del viaggio e mette a fuoco il pannello; Escape chiude e restituisce il focus al comando di avvio.

### Sfoglia il diario

Il dettaglio ha carta, timbro, una foto protagonista, racconto e fotografie successive. L'apertura CSS è breve e non si sovrappone alla transizione nativa della pagina.

Il comando **Sfoglia il diario** attiva `?browse=1`. Solo allora viene richiesta la sequenza cronologica attraverso l'API paginata esistente; vengono conservati soltanto ID, titolo, data e copertina. Non si scaricano tutti i dettagli o tutte le foto. I pulsanti preparano il ricordo successivo prima della navigazione. Sono presenti numero pagina, precedente/successivo, uscita, frecce della tastiera e swipe orizzontale sul racconto. Input, link, pulsanti, selezione di testo e dialoghi non vengono intercettati. Lo scroll verticale touch resta disponibile.

Il comando compare soltanto se il ricordo appartiene a un album e la sequenza è sempre filtrata per quell'album. I ricordi da organizzare non hanno uno sfogliamento globale; i vecchi link `browse=1` vengono ripuliti. La pagina successiva viene verificata prima dell'apertura: se è stata spostata o eliminata, il diario rimane sulla pagina corrente e aggiorna la sequenza. Comandi duplicati, errori di caricamento e uscita durante una richiesta sono gestiti senza navigazioni tardive.

### Rivivi questo momento

`PhotoCinema` è importato dinamicamente e apre un dialogo nativo a pieno schermo, con focus contenuto, Escape, restituzione del focus e blocco dello scroll sottostante. Usa le risorse `display`, mai gli originali. Decodifica la foto corrente, conserva la precedente durante il caricamento e precarica solo la prossima durante la riproduzione. Le immagini sono `object-fit: contain`, con un margine che assorbe lo zoom delicato (massimo 1,035×).

Una foto dura 6,5 s, con dissolvenza di 900 ms e piccolo movimento orizzontale. Titolo, data, descrizione, avanzamento, frecce, swipe, pausa/avvio ed uscita restano disponibili. La sequenza si ferma alla fine; Avvia permette di ricominciare. Una sola foto non genera avanzamenti fittizi. Gli errori di caricamento mostrano Riprova. Con effetti ridotti/disattivati si sfoglia manualmente. La scheda nascosta mette in pausa senza ripartire da sola. Nessun audio.

## P2 — Atmosfera

- Nastri, timbri e nodi hanno microinterazioni contestuali finite. L'intro traccia un cuore con lo stesso linguaggio del filo.
- La stagione deriva dal mese della **data del ricordo**: primavera marzo–maggio, estate giugno–agosto, autunno settembre–novembre, inverno dicembre–febbraio. Piccola icona, nome e accenti carta; nessuna particella continua. Date assenti/non valide danno aspetto standard.
- L'intro compare soltanto dopo l'autenticazione, una volta per sessione della scheda (`sessionStorage`), dura 2 s, si salta con pulsante o Escape e contiene il focus. Non compare sul login né con movimento ridotto. Il timer viene cancellato alla rimozione.
- Sulla copertina desktop, solo con puntatore preciso, fotografie decorative, francobollo e filo rispondono al puntatore con spostamenti di pochi pixel. `requestAnimationFrame` accorpa gli aggiornamenti; nessun controllo interattivo viene spostato. Lo scroll muove il filo originale e l'ingresso nella viewport anima i nodi. Il parallasse è disabilitato su touch e con movimento ridotto.

## Preferenze e manutenzione

In **Impostazioni → Il ritmo del diario**:

- Completi: tutte le interazioni, incluse le riproduzioni avviate esplicitamente.
- Ridotti: modalità manuali, senza animazioni spaziali, intro o zoom.
- Disattivati: nessuna animazione; le funzioni restano disponibili.
- Atmosfera stagionale: interruttore indipendente.

Persistenza locale con `akai-motion` e `akai-seasons`. Gli eventi `storage` sincronizzano le altre schede. `prefers-reduced-motion` prevale sempre su Completi, anche se cambia durante l'utilizzo. Il valore effettivo è esposto da `useMotion` e da `html[data-motion]`; `useReducedMotion` è condiviso anche con la mappa. CSS e JavaScript usano lo stesso sistema. Le preferenze degli effetti non richiedono API o migrazioni; gli album con nome hanno invece la persistenza descritta in `ALBUMS.md`.

Le durate principali sono in `experience.ts` (`motionTokens`), pubblicate da `MotionProvider` come variabili CSS `--motion-*`. Gli easing carta e spring sono in `immersive.css`. Distanze piccole e variazioni decorative sono nello stesso foglio; per cambiare il ritmo partire dai token, non aggiungere timer locali scollegati. Stagioni, raggruppamento tappe e antimeridiano sono funzioni pure con test dedicati.

Non sono state aggiunte dipendenze: React, React Router, Query e Leaflet già presenti; CSS/SVG sostituiscono la necessità di un motore di animazione. I timer vengono cancellati negli effect, gli observer scollegati, i frame annullati. Niente `will-change` globale o motore WebGL. Cinema, mappa e selezione posizione sono caricati su richiesta. Timeline e dettaglio sono immediati nel bundle principale per evitare lo svuotamento della pagina durante uno shared transition. Tradeoff: bundle principale circa 484 kB / 152 kB gzip; Leaflet separato circa 162 kB / 48 kB gzip, cinema circa 4 kB / 2 kB gzip.

## File interessati

Nuovi:

- `apps/web/src/experience.ts`: token, intensità, stagioni e tappe.
- `apps/web/src/motion.tsx`: provider, impostazioni, intro, profondità, nodi e viewport.
- `apps/web/src/navigation.tsx`: link animati e preparazione del dettaglio.
- `apps/web/src/immersive.css`: sistema visivo, transizioni, responsive e accessibilità.
- `apps/web/src/components/DiaryBrowser.tsx`, `MapJourney.tsx`, `PhotoCinema.tsx`.
- `apps/web/test/experience.test.ts` e questo documento.

Integrati: `main.tsx`, `components.tsx`, `components/GeoMap.tsx`, pagine `Home`, `Timeline`, `Detail`, `Editor`, `Settings`, `World`, `world-hooks.ts`. Configurazione: `vitest.config.ts`, `tsconfig.tools.json`, immagine in `docker/preview.env.example`. La revisione successiva degli album aggiunge `collections.ts`, `0003_collections.sql`, i componenti di gestione e `refinements.css`, descritti in `ALBUMS.md`. Lockfile e pipeline Jenkins non cambiano. `scrapbook.tsx` rimane invariato.

## Verifica manuale

1. Aprire la preview in una nuova scheda e fare login. Osservare il filo/cuore per 2 s; in una nuova sessione provare Salta e Escape. Navigare: l'intro non ricompare.
2. Aprire Timeline e scorrere dall'inizio alla fine: un solo filo progressivo, pulsazione singola dei nodi. Passare sulle Polaroid con il mouse; su telefono toccarle e provare lo scroll.
3. Impostare filtri, scorrere e aprire un ricordo: foto e pagina diventano protagoniste. Tornare con Tra i nostri ricordi e con Indietro del browser: filtri e posizione si conservano.
4. Nel dettaglio scegliere Sfoglia il diario: provare pulsanti, frecce dopo aver messo a fuoco la barra, swipe sul testo e uscita. Nel campo commento le frecce devono modificare il cursore, non il ricordo.
5. Aprire Rivivi questo momento con una e più foto: aspettare l'avanzamento, mettere in pausa, usare frecce e swipe, arrivare alla fine e riavviare. Ridimensionare: immagine intera e controlli utilizzabili. Escape restituisce il focus al pulsante iniziale.
6. Da un ricordo geolocalizzato scegliere Ritrova questo luogo. Nella mappa avviare Rivivi la nostra storia: verificare date crescenti, luoghi reali, scheda e filo simbolico. Provare pausa, ripresa, successiva, riavvio, Escape, trascinamento e scelta manuale di una data. Aprire un'altra pagina durante la riproduzione.
7. In Impostazioni provare le tre intensità, ricaricare e verificare la persistenza. Attivare movimento ridotto nel sistema: Completi non deve riattivare voli, zoom, intro o parallasse. Le modalità restano sfogliabili manualmente.
8. Disabilitare Atmosfera stagionale, aprire un ricordo e verificare l'aspetto standard. Riabilitarla e confrontare ricordi in mesi diversi.
9. Su desktop muovere il puntatore sulla copertina: solo decorazioni con profondità lieve. Verificare anche 375, 430, 768 e 1440 px; nessuno scroll orizzontale. Provare normalmente modifica, upload, commenti, cestino, galleria e posizione manuale.

## Validazione e limiti

TypeScript, ESLint, 63 test automatici (55 esistenti e 8 nuovi), build completa web/API/shared e build Docker locale superati. I test esistenti coprono autenticazione, persistenza, ricordi, commenti, media, EXIF e GPS. La verifica browser Chromium sulla preview copre navigazione, ritorno con scroll/filtri, effetti ridotti e modalità immersive; screenshot a 375, 430, 768 e 1440 px. I casi senza GPS, con una sola tappa, più foto nello stesso luogo e ricordo senza foto usano risposte GET simulate nel browser, senza cambiare il database. I ricordi usati dal resto della preview sono dati reali del solo ambiente demo.

Gli artefatti di collaudo sono locali sotto `.tools/immersive-qa/` e ignorati da Git. Lo smoke test e la validazione responsive sono script Playwright locali; non richiedono dipendenze di produzione aggiuntive.

Esiti del collaudo locale del 14 novembre 2026, eseguito in più passaggi:

| Controllo                                                                      | Esito                                                                                 |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| TypeScript ed ESLint                                                           | Superati sul codice finale                                                            |
| Vitest                                                                         | 63 test superati, 3 file                                                              |
| Build produzione e immagine Docker                                             | Superate; container healthy su `127.0.0.1:3000`                                       |
| Layout di 8 pagine, viaggio e cinema a 375/430/768/1440 px                     | 40 controlli superati; contatore visibile anche su mobile                             |
| Flussi immersivi, tastiera, swipe, timer, stagioni e casi limite               | 29 controlli superati                                                                 |
| Smoke navigazione, filtri/scroll, focus, preferenze e mappa                    | 20 controlli superati                                                                 |
| Profondità desktop, riduzione movimento e filo originale durante lo scroll     | 5 controlli superati; un solo SVG della timeline                                      |
| Cinema singolo, commenti, posizione manuale, editor, cestino e pulizia fixture | 10 controlli superati, oltre a creazione/upload verificati prima sullo stesso ricordo |
| Uscita da Sfoglia durante una richiesta lenta                                  | Superata: nessuna navigazione tardiva                                                 |

Il ricordo temporaneo di collaudo è stato rimosso; i quattro ricordi dimostrativi iniziali e il cestino demo sono conservati. Il filo originale è stato verificato anche misurando la diminuzione dello `stroke-dashoffset` durante lo scroll; con effetti disattivati resta completo e leggibile. Nessun errore JavaScript nei passaggi conclusi e nessuna richiesta di fotografie originali da parte delle nuove modalità.

Limiti espliciti: collaudo automatizzato su Chromium desktop/emulazione touch, non su dispositivi fisici Safari/Firefox né sul Raspberry Pi. Le transizioni fotografiche native dipendono dal supporto browser; il fallback resta utilizzabile. Le stagioni seguono il calendario meteorologico dell'emisfero nord, senza inferire emisfero o clima dal GPS. Pausa/ripresa di una tappa o foto riparte con una sosta completa, non dal millisecondo residuo. La cartografia richiede rete esterna come prima e mantiene il proprio stato di errore accessibile. Coordinate e foto dimostrative non attestano viaggi reali. Nessuna verifica prestazionale sull'hardware di produzione viene dichiarata.
