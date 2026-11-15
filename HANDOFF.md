# Handoff — Akai Ito

Aggiornato il **15 novembre 2026**. Questo documento permette di riprendere il lavoro senza la chat precedente.

## Consegna autorizzata — azioni flottanti sulla mappa

Il 15 novembre 2026 l'utente ha chiesto di **pubblicare e unire a main il lavoro già pronto**, prima di iniziare una nuova proposta per la navigazione. Sono autorizzati commit, push e merge delle azioni flottanti della mappa, del componente condiviso e della documentazione su `style/world-floating-actions`. Questa autorizzazione sostituisce il precedente vincolo locale per questa modifica. Verificare SHA finale, Jenkins e deploy. La successiva revisione della navbar va preparata e mostrata in locale, separatamente da questa consegna.

## Azioni flottanti anche sulla mappa

L'utente ha chiesto di raccogliere anche i pulsanti della pagina mappa in un unico comando flottante. In **Il nostro mondo**, il pulsante **Azioni** segue lo scroll e contiene Rivivi/Pausa/Riprendi, Riavvia dall'inizio, Esci dal viaggio, Torna a oggi, cursore temporale e data precisa. Durante il viaggio mostra **Tappa N di M**. Sotto la mappa rimangono data corrente e conteggi; zoom, centratura e comandi contestuali delle foto e della scheda viaggio restano sulla mappa/scheda.

Estratto `components/FloatingActions.tsx` dal menu dei ricordi per condividere presentazione, Popover API, focus, Escape e clic esterno. `MemoryActions` usa questo componente mantenendo il comportamento precedente. In `useMapJourney`, `dismiss()` ferma/chiude senza spostare il focus, mentre `close()` lo restituisce al pulsante: cambiare data dal pannello non sottrae il focus al campo o al cursore. Escape con il menu aperto chiude solo il menu; movimento ridotto preservato. File: `pages/World.tsx`, `components/MapJourney.tsx`, `components/MemoryActions.tsx`, nuovi `components/FloatingActions.tsx` e `world-actions.css`. Nessuna dipendenza, API o modifica dati.

Branch **`style/world-floating-actions`**, da `main` `109ca94`; pubblicazione autorizzata nella consegna sopra. Preview Docker aggiornata e healthy su **http://localhost:3000/world**, con volume e dati demo preservati. Superati typecheck/lint, **94 test automatici**, build Docker, **38 controlli Chromium sulla mappa** e **34 di regressione sul menu ricordi**: scroll, focus/Escape/clic esterno, filtro data/cursore da tastiera, oggi, viaggio/pausa/riavvio/uscita, movimento ridotto e mappa vuota. Layout verificato a 375/430/768/1280 px e altezza ridotta a 667 px; screenshot desktop/mobile esaminati, nessun overflow o errore JavaScript, nessuna scrittura dati. Artefatti ignorati `.tools/world-actions-qa/`, relativi script/log e `.tools/world-actions-memory-regression.log`. Nessun test su dispositivi fisici o Safari/Firefox dichiarato.

## Consegna completata — atlante, azioni flottanti e commenti

Consegna completata: feature `875c155`, merge su `main` **`109ca94e06e2552ea15216b6b20d712ca71e2136`**, **Jenkins #8 SUCCESS**, 94 test e immagine corrispondente allo SHA distribuito. Verificati health e asset pubblici di atlante, azioni e commenti; API private ancora protette (401). I vincoli locali nei paragrafi storici sotto descrivono il lavoro prima di questa pubblicazione.

Il 15 novembre 2026 l'utente ha autorizzato **push e merge su main di tutte le modifiche locali**, incluso questo handoff. La consegna parte da `style/diary-map`, basato su `main` `3216161`, e comprende la mappa in stile diario con terre più leggibili, il menu flottante delle azioni del ricordo, il nuovo campo commenti e la correzione del cleanup Leaflet. Questa autorizzazione sostituisce i precedenti vincoli di sola preview locale riportati nella cronologia sotto. Verificare con Git e Jenkins SHA finale, merge e deployment: `main` avvia la pipeline. Dati Docker e account demo non sono inclusi nel codice.

Verifiche locali concluse: typecheck, lint, **94 test automatici in 6 file**, build Docker healthy e collaudi Chromium descritti sotto. Per riprendere il lavoro, seguire le nuove richieste dell'utente e controllare lo stato effettivo della consegna.

## Campo commenti come biglietto

L'utente ha chiesto di rivedere graficamente la parte in cui si inseriscono i commenti. Il compositore ora è un biglietto crema a righe con margine rosso, avatar e firma in alto, suggerimento e invio compatto sotto il testo. La sezione è centrata e larga al massimo 820 px; il messaggio vuoto è integrato nel biglietto. Su mobile il footer si dispone in colonna e il pulsante resta allineato a destra. Focus visibile sul biglietto e pulsante flottante Azioni nascosto mentre il modulo ha focus, per lasciare libera la scrittura. Il campo di modifica usa le stesse righe; limite 3000 caratteri, API, conferme e logica di invio restano invariati. Nessuna animazione nuova.

File: `apps/web/src/pages/Detail.tsx`, nuovo `apps/web/src/comments.css`. Stesso branch `style/diary-map`, insieme alla mappa e alle azioni flottanti descritte sotto; pubblicazione autorizzata nella consegna attuale. Docker locale aggiornato e healthy su **http://localhost:3000**; dati e volumi preservati.

Verifiche: typecheck, lint, **94 test automatici in 6 file**, build Docker e **26 controlli Chromium**, con screenshot esaminati su desktop e mobile. Nessun overflow a 375/430/768/1280/1440 px; provati stati vuoto/focus/testo, limite caratteri, frecce nel campo, errore con testo conservato, invio riuscito, modifica, annullamento e conferma cancellazione, visibilità del pulsante Azioni e assenza di errori JavaScript. Tutte le scritture commenti sono state simulate, senza cambiare i dati demo. Artefatti ignorati: `.tools/comments-design-qa/` e relativi script/log. Nessun collaudo su dispositivi fisici o Safari/Firefox dichiarato.

## Azioni flottanti nel ricordo, solo locale

L'utente ha chiarito che vuole riunire i pulsanti **Sfoglia il diario, Rivivi, Modifica, ecc.** del ricordo, non i comandi della mappa. Le azioni del dettaglio sono ora nel pulsante flottante **Azioni**, in basso a destra: diario (solo con album), cinema (solo con foto), luogo (solo con coordinate), modifica, posizione delle foto e cestino. Le posizioni multiple si scelgono da una lista con miniature. Sotto le foto resta soltanto la didascalia della posizione; i comandi di invio commento e dei dialoghi restano contestuali ai loro campi. La conferma prima di spostare nel cestino è conservata.

Il pulsante è un portal nel body, quindi segue la viewport anche durante lo scroll. Pannello non modale con Popover API nativa, chiusura con Escape/clic esterno e focus restituito al pulsante. Su telefono resta sopra la barra di navigazione. In modalità diario il pulsante mostra **Pagina N di M**; navigazione, tastiera e swipe rimangono limitati allo stesso album. `DiaryBrowser` espone `renderActions` mantenendo il comportamento precedente come default e non crea sequenze per i ricordi da organizzare. Due test aggiunti per questo contratto.

File: nuovi `components/MemoryActions.tsx` e `memory-actions.css`, integrazione in `pages/Detail.tsx`, `components/DiaryBrowser.tsx` e test `apps/web/test/diary.test.ts`. I collegamenti testuali del menu usano navigazione normale; apertura delle card e sfogliamento conservano le transizioni precedenti. Nel collaudo del ritorno dalla mappa è emerso un errore Leaflet di cleanup: `TravelCamera` ora controlla con `map.getPane("mapPane")` che la mappa esista prima di fermarla. `MapContainer.remove()` ferma già le animazioni quando distrugge i pannelli; una seconda chiamata a `stop()` causava `_leaflet_pos` mancante. Ritorno mappa → ricordo verificato dopo la correzione.

Branch ancora **`style/diary-map`**, con le precedenti rifiniture grafiche della mappa conservate. Tutto solo locale, nessun commit/push richiesto. Preview Docker healthy su **http://localhost:3000**. Superati typecheck/lint, **94 test automatici in 6 file**, build Docker e **34 controlli Chromium**: scroll/focus/Escape/clic esterno, cinema e ritorno, scelta della foto per la posizione, conferma cestino senza cancellazione, editor/mappa e ritorno, diario/tastiera/swipe, ricordi senza album o senza foto, layout e barra mobile a 375/430/768/1280 px. Nessuna scrittura di contenuti nel collaudo. Artefatti ignorati in `.tools/memory-actions-qa/`, log/script sotto `.tools/`. I primi tentativi interrotti per timing o per il bug Leaflet corretto non sono dichiarati come suite concluse; il passaggio finale non ha errori JS. Test solo Chromium, non dispositivi fisici/Safari/Firefox.

## Lavoro locale precedente — mappa come pagina di diario

Ultimo feedback: l'utente approva il nuovo atlante e chiede terre emerse più visibili. Ritoccato solo il filtro delle tessere: maggiore contrasto prima della viratura, terra color carta chiara e mare salvia desaturato, per leggere meglio coste e continenti. Foto, marcatori e comandi non filtrati; cornice e decorazioni invariate. Preview locale aggiornata, nessun push autorizzato per questa revisione.

L'utente ha chiesto di rendere la mappa più simile a una mappa del diario, mostrando il precedente planisfero azzurro. Branch locale **`style/diary-map`**, basato su `main` `3216161`. La consegna delle stagioni è già completata: merge `3216161`, Jenkins #7 SUCCESS e immagine corretta distribuita. Per questa successiva revisione grafica della mappa non sono stati richiesti né eseguiti commit, push o merge.

In **Il nostro mondo** la mappa ora ha un aspetto da atlante cartaceo: tonalità calde/desaturate applicate soltanto alle tessere, cornice di carta con nastro agli angoli, pieghe leggere, timbro, rosa dei venti decorativa e scala metrica reale. Titolo «L’atlante dei nostri ricordi», annotazione sotto la mappa e comandi del tempo più compatti, in beige coerente col resto del diario. Le foto dei segnaposto e dei popup mantengono i colori originali; dimensioni compatte dei marker conservate. Attribuzione e comandi restano visibili/interattivi, decorazioni senza pointer events.

File: nuovo `apps/web/src/diary-map.css` (stili limitati a World), `pages/World.tsx` (cornice/annotazioni), `components/GeoMap.tsx` (prop opzionale `showScale`, false di default, e ScaleControl della libreria già installata). Nessuna nuova dipendenza, backend, posizione, coordinata o dato modificato. Selettore posizione nell'editor mantiene la resa precedente. Il viaggio rimane sulla mappa su desktop e sotto la mappa su telefono; preferenze di movimento ridotto rispettate, particelle stagionali ancora escluse dalla mappa.

Preview Docker healthy e aggiornata: **http://localhost:3000/world**. Verificati typecheck/lint, **92 test automatici**, build Docker e **30 controlli Chromium**, inclusi 375/430/768/1100/1440 px, cartografia caricata, scala/zoom/centra, popup e link al ricordo, filtro data/oggi, viaggio desktop e mobile, movimento ridotto, attribuzione, nessun overflow o errore JS e nessuna scrittura di contenuti. Le foto sono state verificate senza filtri sugli antenati DOM. Gli screenshot iniziali del viaggio durante l'ingresso animato non sono l'esito finale: il collaudo concluso attende l'animazione. Artefatti ignorati in `.tools/diary-map-qa/`, log/script sotto `.tools/`. Nessuna prova su dispositivi fisici o Safari/Firefox dichiarata.

## Consegna precedente — le quattro stagioni

Il 15 novembre 2026, dopo la prova in Docker, l'utente ha chiesto **push e merge su main** della versione finale delle particelle stagionali, compresa l'estate con farfalle corallo/terracotta. Questa richiesta sostituisce il precedente vincolo di sola preview locale. Branch di consegna `feat/seasonal-particles`, basato su `main` `87175e2`; verificare SHA finale, merge e pipeline con Git e Jenkins. La consegna precedente di diario e Impostazioni è completata con `87175e2`, Jenkins #6 SUCCESS.

Versione finale: **petali sakura, farfalle estive, foglie autunnali e neve**. Primavera, autunno e inverno sono approvati e non vanno riprogettati. L'estate è stata cambiata dopo il feedback sul giallo poco visibile: niente lucciole o pulviscolo; farfalle illustrate `#b96959`, `#c88067`, `#a95b58`, apertura lenta delle ali, volo lieve verso l'alto, fondo pesca. Pochi elementi (4/6 mobile, 8/13 desktop, Delicate/Immersive); anteprima «Un battito d’estate».

Il sistema estende MotionProvider con storage locale sincronizzato tra schede (`akai-particles`, `akai-particle-season`). In **Impostazioni → Aspetto → Un soffio tra le pagine**: Disattivate/Delicate/Immersive, Automatico/Stagione attuale, anteprima delle quattro stagioni e pausa/ripresa. Default Delicate/Automatico. Atmosfera spenta ed effetti generali spenti disattivano le particelle; `prefers-reduced-motion` blocca sempre l'animazione. Colori stagionali statici conservati quando si spengono solo le particelle o il sistema riduce il movimento.

Home segue la data attuale; timeline e dettaglio seguono il ricordo visibile/data civile, con stabilizzazione e crossfade di 1,5 s. Sfondo esterno e carta del dettaglio usano la stessa stagione delle particelle; inverno azzurro-grigio e neve con contorno visibile. Nel dettaglio le particelle passano lungo due margini, con foto, testo, controlli e commenti esclusi dal disegno. Mappa, editor, cestino e login esclusi. Rendering sospeso con cinema/dialoghi, scheda o anteprima nascosta. Filo originale e album per viaggio conservati.

Un Canvas 2D, un solo RAF limitato a circa 30 fps, massimo due strati, DPR massimo 1,5 e risoluzione massima 2,4 milioni di pixel. Nessuna dipendenza, API, migrazione o modifica backend aggiunta. `api.ts` rende innocue le date civili non valide mostrando «Data non disponibile». Documentazione e parametri in **docs/SEASONAL-PARTICLES.md**.

Verifiche finali locali: typecheck, lint, **92 test automatici in 6 file** (15 nuovi rispetto ai 77 della consegna precedente), build Docker e preview healthy su **http://localhost:3000**. Collaudi Chromium conclusi in più passaggi: 54 controlli iniziali, 18 su ciclo di vita/sincronizzazione, 25 sulla visibilità nel dettaglio, 16 su colori coerenti e 18 sull'ultima estate con farfalle. Verificati 375/430/768/1100/1440 px, date non valide e stagioni simulate tramite sole risposte GET, foto senza pixel sovrapposti, cinema, preferenze e movimento ridotto. Nessuna modifica ai contenuti demo. I collaudi dei tentativi estivi abbandonati non descrivono la resa finale.

Artefatti ignorati sotto `.tools/`: `seasonal-qa/`, `detail-particles-qa/`, `season-background-qa/`, **summer-butterflies-qa/** e relativi script/log. Disponibili screenshot, sequenze di fotogrammi e un video del primo collaudo. Nessuna verifica su telefoni fisici, Safari/Firefox o benchmark Raspberry viene dichiarata. Dati Docker separati dal codice; nessun volume eliminato e nessun dato demo pubblicato tramite Git.

## Consegna autorizzata: diario e Impostazioni

Il 15 novembre 2026 l'utente ha chiesto **push di tutto e merge su main**, includendo la correzione dello sfogliamento, la riorganizzazione delle Impostazioni, i test e questo handoff. La consegna parte da `fix/album-diary-navigation`; usare `git log` e lo stato reale di Jenkins per verificare SHA finale, merge e deploy. I controlli locali sono conclusi: 77 test, typecheck, lint, build Docker, 23 controlli browser sul diario e 37 sulle Impostazioni. Dati e account Docker restano separati dal codice e non vengono pubblicati tramite Git.

## Riorganizzazione Impostazioni — ultima richiesta

Dopo la correzione del diario l'utente ha chiesto di riorganizzare la schermata Impostazioni. La pagina ora ha tre sezioni: **Il nostro diario** (nomi, data e copertina), **Il tuo account** (profilo/avatar e password), **Aspetto** (effetti e stagioni). Menu laterale su desktop, schede orizzontali su mobile, collegamento Cestino sempre disponibile nel menu. Titolo e spaziatura più compatti, copertina più visibile e pulsanti beige coerenti con quelli già approvati.

Le schede supportano tastiera, frecce, Home/End e mantengono i campi non salvati passando da una sezione all'altra. Messaggi di successo/errore mostrati solo nella sezione pertinente. L'intensità degli effetti usa tre scelte con descrizione al posto del select; salvataggio locale automatico e rispetto del movimento ridotto del sistema invariati. API, dati e meccanismi di autenticazione non modificati.

File: `apps/web/src/pages/Settings.tsx`, nuovo `apps/web/src/settings.css`, presentazione di `MotionSettings` in `apps/web/src/motion.tsx`. Nessuna dipendenza nuova. Lavoro sullo stesso branch `fix/album-diary-navigation`, insieme alla correzione sotto; push e merge autorizzati per entrambi gli interventi. Preview Docker aggiornata e healthy su **http://localhost:3000/settings**.

Verifiche: typecheck, lint, **77 test automatici** e build Docker superati. **37 controlli Chromium**: sezioni, campi mantenuti, tastiera, selettore copertina, segnaposto senza copertina, feedback e payload di salvataggio diario/profilo, validazione/errore password, persistenza preferenze, movimento ridotto e assenza di overflow a 375, 430, 768, 1280 e 1440 px. Le scritture HTTP nel collaudo sono state simulate per preservare account, password e dati demo; preferenze browser ripristinate. Artefatti ignorati sotto `.tools/settings-qa/`; nessun collaudo su dispositivi fisici o Safari/Firefox.

## Correzione locale dello sfogliamento — stato attuale

L'ultima consegna UI è completata: commit `cb99926`, merge su `main` `712819c`, Jenkins #5 SUCCESS con immagine corrispondente allo SHA distribuito. Dopo questa consegna l'utente ha segnalato un bug aprendo un ricordo da organizzare e scegliendo Sfoglia: partiva una sequenza globale e, passando a un ricordo assegnato, il contatore cambiava da 1 di 5 a 1 di 1.

La correzione è sul branch `fix/album-diary-navigation`, basato su `712819c`, e nella preview Docker healthy su **http://localhost:3000**. Il successivo push e merge sono autorizzati insieme alla riorganizzazione delle Impostazioni; verificare l'esito della pipeline sullo SHA consegnato.

- I ricordi senza album non mostrano Sfoglia il diario e non attivano tastiera, swipe o richieste di una sequenza globale. I vecchi link `?browse=1` vengono ripuliti conservando gli altri parametri e il contesto di ritorno.
- Lo sfogliamento richiede sempre l'ID dell'album. Prima di cambiare pagina verifica il dettaglio aggiornato: una pagina spostata in un altro album non viene aperta. Errori e pagine eliminate mantengono il ricordo corrente e consentono di aggiornare/riprovare.
- Richieste duplicate bloccate; uscire durante un caricamento non provoca navigazioni tardive. Prima/ultima pagina e ricordo non più presente nella sequenza hanno stati espliciti.
- File principali: `components/DiaryBrowser.tsx`, `refinements.css`, nuovo `apps/web/test/diary.test.ts`; `tsconfig.tools.json` abilita JSX per importare il componente nei test senza nuove dipendenze.

Verifiche di questa correzione: typecheck, lint, **77 test automatici in 5 file** (6 nuovi sul diario), build Docker e **23 controlli browser Chromium** su desktop e mobile a 375 px. Provati navigazione ripetuta, tastiera/swipe, ritorno browser, album singolo, doppio comando, richiesta lenta/uscita, errore e retry, pagina spostata/eliminata tramite risposte simulate. Nessuna modifica ai dati per queste simulazioni. Artefatti ignorati: `.tools/diary-scope-qa/`, log build/test sotto `.tools/`.

## Rifinitura successiva alla consegna

Dopo il merge `03f1d3b` e la build Jenkins #4 conclusa con SUCCESS, l'utente ha chiesto etichette stagionali più piccole, metadati meglio allineati e **Album** attivo nel menu quando si è dentro un ricordo. Le modifiche sono state prima pubblicate sul branch `fix/compact-memory-metadata` (`3a89e9e`). Il 15 novembre 2026 l'utente ha poi autorizzato la consegna completa delle rifiniture, incluso lo stile uniforme descritto sotto, con push e merge su `main` e conseguente pipeline Jenkins.

Le stagioni sono ora testo e icona compatti senza riquadro: accanto alla data nelle card e nella riga autore/luogo nel dettaglio. Il testo del ricordo ha una colonna centrata e coerente con i metadati. Album risulta attivo su dettaglio, creazione e modifica dei ricordi; Timeline resta attiva nella pagina timeline. File coinvolti: `components.tsx`, `pages/Detail.tsx`, `refinements.css`. Superati typecheck, lint, build Docker e controllo browser a 375, 430, 768, 1100 e 1440 px.

L'utente ha poi chiesto di ridurre anche i pulsanti nel ricordo. In `refinements.css` le azioni Rivivi, Luogo, Sfoglia, Modifica e invio commento sono ora alte 34 px su desktop, con icone da 14 px e padding ridotto. Su touch mantengono target da 44 px; i due comandi sotto la foto hanno spaziatura orizzontale compatta. La barra Sfoglia è più bassa e l'invio del pensiero resta un piccolo pulsante allineato al campo, senza occupare tutta la riga su mobile. La modifica è limitata ai controlli della pagina ricordo: cinema, mappa e dialoghi mantengono le proprie dimensioni. Build Docker e 28 controlli browser su 375, 768 e 1280 px superati; collaudo locale e consegna nello stesso branch.

Dopo il push del commit `3a89e9e`, l'utente ha chiesto uno stile diverso e poi ha rifiutato la proposta che mescolava pulsanti con accento laterale e azioni sottolineate. La versione consegnata usa pulsanti graficamente omogenei: tutti i comandi del ricordo, incluse azioni secondarie e icone, hanno lo stesso fondo beige opaco, testo bruno, bordo sottile e angoli da 8 px. Niente sottolineature, gradienti o accenti laterali; hover e focus sono coerenti. I colori sono centralizzati nelle variabili `--memory-action-*` di `refinements.css`. Le dimensioni compatte restano quelle sopra. Verificati build Docker, 31 controlli responsive e 4 controlli su hover, tastiera, cinema e stato disabilitato. L'utente ha autorizzato push e merge su `main` di questa versione.

## Da leggere per primo

Il progetto è un diario fotografico privato per due persone, con stile Scrapbook: carta crema, Polaroid, nastri adesivi, annotazioni e filo rosso. L'utente comunica in italiano e vuole vedere cambiamenti funzionanti, verificati nel browser e in Docker locale.

**Stato del prodotto:** revisione immersiva, album per singolo viaggio, rifiniture, correzione dello sfogliamento e Impostazioni sono pubblicati. Le particelle stagionali sono implementate e verificate; la pubblicazione della versione finale con farfalle estive è autorizzata.

**Consegne Git completate:** prima `feat/immersive-experience` su `main` (`03f1d3b`, Jenkins #4 SUCCESS), poi le rifiniture da `fix/compact-memory-metadata` (`712819c`, Jenkins #5 SUCCESS). La pipeline può avviare il deploy sul Raspberry e va verificata sullo SHA corretto; per richieste successive seguire le nuove istruzioni dell'utente.

Repository: `https://github.com/elfo399/Akai-Ito.git`.
Base da cui è iniziata questa revisione: `bd06b301250eee8f4a86eb0fa915ba226ca991aa` (`feat: add scrapbook redesign and interactive photo world`).
Branch della consegna corrente: `feat/seasonal-particles`, da unire a `main`; `fix/album-diary-navigation` è già unito a `main` con `87175e2`. `feat/immersive-experience` conserva la revisione iniziale. Verificare sempre `git status` e `git log` prima di riprendere.

## Riprendere su un altro PC

Per ricevere la consegna completa, incluse le ultime rifiniture UI:

```sh
git clone https://github.com/elfo399/Akai-Ito.git
cd Akai-Ito
git switch main
git pull --ff-only
git status --short --branch
git log -5 --oneline --decorate
```

In un clone esistente: controllare prima il lavoro locale, quindi `git fetch origin`, `git switch main` e `git pull --ff-only`. Il branch `fix/compact-memory-metadata` conserva anche la storia separata delle rifiniture.

Se il repository esiste già, verificare prima `git status` e preservare qualsiasi lavoro locale; poi aggiornare il branch appropriato. Per ispezionare separatamente il lavoro della revisione, il branch remoto è `origin/feat/immersive-experience`. Non creare un nuovo progetto, non riscrivere la cronologia e non ripartire dal vecchio stato solo perché manca la chat.

Leggere questo file, `docs/ALBUMS.md` e `docs/IMMERSIVE-EXPERIENCE.md`, poi seguire la nuova richiesta dell'utente. I dati dinamici di Git e Jenkins vanno verificati: questo documento descrive il contesto della consegna, non sostituisce lo stato corrente del repository o della pipeline.

## Docker locale

Requisito sufficiente per la preview: Docker con Compose v2. Dalla radice:

```sh
docker compose --env-file docker/preview.env.example build
docker compose --env-file docker/preview.env.example up -d --no-build --wait --wait-timeout 90
docker compose --env-file docker/preview.env.example ps
```

Aprire **http://localhost:3000**. Il file di preview configura:

- progetto Compose `akai-ito-scrapbook-preview`;
- immagine `akai-ito:immersive-local`;
- ascolto solo `127.0.0.1:3000`;
- cookie HTTP locali (`COOKIE_SECURE=false`);
- volume `akai-ito-scrapbook-preview_diary-data`, montato in `/app/data`.

Sul PC precedente il container era healthy. Le migrazioni additive vengono eseguite automaticamente dal comando Compose prima dell'avvio del server.

**Un clone trasferisce codice e documenti, non il volume Docker.** Su un altro PC il database locale iniziale è vuoto. I demo descritti sotto non vengono creati automaticamente, né sono dati di produzione. Per inizializzare i due account di una preview nuova e vuota:

```sh
docker compose --env-file docker/preview.env.example exec app node apps/api/dist/cli.js init-users
```

Il comando è interattivo e rifiuta la reinizializzazione di un database che ha già gli account. Per avere gli stessi ricordi/foto demo serve trasferire separatamente il volume locale o ricreare dati dimostrativi, concordando con l'utente cosa conservare. Non importare dati demo in produzione. Questa consegna non esporta il volume e non introduce un sistema di backup.

Nel volume del PC precedente: account demo `demo`, password **solo locale** `DiarioLocale2026!`; due album demo, **Lago di Braies** con due giornate e quattro foto, **Tra le montagne** con un ricordo e una foto. Esistono anche gli altri ricordi demo e una pagina nel cestino. La seconda giornata del lago è stata aggiunta appositamente per mostrare lo sfogliamento interno e usa una copia di una foto demo. Le coordinate manuali del dataset sono dimostrative.

Per fermare la preview senza eliminare i dati:

```sh
docker compose --env-file docker/preview.env.example stop
```

Non usare `down -v` per un normale aggiornamento: elimina il volume. Se cambia la porta locale, aggiornare coerentemente `PORT` e `APP_ORIGIN`.

## Cosa abbiamo realizzato

### Esperienza immersiva

- Il filo verticale della timeline è quello originale, un solo `TimelineThread` in `scrapbook.tsx`. Il riempimento durante lo scroll è conservato. I nodi raggiunti hanno due pulsazioni finite, anello più evidente e stato rosso persistente.
- React Router usa `createBrowserRouter` con vere route figlie e `Outlet`. Le View Transitions native collegano la foto della card alla protagonista del dettaglio; dove non sono supportate rimane il fallback CSS. Timeline e dettaglio sono importati subito per evitare il vuoto da Suspense durante la transizione. Le modalità più pesanti rimangono lazy.
- Il ritorno alla timeline conserva filtri in URL e posizione dello scroll. `MemoryLink` prepara il dato prima di navigare, conserva provenienza e foto selezionata e dà feedback di pressione.
- Le Polaroid hanno hover, ombra, lieve rotazione e feedback touch. La galleria normale apre la fotografia con un sollevamento di 650 ms.
- Lo sviluppo fotografico delle card dura 1,7 s: da sbiadita/grigia a colori. Parte solo quando la foto caricata è effettivamente nella viewport, non fuori schermo; non si ripete al normale rerender o tornando alla foto nella stessa sessione dell'app. Le anteprime di nuovi upload usano lo stesso linguaggio.
- Nel dettaglio la foto viene subito dopo titolo e data compatti; autore, luogo e comandi sono dopo la foto. Non deve tornare quasi fuori dalla prima schermata, come accadeva nella prima versione. Il rapporto delle immagini viene rispettato senza un riquadro alto vuoto per gli scatti orizzontali.
- **Sfoglia il diario**: precedente/successivo, tastiera, swipe sul racconto, numero pagina, uscita. Se il ricordo appartiene a un album, la sequenza resta limitata a quell'album.
- **Rivivi questo momento**: dialogo fotografico a schermo intero, immagini `display` con `contain`, Ken Burns leggero, dissolvenze, titolo/data/testo, pausa, frecce, swipe ed uscita. Precarica solo il necessario e non scarica tutti gli originali. Si ferma quando la scheda viene nascosta.
- **Rivivi la nostra storia**: viaggio cronologico Leaflet fra coordinate reali, scheda fotografica, pausa/ripresa/riavvio/successiva/uscita. Foto dello stesso ricordo e luogo raggruppate. Filo geografico progressivo dichiarato simbolico, non itinerario stradale. Nessuna coordinata inventata; nessun GPS disabilita il viaggio, una tappa sola non disegna collegamenti fittizi.
- **Ritrova questo luogo** collega il dettaglio alla mappa sulla foto selezionata.
- Stagioni dalla data del ricordo: carta, bordo e badge con icona/nome; calendario meteorologico dell'emisfero nord, aspetto standard se manca la data. Non applicare filtri stagionali alle fotografie.
- Intro di circa 2 s, dopo autenticazione, saltabile, una volta per sessione della scheda. Profondità leggera sulla copertina desktop, disattivata su touch.
- Preferenze locali **Completi / Ridotti / Disattivati**, più interruttore stagioni. `prefers-reduced-motion` prevale sempre. Storage: `akai-motion`, `akai-seasons`; intro: `sessionStorage['akai-intro']`.

### Album: decisione centrale dell'utente

**Album → capitolo (Viaggi) → singolo viaggio con nome (Barcellona, Amsterdam, ecc.) → diario / fotografie.**

L'utente ha rifiutato il precedente comportamento che mescolava tutte le foto di tutti i viaggi nella categoria. Ogni viaggio deve avere il proprio diario, contenere più giornate/ricordi e mostrare solo le proprie foto. Non tornare a raggruppare automaticamente per il solo capitolo.

Implementato:

- creazione e rinomina di album con nome e descrizione;
- aggiunta di ricordi esistenti, anche più di uno in una transazione;
- nuovo ricordo preassegnato all'album da cui si parte;
- scelta/creazione album nell'editor, spostamento e rimozione dell'assegnazione;
- viste **Il diario** e **Le fotografie**, conteggi, date e copertina derivati dai contenuti attivi;
- pagine precedenti senza album in **Ricordi da organizzare**, senza attribuzioni inventate dal titolo/GPS;
- eliminazione del solo album che conserva foto, ricordi e commenti, compresi i ricordi nel cestino;
- uno stesso ricordo appartiene al massimo a un album, senza duplicare media;
- stesso livello di album con nome disponibile anche negli altri capitoli.

Persistenza: `0003_collections.sql`, tabella `collections`, campo nullable `memories.collection_id`, foreign key `ON DELETE SET NULL`. Migrazione additiva, verificata su un database precedente. Le assegnazioni devono rispettare la categoria; controlli di versione e transazioni impediscono scritture parziali/obsolete. La categoria dell'album non si cambia dopo la creazione; si spostano i ricordi dall'editor.

I vecchi endpoint `/api/albums` e `/api/albums/:category` restano compatibili. Nuovi endpoint `/api/collections`, `/api/collections/:id`, `/api/collections/:id/memories`; filtri `collectionId` e `collectionId=unassigned` su `/api/memories`. Dettagli in `docs/ALBUMS.md`.

## Feedback da preservare

La prima versione aveva animazioni troppo impercettibili e troppi titoli/pulsanti prima della foto. Sono stati corretti questi aspetti e l'organizzazione degli album. L'utente ha già approvato, per ora, cinema fotografico, viaggio sulla mappa, filo geografico, collegamento al luogo, intro, profondità e preferenze. L'ultima revisione è accettata: attendere la prossima richiesta concreta, senza inventare un redesign ulteriore o una backlog inesistente.

L'effetto desiderato rimane un diario intimo, elegante e artigianale. Le particelle stagionali sono state richieste esplicitamente: mantenerle delicate e facoltative. Niente rotazioni eccessive, dashboard tecnologica o musica automatica.

## Mappa dei file

| Area                                            | File principali                                                                     |
| ----------------------------------------------- | ----------------------------------------------------------------------------------- |
| Routing, provider, CSS                          | `apps/web/src/main.tsx`                                                             |
| Token, stagioni e tappe pure                    | `apps/web/src/experience.ts`                                                        |
| Preferenze, intro, observer, profondità, scroll | `apps/web/src/motion.tsx`                                                           |
| Navigazione e preparazione dati                 | `apps/web/src/navigation.tsx`                                                       |
| Motion iniziale / rifiniture e album            | `apps/web/src/immersive.css`, `refinements.css`                                     |
| Card, layout e componenti condivisi             | `apps/web/src/components.tsx`                                                       |
| Filo verticale originale da conservare          | `apps/web/src/scrapbook.tsx`, `scrapbook.css`                                       |
| Diario, cinema, viaggio mappa                   | `components/DiaryBrowser.tsx`, `PhotoCinema.tsx`, `MapJourney.tsx`                  |
| Mappa e posizioni                               | `components/GeoMap.tsx`, `PhotoPositionDialog.tsx`, `pages/World.tsx`               |
| Album e gestione                                | `pages/Albums.tsx`, `components/CollectionForm.tsx`, `CollectionPicker.tsx`         |
| Apertura e scrittura del ricordo                | `pages/Detail.tsx`, `Editor.tsx`                                                    |
| Home / preferenze                               | `pages/Home.tsx`, `Settings.tsx`                                                    |
| Backend album                                   | `apps/api/src/collections.ts`, integrazione in `app.ts`                             |
| Schema e migrazione album                       | `apps/api/src/schema.ts`, `apps/api/migrations/0003_collections.sql`                |
| Tipi / validazione                              | `apps/web/src/types.ts`, `packages/shared/src/index.ts`                             |
| Test                                            | `apps/api/test/{app,world,collections}.test.ts`, `apps/web/test/experience.test.ts` |

I percorsi `components/` e `pages/` nella tabella sono relativi ad `apps/web/src/`. Nessuna dipendenza nuova introdotta per questa revisione.

## Verifiche realmente eseguite

- TypeScript: superato.
- ESLint: superato.
- Vitest: **71 test superati in 4 file**, inclusi 8 nuovi sugli album e 8 funzioni pure dell'esperienza immersiva. I test precedenti su autenticazione, media, ricordi, commenti, EXIF e GPS restano superati.
- Build completa web/API/shared e immagine Docker: superate; preview healthy.
- Browser Chromium: **375, 430, 768, 1440 px**, screenshot e controlli su overflow, foto iniziale visibile, categorie, album, diario e foto isolate.
- Ultima revisione: **36 controlli di layout/contenuti**, **20 sui flussi**, **5 sullo sviluppo fotografico**, conclusi in più passaggi. Provati anche creazione/rinomina, assegnazione, persistenza, rimozione e cancellazione del solo album. Fixture temporanee rimosse.
- In precedenza: ritorno con scroll/filtri, focus, tastiera/swipe, riduzione movimento, pause/timer, zero GPS, una tappa, più foto nello stesso luogo, ricordo senza fotografie. Un solo SVG della timeline con progressione misurata durante lo scroll.

Non sono stati eseguiti test su dispositivi fisici, Safari/Firefox o un benchmark sul Raspberry per questa revisione. Le transizioni native dipendono dal browser e hanno fallback.

Per i controlli sul nuovo PC: installare **Node 24.x** e npm, poi:

```sh
npm ci
npm run build -w @akai/shared
npm run typecheck
npm run lint
npm test
npm run build
```

Non trasferire `node_modules` tra sistemi: reinstallare le dipendenze, incluse quelle native. Sul vecchio PC Node non era nel PATH; si è usato un runtime ignorato sotto `.tools/node-v24.22.3-win-x64/`. Non è un requisito del progetto né un percorso da riprodurre.

## Cosa Git non trasferisce

`.env`, `data/`, `node_modules/`, `dist/`, `.tools/`, log, screenshot e dati Docker sono esclusi da Git. Le utility Playwright e i seed locali erano in `.tools/`, con artefatti in `.tools/immersive-qa/` e `.tools/album-refinement-qa/`: non aspettarsi di trovarli dopo un clone. I test Vitest, il codice, le migrazioni e la documentazione sono invece versionati. Le utility ignorate non sono necessarie per avviare l'app.

I log dei vecchi script browser possono includere tentativi interrotti per selettori o timing del test, seguiti da riesecuzioni mirate riuscite. Le quantità sopra riguardano controlli realmente conclusi; non presentare una singola vecchia esecuzione incompleta come una suite CI completa.

## Produzione e Jenkins

La configurazione esistente è documentata in `docs/JENKINS.md` e nel `Jenkinsfile`. Repository → webhook GitHub → Jenkins → agent Docker ARM64 sul Raspberry. Il deploy è limitato a `main`; l'ultima richiesta dell'utente autorizza il merge della presente consegna.

Job: `https://jenkins.elfo3.dev/job/Akai-Ito/`.
App: `https://akaiito.elfo3.dev`.
Healthcheck: `/api/health`.

Su `main`, Jenkins esegue il target Docker `ci` (typecheck, lint, test e build), crea l'immagine con tag SHA e usa `scripts/jenkins-deploy.sh`. Lo script e la configurazione infrastrutturale non sono stati riscritti per questa revisione. La nuova migrazione album deve essere presente nell'immagine prima dell'avvio. Verificare che la build considerata corrisponda allo SHA consegnato; il solo HTTP 200 del sito non dimostra che sia in esecuzione il nuovo codice.

Non usare gli account demo per la produzione. Non dedurre credenziali, stato dei dati reali o stato corrente della pipeline dai vecchi documenti. Nessun nuovo sistema di backup richiesto: quel tema è stato esplicitamente rimandato dall'utente.

## Primo messaggio utile al prossimo agent

> Leggi AGENTS.md e HANDOFF.md. Il redesign immersivo e gli album per singolo viaggio sono già implementati e accettati. Verifica branch e stato Git, considera i dati Docker separati dal codice e riprendi dalla mia nuova richiesta senza rifare il progetto.
