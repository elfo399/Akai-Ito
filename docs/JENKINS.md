# Pipeline GitHub → Jenkins → Raspberry Pi

La pipeline usa Jenkins su `https://jenkins.elfo3.dev/`, il repository `elfo399/Akai-Ito` e l’agent ARM64 già presente sul Raspberry. Il diario è configurato per `https://akaiito.elfo3.dev`.

## Flusso

1. GitHub notifica un push mediante webhook.
2. Jenkins esegue il checkout sull’agent con etichette `raspberry-pi` e `docker`, con un solo executor per accodare le build.
3. Il target Docker `ci` esegue typecheck, lint, test e build con Node 24, nella stessa architettura del Raspberry.
4. Viene creata l’immagine `akai-ito:<SHA completo del commit>`.
5. Solo il branch `main`, senza pull request, può avviare il deploy.
6. Se il diario è già presente, il job lo ferma brevemente e salva insieme SQLite, WAL e foto con checksum.
7. Compose aggiorna l’app, attende healthy e verifica database/media. Se l’aggiornamento fallisce, tenta di riavviare l’immagine precedente.

Il volume non viene eliminato. `.env` resta sul Raspberry, fuori dal workspace Jenkins e dal repository. Il primo avvio mantiene l’inizializzazione interattiva dei due account prevista dal README.

## Configurazione sul server

- Jenkins controller con accesso autenticato; build eseguite su un agent dedicato, non sul controller.
- Agent Linux ARM64 sul Raspberry con etichette `raspberry-pi` e `docker`, Git, Java richiesto dalla versione Jenkins, Docker e Compose v2. Viene riutilizzato l’agent `orio-raspberry-pi`; la chiave SSH e la verifica della host key rimangono quelle già configurate.
- Directory `/home/elfo/services/akai-ito`, scrivibile dall’utente dell’agent, con `.env` privato di produzione. Il file `compose.proxy.yml` collega il servizio a `proxy-net` con alias `akai-ito`; Nginx Proxy Manager inoltra a `http://akai-ito:3000`.
- Progetto Compose stabile `akai-ito`. Se l’app esistente usa un nome diverso o un volume esterno/bind mount, adattare la configurazione dopo averla ispezionata. Lo script rifiuta un volume inatteso per evitare di avviare un diario vuoto al posto di quello esistente.
- Job **Pipeline from SCM** `Akai-Ito` per `https://github.com/elfo399/Akai-Ito.git`, branch `*/main`, percorso `Jenkinsfile`, checkout leggero. Il trigger è `githubPush()`. Non abilitare build di pull request o fork non fidati sull’agent che può gestire il Docker di produzione.
- Plugin Pipeline, Git e GitHub con relative dipendenze; il checkout del repository pubblico non richiede token. La configurazione del webhook richiede separatamente il permesso di amministrare i webhook del repository.
- Webhook GitHub con evento `push`, URL dell’endpoint previsto dalla versione del plugin (`/github-webhook/`), HTTPS e secret configurato coerentemente nei due servizi. Verificare una consegna reale in GitHub e l’avvio della build in Jenkins. Se Jenkins non è raggiungibile da GitHub, scegliere la soluzione dopo aver controllato rete/proxy esistenti.

Non è necessario un registry: l’immagine viene costruita direttamente sul Raspberry e resta nel suo Docker. Gli accessi Docker consentono di amministrare l’host; l’agent e i branch eseguiti devono essere fidati.

## Prima configurazione e utilizzo

Job: [Akai-Ito](https://jenkins.elfo3.dev/job/Akai-Ito/). Un push su `main` avvia automaticamente controlli e deploy. Il primo deploy è stato verificato con la build [#1](https://jenkins.elfo3.dev/job/Akai-Ito/1/), avviata da un evento GitHub push e terminata con `SUCCESS` dopo 34 test superati. Sono stati verificati HTTPS pubblico (home e healthcheck HTTP 200), accesso anonimo negato alle impostazioni (HTTP 401) e integrità del database sul Raspberry.

Il diario di produzione è vuoto e i due account vengono inizializzati una sola volta. Da una sessione SSH come `elfo`:

```sh
docker exec -it akai-ito-app-1 node apps/api/dist/cli.js init-users
```

Il comando chiede nomi e password nascoste; non serve inserirle nel repository, in Jenkins o nella chat. I deploy successivi conservano account, foto e ricordi.

File operativi sul server:

```text
/home/elfo/services/akai-ito/.env                Configurazione privata
/home/elfo/services/akai-ito/compose.proxy.yml   Rete proxy-net e alias akai-ito
/home/elfo/services/akai-ito/docker-compose.yml Copia della configurazione distribuita
/home/elfo/services/akai-ito/current-image      Tag dell’immagine attualmente distribuita
/home/elfo/services/akai-ito/backups/            Backup prima degli aggiornamenti
```

Per operazioni Compose manuali, impostare l’immagine salvata e includere l’override del proxy:

```sh
cd /home/elfo/services/akai-ito
APP_IMAGE="$(cat current-image)" docker compose -p akai-ito -f docker-compose.yml -f compose.proxy.yml ps
```

L’HTTP interno è pubblicato soltanto su `127.0.0.1:13000`; l’app usa HTTPS tramite il proxy su `https://akaiito.elfo3.dev`. Il volume persistente è `akai-ito_diary-data`.

## Note operative

- I deploy dello stesso job vengono accodati, senza interrompere una migrazione o un backup in corso; un lock sul Raspberry protegge anche da esecuzioni sovrapposte di job diversi.
- Il backup causa una breve indisponibilità e richiede spazio libero. Il container legge il volume come UID 1000, mentre il file viene salvato dall’utente Jenkins con permessi privati; il contenuto non viene scritto nei log.
- Il rollback automatico riguarda l’immagine. Non ripristina il database all’indietro: mantenere le migrazioni compatibili e additive; per migrazioni incompatibili serve una procedura esplicita con backup/ripristino.
- Le immagini di release e i backup non vengono cancellati automaticamente. La retention va concordata in base allo spazio del Raspberry.
- I file Jenkins, script di deploy e sorgenti dell’app devono essere presenti su GitHub perché il job possa prelevarli. Le modifiche locali ancora non committate non sono visibili a Jenkins.

Riferimenti: [Pipeline as Code](https://www.jenkins.io/doc/book/pipeline/pipeline-as-code/), [sintassi delle pipeline](https://www.jenkins.io/doc/book/pipeline/syntax/), [isolamento del controller](https://www.jenkins.io/doc/book/security/controller-isolation/).
