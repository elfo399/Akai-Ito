# Le quattro stagioni

**Revisione mobile locale:** l'utente ha chiesto particelle anche al centro e davanti a foto/testo. Fino a 1000 px il Canvas globale viene portato nel body con un portal, livello decorativo `z-index: 50`, senza intercettare eventi. Distribuzione sull'intera larghezza, compresa la fascia centrale; tolte le maschere dei contenuti nel dettaglio mobile. Numero, forme, colori e preferenze invariati. Desktop oltre 1000 px conserva le fasce laterali e le maschere delle foto; anteprima Impostazioni confinata come prima. Dialoghi/cinema sospendono sempre il rendering e il movimento ridotto resta rispettato. Questa richiesta sostituisce su mobile la precedente scelta di proteggere foto e testo dal disegno, descritta nella cronologia sotto. Branch `style/mobile-seasonal-overlay`, solo preview locale; consegna e verifiche in `HANDOFF.md`.

**Versione finale:** petali, piccole farfalle corallo/terracotta con apertura lenta delle ali, foglie e neve. L'utente ha autorizzato push e merge di questa versione dopo la preview. Primavera, autunno e inverno sono approvati e non vanno riprogettati; le farfalle sostituiscono i precedenti tentativi con lucciole/pulviscolo estivi.

Branch `feat/seasonal-particles`, partito da `main` `87175e2`. Dopo il collaudo Docker l'utente ha autorizzato push e merge su `main`, con la pipeline Jenkins esistente. Verificare lo SHA e l'esito reale del deploy. Nessuna modifica backend/database, migrazione o cancellazione di volumi fa parte di questo intervento. Typecheck, lint, 92 test e build Docker superati; contesto di consegna in `HANDOFF.md`.

## Come provarle

La preview esistente è su **http://localhost:3000** (account demo locale documentato in `HANDOFF.md`). Aprire **Impostazioni → Aspetto → Un soffio tra le pagine**. Le particelle partono con **Delicate / Automatico** se gli effetti e l'atmosfera stagionale sono attivi. Scegliere **Immersive** per confrontare la densità e i quattro pulsanti in **Anteprima delle stagioni** per vedere petali, farfalle, foglie e neve. Pausa/Riprendi ferma soltanto l'anteprima. Selezionare una stagione qui non cambia la modalità del diario.

La preview ha una carta colorata per rendere leggibili le forme, soprattutto neve e farfalle. Nelle pagine il Canvas è trasparente e non filtra le fotografie. Nel dettaglio desktop usa due fasce laterali per evitare che la carta opaca nasconda tutte le particelle; Polaroid, testo e comandi sono esclusi dal disegno. Nella nuova revisione mobile il Canvas attraversa invece anche centro, foto e testo. Lo sfondo esterno e la carta del ricordo seguono la stessa stagione delle particelle, con una transizione colore di 1,5 s. Un ricordo invernale in modalità Automatico resta invernale anche se oggi è autunno. La modalità Stagione attuale cambia insieme colori e particelle. Lo strato colore è separato: resta statico con particelle spente o movimento ridotto, sparisce con Atmosfera stagionale spenta.

```powershell
docker compose --env-file docker/preview.env.example build
docker compose --env-file docker/preview.env.example up -d --no-build --wait --wait-timeout 90
```

I dati restano nel volume già esistente. Non usare `down -v` per aggiornare la preview.

## Architettura

- `seasonal.ts`: configurazione visiva, generazione, densità, preferenze valide, selezione del ricordo e gestione dei due strati di transizione. Importa il calendario civile già esistente da `experience.ts`.
- `useActiveSeason.ts`: osserva i marcatori `data-particle-date`/`data-particle-id` già associati alle card e al dettaglio. Non esegue richieste di dati e non modifica il filo della timeline.
- `components/SeasonalAtmosphere.tsx`: sceglie la politica della pagina e il livello discreto di Home/album.
- `components/SeasonalParticles.tsx`: un Canvas 2D, un solo ciclo `requestAnimationFrame`, forme Path2D condivise, comprese ali e corpo delle farfalle. Nessuna immagine o libreria esterna, nessun WebGL.
- `components/SeasonalParticleSettings.tsx`: controlli e anteprima confinata, con lo stesso renderer delle pagine.
- `motion.tsx`: estende il provider esistente con due preferenze. `seasonal.css` gestisce solo lo strato decorativo e la nuova area nelle Impostazioni.

Canvas permette di muovere poche forme illustrate senza componenti React per particella né aggiornamenti di stato a ogni fotogramma. Non vengono caricati asset remoti, introdotte API o aggiunte dipendenze. `api.ts` protegge inoltre la formattazione di date civili assenti/non valide con «Data non disponibile», anziché interrompere il rendering del ricordo.

## Stagioni e stabilizzazione

Calendario meteorologico dell'emisfero nord, tramite `seasonFor`: marzo–maggio primavera, giugno–agosto estate, settembre–novembre autunno, dicembre–febbraio inverno. Le date `YYYY-MM-DD` dei ricordi non passano da conversioni UTC. La stagione corrente usa anno/mese/giorno locali e si aggiorna alla mezzanotte locale o tornando alla scheda. Data non valida: nessuna atmosfera inventata.

La banda di lettura è il 20–80% dell'altezza della viewport. Un `IntersectionObserver` scopre i candidati; la selezione usa la distanza dal centro e un'isteresi dell'8% per conservare il ricordo attivo quando due card sono quasi equivalenti. Lo scroll viene accorpato dopo 90 ms di quiete, poi il candidato deve stabilizzarsi per 450 ms. Durante gli spazi tra card si conserva l'ultima stagione; liste vuote, filtri e cambi pagina sono gestiti separatamente. Un observer delle modifiche DOM permette di agganciare i contenuti caricati in modo asincrono.

Le particelle in uscita continuano a muoversi mentre sfumano in 1,5 secondi; le nuove entrano con lo stesso tempo. Al massimo due strati, eliminazione degli strati spenti e riuso dello strato precedente se si torna rapidamente alla stessa stagione. Non si accumulano motori o code di transizioni.

| Vista | Automatico |
| --- | --- |
| Home | Stagione attuale, densità discreta |
| Timeline | Ricordo centrale stabilizzato |
| Dettaglio | Data del ricordo |
| Album | Ricordo visibile se presente, altrimenti stagione attuale; densità discreta |
| Impostazioni | Solo la finestra di anteprima |
| Mappa, editor, cestino, login | Nessuna particella |
| Cinema e dialoghi | Rendering sospeso e Canvas ripulito |

**Stagione attuale** sostituisce la selezione automatica solo nelle viste ammesse. Il livello globale è `fixed`, `pointer-events: none`, senza layout o overflow. Su desktop resta nello stacking context isolato dei contenuti; su mobile è nel body e davanti alla pagina e ai launcher, mentre i popover/dialoghi nativi mantengono il proprio top layer. L'anteprima ha un suo stacking context e un ritaglio locale.

Nel **dettaglio desktop** il medesimo Canvas usa un livello decorativo anteriore con due fasce laterali (`framedParticleX`), dimensionate dallo spazio intorno alla Polaroid. Non aumenta la densità. Dopo il disegno vengono ripuliti i rettangoli protetti di foto, testo, controlli, commenti e navigazione: nessun pixel di foglia, neve o alone attraversa la Polaroid. La geometria si aggiorna con scroll, resize e modifiche del contenuto, senza misurazioni DOM a ogni frame quando la pagina è ferma. Su mobile foglie e petali conservano il raggio massimo 8 px e la neve il contorno più leggibile, ma la nuova sovrapposizione attraversa foto e testo senza quelle maschere. Tornando alle altre viste desktop si ripristina il livello di sfondo.

## Preferenze

`akai-particles`: `off`, `delicate` (default), `immersive`. `akai-particle-season`: `auto` (default), `current`. Lettura protetta dello storage, validazione dei valori e sincronizzazione tra schede con lo stesso provider già usato da `akai-motion` e `akai-seasons`.

Particelle assenti se il livello è Disattivate, l'atmosfera stagionale è spenta, gli effetti generali sono Disattivati o il sistema richiede `prefers-reduced-motion: reduce`. Quest'ultimo blocco vale anche per l'anteprima. Con effetti generali Ridotti ma senza la preferenza di sistema, densità al 55%, velocità al 55% e opacità ridotta. Un messaggio nell'anteprima spiega quale interruttore ne sospende il funzionamento.

## Ritoccare la resa

I parametri sono in `particleTuning` in `seasonal.ts`; le forme illustrate sono nella funzione `shapes()` del renderer.

| Stagione | Colori | Dimensione base | Velocità verticale | Oscillazione |
| --- | --- | --- | --- | --- |
| Primavera | `#df9eb4`, `#efb6c7`, `#d58ca5` | 6–12 px | 17–31 px/s | 25 px |
| Estate | corallo/terracotta `#b96959`, `#c88067`, `#a95b58` | 7–10 px | Volo lieve verso l'alto 5–10 px/s | 18 px |
| Autunno | `#a75a42`, `#c5844f`, `#b29443`, `#865947` | 7–14 px | 19–34 px/s | 35 px + vento diagonale |
| Inverno | `#fffdf5`, `#f7f7f0`, `#f5f8f7`, contorno `#4f6f88bf` | 2,4–4,5 px | 12–26 px/s | 15 px |

Dimensione e velocità vengono modulate dalla profondità (0,55–1); Delicate rallenta ulteriormente al 80%. Forme dei petali con incisione, tre forme di foglia con venature, neve con alcuni piccoli fiocchi a sei punte. Le farfalle risalgono con oscillazioni sfalsate e apertura orizzontale delle ali tra il 45% e il 100%, senza lampeggiare. Opacità, fase e rotazione differiscono per particella. Le particelle che cadono si rigenerano sopra la viewport; le farfalle sotto. Dissolvenza ai bordi in entrambi i casi.

Le palette di sfondo/carta sono in `seasonal.css`: primavera `#edf0e5`/`#eef3e5`, estate `#f4e5d9`/`#faede3`, autunno `#f4e7d9`/`#fae7d4`, inverno `#dce5ec`/`#e5edf3`. Il colore viene dalla stessa `useActiveSeason` che alimenta il Canvas, evitando sfondo corrente autunnale e particelle del ricordo invernali. La neve mantiene il riempimento bianco e usa un contorno blu-grigio da 1 px per restare leggibile anche sui fondi chiari.

Per l'estate, due ali illustrate simmetriche usano la palette `summer.colors`, con un tratto sottile per corpo e antenne. Nessun alone, glitter o punto luminoso. Nel dettaglio su telefono la dimensione è limitata a 7,5 px prima dell'apertura delle ali. L'anteprima è «Un battito d’estate», su fondo pesca.

## Budget e ciclo di vita

Desktop: 12 particelle Delicate / 23 Immersive, con 8/13 farfalle per l'estate. Sotto 600 px: 5/9, con 4/6 farfalle. Home e album usano il 65% della densità e un'opacità più contenuta; le preferenze ridotte si applicano in aggiunta. Durante il cambio possono coesistere due gruppi. L'anteprima usa il budget del dispositivo anche quando il riquadro è più stretto.

Rendering limitato a circa 30 fps via RAF e delta time, con delta massimo di 50 ms al ritorno da una pausa. Device pixel ratio massimo 1,5 e massimo 2,4 milioni di pixel interni. ResizeObserver mantiene forma e risoluzione corrette. Le forme e l'alone sono preparati una volta; gli oggetti particella vengono riusati durante l'animazione. Nessun setState React per fotogramma. Observer, timer e frame vengono cancellati allo smontaggio, anche in StrictMode.

Il ciclo si ferma con scheda nascosta, riquadro fuori viewport/nascosto o dialogo aperto, e riparte senza recuperare il tempo perso. La modalità senza data si ferma dopo la dissolvenza dell'ultima stagione. La resa e i tempi vanno valutati sul browser del telefono: il Raspberry serve i file, mentre il Canvas viene eseguito sul dispositivo che apre il diario.

## Verifiche

I test di `apps/web/test/seasonal.test.ts` coprono calendario/date non valide, preferenze, limiti di densità, selezione centrale/isteresi, distribuzione e numero massimo di strati. Eseguire typecheck, lint, test e build Docker prima di consegnare. I risultati del collaudo browser e i limiti effettivi sono riportati nell'ultimo aggiornamento di `HANDOFF.md`; non sono dichiarati benchmark su dispositivi fisici o browser diversi da quelli realmente provati.

Collaudo locale concluso: typecheck/lint, **90 test in 6 file**, build Docker e container healthy; **54 controlli Chromium** sui flussi e **18** su sincronizzazione/ciclo di vita/responsive. Screenshot delle quattro stagioni, due fotogrammi distinti per ognuna e video sotto `.tools/seasonal-qa/` (ignorati da Git). Nel campione finale di anteprima su Docker: 60 disegni in 2 secondi, mediana 33,3 ms e p95 34,2 ms. Le date della timeline e la data non valida nei test sono risposte GET simulate; nessun contenuto demo viene modificato. Test di visibilità scheda simulato, test di anteprima nascosta e smontaggio reale via navigazione. Verificati 375, 430, 768, 1440 px e DPR 3 emulato; nessuna dichiarazione di prove su telefoni fisici o Safari/Firefox.
