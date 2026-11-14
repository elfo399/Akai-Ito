# Il nostro mondo

Funzione integrata nel diario esistente, sul branch `feat/our-world-map`, insieme al redesign Scrapbook. Sviluppo e verifiche eseguiti in locale; nessun merge su `main`, deploy in produzione o intervento su Jenkins.

## Utilizzo

Aprire **http://localhost:3000/world**, oppure scegliere **Il nostro mondo** nella navigazione. Restano validi gli account locali della preview.

La pagina mostra le fotografie archiviate nel database, senza contenuti geografici dimostrativi incorporati nel codice. Le foto prive di coordinate rimangono nel diario senza un pin. Le vecchie foto della preview possono quindi lasciare inizialmente vuota la mappa: non vengono geolocalizzate dal titolo o dalla descrizione.

Per assegnare un punto, aprire un ricordo, scegliere **Imposta posizione** sotto la fotografia, toccare la mappa oppure inserire latitudine e longitudine, quindi salvare. Entrambi gli utenti vedono la stessa posizione. Il dialogo permette correzione e rimozione e distingue posizioni EXIF, manuali e rimosse. Non cambia gli originali. Un punto rimosso manualmente non viene ripristinato dalle importazioni EXIF successive.

Il cursore rosso e il campo data filtrano inclusivamente: `dataScatto <= dataSelezionata`. Frecce, Home ed End funzionano da tastiera. **Torna a oggi** interrompe la riproduzione. Gli scatti con data futura restano nascosti fino al giorno corrispondente.

**Rivivi la nostra storia** parte dall'inizio e avanza fino a oggi, con pausa, ripresa e riavvio. Nascondere la scheda interrompe la riproduzione. Con movimento ridotto l'autoplay è disabilitato; la navigazione manuale rimane disponibile. Il pulsante di centratura inquadra i luoghi visibili, senza spostamenti automatici durante la riproduzione.

I pin singoli sono piccole Polaroid con cuore e ritaglio quadrato; i gruppi sono cerchi compatti con cuore e numero, per lasciare leggibile la cartografia. Le foto vicine vengono raggruppate in base allo zoom. Nel popup rimangono le anteprime grandi, il carosello e il collegamento al ricordo. L'area interattiva dei pin rimane di almeno 44 px. Il contatore dei luoghi distingue coordinate arrotondate a cinque decimali, indipendentemente dai gruppi visivi. Le cartoline sotto la mappa sono mostrate dodici per volta.

## EXIF e migrazione

**`apps/api/migrations/0002_photo_locations.sql`** aggiunge quattro colonne nullable a `memory_media`: `latitude`, `longitude`, `captured_on`, `location_source`. Non ricrea tabelle, non modifica ricordi o coordinate esistenti e non cambia le fotografie. Si applica con il meccanismo di migrazioni versionate già presente.

Nei nuovi upload JPEG, PNG e WebP, Sharp estrae il blocco EXIF dall'originale validato ed **exifr** legge soltanto GPS e `DateTimeOriginal`. Coordinate e date vengono validate. La data EXIF viene conservata come data civile della fotocamera, senza conversioni di fuso. Se manca, vale la data evento del ricordo, mai quella di upload. Metadati danneggiati non impediscono di conservare una fotografia valida.

Le miniature e le immagini ottimizzate continuano a perdere EXIF/GPS, come nella V1. Gli originali restano intatti e protetti. Coordinate e date sono nel database privato. Gli aggiornamenti manuali e le importazioni applicate incrementano la versione del ricordo; una modifica concorrente genera HTTP 409 e il dialogo permette di ricaricare i dati aggiornati.

## Importare metadati già archiviati

Il comando è separato dall'avvio e **non viene mai eseguito automaticamente**. La modalità predefinita è dry-run. Legge sequenzialmente gli originali dei ricordi attivi; non riscrive file e non sovrascrive posizioni presenti, correzioni o rimozioni manuali. Rieseguirlo non modifica i record già completati. I ricordi nel cestino sono esclusi; dopo un ripristino si può rieseguire il comando.

Per la preview locale, fermare l'app durante la manutenzione:

```sh
docker compose --env-file docker/preview.env.example stop app
docker compose --env-file docker/preview.env.example run --rm --no-deps app node apps/api/dist/cli.js import-photo-metadata --dry-run
```

Il riepilogo contiene solo conteggi: analizzati, senza GPS, scelte manuali protette, aggiornamenti possibili/applicati ed errori. Non contiene coordinate, nomi file o identificativi.

Dopo aver esaminato il dry-run, applicare esplicitamente e riaprire l'app:

```sh
docker compose --env-file docker/preview.env.example run --rm --no-deps app node apps/api/dist/cli.js import-photo-metadata --apply
docker compose --env-file docker/preview.env.example up -d --wait
```

Con Node locale, dopo le migrazioni:

```sh
npm run import-photo-metadata -- --dry-run
npm run import-photo-metadata -- --apply
```

Non sono stati eseguiti import sui dati di produzione.

## API autenticate

| Metodo e percorso                 | Risultato                                                                                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/world`                  | Foto con posizione dei ricordi attivi, data effettiva e fonte, origine della posizione, prima data, conteggio senza GPS e configurazione cartografica. |
| `GET /api/world?until=YYYY-MM-DD` | Foto filtrate inclusivamente. Il frontend scarica la raccolta una volta e filtra localmente durante la riproduzione.                                   |
| `GET /api/world/config`           | Configurazione delle tile per il selettore del punto.                                                                                                  |
| `PUT /api/media/:id/location`     | `{latitude, longitude, version}`: coordinate entrambe valide oppure entrambe `null`. Restituisce foto aggiornata e nuova versione.                     |

Tutti usano le sessioni esistenti; il PUT richiede origine e CSRF validi. Non vengono restituiti percorsi fisici. Le foto dei ricordi eliminati non sono consultabili o modificabili tramite le API geografiche. Autenticazione e permessi condivisi restano invariati.

## Provider cartografico

Configurazione facoltativa in `.env.example`, inoltrata anche da Compose:

| Variabile             | Predefinito                                      |
| --------------------- | ------------------------------------------------ |
| `MAP_TILE_URL`        | `https://tile.openstreetmap.org/{z}/{x}/{y}.png` |
| `MAP_ATTRIBUTION`     | `© OpenStreetMap contributors`                   |
| `MAP_ATTRIBUTION_URL` | `https://www.openstreetmap.org/copyright`        |
| `MAP_MAX_ZOOM`        | `19`                                             |

Il template usa HTTPS e un host fisso con `{z}`, `{x}`, `{y}`. La CSP permette le immagini dall'origine configurata oltre alle origini locali esistenti. L'attribuzione è testo, non HTML arbitrario. Riavviare il servizio dopo un cambio di configurazione. Eventuali token nel template sono credenziali pubbliche da browser, non segreti del backend.

Con OpenStreetMap: attribuzione visibile, URL ufficiale, referrer presente tramite `strict-origin-when-cross-origin`, cache browser ordinaria, sole tile della visuale (`keepBuffer=0`, aggiornamento a spostamento concluso), nessun prefetch o download offline. Nessuna chiamata di geocoding. Il provider riceve comunque l'area cartografica richiesta, come indicato nella pagina. Se le tile non sono disponibili, rimangono utilizzabili cartoline e inserimento numerico delle coordinate.

Riferimenti verificati: [politica tile OSM](https://operations.osmfoundation.org/policies/tiles/), [React Leaflet](https://react-leaflet.js.org/docs/start-installation/), [exifr](https://github.com/MikeKovarik/exifr).

## File principali

- `apps/api/src/photo-metadata.ts`, `import-photo-metadata.ts`, `map-config.ts`: parsing, importazione e provider.
- `apps/api/src/app.ts`, `schema.ts`, `cli.ts`, `migrations/0002_photo_locations.sql`: upload, API, campi e comando.
- `packages/shared/src/world.ts`: tipi, date, filtro e raggruppamento per celle proiettate con gestione dell'antimeridiano, senza confronto di ogni coppia di fotografie.
- `apps/web/src/pages/World.tsx`, `components/GeoMap.tsx`, `components/PhotoPositionDialog.tsx`, `world-hooks.ts`, `world.css`: pagina, mappa, popup, correzioni, movimento e stile.
- `apps/web/src/pages/Detail.tsx`, `main.tsx`, `components.tsx`, `types.ts`, `scrapbook.css`: integrazione nel diario e navigazione mobile.
- Manifest e lock npm: Leaflet 1.9, React Leaflet 5, tipi Leaflet ed exifr; nessun aggiornamento intenzionale delle dipendenze precedenti. Leaflet viene caricato con la pagina o il selettore, non sulla home.

## Verifica e limiti

Typecheck e lint superati; **55 test automatici superati** (34 preesistenti e 21 nuovi), build completata anche nell'immagine Docker finale e `git diff --check` superato. Il container della preview è sano e `/api/health` restituisce `{"status":"ok"}`. I test coprono EXIF, fallback, coordinate invalide, API, CSRF, condivisione, conflitti, eliminazione, filtro inclusivo, raggruppamento, antimeridiano, diecimila foto coincidenti e migrazione di un database V1.

**31 controlli browser sulla mappa** superati: layout a 375, 768 e 1440 px, gruppi, popup contenuti nello schermo, carosello, filtro inclusivo, tastiera, inserimento/correzione/rimozione manuale, persistenza, play/pausa/riavvio e termine a oggi, movimento ridotto e attribuzione. **22 controlli di regressione e preview** superati sulle schermate esistenti e sull'accesso a `/world` nella preview utente. Nessun errore JavaScript rilevato.

Verifica visuale con Chromium headless e progetto Docker QA separato dalla preview. Le fixture dei test automatici sono nel solo volume QA. Nella preview locale sono state successivamente assegnate posizioni dimostrative manuali alle sei foto esistenti, su richiesta dell'utente: questi dati restano nel volume locale e non vengono versionati. Screenshot e log locali in `.tools/world-qa/` e `.tools/world-browser.log`, ignorati da Git. Nessuna verifica su Safari, Firefox o telefoni fisici.

La correzione finale dei pin è stata verificata con altri **28 controlli browser**, comprese foto verticali, orizzontali e quadrate e popup a 375, 768 e 1440 px. Gli screenshot nei collegamenti seguenti sono artefatti della sessione locale: non sono inclusi nel repository.

| Screenshot QA (fixture isolate) | Collegamento locale |
| --- | --- |
| Mappa desktop | [1440 px](../.tools/world-qa/world-1440.png) |
| Mappa tablet | [768 px](../.tools/world-qa/world-768.png) |
| Mappa mobile | [375 px](../.tools/world-qa/world-375.png) |
| Popup mobile | [375 px](../.tools/world-qa/popup-375.png) |
| Selettore posizione | [375 px](../.tools/world-qa/position-375.png) |
| Preview utente durante la verifica iniziale | [1440 px](../.tools/world-qa/preview-world-1440.png) |

Non vengono ricavate coordinate da titolo o racconto, né riconosciuto automaticamente il luogo fotografato. Non vengono lette date XMP/IPTC o date di caricamento al posto della data evento. Le foto esistenti richiedono import esplicito o un punto manuale. Non sono presenti ricerca indirizzi, geocoding, mappe offline o sincronizzazione cloud.
