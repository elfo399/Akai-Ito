# Fase 2 — revisione locale Scrapbook

Il lavoro prosegue ora sul branch `feat/our-world-map`, conservando questo redesign e aggiungendo [Il nostro mondo](WORLD.md). La preview attuale usa l'immagine `akai-ito:world-local`.

Branch iniziale del redesign: `feat/phase2-scrapbook-ui`; il lavoro completo prosegue su `feat/our-world-map`. Nessun merge su `main` o deploy in produzione è stato eseguito.

## Preview Docker

Aprire **http://localhost:3000**. La preview usa il progetto Compose `akai-ito-scrapbook-preview`, l'immagine `akai-ito:world-local` e il volume dedicato `akai-ito-scrapbook-preview_diary-data`. La porta è pubblicata soltanto su `127.0.0.1`.

Avvio o aggiornamento dalla radice del repository:

```sh
docker compose --env-file docker/preview.env.example up -d --build --wait
```

Stato e arresto, mantenendo i dati:

```sh
docker compose --env-file docker/preview.env.example ps
docker compose --env-file docker/preview.env.example stop
```

Il volume di questa sessione contiene un diario dimostrativo con quattro ricordi, sei fotografie paesaggistiche, due commenti e una pagina ripristinabile nel cestino. I nomi e la data visualizzati provengono dalle impostazioni del database dimostrativo. Non sono valori predefiniti del frontend. Le credenziali dimostrative sono state comunicate nella conversazione.

Su un volume nuovo, inizializzare i propri due utenti con il comando già disponibile nella V1:

```sh
docker compose --env-file docker/preview.env.example exec app node apps/api/dist/cli.js init-users
```

Non usare `down -v`: eliminerebbe i dati del volume. Non utilizzare questa configurazione HTTP locale per la produzione.

## Schermate e componenti

- **Home:** copertina composta da fogli sovrapposti, dedica con nomi reali delle impostazioni, contatore, Polaroid, indice del diario e ricordi recenti.
- **Timeline:** curve SVG continue, nodi collegati alle schede alternate, anni e finale con cuore e frase richiesta; filo laterale su mobile. Filtri più leggibili e utilizzabili al tocco.
- **Dettaglio:** titolo di capitolo, data a timbro, foglio con margine, collage fotografico e biglietti distinguibili anche tramite testo per autore corrente e partner.
- **Galleria:** titolo e posizione corrente, apertura discreta, tastiera e swipe esistenti preservati, chiusura con Escape e ritorno del focus alla fotografia di partenza.
- **Editor:** sezioni di carta, campi validati con messaggi associati, caricamento anche trascinando file, anteprime Polaroid numerate, copertina esplicita, riordino tramite pulsanti, stato delle modifiche e conferma prima di seguire un link con modifiche non salvate. I campi vengono disabilitati durante il salvataggio.
- **Login, album, impostazioni e cestino:** materiali e gerarchia coerenti, copertine cucite degli album, focus visibile e azione distruttiva distinta nel cestino.
- **Navigazione:** logo coerente, sezione attiva anche nelle sottopagine, `aria-current`, focus e posizione della pagina ripristinati al cambio percorso.

## Filo e asset

`apps/web/src/scrapbook.tsx` contiene il marchio SVG a filo aperto, il nastro, il foglio riutilizzabile, il filo della timeline e il finale. Il filo misura i nodi tramite `ResizeObserver`, aggiornando la geometria solo al ridimensionamento del contenuto. L'animazione progressiva usa CSS scroll timeline quando supportata; gli altri browser mostrano il filo completo. Con `prefers-reduced-motion` il filo rimane interamente visibile e senza animazione.

`apps/web/src/scrapbook.css` estende i layout V1 con i materiali e gli adattamenti della Fase 2. La favicon SVG usa lo stesso marchio della navbar e del login. Font locali esistenti conservati; nessuna nuova dipendenza applicativa. Le foto dimostrative sono nel volume locale, non negli asset distribuiti dell'applicazione.

## Verifica

- `npm run typecheck`: superato.
- `npm run lint`: superato.
- `npm test`: **34 test superati**.
- `npm run build`: superato; eseguito anche nella build Docker finale.
- `git diff --check`: superato.
- Container avviato con healthcheck; `GET /api/health` restituisce `{"status":"ok"}`.
- Verifica browser Chromium headless su home, timeline, dettaglio, creazione e modifica, album, singolo album, impostazioni, cestino e login a **320, 375, 390, 768, 1024 e 1440 px**. Controllati overflow orizzontale e caricamento immagini.
- Flussi verificati: login; galleria con frecce ed Escape; ritorno focus; avviso modifiche non salvate; caricamento, copertina e riordino; creazione e modifica di un ricordo; commento; cestino e ripristino; movimento ridotto. I record creati dal test vengono rimossi dal solo volume dimostrativo.
- Esecuzione conclusiva sulla preview Docker aggiornata: **127 controlli browser superati**, nessun errore JavaScript rilevato. Il crawl è stato rallentato per rispettare il limite richieste della V1.

Gli screenshot e i log della sessione sono nella directory locale ignorata da Git `.tools/scrapbook-qa/`, con nomi come `home-1440.png`, `home-390.png`, `timeline-1440.png`, `timeline-390.png`, `editor-upload-390.png` e `gallery-390.png`.

| Schermata    | Desktop                                             | Mobile                                                             |
| ------------ | --------------------------------------------------- | ------------------------------------------------------------------ |
| Home         | [1440 px](../.tools/scrapbook-qa/home-1440.png)     | [390 px](../.tools/scrapbook-qa/home-390.png)                      |
| Timeline     | [1440 px](../.tools/scrapbook-qa/timeline-1440.png) | [390 px](../.tools/scrapbook-qa/timeline-390.png)                  |
| Dettaglio    | [1440 px](../.tools/scrapbook-qa/detail-1440.png)   | [390 px](../.tools/scrapbook-qa/detail-390.png)                    |
| Editor       | [1440 px](../.tools/scrapbook-qa/editor-1440.png)   | [Upload e copertina](../.tools/scrapbook-qa/editor-upload-390.png) |
| Album        | [1440 px](../.tools/scrapbook-qa/albums-1440.png)   | [390 px](../.tools/scrapbook-qa/albums-390.png)                    |
| Login        | [1440 px](../.tools/scrapbook-qa/login-1440.png)    | [390 px](../.tools/scrapbook-qa/login-390.png)                     |
| Impostazioni | [1440 px](../.tools/scrapbook-qa/settings-1440.png) | [390 px](../.tools/scrapbook-qa/settings-390.png)                  |
| Cestino      | [1440 px](../.tools/scrapbook-qa/trash-1440.png)    | [390 px](../.tools/scrapbook-qa/trash-390.png)                     |

## Limiti e perimetro

Il mockup grafico non era disponibile: applicata la specifica testuale. Verifica visuale eseguita sugli screenshot del browser di test; il controllo diretto del browser Windows non era disponibile. Non eseguiti test su dispositivi fisici, Safari o Firefox. Il riordino delle fotografie conserva i pulsanti accessibili; il trascinamento aggiunge file ma non cambia il loro ordine.

La build emette avvisi innocui di Rollup sulle annotazioni dei commenti del pacchetto Zod già installato. Nessun aggiornamento di dipendenze, modifica a backend, autenticazione, schema SQLite, pipeline, proxy o Raspberry Pi. Nessun collegamento o cambiamento ai dati di produzione.
