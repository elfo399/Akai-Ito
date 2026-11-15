# Handoff — Akai Ito

Aggiornato il **15 novembre 2026**. Questo documento permette di riprendere il lavoro senza la chat precedente.

## Consegna autorizzata — passkey, Memory Vault e particelle mobili

Il **15 novembre 2026** l'utente ha richiesto **push e merge su main** di tutto il lavoro locale. La consegna comprende il blocco/passkey, Memory Vault, particelle mobili, configurazioni di preview, test e documentazione. Questa autorizzazione sostituisce i vincoli di sola preview dei paragrafi storici sotto per la pubblicazione del codice e il normale deployment Jenkins di `main`.

**Non attivare automaticamente i timer del Vault**, non inventare destinazione USB/NAS o password e non modificare volumi/account personali fuori dalla migrazione additiva prevista dal deploy. `0004_diary_lock.sql` lascia il blocco disattivato sugli account esistenti. Il backup pre-deploy deve essere verificato prima dell'applicazione della migrazione; il nuovo script conserva archivi storici e immagini precedenti.

Preflight reale sul Raspberry: applicazione healthy, host ARM64, Python 3 con SQLite **3.40.1** e tutti i tool richiesti disponibili; deploy/backups privati 700 e `.deploy.lock` 600 di **elfo**, spazio sufficiente. Remote `main` inizialmente identico alla base `202b3a3`; ultima pipeline precedente **#11 SUCCESS**. I controlli locali restano **127 test applicativi**, **19 Python**, **34 Docker/Restic**, typecheck/lint e build AMD64/ARM64 documentati sotto. Verificare SHA finale, risultato della pipeline e immagine realmente distribuita; il solo push non dimostra il deployment. L'API Jenkins di bootstrap è stata rimossa: per controlli operativi si può leggere in sola lettura metadata/log del job via SSH autorizzato, senza ricreare credenziali di setup.

## Implementazione Memory Vault prima della pubblicazione

Specifica **MEMORY VAULT — Backup automatici, sicurezza dei dati e disaster recovery** implementata sul branch **`feat/memory-vault-backup`**. Le modifiche locali a passkey/blocco del diario e particelle mobili sono conservate, ancora non committate, dalla base pubblicata `202b3a3`. **Nessun push/merge, job Jenkins, timer installato, accesso al Raspberry, modifica dei dati personali o dei volumi di produzione autorizzato/eseguito.** I vincoli locali di questa richiesta prevalgono sulle autorizzazioni storiche sotto.

Il Vault è operativo da CLI **sull'host Linux**, senza nuova UI o database: `scripts/memory-vault.sh`, helper offline `vault-files.py`, primitive condivise `backup-common.sh`. Usa **Restic** con repository locale dedicato su USB/NAS montato, cifratura/deduplicazione, password in file privato fuori da Git e dal supporto di backup. Configurazione pronta in `docker/backup.env.example`, da copiare fuori dal repository e compilare con i percorsi reali. Target già esistente 700, mount obbligatorio, controlli di sorgente facoltativi, spazio per copia/staging/restore; modalità senza mount consentita solo in test esplicito. Cache Restic e staging sul target, stato e journal piccoli sul filesystem locale.

Coerenza: tutti i comandi mutanti acquisiscono **`BACKUP_DEPLOY_DIR/.deploy.lock`**, lo stesso `flock` del deploy; exit **75** se occupato. L'operatore deve configurare esattamente directory/utente Unix di Jenkins. Nessun lock annidato. Si scoprono container e volume effettivi, si rifiutano altri container con quel volume scrivibile, si ferma il servizio e si copia l'intero volume read-only (DB/WAL/SHM, originali, derivati, avatar, altri file). Si riavvia lo **stesso container**, con healthcheck, prima di normalizzare/verificare la copia e cifrarla. Se era già fermo resta fermo. Il journal persistente permette `recover` dopo un arresto interrotto, anche col target offline, solo se identità/immagine/progetto/volume coincidono. Trap SIGTERM/SIGINT, exit non zero e record atomici dei fallimenti; candidati incompleti mai pubblicati come validi.

Manifest cifrato con ID/UTC/tipo/immagine immutabile, dimensione e SHA-256 di tutti i file, conteggi, migrazioni e hash logico del database. Il validator rifiuta traversal, link, device, duplicati, checksum errati, SQLite/foreign key non validi e media mancanti/vuoti. Consolidamento WAL soltanto sulla copia. `verify` ripristina e confronta il manifest; `test-restore` crea un volume UUID nuovo, esegue la **CLI verify dell'app come UID 1000**, rilegge il volume e confronta i file/DB effettivi, poi elimina solo il proprio volume con label verificata. `restore` conserva un nuovo volume per l'operatore e non lo collega alla produzione; rifiuta destinazioni esistenti e controlla spazio anche sul filesystem del volume Docker.

Retention **7 giornalieri / 4 settimanali / 6 mensili** configurabili più keep-last 1 obbligatorio. Solo snapshot con tag Vault+progetto+verificato, gruppo host stabile; dry-run disponibile, auto-retention disattivata per default. Apply solo dopo backup riuscito nello stesso repository; check prima/dopo forget/prune. Snapshot incompleti, altri progetti e tar.gz storici Jenkins fuori dalla retention. `status` distingue ultimo tentativo, ultimo successo, dimensioni, ultimo drill e inventario con data dell'ultimo controllo; log privati ed eventi JSON senza fotografie/segreti. Hook per future notifiche non configurato.

Compatibilità legacy: `backup.sh`, `restore.sh` e `jenkins-deploy.sh` riutilizzano copia/validazione/lock. Tar.gz+SHA-256 ancora leggibili, nomi UTC/UUID senza sovrascritture, restore solo in volume nuovo. **Questi archivi restano in chiaro**, privati e non cancellati automaticamente. Nuovo prerequisito host: Python 3/SQLite e tool GNU, verificati prima di fermare l'app. `Jenkinsfile` non modificato, pipeline non eseguita. Il rollback preesistente riguarda l'immagine, non ripristina il DB: leggere la procedura dati prima di qualsiasi rilascio futuro.

Scheduler **solo template** in `docker/systemd/`: backup giornaliero **03:30 Europe/Rome**, drill settimanale opzionale domenica 05:00, `Persistent=true`, recupero al boot. Restano `User=CHANGE_ME` e percorsi esemplificativi `/opt/akai-ito`; vanno adattati e verificati dall'operatore prima di installare/abilitare. Mancano intenzionalmente destinazione reale USB/NAS, sorgente del mount, file password e utente operativo concordato: non inventarli né attivare servizi in produzione.

Comandi: `npm run backup:init`, `backup`, `backup:list`, `backup:verify`, `backup:test-restore`, `backup:restore`, `backup:retention`, `backup:status`, oppure `bash scripts/memory-vault.sh <operazione>` senza Node sull'host. Documentazione completa **[docs/BACKUP-RECOVERY.md](docs/BACKUP-RECOVERY.md)**: installazione, chiave conservata separatamente, configurazione/mount, timer, log, retention, vecchi tar, recupero da cancellazione/corruzione e **SD completamente guasta**, immagine compatibile e promozione del volume solo manuale.

Verifiche concluse: typecheck/lint e **127 test applicativi in 8 file**, **19 test Python offline**, **34 controlli Docker/Restic** nella suite finale, ShellCheck/sintassi, template systemd e calendario validati offline. Build Docker AMD64 e **ARM64 in emulazione** concluse; runtime ARM64 ha eseguito migrazioni, inizializzazione di due account sintetici (Argon2), SQLite, PNG Sharp e CLI verify su tmpfs, senza volume reale. **Nessuna prova fisica su Raspberry, USB/NAS o scheduler installato**. Il passaggio finale termina con `Completed 34 Docker/Restic checks + 19 offline tests`, senza errori. Restic collaudato **0.14.0**, tooling Debian/Node 24 separato (`docker/vault-test.Dockerfile`), nessun pacchetto installato sul Raspberry.

Suite ripetibile: `scripts/test-memory-vault.sh`, `test-vault-retention.sh`, `test-vault-files.py`, `check-vault-units.sh`. Solo progetti/volumi UUID, PNG/avatar/commenti/album sintetici; originale modificato dopo backup, recupero dello stato precedente in volume nuovo e originale rimasto modificato. Coperti mount/spazio/permessi, copia fallita, SIGTERM/SIGINT, journal, conflitti manuale/programmato/entry point deploy locale (nessun job reale), checksum e repository cifrato corrotto, retention con date fissate e protezione ultima copia. Tag immagine QA dedicato per evitare interferenze con rebuild del tag locale; attese del test limitate nel tempo. Risorse temporanee rimosse solo dopo verifica delle label; non eliminare volumi inizialmente presenti.

Artefatti ignorati `.tools/vault-integration.log`, `vault-app-tests.log`, `vault-app-build.log`, `vault-tooling-build.log`, `vault-arm64-build.log`, `vault-arm64-runtime.log`. Le preview precedenti **3000** (particelle) e **3001** (blocco/passkey) sono conservate e healthy; il Vault non richiede una preview web o migrazioni. I primi tentativi interrotti hanno corretto stdin del job background, capability necessaria sui soli helper di restore, fixture Compose e isolamento del tag QA: non costituiscono suite concluse. Usare il riepilogo `Completed … Docker/Restic checks + 19 offline tests` dell'ultima esecuzione per il conteggio definitivo.

## Lavoro locale precedente — blocco del diario con passkey, solo preview isolata

Implementata la specifica **BIOMETRIC LOCK & PASSKEYS** sul branch **`feat/biometric-diary-lock`**, dalla stessa base pubblicata `202b3a3`. Lavoro locale non committato, con le modifiche alle particelle mobili sotto conservate. **Nessun push, merge, avvio Jenkins o modifica dei dati di produzione autorizzato per questo intervento.** Non applicare la nuova migrazione al volume della preview precedente. La vecchia autorizzazione alla pubblicazione nei paragrafi storici non si estende a questa funzionalità.

Il blocco opzionale è in **Impostazioni → Il tuo account → Proteggi il nostro diario**: registrazione passkey con password, attivazione/disattivazione, timeout 0/60/300/900 (default 300), aggiunta/revoca credenziali personali, Blocca adesso e recupero tramite password. Due account indipendenti; l'ultima passkey non può essere rimossa mentre il blocco è attivo. Schermata Scrapbook neutra senza immagini private. WebAuthn richiede realmente UV; il dispositivo sceglie volto/impronta/PIN/metodo disponibile.

Backend: nuova migrazione **additiva** `0004_diary_lock.sql`, preferenze sugli utenti, stato nelle sessioni e nuove tabelle passkeys/challenge/presenze. `apps/api/src/diary-lock.ts` usa **SimpleWebAuthn server 14.1.0**; browser **14.0.0**. Challenge monouso da 120 secondi, vincolate a sessione/account/scopo, consumo atomico, origine/RP configurati senza fidarsi degli header, firma/UV/counter verificati dalla libreria. Gestione con verifica recente, CSRF e rate limiting. L'hook centrale in `app.ts` restituisce **423 DIARY_LOCKED** per tutte le API private, incluse foto, miniature, originali e avatar; 401 resta sessione assente/scaduta/revocata. Gli account esistenti rimangono disattivati per default, login/password/sessioni precedenti preservati.

Frontend: `diary-session.tsx`, `DiaryGate`, `DiaryProtection`, `diary-lock.css` e `diary-scroll.ts`. Maschera opaca sincrona al background/blur, verifica server prima di rivelare la pagina, scarto delle risposte obsolete; al blocco confermato pulizia query e smontaggio del contenuto privato. Un rientro breve conserva le bozze, il blocco conserva percorso/parametri e scroll. Il ripristino è integrato nel **solo `RouteViewport` esistente** in `motion.tsx`, evitando due ripristini concorrenti dopo reload. Attività da eventi fidati raggruppata a 15 secondi, nessun polling; timer/eventi ripuliti. BroadcastChannel sincronizza blocco/sblocco e cambi di preferenze, sempre con nuova verifica server. Le presenze obsolete vengono ripulite allo sblocco per non rinviare Subito dopo reload/chiusura di schede.

**Subito** = tutte le finestre note in background; in primo piano vale un minuto senza interazioni, dichiarato nella UI. Per i browser terminati senza eventi vale comunque la scadenza server dall'ultima attività. RP ID deriva dall'hostname di `APP_ORIGIN`; le cerimonie accettano solo l'origine esatta configurata, HTTPS oppure localhost per lo sviluppo. Usare localhost e non l'alias IP nella preview. Non sono salvati dati biometrici o chiavi private.

**Preview pronta: http://localhost:3001**, progetto `akai-ito-biometric-preview`, immagine `akai-ito:biometric-local`, volume **`akai-ito-biometric-preview_diary-data`**, bind 127.0.0.1. Configurazione: `docker/biometric.preview.env.example`. Solo dati sintetici: `demo` (Elena) / `partner` (Luca), password per entrambi **`DiarioLocale2026!`**. Il test lascia un ricordo/foto a tinta unita, disattiva il blocco, ripristina il timeout a cinque minuti e revoca le passkey virtuali: il dispositivo dell'utente può essere configurato da zero. Credenziali esclusivamente locali. La preview 3000 e il suo volume sono conservati; per evitare interferenze dei cookie localhost fra porte usare un profilo/finestra privata distinto. Per provare da smartphone serve una futura preview HTTPS raggiungibile dal dispositivo: non esporre semplicemente HTTP sull'IP LAN.

Verifiche: **typecheck, lint, 127 test automatici in 8 file** (27 nuovi test backend di blocco con firme reali e orologio iniettato), build Docker e **53 controlli Chromium con autenticatore virtuale CDP**. Coperti registrazione/revoca/disattivazione, quattro tempi, annullamento/errore/assenza WebAuthn, firma valida, media reali della fixture rifiutati con 423/no-store, due account, più schede, reload, eventi background/bfcache simulati, password errata/corretta, risposta di stato tardiva scartata, bozza conservata al breve cambio focus, percorso/scroll, logout e assenza di errori JS. Layout e screenshot esaminati a **375/430/768/1440 px**. I primi tentativi interrotti hanno portato alle correzioni delle presenze/scroll o dello script di collaudo; solo il passaggio finale con `Completed 53 checks` costituisce la suite browser completata. Artefatti ignorati `.tools/biometric-qa/` e log `.tools/biometric-*.log`. Script ripetibile versionato **`scripts/biometric-browser-check.ts`**; dipendenza Playwright facoltativa installata fuori dal workspace in `.tools/visual-qa/`. Nessuna prova fisica Face ID, Touch ID, Safari/PWA iOS o Android dichiarata.

Leggere **[docs/BIOMETRIC-LOCK.md](docs/BIOMETRIC-LOCK.md)** per architettura, API, comportamento preciso, compatibilità, prove e limiti degli snapshot PWA. Include la procedura richiesta prima di una futura migrazione in produzione: stop delle scritture, archivio dell'intero volume DB/WAL/SHM/media, checksum, ripristino verificato in un volume nuovo con controlli SQLite e CLI verify. Il rollback richiede immagine/configurazione e backup dati corrispondenti; riaccendere solo la vecchia immagine non sostituisce il ripristino. Nessuna di queste operazioni è stata eseguita in produzione.

## Lavoro locale precedente — particelle mobili anche al centro e in primo piano

L'utente ha segnalato che da smartphone le particelle erano troppo laterali e chiesto di portarle al centro, davanti al contenuto. Branch **`style/mobile-seasonal-overlay`**, da `main` `202b3a3`, stato iniziale pulito. Fino a 1000 px il Canvas globale viene portato nel body tramite portal, `z-index: 50`, per superare anche lo stacking context del root e i launcher. Si distribuisce su tutta la larghezza con oscillazioni individuali e una presenza nella fascia centrale; nel dettaglio mobile non vengono più applicate maschere a foto/testo. `pointer-events: none` mantiene tocchi, menu e scroll utilizzabili. Numero, forme, palette, opacità e budget rimangono quelli approvati. Desktop oltre 1000 px conserva livello/fasce laterali/maschere; anteprima confinata e pagine escluse conservate. Cinema/dialoghi continuano a sospendere/ripulire il Canvas. Movimento ridotto e Disattivate rispettati. La nuova richiesta dell'utente sostituisce soltanto su mobile la precedente decisione di non sovrapporre particelle alle foto.

File: `components/SeasonalAtmosphere.tsx`, `components/SeasonalParticles.tsx`, `seasonal.css`, `docs/SEASONAL-PARTICLES.md`. Nessuna dipendenza, API, modifica dati o animazione diversa delle forme. **Solo locale: nessun nuovo push/merge richiesto.** Docker aggiornato e healthy su **http://localhost:3000**. Typecheck/lint, **100 test automatici**, build Docker e **37 controlli Chromium**: tutte e quattro le stagioni simulate con sole risposte GET, pixel disegnati al centro e sopra le foto, passaggio mobile/desktop senza Canvas duplicati a 375/430/768/1000/1001/1440 px, maschere desktop, pointer events/scroll/menu, sospensione e ripresa cinema, pagine ammesse/escluse, preferenze off/reduced motion, nessun overflow/errore JS/scrittura dati. Screenshot delle quattro stagioni esaminati; artefatti ignorati `.tools/mobile-seasonal-qa/` e relativi script/log. Nessuna prova fisica smartphone o Safari/Firefox dichiarata. Il primo errore sul test Disattivate era causato dall'inizializzatore del collaudo che riscriveva la preferenza; corretto prima del passaggio concluso.

## Consegna completata — PWA e viewport mobile

Feature **`917a504`**, merge su `main` **`202b3a36914635002ae5aa4d16c77e61bc6587e0`**, **Jenkins #11 SUCCESS** con 100 test. Runtime healthy e SHA distribuito verificati; sul dominio HTTPS confermati manifest standalone, quattro PNG opachi con dimensioni corrette, metadati iOS, asset viewport, route dirette e API private 401. L'utente può reinstallare la vecchia icona Home seguendo `docs/PWA.md`. La modifica successiva alle particelle mobili non è compresa in questo deployment.

Il 15 novembre 2026, dopo la preview locale, l'utente ha richiesto **push e merge**. Sono autorizzati commit, push e merge su `main` dell'intera revisione `fix/mobile-pwa-viewport`, incluse icone, script, test e documentazione. Questa richiesta sostituisce i precedenti vincoli locali dell'allegato. Verificare SHA finale, Jenkins e immagine effettivamente distribuita; dopo il deploy l'utente può rimuovere la vecchia icona Home e reinstallare la web app seguendo `docs/PWA.md`. Dati e volumi Docker rimangono separati dal codice.

## Implementazione PWA e viewport mobile

Specifiche nell'allegato «AKAI ITO — PWA & MOBILE VIEWPORT FIX». Branch dedicato **`fix/mobile-pwa-viewport`**, da `main` `198efaa`; stato iniziale pulito. Dopo il vincolo iniziale di sola preview, pubblicazione autorizzata nella consegna sopra. Docker locale aggiornato e healthy su **http://localhost:3000**, dati/account/volume conservati, nessuna migrazione o modifica backend.

Diagnosi confermata nel codice: mancavano manifest, icone PNG e metadati iOS, perciò una precedente icona Home poteva essere un normale collegamento. Non è stato esaminato il telefono dell'utente e non si dichiara questa ipotesi come diagnosi fisica definitiva. I cinque link principali erano già React Router. Convertito il link interno del fallback 404 a Router Link. Le vecchie distanze fisse dei launcher non seguivano l'altezza reale della navigazione con safe area; nella prima verifica una regola CSS caricata successivamente ripristinava quei valori. Corretto direttamente `memory-actions.css` e verificato il risultato, senza duplicare gli override.

Implementati manifest pubblico con `id/start_url/scope` `/`, `display: standalone`, colori carta e nomi richiesti; PNG opachi 192/512, Apple 180 e maskable 512 generati dal logo SVG esistente. Metadati iOS, viewport-fit e interactive-widget, zoom utente conservato. `useMobileViewport` usa VisualViewport, misura la navigazione con ResizeObserver, espone solo `data-display-mode`/`data-keyboard-open` diagnostici e misure CSS, rispetta il pinch zoom e riconosce anche `navigator.standalone`. Riduzione significativa dell'altezza mentre si scrive su touch suggerisce una tastiera: navigazione/launcher si nascondono temporaneamente, pannelli e dialoghi restano nella viewport visibile e lo scroll pagina resta libero. È un'euristica documentata, non una promessa universale sui browser. Nessuna animazione approvata riprogettata. Pagine/login usano minimi `svh`; overlay continuano ad adattarsi alla viewport visibile. Nessun service worker o caching offline introdotto; cookie/CSRF/header/cache foto invariati.

File: `apps/web/index.html`, `public/manifest.webmanifest`, `public/icons/*.png`, nuovi `src/mobile-viewport.ts` e `mobile-viewport.css`, integrazione `src/main.tsx`, geometria in `memory-actions.css` e variabile larghezza in `world-actions.css`; script riproducibile `scripts/generate-pwa-icons.ts`, 6 test in `apps/web/test/pwa.test.ts`, **docs/PWA.md**, README e handoff. `docs/PWA.md` contiene diagnosi, limiti, installazione/reinstallazione Android e iPhone e prova fisica da fare dopo la futura pubblicazione; eliminare la vecchia icona Home e ricrearla può essere necessario.

Verifiche concluse: typecheck/lint, **100 test automatici in 7 file**, build produzione tramite Docker, preview healthy. **184 controlli Chromium**: 22 asset/scope/privacy, 51 navigazione/viewport/safe area/tastiera simulata, 6 lightbox/cinema verticale e orizzontale, 38 regressione mappa, 37 Timeline e 30 album. Chromium legge il manifest senza errori e `Page.getInstallabilityErrors` restituisce lista vuota nel contesto locale sicuro localhost; icone verificate per MIME, dimensioni, opacità e presenza nella build. Route dirette/refresh/login e cinque destinazioni SPA senza reload, ritorno mappa/ricordo, larghezze 320/375/430/768/1000/1001/1440 px, altezze variabili 560/720/900 px e overlay 375×667/844×390, safe area artificiali, tastiera visual-only e con resize layout, focus, scroll, pinch zoom e movimento ridotto. Nessun asset mancante, errore JS o scrittura dati nel collaudo; API private 401/no-store e foto private/no-store confermate, nessun service worker o Cache Storage registrato. Screenshot e icona esaminati; le catture iniziali di fade-in non sono la resa finale delle foto.

**Limiti:** nessuna installazione reale provata su Android Chrome o iOS Safari, nessun telefono fisico disponibile. Il display mode browser è verificato; flag iOS standalone simulato e ramo media-query coperto da test unitari. Il tentativo CDP di emulare nativamente display-mode standalone non era supportato, quindi non viene dichiarato un test reale di installazione. Browser normali possono mostrare le loro barre. Preview HTTP localhost sul PC non è una prova di installazione HTTPS sul telefono; nessun accesso a Jenkins o deploy di produzione per questo lavoro. Artefatti ignorati `.tools/pwa-qa/`, `pwa-*.log` e script relativi. I primi passaggi falliti per canale alpha, precedenza CSS o limite di emulazione sono stati risolti/esclusi prima dei passaggi conclusi.

## Consegna completata — navigazione, filtri Timeline e azioni album

Feature **`131a069`**, merge **`198efaad22299d2624ad40655f3fbbc005384b26`**, **Jenkins #10 SUCCESS** con 94 test. Runtime e immagine corretta distribuiti; verificati asset di indice, filtri e azioni album, health e API private. I vincoli locali nei paragrafi storici sotto descrivono il lavoro prima della pubblicazione. La successiva PWA non è compresa nel deployment.

Il 15 novembre 2026 l'utente ha richiesto **push e merge in main di tutte le modifiche locali**. La consegna parte da `style/bookmark-navigation`, basato su `main` `09aa1b2`, e include indice a segnalibri con logo centrato, filtri flottanti della Timeline, correzione della prima card/anno e del focus nei popover, azioni flottanti del singolo album e questa documentazione. Questa autorizzazione sostituisce i vincoli di sola preview nei paragrafi storici sotto. Nessuna modifica a dati, account o volumi Docker. Controllare con Git e Jenkins SHA finale, merge e deployment; `main` avvia la pipeline.

Verifiche locali concluse: typecheck, lint, **94 test automatici in 6 file**, build Docker healthy e collaudi Chromium descritti sotto. Per lavori successivi seguire le nuove istruzioni dell'utente, conservando le parti già approvate.

## Azioni album flottanti

L'utente ha indicato i quattro pulsanti nell'intestazione di un singolo album e chiesto di raccoglierli in un pulsante flottante. In `TripDiary`, **Azioni** contiene ora **Aggiungi un ricordo**, **Aggiungi ricordi esistenti**, **Modifica album** ed **Elimina album**. Intestazione libera dai comandi; le schede **Il diario/Le fotografie** restano visibili. Riutilizzato `FloatingActions`, senza nuovi componenti o dipendenze. Il collegamento al nuovo ricordo usa un normale Router Link e conserva album/capitolo preselezionati; prima di aprire i dialoghi il menu si chiude e focalizza il launcher, così annullamento/chiusura restituiscono il focus al pulsante. Conferma di eliminazione e conservazione dei ricordi invariate. Menu disponibile anche per album vuoti e nella vista fotografie. La pagina del capitolo e i comandi contestuali degli stati vuoti non sono stati modificati.

File: `apps/web/src/pages/Albums.tsx`, spazio inferiore per il pulsante in `refinements.css`, documentazione `docs/ALBUMS.md`. Branch ancora **`style/bookmark-navigation`**, con navigazione, logo e filtri Timeline locali conservati. **Nessun nuovo push/merge richiesto.** Docker healthy e aggiornato su **http://localhost:3000**. Typecheck, lint, **94 test automatici**, build Docker e **30 controlli Chromium** superati: intestazione e menu, scroll, Escape/focus, dialoghi e annullamento, conferma eliminazione senza confermarla, nuovo ricordo con parametri corretti, cambio vista, album vuoto simulato e layout a 375/430/768/1001/1280 px. Screenshot desktop/mobile esaminati, nessun errore JavaScript, nessuna scrittura ai dati demo. Artefatti ignorati `.tools/album-actions-qa/` e relativi script/log. Nessuna verifica su dispositivi fisici o Safari/Firefox dichiarata.

## Filtri Timeline flottanti e anno senza sovrapposizioni

L'utente ha segnalato l'anno della Timeline sovrapposto alla barra filtri e chiesto un pulsante flottante. Tolta la barra: il pulsante **Filtri**, in basso a destra, apre anno, capitolo, ordine e **Azzera filtri**. Mostra il numero di filtri anno/capitolo attivi; sulla pagina resta una riga di riepilogo. `FloatingActions` ora accetta `triggerText`, con default Azioni invariato per mappa/ricordi. URL, filtro lato API, reset della pagina quando cambia un filtro e conservazione degli altri parametri rimangono funzionanti. Azzera rimuove year/category/order/page e chiude il pannello.

La prima card riceveva erroneamente il margine negativo delle successive perché il primo figlio della timeline è l'SVG. Corretto il primo elemento con `:first-of-type` e riservato spazio all'anno dentro la Timeline in `timeline-filters.css`, senza modificare il disegno del filo originale. Il collaudo ha inoltre confermato che `RouteViewport` spostava il focus al main dopo il cambio filtro in URL: ora conserva il focus quando è dentro un popover aperto, mantenendo il ripristino precedente negli altri casi. Select con label esplicite e target touch da 44 px.

File: `pages/Timeline.tsx`, nuovo `timeline-filters.css`, `components/FloatingActions.tsx`, piccolo intervento in `motion.tsx`. Branch ancora **`style/bookmark-navigation`**, con navigazione e logo approvati conservati. **Tutto locale, nessun nuovo push/merge autorizzato.** Docker aggiornato e healthy su **http://localhost:3000/timeline**, dati preservati. Superati typecheck/lint, **94 test automatici**, build Docker e **37 controlli Chromium**: anno sotto il riepilogo a 375/430/768/1001/1280 px, nessun overflow, pannello/scroll/barra mobile e altezza 667 px, focus/Escape/clic esterno, anno/capitolo/ordine, contatore, reset, parametri URL e paginazione, movimento ridotto e presenza del filo originale. Screenshot desktop/mobile esaminati, nessun errore JavaScript o scrittura dati. Artefatti ignorati `.tools/timeline-filters-qa/`, script e log; i primi passaggi falliti hanno identificato il margine negativo o timing del collaudo e non costituiscono la verifica finale. Nessuna prova su dispositivi fisici o Safari/Firefox dichiarata.

## Navigazione a segnalibri, proposta locale approvata

Dopo aver chiesto prima push/merge del lavoro pronto, l'utente vuole una navigazione più particolare della solita barra superiore. La consegna precedente è completata (vedi sotto). La nuova proposta locale sostituisce la navbar desktop con un **indice a segnalibri sul lato sinistro**: linguette di carta numerate e colorate, filo rosso tratteggiato e capitolo attivo spostato leggermente verso la pagina. Account e uscita sono in fondo all'indice. Il contenuto occupa lo spazio a destra, senza sovrapporsi all'indice fisso. Su mobile/tablet fino a 1000 px rimane un piccolo marchio centrale sopra la pagina e le cinque destinazioni sono segnalibri in basso; il pulsante Azioni rimane sopra di essi.

L'utente ha approvato l'indice e chiesto di rivedere soltanto la collocazione del logo. Tolti cartoncino inclinato e scotch: simbolo del filo più ampio, centrato sopra il nome, direttamente sullo sfondo, con una sottile linea sotto al marchio. Ritocco limitato a `diary-navigation.css`, mantenendo le dimensioni mobili precedenti e tutti i segnalibri. Docker aggiornato; **20 controlli Chromium mirati** su 320/375/768/1001/1440 px, centratura, assenza di overflow, account su schermo basso, collegamento Home e focus tastiera, senza errori JavaScript. Screenshot esaminato; artefatti ignorati `.tools/navigation-logo-qa/` e relativi script/log. Nessun nuovo push richiesto. Le verifiche più ampie sotto si riferiscono alla proposta precedente al ritocco del logo.

Stessi percorsi e logica di navigazione: Album attivo nei ricordi e nell'editor, Impostazioni attive nel Cestino. Link veri, `aria-current`, salta al contenuto, focus visibile, uscita e movimento ridotto conservati. Stili limitati a `.diary-shell`, nessuna modifica al login, al filo della timeline, ai dati o alle API. File: `apps/web/src/components.tsx`, import in `main.tsx`, nuovo `diary-navigation.css`.

Branch **`style/bookmark-navigation`**, da `main` `09aa1b2`. **Solo preview locale, nessun push/merge della nuova navigazione richiesto.** Docker aggiornato e healthy su **http://localhost:3000**. Typecheck, lint, **94 test automatici**, build Docker, **56 controlli Chromium di navigazione** e **23 controlli layout/uscita** superati. Verificati 320/375/430/768/1000/1001/1100/1280/1920 px, altezza 600 px per l'accessibilità dell'account, desktop/mobile e soglia 1000 px, link/stati attivi, scroll, menu Azioni, tastiera e movimento ridotto; Home, Timeline, Album, Impostazioni, editor nuovo/esistente e dettaglio senza overflow. Screenshot desktop/mobile/editor/Impostazioni esaminati. Nessun errore JavaScript o modifica ai dati; logout simulato. Artefatti ignorati `.tools/bookmark-navigation-qa/`, script/log relativi e `.tools/bookmark-layout-smoke.log`. Nessuna verifica su Safari/Firefox o dispositivi fisici dichiarata.

## Consegna completata — azioni flottanti sulla mappa

Feature **`4171fac`**, merge su `main` **`09aa1b2a17bacbdd65928489ebf44d7b701a71e9`**, **Jenkins #9 SUCCESS** con 94 test. Runtime healthy e immagine corrispondente allo SHA verificati; health HTTPS, asset delle azioni flottanti della mappa e API private (401) confermati. La navigazione a segnalibri successiva non è compresa in questo deployment.

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
