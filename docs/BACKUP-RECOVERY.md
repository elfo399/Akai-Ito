# Akai Ito — Memory Vault

Sistema operativo di backup **Linux**, da eseguire sull'host Docker. Non aggiunge una pagina web, un database o un servizio applicativo permanente. Branch `feat/memory-vault-backup`; preparato e collaudato localmente con dati sintetici. **Non è attivo in produzione**: nessun timer installato, push, Jenkins o modifica dei volumi reali.

## Strategia scelta

Il Vault usa **Restic** per cifratura autenticata, snapshot incrementali, deduplicazione dei file, controlli crittografici e retention. È utile perché fotografie originali e derivati cambiano poco fra due backup; archivi compressi completi ogni notte moltiplicherebbero lo spazio occupato. `backup.sh`, `restore.sh` e i tar.gz pre-deploy restano compatibili e utilizzano le stesse primitive di copia/verifica e lo stesso lock. La pipeline Jenkins non viene riprogettata.

Un backup Vault procede così:

1. Carica la configurazione privata, registra il tentativo e acquisisce **`BACKUP_DEPLOY_DIR/.deploy.lock`**, lo stesso file del deploy Jenkins. Se occupato esce con **75**, senza fermare o riavviare il servizio dell'altro processo.
2. Recupera un eventuale arresto interrotto, poi verifica destinazione, mount, permessi, repository/password, spazio e identità del container/volume effettivamente in uso. Rifiuta altri container che montano quel volume in scrittura. Non presume il nome del volume e può controllarlo anche con `BACKUP_EXPECTED_VOLUME`.
3. Memorizza un journal di riavvio locale e ferma il container esistente. Non lo ricrea con una nuova immagine e non applica migrazioni. Se era già fermo, rimane fermo anche alla fine.
4. Legge **l'intero volume**, montato in sola lettura in un helper senza rete: database, eventuali WAL/SHM, originali, derivati, avatar e altri file persistenti. Scrive un tar temporaneo non compresso sul supporto di backup.
5. Riavvia il container precedente e attende l'healthcheck. La fase di fermo dura la copia del volume, non la successiva cifratura e manutenzione del repository. La prima copia di molti GB può comunque richiedere tempo: misurarlo sul disco/NAS reale.
6. Sulla **sola copia** estrae in sicurezza, verifica SQLite, foreign key e media e consolida il WAL catturato. Non tocca il database attivo. Crea un manifest con conteggi, registro migrazioni, hash del contenuto logico del DB e SHA-256/dimensione di ogni file.
7. Salva i file e il manifest con Restic come candidato `vault-pending`, controlla il repository e, solo dopo successo, pubblica il tag `vault-verified`. Un candidato fallito non compare nell'elenco dei backup validi.
8. Aggiorna stato e inventario, esegue l'eventuale retention configurata e rimuove soltanto la propria directory temporanea identificata da UUID e marcatore di proprietà. Rilascia il lock.

La Online Backup API SQLite da sola non è usata come sostituto della copia coerente DB/media. Durante la cattura non devono esserci scritture amministrative esterne al servizio; l'esclusione controlla gli altri container, non può impedire a root di modificare direttamente i file sull'host. Anche `purge`, importazioni e operazioni manuali sul volume devono rispettare lo stesso lock.

## Prerequisiti e dati da scegliere

- Raspberry/Linux **ARM64**, Docker Engine e Compose v2, Bash, Python 3 con SQLite/tarfile, Restic **0.14 o successivo**, jq, util-linux (`flock`, `findmnt`, `mountpoint`), GNU coreutils/tar/gzip. Non serve Node sull'host per i comandi shell.
- Un utente operativo fidato con accesso Docker. **Il timer deve usare lo stesso utente Unix che possiede `.deploy.lock` di Jenkins**: non usare root per creare un nuovo lock 600 che Jenkins non possa poi aprire. L'accesso al socket Docker equivale a un accesso amministrativo; non allargarne i permessi.
- Directory di deploy esatta già usata da Jenkins; percorso del repository sorgente stabile per gli script; destinazione privata su disco USB/NAS; mount effettivo; spazio sufficiente; file della password Restic esterno a Git e al disco dei backup.
- Per il ripristino, immagine locale compatibile con la versione del backup. Il manifest conserva l'ID immutabile dell'immagine; su una macchina nuova va recuperata o ricostruita la versione corrispondente, impostando `BACKUP_APP_IMAGE`. Non presumere che l'ultima versione possa leggere qualsiasi schema storico.

Su Debian/Raspberry Pi OS installare i pacchetti necessari con il proprio gestore e verificarli prima di abilitare il timer. Per esempio: `bash python3 restic jq util-linux coreutils tar gzip`; ShellCheck serve ai collaudi. Docker/Compose devono essere installati e funzionanti secondo la procedura già usata sul Raspberry.

## Destinazione e segreti

Scegliere un filesystem **fisicamente separato** dalla scheda SD. Un'altra cartella o una partizione sulla stessa SD non protegge da un suo guasto. Il NAS deve essere montato sull'host; nella prima versione il Vault gestisce repository Restic locali a quel mount, non credenziali/backend remoti arbitrari.

Prima controllare `findmnt`, dispositivo/UUID o sorgente NAS e permessi. Solo dopo creare una directory dedicata **700** sul filesystem montato, di proprietà dell'utente operativo. Non creare il punto di destinazione con uno script che possa ricadere sulla SD quando il disco manca. La directory deve esistere: il Vault non la crea automaticamente.

Configurare:

```sh
# Percorsi sotto scelti dall'operatore; non sono percorsi di produzione preconfigurati.
install -m 600 docker/backup.env.example /PERCORSO-PRIVATO/backup.env
```

Modificare ogni placeholder di [docker/backup.env.example](../docker/backup.env.example). Tenere la configurazione fuori dal repository; è un file shell fidato, non input di un utente web. `MEMORY_VAULT_CONFIG` seleziona il file (default `/etc/akai-ito/backup.env`). Non inserire password nel file: è ammesso solo **`RESTIC_PASSWORD_FILE`**.

Creare la password con un gestore di password o una sorgente casuale robusta e salvarla in un file **600/400**, di proprietà dell'operatore o root, leggibile dall'operatore. Il percorso deve essere esterno sia al repository sorgente sia alla destinazione dei backup. Evitare argomenti di processo, history della shell, Git, screenshot e log contenenti il segreto. Conservare una **seconda copia separata** in un gestore di password o supporto offline: la perdita della password Restic rende i backup irrecuperabili. Un NAS non deve contenere l'unica copia della propria chiave di decifratura.

`BACKUP_REQUIRE_MOUNT=true` è il default. `BACKUP_MOUNT_POINT` deve essere un mount reale, diverso da `/`, e il target deve appartenere a quel mount. `BACKUP_EXPECTED_SOURCE` può fissare anche il valore SOURCE riportato da `findmnt`, utile contro il montaggio del disco sbagliato. Per un NAS gestire prima autenticazione e disponibilità del mount con la configurazione Linux esistente, senza mettere credenziali NAS nel Vault.

La cifratura protegge il repository Restic; **la copia temporanea è in chiaro** nella sottocartella privata `.staging` del target. Serve un filesystem che applichi correttamente permessi/ACL privati (oppure ulteriore cifratura del disco). Non usare una condivisione pubblica o un filesystem che renda la staging leggibile ad altri. La cancellazione della staging non equivale a una cancellazione fisica sicura dei settori, soprattutto su SSD/NAS: considerare anche la cifratura del supporto e le sue snapshot amministrative.

## Spazio e configurazione

Il preflight della cattura riserva circa **tre volte** la dimensione del volume più `BACKUP_MIN_FREE_MB` (default 1024 MiB): tar temporaneo, copia estratta e nuovo contenuto del repository. Non è la dimensione permanente di ogni snapshot, perché Restic deduplica. La verifica completa richiede spazio per una copia; il preflight usa un margine di due copie. Un ripristino/drill riserva **cinque copie** sul target per staging, tar di trasferimento e confronto di rilettura. Controlla inoltre lo spazio del **nuovo volume Docker**, che potrebbe essere sulla SD anziché sul disco dei backup. La procedura rifiuta spazio insufficiente; in quel caso un volume nuovo ancora vuoto può rimanere per ispezione, senza alterare quello attivo.

Anche la cache Restic è sul target, in `.cache`, per evitare crescita della cache sulla SD. Restano locali soltanto i piccoli record di stato, log e journal necessari al recupero quando il supporto esterno è offline.

Opzioni principali:

| Impostazione                                       | Significato                                                                                                                                    |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `BACKUP_DEPLOY_DIR`, `COMPOSE_PROJECT_NAME`        | Identità del progetto e lock condiviso col deploy                                                                                              |
| `BACKUP_TARGET_DIR`, `BACKUP_MOUNT_POINT`          | Target privato esistente e mount da verificare                                                                                                 |
| `BACKUP_EXPECTED_SOURCE`, `BACKUP_EXPECTED_VOLUME` | Controlli aggiuntivi contro disco/volume inatteso                                                                                              |
| `BACKUP_STATE_DIR`                                 | Stato, log e journal locali; deve restare fuori dal target e dalle directory pubbliche                                                         |
| `RESTIC_REPOSITORY`                                | Sottodirectory del target, dedicata a questo Vault                                                                                             |
| `RESTIC_PASSWORD_FILE`                             | File privato del segreto, fuori da Git e dal target                                                                                            |
| `BACKUP_VERIFY_READ_DATA=true`                     | Legge e verifica tutti i dati cifrati del repository; `false` limita il check Restic alle strutture, mantenendo la verifica della copia locale |
| `BACKUP_KEEP_DAILY/WEEKLY/MONTHLY`                 | Default 7/4/6; è sempre aggiunto keep-last 1                                                                                                   |
| `BACKUP_AUTO_RETENTION=false`                      | Inizialmente nessuna cancellazione automatica; abilitarla dopo il dry-run                                                                      |
| `BACKUP_MIN_FREE_MB`, `BACKUP_HEALTH_TIMEOUT`      | Riserva disco e attesa healthcheck, default 1024 MiB/180 s                                                                                     |
| `BACKUP_APP_IMAGE`                                 | Immagine compatibile disponibile localmente per restore/drill su un nuovo host                                                                 |
| `BACKUP_KEEP_TEST_VOLUME=false`                    | Conserva opzionalmente il volume nuovo del drill per ispezione                                                                                 |
| `BACKUP_FAILURE_HOOK`                              | Integrazione futura tramite eseguibile locale privato; default vuoto                                                                           |

Non usare un repository Restic condiviso con altri sistemi. `init` rifiuta un repository già esistente e crea un marcatore con ID del repository e progetto; i comandi successivi verificano entrambi. Il Vault non adotta silenziosamente backup storici. Non usare `restic unlock` automaticamente: dopo un crash verificare prima che nessun processo lavori sul repository e consultare la procedura ufficiale.

## Primo backup e comandi

Sull'host Linux, dalla copia stabile del repository:

```sh
export MEMORY_VAULT_CONFIG=/PERCORSO-PRIVATO/backup.env
bash scripts/memory-vault.sh init
bash scripts/memory-vault.sh backup manual
bash scripts/memory-vault.sh list
bash scripts/memory-vault.sh verify latest
bash scripts/memory-vault.sh test-restore latest
bash scripts/memory-vault.sh status
```

`init` è un'operazione esplicita una tantum. Non viene eseguita dal timer: un disco/repository mancante provoca un errore, non un nuovo archivio vuoto apparentemente sano.

Alias npm disponibili **sull'host con Node**, equivalenti agli script shell:

| Comando                                            | Operazione                                                                          |
| -------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `npm run backup:init`                              | Inizializza il repository nuovo                                                     |
| `npm run backup`                                   | Backup manuale                                                                      |
| `npm run backup:list`                              | Inventario live dei soli snapshot verificati                                        |
| `npm run backup:verify -- latest`                  | Check crittografico, restore in staging, SQLite e hash di tutti i file              |
| `npm run backup:test-restore -- latest`            | Vero nuovo volume Docker, CLI applicativa e confronto indipendente del contenuto    |
| `npm run backup:restore -- ID akai-restored-NUOVO` | Ripristino conservato in un volume **nuovo**, mai collegato automaticamente all'app |
| `npm run backup:retention -- --dry-run`            | Piano senza cancellazioni                                                           |
| `npm run backup:retention -- --apply`              | Retention esplicita, solo dopo l'ultimo backup riuscito nello stesso repository     |
| `npm run backup:status`                            | Stato locale, disponibile anche con storage di backup offline                       |

Un ID abbreviato è accettato solo se identifica esattamente uno snapshot verificato del progetto. `latest` riguarda solo quegli snapshot, non candidati falliti o altri host/progetti.

## Retention

Si mantengono le ultime **7 date giornaliere, 4 periodi settimanali e 6 mensili** non vuoti secondo le regole Restic, più **sempre almeno l'ultimo snapshot verificato**. I gruppi si sovrappongono: non sono necessariamente 17 copie distinte e non sono limiti di anzianità a calendario con buchi obbligatori. I raggruppamenti usano UTC; il timer usa Europe/Rome.

Prima eseguire il dry-run e controllare il piano. `BACKUP_AUTO_RETENTION=true` abilita `forget`, quindi `prune` e un nuovo `check`, esclusivamente dopo la riuscita del backup corrente. La modalità manuale `--apply` controlla anche che l'ultimo tentativo di backup sia riuscito, che appartenga allo stesso repository e che lo snapshot sia ancora presente. Dopo un tentativo fallito ripetere prima un backup riuscito. Backup incompleti, errori di copia, mount o spazio non avviano retention.

I filtri richiedono contemporaneamente tag gestito, progetto e `vault-verified`; il raggruppamento usa l'host stabile del progetto. Candidati incompleti non vengono promossi automaticamente né cancellati dalla policy: possono richiedere pulizia amministrativa dopo aver compreso l'errore. File tar.gz preesistenti di Jenkins, snapshot non gestiti o altri progetti non vengono dimenticati. Il repository dedicato evita che il pruning venga usato come manutenzione generica di backup altrui. Tutte le operazioni hanno il medesimo lock host; Restic aggiunge i propri lock di repository. Non usare operazioni Restic dirette concorrenti con il Vault.

La retention non rende i backup immutabili e non protegge da un amministratore o malware con le credenziali del repository. Per protezioni aggiuntive conservare una copia offline/offsite o le snapshot protette del NAS, con una politica esplicita. Nessuna replica o servizio esterno viene configurato da questo codice.

## Scheduler systemd, da installare solo dopo la configurazione

I template sono in `docker/systemd/`. **Non installarli senza modificarli**: contengono `User=CHANGE_ME` e `/opt/akai-ito` come percorso esemplificativo.

1. Configurare e verificare manualmente target, password, primo backup e primo drill. Conservare script/app image su percorsi stabili, esterni al workspace Jenkins eliminabile.
2. Impostare in tutti i service il medesimo utente Unix di Jenkins, `WorkingDirectory`, `ExecStart` e `MEMORY_VAULT_CONFIG` reali. La directory di deploy nel file deve essere identica a quella passata a `jenkins-deploy.sh`.
3. Copiare i file adattati in `/etc/systemd/system/`. Aggiungere un drop-in `RequiresMountsFor=/MOUNT/REALE` per backup e drill, secondo la gestione effettiva del disco/NAS. **Non** applicare quel requisito al service `recover`: deve poter riaprire l'app anche se il disco esterno manca. Il controllo nello script rimane comunque obbligatorio.
4. Verificare le unità con `systemd-analyze verify`, poi `systemctl daemon-reload`.
5. Quando l'operatore decide di attivarli: abilitare `akai-memory-vault-recover.service` al boot e `akai-memory-vault.timer`; avviare manualmente il backup e verificare stato e log. Il timer del drill è opzionale e si abilita separatamente dopo aver misurato spazio e durata.

Comandi di attivazione **da eseguire manualmente sul Raspberry già configurato**, non eseguiti da questo intervento:

```sh
sudo systemctl daemon-reload
sudo systemctl enable akai-memory-vault-recover.service
sudo systemctl enable --now akai-memory-vault.timer
sudo systemctl start akai-memory-vault.service
systemctl list-timers 'akai-memory-vault*'
systemctl status akai-memory-vault.service
journalctl -u akai-memory-vault.service --since today
```

Default: **03:30 Europe/Rome ogni giorno**, `Persistent=true` recupera un'attivazione persa durante lo spegnimento, non crea retroattivamente tutti i backup mancati. Per cambiare orario usare un drop-in del timer con `OnCalendar=` vuoto seguito dal nuovo valore e riavviare il timer. Il drill opzionale è la domenica alle **05:00 Europe/Rome**; usa lo stesso lock e non può sovrapporsi a backup/deploy. Un conflitto esce con 75 ed è visibile come tentativo fallito: riprogrammare o ripetere dopo il deploy. Non è presente un processo permanente o polling del calendario.

Le unità limitano la priorità e prevedono timeout sufficienti alla trap. SIGTERM/SIGINT fermano il lavoro, tentano il riavvio e restituiscono exit code non zero. Un blackout o SIGKILL non può eseguire trap: il journal locale conserva l'identità del container da recuperare. `recover`, eseguito anche prima delle altre operazioni mutanti, lo riavvia solo se ID, immagine, progetto e volume coincidono; altrimenti richiede un intervento. Nessun sistema software garantisce il riavvio quando Docker o l'hardware sono indisponibili: lo stato di errore e il journal rimangono ispezionabili.

## Stato, log ed errori

`status` restituisce JSON con ultimo tentativo, ultimo backup riuscito, dimensione logica, byte aggiunti riportati da Restic, ID/versione immagine, eventuale fase fallita e ultimo drill riuscito. `inventory` contiene anche `checkedAt`: è **l'ultimo inventario noto**, non una garanzia che il NAS sia attualmente raggiungibile. `list` interroga il repository e aggiorna il numero di snapshot disponibili.

Record dei tentativi atomici e log sono in `BACKUP_STATE_DIR/attempts/` e `logs/`, privati. La console/journal ricevono eventi JSON con ID, fase ed exit code; non ricevono fotografie, password o il contenuto del database. I dettagli Restic restano nel log privato del tentativo. I log applicativi non vengono ampliati. I record `running` rimasti dopo un blackout sono tentativi interrotti, non successi; l'ultimo successo precedente rimane distinto. La conservazione dei log può essere gestita dall'operatore con journald e una policy locale separata: la retention del Vault gestisce **solo gli snapshot**, non cancella archivi o log storici arbitrari.

Un backup valido viene pubblicato solo dopo controllo della copia, riuscita Restic e verifica del repository. Un errore di manutenzione successiva può lasciare uno snapshot valido ma far terminare il processo con errore; leggere la fase registrata prima di riprovare. Non trattare un file presente o un candidato `vault-pending` come un backup verificato.

`BACKUP_FAILURE_HOOK` è vuoto per default. Se in futuro l'utente configura un eseguibile locale privato, riceverà `VAULT_RUN_ID`, `VAULT_OPERATION`, `VAULT_EXIT_CODE`; può leggere il record locale. Nessun indirizzo email, token Telegram, chiamata remota o credenziale di notifica viene configurato o usato in questa versione.

## Ripristino e scelta della versione

Prima verificare il backup, quindi ripristinare in un nome **nuovo** `akai-*`:

```sh
bash scripts/memory-vault.sh list
bash scripts/memory-vault.sh verify ID
bash scripts/memory-vault.sh restore ID akai-restored-DATA-NUOVO
```

Il comando controlla archivio Restic e manifest, restituisce conteggi e riferimenti, rifiuta volumi esistenti, crea un volume con label di proprietà, trasferisce i dati e ripristina UID/GID 1000:1000. Solo il container temporaneo di estrazione usa root con CHOWN/DAC_OVERRIDE/FOWNER per file e directory iniziali del nuovo volume; non è privilegiato, non ha rete e non modifica l'app attiva. Il controllo applicativo gira come UID 1000, senza capability.

La CLI già presente verifica integrità SQLite, foreign key e file. Il Vault rilegge inoltre **il volume effettivo appena ripristinato**, confrontando hash di tutti i file, conteggi, migrazioni e hash logico del DB con il manifest. Un volume fallito rimane isolato per ispezione; non viene promosso né collegato alla produzione. Il drill esegue lo stesso percorso con un volume UUID, poi elimina solo la risorsa creata dal proprio tentativo e con label corrispondente; `BACKUP_KEEP_TEST_VOLUME=true` permette di conservarla.

Per controllare dall'interfaccia usare un progetto Compose di preview, origine e porta separati, immagine compatibile e override del volume **external** appena ripristinato. Non utilizzare rete/alias del proxy di produzione per questa prova. Non applicare migrazioni nuove prima di aver verificato la versione originale. Un ripristino recupera anche gli hash delle password, le passkey pubbliche e le sessioni del momento del backup: decidere esplicitamente la revoca delle vecchie sessioni dopo il recupero. Le chiavi private delle passkey rimangono sui dispositivi/gestori originali; sul nuovo dominio può servire la password e una nuova registrazione.

Solo dopo il controllo e una decisione manuale dell'operatore si può fermare l'app, impostare un override del volume attivo e avviare l'immagine corrispondente. Il Vault **non compie questa sostituzione**. Conservare il volume precedente per il ritorno indietro; il rollback di una migrazione richiede dati e immagine corrispondenti, non soltanto un tag Docker precedente.

### Compatibilità degli archivi esistenti

```sh
# Su deploy gestito da Jenkins, passare SEMPRE la sua stessa directory di lock.
BACKUP_DEPLOY_DIR=/DEPLOY/REALE sh scripts/backup.sh /DESTINAZIONE/PRIVATA
BACKUP_DEPLOY_DIR=/DEPLOY/REALE BACKUP_APP_IMAGE=akai-ito:VERSIONE \
  sh scripts/restore.sh /DESTINAZIONE/akai-ito-DATA.tar.gz akai-restored-NUOVO
```

In un'installazione standalone la directory corrente resta il default del lock. Gli operatori del deploy Jenkins devono passare quella reale, non usare una cartella diversa del checkout. Entrambi gli entry point usano `backup-common.sh`; non acquisiscono lock annidati. Gli archivi hanno nomi UTC/UUID, checksum SHA-256, copia completa e verifica SQLite/media; non sovrascrivono file esistenti. Il restore controlla checksum e tutti i membri del tar, rifiutando traversal, percorsi assoluti, duplicati, link e device prima di creare il volume. La coppia tar/checksum viene pubblicata soltanto dopo validazione. Il formato resta compatibile con i backup storici.

**Questi tar.gz restano in chiaro**, protetti da permessi e supporto scelto dall'operatore; non vengono cifrati, importati in Restic o eliminati automaticamente. Jenkins continua a produrre il backup pre-deploy, ora con copia e verifica condivise. Richiede quindi anche Python 3 e gli strumenti GNU sull'agent. Il suo rollback automatico riguarda l'immagine e non sostituisce il ripristino manuale del database.

## Disaster recovery: scheda SD completamente guasta

Occorre avere conservato **prima del guasto**, fuori dalla SD:

- Repository Restic completo sul disco/NAS separato, oppure tar.gz e checksum storici.
- Password Restic in una posizione separata e recuperabile; eventuali credenziali del mount NAS conservate privatamente.
- Copia privata di configurazione backup e `.env` applicativo, impostazioni Compose/proxy e associazioni dei volumi. Non metterle nel repository pubblico.
- Riferimento Git/versione applicativa e, se non ricostruibile o non presente in un registry, copia esportata dell'immagine Docker corrispondente. `current-image` e metadati del backup aiutano a identificarla; un ID locale Docker da solo non scarica un'immagine su un'altra macchina.
- Accessi necessari a repository, Raspberry/proxy/DNS e dispositivi con passkey. La password tradizionale resta il recupero se una passkey non è più disponibile.

Procedura sul Raspberry nuovo:

1. Preparare sistema Linux 64 bit, aggiornamenti, orologio e storage affidabile. Installare Docker/Compose e i prerequisiti del Vault. Non avviare ancora il servizio pubblico o il timer.
2. Recuperare una copia fidata del repository e della versione corrispondente agli script/app del backup. Ripristinare privatamente configurazioni e segreti con proprietario e permessi corretti.
3. Collegare/montare il disco USB o NAS e verificarne **sorgente, target e spazio**, senza inizializzare un repository nuovo. Ricostruire la configurazione Vault per i nuovi percorsi, preservando progetto e marcatore del repository. Recuperare la password da dove è stata conservata separatamente.
4. Caricare l'immagine salvata o ricostruire quella versione del codice; impostare `BACKUP_APP_IMAGE` al tag disponibile compatibile. Non puntare subito a `latest` né a una versione con migrazioni non verificate.
5. Eseguire `list`, `verify ID` e `restore ID akai-restored-NUOVO`. La prima macchina originale non serve al restore; servono repository, password, strumenti e immagine compatibile. Controllare report, conteggi, migrazioni, file originali/derivati/avatar e CLI.
6. Avviare una preview isolata col volume ripristinato. Accedere con la password, controllare album, ricordi, foto originali, commenti, mappa e protezione del diario. Non creare nuovi utenti sopra il database recuperato. Considerare la revoca delle sessioni ripristinate.
7. Solo dopo questo controllo configurare manualmente Compose/proxy/origine HTTPS e il volume attivo di produzione. Verificare healthcheck e accesso privato, conservando copia del backup e del volume precedente, se esiste.
8. Eseguire un nuovo backup e un drill. Solo alla fine installare/abilitare timer e recupero al boot con percorsi e utente del nuovo host.

Se il guasto è una cancellazione accidentale scoperta in tempo, scegliere una versione precedente dalla retention e applicare lo stesso percorso isolato. Se l'immagine corrente o il database sono corrotti, non sovrascrivere l'unica copia danneggiata: conservarla per analisi e ripristinare una versione verificata separata. Non usare `docker compose down -v` o cancellazioni generiche dei volumi.

## Test locali e limiti

Esito finale locale: **127 test applicativi**, **19 test Python offline** e **34 controlli Docker/Restic** conclusi; typecheck, lint, ShellCheck e sintassi passano. Template systemd e calendario Europe/Rome validati offline. Build AMD64 e ARM64 concluse; il runtime ARM64 emulato ha verificato migrazioni, SQLite, Argon2, PNG Sharp e CLI su dati temporanei. Nessun test fisico Raspberry/USB/NAS o attivazione di un timer viene dichiarato.

I collaudi usano un'immagine tooling separata, Restic reale e progetti/volumi UUID solo con utenti, PNG, avatar e commenti sintetici. La suite modifica il diario **dopo** il backup, ripristina lo stato precedente in un volume nuovo e controlla che il volume originale mantenga la modifica. Verifica inoltre errori, mount/spazio/permessi, lock, segnali, journal, formato/checksum/SQLite/media, retention e assenza di modifiche ai volumi preesistenti. Non esegue il job Jenkins reale.

Su Linux con Docker:

```sh
docker build -t akai-ito:vault-local .
bash scripts/test-memory-vault.sh
```

Da Windows/Docker Desktop è disponibile il runner Linux, senza installare Restic/systemd sul PC:

```powershell
docker build -f docker/vault-test.Dockerfile -t akai-ito:vault-test .
docker run --rm --network none `
  --mount "type=bind,source=$($PWD.Path),target=/workspace,readonly" `
  --mount type=bind,source=/var/run/docker.sock,target=/var/run/docker.sock `
  akai-ito:vault-test bash scripts/test-memory-vault.sh
```

Il socket Docker è usato solo dal runner fidato per gestire le proprie fixture UUID. Non esporlo al pubblico. I test eliminano soltanto risorse create da loro e con proprietà verificata; un restore operativo fallito viene invece conservato per analisi. Gli artefatti del runner sono temporanei; stdout può essere salvato in `.tools/vault-integration.log`.

Eseguire anche `npm run typecheck`, `npm run lint`, `npm test`, build Docker e ShellCheck/syntax check di tutti gli script. Le prove ARM64 in emulazione, se concluse, dimostrano la build/runtime emulati, non prestazioni o affidabilità di un Raspberry fisico, un USB o NAS reale. Anche perdita di alimentazione, spazio di un archivio fotografico reale e recupero dei segreti vanno provati sul proprio hardware prima dell'attivazione.

## Fonti

Scelte confrontate con la documentazione ufficiale [backup Restic](https://restic.readthedocs.io/en/stable/040_backup.html), [repository e controlli](https://restic.readthedocs.io/en/stable/045_working_with_repos.html), [forget/prune e retention](https://restic.readthedocs.io/en/stable/060_forget.html) e [timer systemd](https://www.freedesktop.org/software/systemd/man/latest/systemd.timer.html). Le opzioni utilizzate vengono anche verificate contro i binari dei collaudi; nessuna chiamata a questi siti è necessaria durante i backup.
