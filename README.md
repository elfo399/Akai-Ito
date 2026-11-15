# 赤い糸 — Akai Ito

_Il diario del nostro filo rosso._

**Ripresa del lavoro da un altro PC o agent:** leggere [HANDOFF.md](HANDOFF.md), con stato della consegna, decisioni, Docker e verifiche. [Album e diari di viaggio](docs/ALBUMS.md).

Un diario fotografico privato per due persone. Ricordi, fotografie e pensieri sono reali e condivisi; il database iniziale è vuoto. Nessuna registrazione pubblica, servizio cloud o dipendenza da servizi esterni durante l’utilizzo.

## Cosa comprende

- Login, logout, sessioni persistenti revocabili e cambio password personale.
- Blocco opzionale del diario con passkey, timeout personali e recupero con password; controllo anche sulle API e sulle fotografie. [Configurazione, preview e verifiche](docs/BIOMETRIC-LOCK.md).
- Due account con uguali permessi sui ricordi, inizializzati da terminale.
- Copertina con nomi, fotografia, data della relazione e giorni insieme.
- Timeline per data **dell’evento**, ordine invertibile, filtri anno/categoria e paginazione.
- Creazione e modifica con controllo di versione; un conflitto restituisce HTTP 409 e permette di ricaricare la versione aggiornata.
- Fotografie JPEG, PNG e WebP: upload multiplo, anteprime, ordine, copertina, rimozione, miniature e immagini ottimizzate.
- Galleria con visualizzatore, frecce, tastiera, swipe e download dell’originale.
- Commenti condivisi; modifica ed eliminazione riservate all’autore.
- Album con nome dentro ogni categoria: un diario per ogni viaggio, con più ricordi/giornate, foto separate e gestione delle assegnazioni senza duplicare i file.
- **Il nostro mondo**: mappa fotografica privata, timeline, riproduzione della storia, EXIF e posizioni manuali. [Utilizzo, API e importazione dei metadati](docs/WORLD.md).
- Impostazioni condivise e profilo personale con avatar.
- Cestino, ripristino e cancellazione definitiva con conferma esplicita.
- Design scrapbook mobile first: carta crema, Polaroid, washi tape, font locali e filo rosso SVG. Rispetto di `prefers-reduced-motion`, dialoghi nativi con gestione del focus e navigazione mobile.

## Architettura

Monorepo npm workspaces, Node.js 24 LTS, TypeScript strict.

```text
apps/web/             React, Vite, Tailwind, Router, TanStack Query, RHF, Zod, Lucide
apps/api/src/         Fastify, Drizzle, SQLite, Argon2id, Sharp
apps/api/migrations/  Migrazioni SQL versionate
apps/api/test/        Test Vitest / Fastify inject
packages/shared/     Schemi Zod, categorie e funzioni per date civili
scripts/             Backup, ripristino, verifica Docker isolata
Dockerfile           Build multi-stage, runtime non root
docker-compose.yml   Un servizio e un volume persistente
data/                Database e media locali (ignorati da Git)
```

In produzione Fastify serve frontend e API dalla stessa origine. SQLite usa foreign keys, WAL e busy timeout. Drizzle definisce schema, relazioni e query parametrizzate. Non occorrono Redis o database separati.

I record contengono date evento civili `YYYY-MM-DD`; non vengono convertite in mezzanotte UTC. I timestamp sono UTC e vengono visualizzati in `Europe/Rome`. Il conteggio dei giorni usa le date civili di Roma, senza errori nei cambi di ora legale.

## Avvio rapido con Docker

Requisiti: Docker Engine con Compose v2, sistema Linux **64 bit** sul Raspberry Pi e spazio sufficiente per originali, derivati e backup. Il Dockerfile non forza un’architettura: usa le immagini Node ufficiali disponibili per AMD64 e ARM64. Non modifica proxy, DNS, tunnel o firewall.

Dal repository:

```sh
cp .env.example .env
```

In PowerShell: `Copy-Item .env.example .env`.

Per la produzione dietro il reverse proxy HTTPS già esistente, impostare nel file `.env`:

```dotenv
APP_ORIGIN=https://URL-REALE-DEL-DIARIO
COOKIE_SECURE=true
TRUST_PROXY=false
PORT=3000
```

Sostituire l’URL con la propria origine esatta, senza slash finale né sottopercorso. `TRUST_PROXY=true` è appropriato solo quando ogni connessione all’app proviene dal proxy fidato e il proxy sostituisce correttamente gli header inoltrati. Il valore predefinito evita di fidarsi di header inviati direttamente dai client.

Per una prova HTTP locale con il frontend di produzione usare invece `APP_ORIGIN=http://localhost:3000` e `COOKIE_SECURE=false`. In questa sola configurazione locale sono accettati anche `127.0.0.1` e `[::1]`, con lo stesso protocollo e la stessa porta; origini assenti, `null`, porte diverse e richieste cross-site restano rifiutate. Con HTTPS o cookie Secure il controllo resta esatto. Per lo sviluppo Vite usare `http://localhost:5173`.

```sh
docker compose up -d --build
docker compose exec app node apps/api/dist/cli.js init-users
docker compose ps
```

Il comando interattivo chiede **entrambi** i nomi utente, nomi visualizzati e password. Le password sono nascoste, richiedono almeno 12 caratteri, devono essere ripetute e non compaiono negli argomenti del processo. I due account vengono salvati insieme in una transazione solo dopo la validazione. Il comando rifiuta una seconda inizializzazione; non inserisce ricordi, foto, date o nomi dimostrativi. Conservare le password nel proprio gestore di password.

Aprire l’origine configurata, accedere e scegliere in Impostazioni la data e i nomi. Creare il primo ricordo con fotografie; la copertina della home si sceglie dalle foto già presenti nel diario.

La porta 3000 viene pubblicata su `127.0.0.1` per impostazione predefinita. Se il proxy esistente si trova in un altro container, collegarlo all’app con la propria rete Docker tramite override Compose; se serve un indirizzo diverso, impostare `BIND_ADDRESS` sull’interfaccia appropriata. Non esporre direttamente la porta HTTP su Internet. Queste scelte infrastrutturali rimangono a carico del deployment esistente.

### Persistenza e permessi

Il volume `diary-data` contiene `/app/data/akai.sqlite` (più WAL/SHM quando presenti) e `/app/data/media/`. Un normale `docker compose down` conserva i dati; **`docker compose down -v` li elimina**. Non usare `-v` per aggiornamenti o riavvii.

Il runtime usa UID/GID `1000:1000`, filesystem applicativo in sola lettura, `/tmp` temporaneo, nessuna capability e `no-new-privileges`. Il volume nuovo eredita i permessi della directory predisposta nell’immagine. Con un bind mount, preparare esplicitamente la directory dati con proprietario `1000:1000`; non allargare i permessi a tutti.

Healthcheck: `GET /api/health` esegue una query SQLite e restituisce `{"status":"ok"}`. Non rivela informazioni private. Controllo manuale:

```sh
curl -f http://localhost:3000/api/health
```

## Configurazione

| Variabile          | Predefinito             | Significato                                                                            |
| ------------------ | ----------------------- | -------------------------------------------------------------------------------------- |
| `APP_ORIGIN`       | obbligatoria in Compose | Origine del browser accettata per le mutazioni; in sviluppo `http://localhost:5173`    |
| `COOKIE_SECURE`    | `true` nel server       | Cookie trasmesso solo in HTTPS; `false` esclusivamente nelle prove HTTP locali         |
| `PORT`             | `3000`                  | Porta pubblicata; il processo nel container ascolta sempre su 3000                     |
| `DATA_DIR`         | `./data`                | Directory locale rispetto alla radice del repository; Compose la imposta a `/app/data` |
| `TRUST_PROXY`      | `false`                 | Fiducia negli header del proxy, da abilitare solo nella topologia descritta sopra      |
| `BIND_ADDRESS`     | `127.0.0.1`             | Interfaccia host usata da Compose                                                      |
| `MAX_UPLOAD_FILES` | `20`                    | Massimo di nuove immagini per richiesta                                                |
| `MAX_IMAGE_MB`     | `15`                    | Limite per ogni immagine in MiB                                                        |

I limiti riguardano ogni caricamento, non il numero di foto conservate nell’intero diario. Ogni ricordo ammette al massimo 200 foto. Impostare sul proprio proxy un limite del corpo richiesta adeguato al prodotto dei limiti e un timeout sufficiente per Sharp sul Raspberry; questo repository non modifica il proxy.

Non serve un secret precondiviso: i token di sessione e CSRF sono casuali, generati con `crypto.randomBytes`. Nel database viene conservato soltanto l’hash del token di sessione. Non inserire password nel file `.env`.

## Avvio locale

Installare Node.js **24 LTS** e npm. Le dipendenze native hanno binari per le piattaforme supportate; se npm deve compilarle, servono Python, make e un compilatore C++ (su Windows gli strumenti C++ compatibili con node-gyp).

```sh
npm ci
cp .env.example .env
npm run migrate
npm run init-users
npm run dev
```

Aprire `http://localhost:5173`. Vite inoltra `/api` al backend su porta 3000. I comandi npm leggono `.env` dalla radice; sviluppo e CLI usano la stessa directory dati anche quando il workspace API cambia directory corrente.

Per eseguire localmente la build di produzione:

```sh
npm run build
# Impostare APP_ORIGIN=http://localhost:3000 e COOKIE_SECURE=false in .env
npm start
```

## Database e migrazioni

`apps/api/src/schema.ts` descrive `users`, `session`, `couple_settings`, `memories`, `memory_media` e `comments`. Le migrazioni si trovano in `apps/api/migrations/` e vengono registrate in `_migrations`. I file applicati non devono essere modificati: aggiungere una nuova migrazione numerata.

```sh
npm run migrate
# oppure
docker compose exec app node apps/api/dist/cli.js migrate
```

Compose applica all’avvio la migrazione iniziale additiva e quelle versionate non ancora applicate, in transazione. La V1 non contiene migrazioni distruttive. Prima di introdurre migrazioni future: revisionare SQL, effettuare un backup verificato e mantenere separati gli interventi distruttivi; non aggiungerli all’avvio automatico.

Le modifiche ai ricordi richiedono il campo `version`; il server controlla il valore nella transazione e lo incrementa. Un conflitto non sostituisce dati o fotografie. Nell’editor il ricaricamento automatico in background è disabilitato, per conservare le modifiche locali fino alla risoluzione esplicita.

## Sicurezza delle fotografie

- Tutti gli endpoint dati, miniature, immagini visualizzate, originali e avatar richiedono una sessione valida.
- Le cartelle dati non sono mai registrate come directory statiche. Solo il frontend compilato è pubblico.
- Le operazioni mutanti richiedono origine esatta, cookie `HttpOnly` / `SameSite=Strict` e token CSRF della sessione; il login è protetto dal controllo dell’origine e dal rate limit.
- Password Argon2id, sessioni con scadenza a 30 giorni, revoca al logout e revoca di tutte le proprie sessioni al cambio password.
- Nome file generato con UUID; nessun percorso fornito dal client viene usato nello storage. Controllo MIME, firma binaria e decodifica Sharp completa; limite di 40 megapixel, rifiuto di formati animati/multipagina e dei file danneggiati.
- Originali conservati privatamente. I derivati WebP (lato massimo 2000 e 600 pixel) rimuovono metadati EXIF/GPS e vengono usati nella navigazione. I download degli originali conservano invece i dati originali.
- Upload elaborati in sequenza per richiesta, cache Sharp ridotta, transazione dei record e pulizia dei file in caso di errore. Dopo un arresto improvviso possono restare file non referenziati: la manutenzione offline li individua e rimuove.
- Testi visualizzati come testo React, senza HTML arbitrario; validazione Zod, query parametrizzate, security headers, CSP e rate limiting. Nessun dato personale o fotografia nei log applicativi.
- Media con `Cache-Control: private, no-store`, per evitare di mantenerli in cache dopo il logout. Gli asset statici possono essere memorizzati normalmente.

## Cestino e pulizia

Elimina sposta un ricordo nel cestino e ne nasconde anche fotografie, commenti e presenza negli album. Entrambi gli account possono ripristinarlo. La cancellazione manuale definitiva richiede di scrivere `ELIMINA`.

La V1 conserva i ricordi per **almeno 30 giorni**. Non avvia timer nascosti: i contenuti più vecchi vengono rimossi soltanto eseguendo la manutenzione. Eseguirla **con il servizio fermo**, per non cancellare file di upload ancora in corso:

```sh
docker compose stop app
docker compose run --rm --no-deps app node apps/api/dist/cli.js purge
docker compose up -d app
```

`purge` elimina record nel cestino da oltre 30 giorni (con cascata su commenti/media) e file non più referenziati, comprese fotografie e residui di caricamenti interrotti. Può essere programmato nel proprio sistema di manutenzione; prima è consigliabile un backup. Non include cron o altri servizi.

Per verificare senza cancellare:

```sh
npm run verify-data
# oppure
docker compose exec app node apps/api/dist/cli.js verify
```

Il comando verifica integrità SQLite, foreign keys ed esistenza di tutti i file referenziati, segnalando anche il numero di file orfani. Un file mancante o un errore di integrità produce un codice di uscita diverso da zero. Per un controllo coerente con upload contemporanei, eseguirlo a servizio fermo mediante `compose run`.

## Backup consistente e ripristino

Il database e i file devono essere acquisiti **nello stesso intervallo senza scritture**. Copiare soltanto `akai.sqlite` mentre il server è attivo non è una procedura valida: WAL e fotografie potrebbero non corrispondere.

**Memory Vault** aggiunge snapshot cifrati/deduplicati Restic, controllo del mount esterno, lock condiviso con Jenkins, retention 7 giornalieri/4 settimanali/6 mensili, stato CLI e veri test di ripristino in un nuovo volume. Sono pronti i timer systemd delle 03:30 Europe/Rome e del drill settimanale; **non sono installati o attivi in produzione**. Configurare prima destinazione e password privata usando [docker/backup.env.example](docker/backup.env.example), poi seguire [installazione e disaster recovery](docs/BACKUP-RECOVERY.md).

Sull'host Linux, dopo la configurazione privata:

```sh
export MEMORY_VAULT_CONFIG=/PERCORSO-PRIVATO/backup.env
bash scripts/memory-vault.sh init
bash scripts/memory-vault.sh backup manual
bash scripts/memory-vault.sh list
bash scripts/memory-vault.sh test-restore latest
bash scripts/memory-vault.sh status
```

Gli alias `npm run backup`, `backup:list`, `backup:verify`, `backup:test-restore`, `backup:restore`, `backup:retention` e `backup:status` richiamano gli stessi script, se Node è disponibile sull'host. Non richiedono Node per l'uso shell. Backup e staging vanno su un supporto separato, fuori dalle directory sorgenti/pubbliche; una copia sulla stessa SD non protegge dal suo guasto. Conservare la password di cifratura separatamente: senza di essa i backup non sono recuperabili.

Gli entry point tar.gz precedenti rimangono disponibili. Su un deploy gestito da Jenkins passare sempre `BACKUP_DEPLOY_DIR` uguale alla sua directory reale per condividere `.deploy.lock`; in standalone il default resta la directory corrente. Non è prevista retention automatica degli archivi storici.

Su Raspberry/Linux, dalla radice del repository:

```sh
sh scripts/backup.sh ./backups
```

Lo script acquisisce il lock, ferma l’app, archivia l’intero volume (inclusi eventuali WAL/SHM e media), verifica SQLite/file e pubblica archivio e checksum SHA-256 solo dopo successo. Riavvia lo stesso container con una trap anche in caso di errore; un'app già ferma rimane ferma. L'archivio viene scritto dall'operatore host in una directory privata 700, senza imporre il suo UID uguale a quello del container. Occorrono Python 3 e gli strumenti GNU descritti nella documentazione. Questi tar.gz sono **in chiaro**: contengono fotografie private, hash delle password e sessioni e vanno conservati su un supporto protetto. Conservare separatamente `.env` e la versione dell'app usata per il backup.

Per ripristinare **senza sovrascrivere il volume corrente**, usare un nuovo nome volume:

```sh
sh scripts/restore.sh /percorso/akai-ito-DATA.tar.gz akai-ito-restored
```

La procedura controlla il checksum, rifiuta volumi già esistenti, estrae nel nuovo volume e verifica database e file. L’uso temporaneo di root serve solo ad assegnare UID/GID 1000 al volume ripristinato. L’app continua a essere eseguita come utente non root.

Dopo il controllo, creare `compose.restore.yml`:

```yaml
volumes:
  diary-data:
    external: true
    name: akai-ito-restored
```

Quindi collegare il nuovo volume:

```sh
docker compose stop app
docker compose -f docker-compose.yml -f compose.restore.yml up -d --force-recreate
docker compose -f docker-compose.yml -f compose.restore.yml exec app node apps/api/dist/cli.js verify
curl -f http://localhost:3000/api/health
```

Aprire il diario, accedere, verificare un ricordo e una fotografia; mantenere l’override nei successivi comandi oppure rendere definitiva la stessa associazione del volume nella propria configurazione. Il volume precedente rimane disponibile per tornare indietro. Ripetere periodicamente un ripristino di prova: il solo checksum non dimostra la recuperabilità del diario.

## Test e verifiche

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm audit
docker compose --env-file .env.example config --quiet
docker build -t akai-ito:local .
node --import tsx scripts/docker-smoke.ts
```

La suite API copre login/sessioni, rate limiting, CSRF, accesso anonimo, creazione e modifica condivisa, conflitti, upload validi e falsi, pulizia dei fallimenti, originali protetti, ordine/cover/rimozione foto, ordine cronologico, filtri, cestino/ripristino, conferma definitiva, commenti e permessi, album, impostazioni, giorni civili e persistenza.

Lo smoke Docker crea un progetto Compose e volumi temporanei separati: inizializza due account casuali, salva foto e commenti, verifica accessi HTTP, riavvia il container, ripristina un backup in un secondo volume e controlla integrità e contenuti. Infine elimina solo le proprie risorse QA. Non inizializza il volume del diario. Richiede porta locale 33117 libera (modificabile con `SMOKE_PORT`).

Per una build ARM64 da una macchina diversa, quando Buildx/emulazione è disponibile:

```sh
docker buildx build --platform linux/arm64 --load -t akai-ito:arm64 .
```

Per ripetere lo smoke sull’immagine ARM64, anche in emulazione:

```sh
SMOKE_IMAGE=akai-ito:arm64 SMOKE_PLATFORM=linux/arm64 npm run test:docker
```

Lo stato delle verifiche eseguite in questa implementazione è riportato in [docs/VERIFICATION.md](docs/VERIFICATION.md).

## Deployment sul Raspberry Pi

1. Copiare/clonare il repository sul Pi con sistema operativo ARM64 e Docker già configurato.
2. Preparare `.env` con l’origine HTTPS effettiva e `COOKIE_SECURE=true`; adattare solo il collegamento dell’app al proxy già esistente.
3. Eseguire `docker compose up -d --build` e attendere lo stato healthy.
4. Creare i due account con `docker compose exec app node apps/api/dist/cli.js init-users`.
5. Aprire l’URL HTTPS, impostare nomi/data, creare un ricordo e caricare foto; accedere anche con il secondo account.
6. Riavviare con `docker compose restart app` e verificare i contenuti, anche da smartphone.
7. Predisporre backup con una prova di ripristino e la pulizia periodica del cestino.

Il deploy automatico sul Raspberry è configurato tramite Jenkins e verificato con un push reale su GitHub. Vedere [docs/JENKINS.md](docs/JENKINS.md) per URL, percorsi e prima inizializzazione degli account.

## Deploy automatico con Jenkins

Il repository include un `Jenkinsfile`, il target Docker `ci` e `scripts/jenkins-deploy.sh`. Il flusso previsto è GitHub → test/build → backup → deploy sul Raspberry → healthcheck, con tentativo di riavvio dell’immagine precedente in caso di errore. La configurazione del controller, dell’agent SSH e del webhook è descritta in [docs/JENKINS.md](docs/JENKINS.md) e va completata sull’installazione reale.

## App mobile e PWA

La configurazione standalone, le icone del logo, la gestione di viewport/safe area e la procedura per sostituire una vecchia icona Home sono documentate in [docs/PWA.md](docs/PWA.md). Non è prevista cache offline di fotografie o dati privati. Stato di pubblicazione e verifiche realmente eseguite in [HANDOFF.md](HANDOFF.md).

## Limiti della V1

- Una coppia e due account; nessun recupero password via email, registrazione o gestione multi-coppia. Il cambio password richiede la password attuale.
- Nessun WebSocket: gli altri aggiornamenti si vedono tramite nuove richieste, cambio pagina o rifocalizzazione (eccetto l’editor, che preserva la propria versione).
- Nessun video, HEIC, lettera privata, mappa, chat o funzionalità social.
- Nessuna transcodifica degli originali: occupano spazio insieme ai due derivati. Il limite di 40 MP può rifiutare fotografie molto grandi; ridimensionarle prima dell’upload.
- Gli upload si inviano al salvataggio del ricordo; non è disponibile la ripresa dopo un’interruzione di rete.
- Cestino con rimozione su comando, non esattamente allo scadere del trentesimo giorno.
- Il riferimento grafico “mockup Scrapbook” citato nella richiesta non era presente tra gli allegati disponibili; il design segue la descrizione e la palette fornite.
- La verifica visiva interattiva del browser e la prova su smartphone fisico dipendono dall’accesso a tali dispositivi; consultare il rapporto delle verifiche per quanto effettivamente eseguito.

_Ogni ricordo è un nodo nel filo che ci unisce._
