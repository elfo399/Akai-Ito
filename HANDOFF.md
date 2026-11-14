# Handoff — Akai Ito

Aggiornato il **15 novembre 2026**. Questo documento permette di riprendere il lavoro senza la chat precedente.

## Rifinitura successiva alla consegna

Dopo il merge `03f1d3b` e la build Jenkins #4 conclusa con SUCCESS, l'utente ha chiesto etichette stagionali più piccole, metadati meglio allineati e **Album** attivo nel menu quando si è dentro un ricordo. Le modifiche sono state prima pubblicate sul branch `fix/compact-memory-metadata` (`3a89e9e`). Il 15 novembre 2026 l'utente ha poi autorizzato la consegna completa delle rifiniture, incluso lo stile uniforme descritto sotto, con push e merge su `main` e conseguente pipeline Jenkins.

Le stagioni sono ora testo e icona compatti senza riquadro: accanto alla data nelle card e nella riga autore/luogo nel dettaglio. Il testo del ricordo ha una colonna centrata e coerente con i metadati. Album risulta attivo su dettaglio, creazione e modifica dei ricordi; Timeline resta attiva nella pagina timeline. File coinvolti: `components.tsx`, `pages/Detail.tsx`, `refinements.css`. Superati typecheck, lint, build Docker e controllo browser a 375, 430, 768, 1100 e 1440 px.

L'utente ha poi chiesto di ridurre anche i pulsanti nel ricordo. In `refinements.css` le azioni Rivivi, Luogo, Sfoglia, Modifica e invio commento sono ora alte 34 px su desktop, con icone da 14 px e padding ridotto. Su touch mantengono target da 44 px; i due comandi sotto la foto hanno spaziatura orizzontale compatta. La barra Sfoglia è più bassa e l'invio del pensiero resta un piccolo pulsante allineato al campo, senza occupare tutta la riga su mobile. La modifica è limitata ai controlli della pagina ricordo: cinema, mappa e dialoghi mantengono le proprie dimensioni. Build Docker e 28 controlli browser su 375, 768 e 1280 px superati; collaudo locale e consegna nello stesso branch.

Dopo il push del commit `3a89e9e`, l'utente ha chiesto uno stile diverso e poi ha rifiutato la proposta che mescolava pulsanti con accento laterale e azioni sottolineate. La versione consegnata usa pulsanti graficamente omogenei: tutti i comandi del ricordo, incluse azioni secondarie e icone, hanno lo stesso fondo beige opaco, testo bruno, bordo sottile e angoli da 8 px. Niente sottolineature, gradienti o accenti laterali; hover e focus sono coerenti. I colori sono centralizzati nelle variabili `--memory-action-*` di `refinements.css`. Le dimensioni compatte restano quelle sopra. Verificati build Docker, 31 controlli responsive e 4 controlli su hover, tastiera, cinema e stato disabilitato. L'utente ha autorizzato push e merge su `main` di questa versione.

## Da leggere per primo

Il progetto è un diario fotografico privato per due persone, con stile Scrapbook: carta crema, Polaroid, nastri adesivi, annotazioni e filo rosso. L'utente comunica in italiano e vuole vedere cambiamenti funzionanti, verificati nel browser e in Docker locale.

**Stato del prodotto:** la revisione immersiva, gli album per singolo viaggio e le successive rifiniture sono implementati e verificati. L'ultima richiesta è pubblicare tutto e unire su `main`, inclusi pulsanti uniformi, metadati compatti e navigazione Album corretta. Non è richiesta una nuova riprogettazione.

**Consegna Git iniziale, completata:** codice e documentazione su `feat/immersive-experience`, push e merge su `main` (`03f1d3b`), con Jenkins #4 SUCCESS. **Consegna attuale autorizzata:** commit, push e merge su `main` delle rifiniture da `fix/compact-memory-metadata`. La pipeline può avviare il deploy sul Raspberry e va verificata sullo SHA corretto; per richieste successive seguire le nuove istruzioni dell'utente.

Repository: `https://github.com/elfo399/Akai-Ito.git`.
Base da cui è iniziata questa revisione: `bd06b301250eee8f4a86eb0fa915ba226ca991aa` (`feat: add scrapbook redesign and interactive photo world`).
Branch di lavoro: `feat/immersive-experience`. Il contenuto di questo handoff viene consegnato insieme alle modifiche; usare `git log` per leggere gli SHA finali, senza assumere che coincidano con quello di base.

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

L'effetto desiderato rimane un diario intimo, elegante e artigianale. Niente particelle continue, rotazioni eccessive, dashboard tecnologica o musica automatica.

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
