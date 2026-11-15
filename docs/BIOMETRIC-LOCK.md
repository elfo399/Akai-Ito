# Proteggi il nostro diario — passkey e blocco della sessione

Implementazione sul branch locale `feat/biometric-diary-lock`. Nessun push, Jenkins o modifica ai dati di produzione è autorizzato da questo intervento. La migrazione `0004_diary_lock.sql` è additiva e si applica all'avvio **solo del nuovo volume di preview**. Le modifiche alle particelle mobili già presenti sono conservate.

## Come usarlo

Ogni persona accede con la propria password e apre **Impostazioni → Il tuo account → Proteggi il nostro diario**. Il blocco è inizialmente disattivato per tutti, compresi gli account già esistenti.

1. Selezionare **Attiva blocco biometrico**, confermare la password e dare un nome al dispositivo.
2. Completare la registrazione nella finestra di sicurezza del browser/dispositivo. Volto, impronta, PIN, chiave esterna o altra verifica sono scelti dal sistema operativo: Akai Ito non può imporre Face ID.
3. Scegliere Subito, 1, 5 o 15 minuti. Il valore iniziale è **5 minuti**. Per modificare il tempo, aggiungere/rimuovere passkey o disattivare la protezione l'interfaccia richiede nuovamente la password.
4. **Blocca adesso** permette una prova immediata. **Sblocca il diario** esegue WebAuthn; **Usa la password** è sempre il recupero, verificato realmente dal server.

Gli account conservano preferenze e credenziali indipendenti. Una persona non può usare la propria passkey per sbloccare l'altra. Per configurare il secondo account, uscire e ripetere la procedura. Sono ammesse al massimo dieci passkey per account; non si può rimuovere l'ultima mentre la protezione è attiva. La rimozione nel diario revoca la chiave sul server; l'eventuale voce nel gestore di password del dispositivo va rimossa da quel gestore.

In caso di problemi scegliere **Usa la password**, quindi disattivare il blocco nelle impostazioni confermando la password. Le passkey rimangono registrate finché non vengono rimosse. Non è previsto recupero via email. Password dimenticata e perdita contemporanea di tutte le passkey richiedono la procedura amministrativa già prevista per gli account, non un bypass del blocco.

## Architettura e confini di sicurezza

- `apps/api/src/diary-lock.ts` contiene lo stato persistente e le cerimonie WebAuthn. `app.ts` applica il controllo centralmente nell'hook `onRequest`, dopo autenticazione e CSRF e prima delle rotte private, comprese immagini, originali, miniature, avatar, commenti, album, mappa, impostazioni e mutazioni. Non è necessario ricordarsi il blocco in ogni nuova rotta `/api/`.
- Sessione assente/scaduta/revocata: **401**. Sessione valida e bloccata: **423** con `code: DIARY_LOCKED`. Il blocco non elimina il cookie. Login con password crea una nuova sessione sbloccata; cambio password e logout conservano la revoca esistente.
- Le eccezioni sono login e health pubblici, `/auth/me` (stato, CSRF e identità minima, senza avatar durante il blocco), stato blocco, visibilità, opzioni/verifica di sblocco, recupero password e logout. Registrazione, elenco/revoca passkey e modifica delle preferenze sono inaccessibili durante il blocco. Le rotte di visibilità non possono sbloccare una sessione.
- Le API e i media privati conservano `Cache-Control: no-store`. Il service worker non memorizza API, fotografie, avatar o pagine private per uso offline. L'app non può ritirare immagini già scaricate o copie effettuate volontariamente dall'utente.
- La verifica crittografica usa `@simplewebauthn/server` **14.1.0**, il browser **14.0.0**, senza algoritmi WebAuthn artigianali. `userVerification: required` è richiesto nelle opzioni e verificato dal server; non basta una presenza senza verifica dell'utente.
- Le challenge casuali scadono dopo 120 secondi. Sono associate ad account, sessione e scopo; una nuova challenge sostituisce la precedente per lo stesso scopo/sessione. `DELETE … RETURNING` le consuma atomicamente prima della verifica asincrona, anche in caso di firma non valida. Non sono riutilizzabili.
- Registrazione e autenticazione verificano challenge, origine esatta, RP ID, UV, firma/attestazione tramite la libreria. L'ID della credenziale è globalmente unico. Lo user handle, se presente, deve corrispondere all'account autenticato; il proprietario non viene accettato dal corpo della richiesta.
- Si conservano chiave **pubblica** COSE, contatore, trasporti, tipo dispositivo, stato di backup, nome e date. Nessuna chiave privata, volto o impronta. I contatori seguono la libreria: lo zero è consentito per passkey sincronizzate, un contatore positivo non può retrocedere. Un aggiornamento condizionale e una transazione impediscono che una credenziale revocata o modificata durante la verifica sblocchi la sessione.
- Le operazioni di gestione richiedono sessione sbloccata e verifica recente, entro cinque minuti, tramite login, password o precedente sblocco con UV. La UI chiede esplicitamente la password per ogni modifica. Le sessioni vengono ricontrollate dopo Argon2/WebAuthn asincroni; una sessione scaduta/revocata non può essere resuscitata.
- Password di recupero/conferma e cerimonie WebAuthn hanno limite di otto tentativi per rotta/IP in quindici minuti, oltre al limite generale esistente. Cookie HttpOnly/SameSite, HTTPS in produzione, CSRF e controllo Origin sono preservati. Nessun contenuto delle cerimonie o segreto viene aggiunto ai log.

## Origine, HTTPS e dispositivi

RP ID = hostname della **configurazione** `APP_ORIGIN`, senza porta; expectedOrigin = `APP_ORIGIN` esatta, compresi schema e porta. Il server non li ricava da Host, X-Forwarded-Host o altri header del client. La configurazione deve essere un'origine canonica senza slash finale, percorso, credenziali o query.

WebAuthn è abilitato per HTTPS con nome host, oppure `http://localhost` per lo sviluppo. Le cerimonie richiedono sempre l'Origin configurata esatta: gli alias HTTP loopback del login tradizionale non vengono estesi a WebAuthn. Usare **localhost:3001**, non 127.0.0.1:3001. Un indirizzo IP LAN in HTTP non consente di provare passkey sul telefono. Per una futura prova fisica preparare una preview con hostname e HTTPS validi, configurando la sua origine esatta senza toccare quella di produzione. Le credenziali sono legate al RP ID: cambiare dominio può richiedere una nuova registrazione.

Safari/iPhone e PWA installata, Chrome/Android e PWA, desktop compatibili possono usare la verifica esposta dal browser e dal dispositivo. Il flusso parte da un pulsante, senza richieste biometriche automatiche all'apertura. Assenza di secure context/PublicKeyCredential o configurazione server inadatta impedisce l'attivazione e mostra una spiegazione; lo sblocco con password rimane disponibile. Disponibilità delle API non garantisce la presenza di un autenticatore utilizzabile: annullamenti e impossibilità di completare la cerimonia lasciano la sessione bloccata.

## Timeout e più finestre

Il server memorizza per sessione `last_activity`, `background_at`, `locked_at` e `verified_at`. Le preferenze sono nell'account. Il client invia attività reale e fidata — tocchi, tastiera, scroll — al massimo una volta ogni quindici secondi, con un invio finale raggruppato quando necessario. Non è necessario effettuare altre richieste API mentre si legge. Senza interazioni, leggere per più del timeout configurato è considerato inattività. Non c'è polling periodico.

La scadenza è il minimo fra ultima attività + timeout e inizio background + timeout. **Subito** significa blocco quando tutte le finestre note sono in background; in primo piano usa un minuto di inattività per evitare di ribloccare continuamente durante l'uso. Il testo delle impostazioni lo esplicita. Una finestra visibile e attiva impedisce che il cambio di un'altra finestra blocchi tutta la sessione. Le presenze vecchie scadono e vengono azzerate allo sblocco, così reload e finestre chiuse non rinviano il blocco immediato.

`visibilitychange`/`pagehide` notificano il background con fetch keepalive. `pageshow` (anche bfcache), visibilità e focus verificano lo stato sul server **prima** di rivelare contenuti. Un timer locale singolo copre l'inattività in primo piano, ma il controllo server viene ripetuto al ritorno: timer sospesi, reload e orologio del browser non autorizzano l'accesso. Gli intervalli del client sono calcolati dalla coppia deadline/serverTime restituita dal server. Se il browser viene terminato senza inviare eventi, resta valido il limite server dall'ultima attività; per Subito questo ripiego può arrivare a un minuto. Nessuna PWA può notificare in modo infallibile la propria terminazione.

`BroadcastChannel` comunica lock/unlock e cambi di preferenze fra le schede dello stesso account e origine. Non trasporta token o prove di autenticazione: ogni scheda ricontrolla il server. Altre sessioni dello stesso account vengono bloccate quando si abilita o cambia la protezione; la disattivazione la rimuove anche da quelle sessioni. Un altro dispositivo già aperto verifica il cambiamento alla prima richiesta privata o al ripristino, senza polling remoto.

## Protezione visiva e ripresa

`diary-session.tsx` coordina la sessione; `DiaryGate` è una pagina Scrapbook neutra, con filo rosso e senza foto. Al primo caricamento il layout privato non viene montato prima di `/auth/me`. Al background/blur una copertura **opaca**, fuori dallo stacking context del root, nasconde immediatamente shell, particelle, dialoghi e popover. Le immagini catturate dalle View Transitions sono nascoste quando il diario è protetto. La copertura non è il controllo di autorizzazione: questo è sempre sul backend.

Per un rientro breve si sospendono le query e si nasconde il DOM, conservando temporaneamente bozze e stato della pagina. Una risposta di verifica precedente al nuovo background viene scartata. Su blocco confermato, 423 o revoca si svuota TanStack Query, si smonta il layout privato e si scartano le risposte private iniziate prima del cambio di stato. Se lo stato non può essere verificato, rimane una schermata neutra con Riprova. La password digitata non viene salvata nello storage.

Route e parametri URL non cambiano durante il blocco. In sessionStorage si conserva soltanto percorso e posizione dello scroll, ripristinati quando il contenuto autorizzato è pronto. Non vengono persistiti ricordi o credenziali. I dialoghi di verifica del sistema operativo sono riconosciuti per evitare di distruggere il flusso WebAuthn quando sottraggono il focus. Movimento ridotto e navigazione da tastiera rimangono rispettati.

**Limite PWA:** iOS/Android decidono quando acquisire e conservare gli snapshot del multitasking. La copertura negli eventi browser riduce l'esposizione ma non garantisce l'oscuramento di uno snapshot acquisito prima dell'evento. Una PWA non ha necessariamente le API di protezione delle schermate di un'app nativa. Riavvio del processo e riapertura della PWA verificano sempre il server prima dei contenuti; il comportamento di snapshot e prompt biometrici va collaudato sul dispositivo fisico.

## API

Tutti i percorsi sotto iniziano con `/api`; sessione e CSRF per le mutazioni restano obbligatori.

| Metodo e percorso                     | Funzione                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------ |
| GET `/auth/me`                        | Identità minima, CSRF e stato `lock`; nessun avatar durante il blocco    |
| GET `/auth/lock/state`                | enabled, timeoutSeconds, locked, deadline, serverTime, webauthnAvailable |
| POST `/auth/lock/activity`            | `{tabId}` UUID; aggiorna attività solo se già sbloccata                  |
| POST `/auth/lock/visibility`          | `{tabId, hidden}`; non può sbloccare                                     |
| POST `/auth/lock/manual`              | Blocca adesso, se abilitato                                              |
| POST `/auth/lock/reauth`              | `{password}`; conferma recente per la gestione                           |
| PUT `/auth/lock/preferences`          | `{enabled, timeoutSeconds}` con tempo 0/60/300/900                       |
| GET `/auth/passkeys`                  | Solo passkey del proprietario, senza chiavi pubbliche nell'elenco        |
| POST `/auth/passkeys/options`         | Opzioni di registrazione e challengeId                                   |
| POST `/auth/passkeys/verify`          | `{challengeId, response, name}`                                          |
| DELETE `/auth/passkeys/:credentialId` | Revoca del proprietario con verifica recente                             |
| POST `/auth/lock/options`             | Opzioni di autenticazione limitate alle credenziali dell'account         |
| POST `/auth/lock/verify`              | `{challengeId, response}`; verifica firma/UV e sblocca                   |
| POST `/auth/lock/password`            | `{password}`; recupero Argon2id                                          |
| POST `/auth/logout`                   | Revoca della sessione anche da bloccata                                  |

## Preview Docker isolata

```sh
docker compose --env-file docker/biometric.preview.env.example up -d --build
docker compose --env-file docker/biometric.preview.env.example ps
```

Aprire **http://localhost:3001**. Progetto `akai-ito-biometric-preview`, immagine `akai-ito:biometric-local`, volume `akai-ito-biometric-preview_diary-data`, bind solo su 127.0.0.1. La preview precedente su 3000 ha immagine e volume distinti e non viene migrata. Su questo PC sono stati inizializzati **solo nella nuova preview** due account sintetici: `demo` / `partner`, entrambi con password `DiarioLocale2026!`; non sono credenziali di produzione. Il test browser crea una fotografia sintetica a tinta unita, senza fotografie personali. Al termine revoca le chiavi virtuali e disattiva il blocco per permettere una configurazione reale.

Su un nuovo PC il volume parte vuoto: usare il comando interattivo `docker compose --env-file docker/biometric.preview.env.example exec app node apps/api/dist/cli.js init-users` e configurare i due account sintetici sopra per eseguire lo script. Evitare di usare la stessa sessione del browser per le due preview localhost: i cookie HTTP non sono separati per porta; una finestra privata o un profilo distinto evita interferenze di login. Dati e volumi restano separati.

## Verifiche ripetibili

Esito locale: **127 test Vitest in 8 file**, typecheck/lint, build Docker e **53 controlli Chromium** conclusi, con screenshot esaminati alle quattro larghezze richieste. La preview è healthy; nessun push o deployment è stato eseguito.

```sh
npm run typecheck
npm run lint
npm test
# Dipendenza browser facoltativa, mantenuta fuori dal workspace/package-lock:
npm install --prefix .tools/visual-qa --no-save playwright@1.65.1
node .tools/visual-qa/node_modules/playwright/cli.js install chromium
node --import tsx scripts/biometric-browser-check.ts
```

Lo script rifiuta di partire con passkey già presenti o blocco attivato e usa unicamente `http://localhost:3001`, account demo/partner e dati sintetici. Non va indirizzato alla produzione. Concluso con successo, lascia il ricordo sintetico, rimuove tutte le passkey create dal test e disattiva il blocco. In caso di interruzione accedere alla preview con password, disattivare il blocco e rimuovere soltanto le chiavi chiamate QA prima di riprovare. I limiti antiabuso restano attivi: riavviare **solo il container della preview** fra suite ripetute, senza eliminare il volume.

I test backend usano SQLite temporaneo, orologio iniettato, chiavi EC e risposte realmente firmate, verificate dalla libreria di produzione. Coprono challenge, account/sessione, origini/RP/UV/firme, contatori, revoca, recupero password, limiti, timeout e autorizzazione centrale. Il test browser usa Chromium e autenticatore virtuale CDP con credenziali residenti e UV: configurazione, gestione chiavi, timeout, cancellazione, sblocco reale, password, più schede, media reali della fixture bloccati, reload, route/scroll e layout a 375/430/768/1440 px. Il background/bfcache viene anche simulato con eventi; non equivale a un test fisico del ciclo di vita iOS. Screenshot e risultati sono ignorati in `.tools/biometric-qa/`.

**Nessuna verifica Face ID, Touch ID, Safari/iPhone, PWA fisica o Android fisico viene dichiarata sulla base dell'autenticatore virtuale.** Prima di una pubblicazione eseguire su quei dispositivi registrazione, annullamento, sblocco, fallback, passaggio fra app e riapertura dopo il timeout, incluso kill del processo e snapshot del multitasking.

## Backup consistente prima di una futura migrazione

Questa procedura va preparata e autorizzata per il deployment futuro; **non è stata eseguita sulla produzione**. Non copiare soltanto `akai.sqlite` mentre l'app scrive: il WAL può contenere transazioni confermate e fotografie/database devono corrispondere.

1. Annotare SHA/immagine attualmente in esecuzione, configurazione del deploy e **nome reale del volume** da `docker inspect`. Non dedurlo solo dal nome Compose. Conservare l'immagine precedente e verificare spazio disponibile per backup e ripristino. Limitare l'accesso alla directory dei backup: contiene tutte le foto e gli hash di autenticazione.
2. Fermare il servizio app con timeout sufficiente e assicurarsi che nessun altro processo scriva quel volume. Per un backup coerente fra DB e media mantenere il servizio fermo per tutta la copia. I checkpoint SQLite alla chiusura non vanno presunti: includere anche WAL/SHM, se presenti.
3. Archiviare **l'intero volume dati**, montato in sola lettura in un container helper senza rete, includendo `akai.sqlite`, eventuali `-wal`/`-shm`, `media/` e le altre directory presenti. Non avviare il server helper. L'archivio deve essere scritto fuori dal volume, con permessi riservati. Calcolare SHA-256 e controllare l'indice dell'archivio. `scripts/jenkins-deploy.sh` contiene già stop, archivio del volume effettivo e checksum: il backup del job va verificato prima del futuro rilascio.
4. Eseguire un **ripristino di prova in un volume nuovo e isolato**, mai sopra il volume originale: verificare checksum, estrarre con percorsi relativi, ripristinare UID/GID 1000:1000. Nessuna rete/proxy/origine di produzione deve puntare a questa copia. Controllare `PRAGMA integrity_check`, `PRAGMA foreign_key_check`, registro `_migrations`, conteggi di account/ricordi/media/commenti/album e presenza dei file. Il comando `node apps/api/dist/cli.js verify` esegue i controlli applicativi dei riferimenti alle fotografie. Verificare anche che originali e derivati siano leggibili.
5. Sulla **copia** applicare la nuova immagine e la migrazione; ricontrollare integrità, dati e default `lock_enabled=0`, timeout 300. Provare login e lettura di ricordi/media con account di collaudo appropriati, verificando che nessun account venga bloccato automaticamente. Documentare esito e checksum prima di autorizzare il rilascio effettivo.
6. Solo dopo questi controlli applicare l'aggiornamento autorizzato al volume di produzione e verificare health, CLI verify, login e media. Conservare backup, checksum, configurazione e immagine precedente secondo la politica del progetto.

**Rollback:** l'immagine precedente da sola non costituisce rollback dello schema. Le nuove colonne/tabelle non vengono eliminate da questo codice. Se serve tornare allo stato precedente, fermare l'app e ripristinare il backup verificato in un altro volume, con l'immagine e la configurazione corrispondenti; puntare il servizio a quella copia dopo verifica. Conservare separatamente anche il volume aggiornato per non perdere eventuali nuovi contenuti. Non sovrascrivere o eliminare il volume originale e non usare `down -v`. La semplice riaccensione automatica dell'immagine vecchia nello script Jenkins non sostituisce questa procedura di ripristino dei dati.

## Fonti tecniche

API confrontate con i tipi delle versioni installate e la documentazione ufficiale: [SimpleWebAuthn server](https://simplewebauthn.dev/docs/packages/server), [SimpleWebAuthn browser](https://simplewebauthn.dev/docs/packages/browser), [Chrome DevTools WebAuthn](https://chromedevtools.github.io/devtools-protocol/tot/WebAuthn/). Non ci sono chiamate a questi servizi durante l'uso del diario.
