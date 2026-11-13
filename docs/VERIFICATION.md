# Verifica Akai Ito V1

Data: 13 novembre 2026. Ambiente di sviluppo Windows, Node.js 24.22.3; Docker Desktop con motore Linux AMD64. Nessun deployment sul Raspberry Pi.

| Verifica                                                            | Esito                                                         |
| ------------------------------------------------------------------- | ------------------------------------------------------------- |
| TypeScript strict: shared, API, frontend, test e script             | Superata                                                      |
| ESLint                                                              | Superata                                                      |
| Vitest / Fastify inject                                             | **31 test superati**, 0 falliti                               |
| Build Vite frontend e TypeScript backend                            | Superate                                                      |
| `npm audit` (incluse dipendenze di sviluppo)                        | **0 vulnerabilità segnalate**                                 |
| Validazione Docker Compose                                          | Superata                                                      |
| Docker build Linux AMD64                                            | Superata                                                      |
| Smoke HTTP dell’immagine di produzione                              | Superato                                                      |
| Runtime non root e filesystem applicativo in sola lettura           | Verificati nel servizio Compose                               |
| Riavvio container con sessioni, ricordi e fotografie persistenti    | Superato                                                      |
| Backup offline, ripristino su volume separato, integrità e conteggi | Superati                                                      |
| Inizializzazione interattiva reale dei due account via TTY Docker   | Superata; password non visualizzate, diario vuoto             |
| Sintassi POSIX degli script di backup/ripristino (`sh -n`)          | Superata                                                      |
| Build Linux ARM64 e smoke completo in emulazione                    | Superati                                                      |
| Verifica visiva interattiva desktop/mobile                          | Non eseguita: collegamento browser/computer use indisponibile |
| Prova su Raspberry Pi e smartphone fisici                           | Non eseguita                                                  |

I 31 test API comprendono i dodici flussi richiesti: login, accesso non autenticato, creazione, modifica, conflitto, eliminazione/ripristino, upload valido, rifiuto di file non validi, protezione delle immagini, commenti, permessi sui commenti e ordinamento cronologico. Coprono inoltre origini/CSRF, logout, cookie, rate limiting, avatar, JPEG/PNG/WebP, limiti configurabili, ripulitura di upload parziali, concorrenza effettiva, percorso dei media, album, impostazioni, cambio password, giorni civili e pulizia dopo 30 giorni.

Lo smoke Docker usa richieste HTTP reali, credenziali casuali e volumi temporanei separati. Controlla due login, upload di un’immagine, lettura dal secondo account, accesso anonimo negato, commento, riavvio, frontend SPA, asset statici e cache. Ferma poi l’app, archivia database e media insieme, ripristina in un nuovo volume e verifica integrità SQLite, relazioni, presenza dei file e conteggi di ricordi/foto/commenti. Le risorse QA vengono rimosse al termine.

Gli script shell forniti hanno superato il controllo sintattico. La procedura equivalente di arresto, archivio e ripristino è stata eseguita dallo smoke; gli script `.sh` completi non sono stati eseguiti direttamente su un Raspberry.

Vite segnala due annotazioni di tree shaking nei sorgenti Zod: le rimuove durante il build, che termina correttamente. npm segnala la deprecazione del downloader transitivo `prebuild-install` e le policy per gli script di installazione nativi; i moduli nativi sono stati installati e utilizzati nei test.

La verifica visiva e touch resta necessaria prima di considerare collaudati tutti i criteri su smartphone. Sono implementati layout responsive, controlli touch, galleria con swipe/tastiera e rispetto di reduced motion; questi comportamenti non vengono dichiarati verificati mediante browser o dispositivo reale.

## Correzione accesso all’anteprima locale

Riprodotto il login rifiutato quando il diario configurato come `http://localhost:3000` viene aperto da `http://127.0.0.1:3000`. La configurazione HTTP locale con cookie non Secure ora accetta i tre nomi di loopback `localhost`, `127.0.0.1` e `[::1]` soltanto sullo stesso protocollo e sulla stessa porta. Origini mancanti/opache, domini ingannevoli, altre porte e richieste cross-site restano bloccati; HTTPS e cookie Secure mantengono il controllo esatto dell’origine.

La regressione è stata riprodotta da un nuovo test fallito prima della correzione. Dopo la correzione: **34 test API superati**, typecheck e lint superati; immagine Docker AMD64 ricostruita. Le nuove verifiche coprono anche mutazioni autenticate e obbligo del token CSRF sugli indirizzi locali equivalenti.

Il container di anteprima è stato ricreato sul volume esistente ed è healthy. Verificati via HTTP, con le credenziali dell’anteprima già presenti, login/sessione/logout (HTTP 200) da entrambi gli indirizzi `127.0.0.1:3000` e `localhost:3000`; un’origine estranea continua a ricevere HTTP 403. Verifica dati: integrità SQLite OK, nessun file mancante o orfano.
