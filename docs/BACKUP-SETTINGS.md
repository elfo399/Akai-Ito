# Backup dalle impostazioni

**Impostazioni → Backup** configura Memory Vault sul Raspberry: destinazione, cartella, password di cifratura iniziale, orario Europe/Rome e conservazione (7 giornalieri, 4 settimanali, 6 mensili per default). Impostazioni e copie sono condivise dai due account. Ogni operazione richiede la password dell’account; le API verificano sessione, CSRF, diario sbloccato e verifica recente.

1. Scegliere un disco/NAS già montato e scrivibile, oppure «Su questo Raspberry». La copia locale richiede una conferma: **non protegge dal guasto del disco**. L’app non monta o formatta dispositivi.
2. Scegliere una password di cifratura di almeno 12 caratteri e conservarla separatamente, anche fuori dal Raspberry. Non viene restituita al browser e non si cambia da questa schermata. Cambiare destinazione mantiene la stessa chiave.
3. Impostare orario e conservazione, scegliere se attivare le copie giornaliere, quindi «Salva e prepara i backup» e confermare con la password dell’account.
4. La preparazione verifica/inizializza il repository. Se si richiede l’automatismo, effettua prima una copia reale: il timer si abilita **solo dopo il successo**. In modalità manuale usare «Crea una copia adesso».

La pagina distingue ultimo tentativo, ultima copia riuscita, inventario, ultimo test di recupero e stato effettivo del timer. «Verifica l’ultima copia» controlla cifratura, manifest, file e database. «Prova il recupero» controlla un volume temporaneo separato; non sostituisce il diario. «Sospendi» disattiva solo le copie future e funziona anche con la destinazione offline. Un tentativo fallito non appare riuscito. Durante la copia a freddo l’app può essere brevemente irraggiungibile: il lavoro continua sull’host e la schermata riprende a leggerne lo stato.

Il ripristino effettivo resta un’operazione dell’operatore descritta in [BACKUP-RECOVERY.md](BACKUP-RECOVERY.md). Nessun pulsante web sovrascrive la produzione.

## Installazione e architettura

Prerequisiti host: Linux, utente di deploy con **UID 1000** (uguale al processo app), Docker, Python 3/SQLite, Bash/GNU, Restic e jq. Su Debian/Raspberry: `sudo apt-get install restic jq`. L’utente deve poter usare Docker e `sudo -n` per installare le unità; la directory di deploy resta privata con `.env` e volume preesistenti.

`jenkins-deploy.sh`, sotto il lock dei backup, esegue `install-vault-control.sh`. L’installer conserva gli strumenti in `DEPLOY_DIR/vault-tools/release-*/scripts`, cambia atomicamente il link `current`, crea una chiave casuale privata persistente e installa socket/service **PROJECT-vault-control**. `compose.vault.yml` aggiunge all’app soltanto `DEPLOY_DIR/vault-control:/app/vault-control:ro`. Il container web **non riceve il socket Docker**, repository, configurazione o password dei backup. Le versioni precedenti degli strumenti vengono conservate.

Il controller Python gira come utente di deploy, ascolta soltanto un socket Unix attivato da systemd, verifica UID del peer e token, espone solo stato/configurazione e quattro azioni validate. Non accetta comandi shell, percorsi arbitrari, restore in produzione o password di mount. La destinazione è un ID dei mount reali e una cartella semplice: ricontrolla permessi, link, sorgente/UUID del mount e lock. Il token non viene inviato al browser. Richieste e job non registrano password. Il controller termina dopo cinque minuti di inattività se non ci sono lavori in corso.

File generati: `DEPLOY_DIR/.memory-vault/backup.env` e `web-settings.json` (600), `restic-password` (400), fuori da Git e dal repository cifrato. La precedente configurazione CLI `/etc/akai-ito/backup.env` non viene sovrascritta: un’installazione già programmata va migrata evitando due scheduler. Il ramo web abilita `BACKUP_ALLOW_LOCAL_DESTINATION=true` solo dopo la conferma della copia locale; il default CLI richiede ancora un mount esterno. Il flag test non si usa in produzione.

I lavori partono su processi host separati, con ID, stato atomico e log privati. `.deploy.lock` impedisce conflitti con backup/deploy. L’installer rifiuta di aggiornare gli strumenti durante un job web. La UI rilegge lo stato ogni 2,5 secondi solo durante un lavoro, anche se la prima lettura cade nel riavvio dell’app. Nessun polling periodico esegue backup.

Il controller scrive soltanto unità utente marcate «Managed by Akai Ito backup settings»: **PROJECT-memory-vault.service/.timer**, con Europe/Rome e `Persistent=true`. L’installer abilita linger e un recupero al boot che salta se manca la configurazione; **non abilita il timer dei backup**. Il recupero attende Docker e usa il journal del Vault. La UI richiede timer sia abilitato sia attivo per indicare l’automatismo. Sospendere durante la prima copia impedisce un’attivazione tardiva.

Controlli operativi:

```sh
sudo systemctl status akai-ito-vault-control.socket
sudo journalctl -u akai-ito-vault-control.service
systemctl --user status akai-ito-memory-vault.timer
MEMORY_VAULT_CONFIG=/home/elfo/services/akai-ito/.memory-vault/backup.env \
  bash /home/elfo/services/akai-ito/vault-tools/current/scripts/memory-vault.sh status
```

Il backend restituisce `available:false` se il collegamento manca, senza inventare configurazioni o successi. Nelle preview senza bridge solo la sezione Backup mostra «Riprova collegamento».

## Verifiche ripetibili

- `npm test`, `npm run typecheck`, `npm run lint`; test API in `apps/api/test/backup.test.ts`.
- `python3 -B scripts/test-vault-control.py` e `python3 -B scripts/test-vault-files.py` su Linux, eseguiti anche dal target Docker `ci`.
- `scripts/test-backup-settings.sh`: runner Linux con Docker CLI, Restic, Python e systemd-analyze; sorgenti read-only, Docker socket **solo nel runner QA**, volume dedicato `/control` passato come `VAULT_QA_CONTROL_VOLUME`. Immagine `VAULT_TEST_IMAGE`, default `akai-ito:backup-settings-local`. Crea solo risorse UUID/account sintetici, pinna l’immagine e rimuove i propri dati. Scheduler simulato, cifratura/copia/verifica/drill effettivi. `VAULT_QA_HOLD=true` conserva la fixture su localhost:3002 fino a `/control/finish` per il browser.
- `node scripts/backup-settings-browser-check.mjs`: Playwright opzionale in `.tools/visual-qa/`, solo fixture 3002; password errata/corretta, salvataggio e copia reali, layout e blocco con autenticatore virtuale. Artefatti ignorati in `.tools/backup-settings-qa`.

La schermata biometrica usa un viewport fisso centrato e blocca lo scroll di html/body soltanto negli stati checking/locked. La densità segue l’altezza del contenitore, inclusa la VisualViewport ridotta dalla tastiera. Lo sblocco restituisce lo scroll normale e conserva il percorso; il ripristino esistente rimane in `RouteViewport`.

Consegna 15 novembre 2026: target Docker CI completato, 138 test applicativi, 28 Python, 23 controlli browser, suite di regressione **34 Docker/Restic + 19 offline** conclusa. Installazione e socket activation provati anche sull’host Raspberry con unità/directory QA isolate poi rimosse; nessun repository o timer dei backup di produzione configurato dall’agente.
