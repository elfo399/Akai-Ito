# Akai Ito — installazione e viewport mobile

## Stato e diagnosi

Revisione preparata sul branch `fix/mobile-pwa-viewport`, poi autorizzata dall'utente per push e merge su `main`. Preview: http://localhost:3000. Stato di consegna, esito Jenkins e verifiche effettive in `HANDOFF.md` e nella cronologia Git.

Prima dell'intervento mancavano manifest, icone PNG e metadati iOS. Un'icona Home creata allora poteva essere un semplice collegamento al browser. Questo spiega una possibile apertura con toolbar; non prova quale tipo di collegamento fosse presente sul telefono dell'utente. I cinque collegamenti della navigazione erano già link React Router, senza cambio origine. L'unico link interno a pagina intera rimasto nel fallback 404 è stato convertito a Router Link.

Il manifest pubblico `/manifest.webmanifest` ha identità stabile `/`, avvio `/`, scope `/` e display `standalone`: comprende Home, Timeline, album, ricordi, editor, mappa, Impostazioni e login. Colori carta `#F8F1E7`. Il server esistente serve già file statici e fallback SPA per le route dirette; backend/database e header di sicurezza restano invariati.

Icone pubbliche dal percorso del logo in `public/favicon.svg`: `icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` e `apple-touch-icon.png` (180 px). PNG opachi, con margine maggiore nella variante maskable. Rigenerazione dalla radice: `node --import tsx scripts/generate-pwa-icons.ts` (Node 24 e dipendenze già installate).

## Reinstallazione dopo la pubblicazione

Eseguire la procedura sul dominio pubblico **dopo un deployment riuscito di questa revisione**. `localhost` sul telefono indica il telefono stesso, non il PC. La preview sul PC permette i controlli locali, ma un indirizzo LAN HTTP non equivale all'origine HTTPS richiesta per l'installazione completa.

### Android / Chrome

1. Chiudere la vecchia finestra Akai Ito. Tenere premuta l'icona Home: se è un collegamento scegliere **Rimuovi**; se è un'app installata scegliere **Disinstalla**, confermando solo l'app. Non occorre eliminare i dati del sito o altri dati del browser.
2. Aprire Chrome e visitare `https://akaiito.elfo3.dev/`. Ricaricare la pagina; accedere se richiesto.
3. Aprire il menu ⋮ e scegliere **Installa e crea scorciatoia → Installa**, **Aggiungi a schermata Home → Installa** oppure **Installa app**, secondo la versione. Scegliere l'installazione come app quando il browser distingue app e semplice scorciatoia.
4. Confermare **Akai Ito**, chiudere la scheda e aprire la nuova icona dalla Home.
5. Provare le cinque destinazioni: l'URL rimane nello scope e la finestra standalone non usa la normale barra indirizzi.

Le diciture e la disponibilità della proposta automatica dipendono da Chrome/versione/dispositivo; non è stato aggiunto un banner d'installazione personalizzato. [Guida Chrome](https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid&hl=it).

### iPhone / Safari

1. Chiudere la vecchia finestra dal selettore app. Tenere premuta l'icona Akai Ito e rimuovere/eliminare quel collegamento o web app dalla Home. Non è necessario cancellare cronologia o dati di Safari.
2. Aprire **Safari**, visitare `https://akaiito.elfo3.dev/` e ricaricare.
3. Aprire **Condividi → Aggiungi alla schermata Home** (eventualmente passando da Altro/Mostra altro). Se presente, attivare **Apri come app web**.
4. Confermare il nome **Akai Ito → Aggiungi**. Aprire la nuova icona dalla Home e accedere se richiesto.
5. Verificare navigazione, ritorno, rotazione, notch, indicatore Home e tastiera.

Le sessioni del browser e della web app possono differire: una nuova richiesta di login non significa che i ricordi siano stati cancellati. La barra di stato del sistema può restare visibile; è distinta dalla barra indirizzi. [Guida Apple](https://support.apple.com/it-it/guide/iphone/iphea86e5236/ios).

## Browser, scorciatoia e standalone

Una scheda normale o una vecchia scorciatoia può mostrare le barre del browser: il sito non può sopprimerle. Una web app installata con manifest standalone usa un contesto dedicato; i link esterni e i download possono aprire UI gestita dal sistema/browser. Le normali route del diario rimangono interne. [Installazione PWA](https://web.dev/learn/pwa/installation), [Home Screen web apps in WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).

Diagnostica senza dati personali, nella console:

```js
window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
document.documentElement.dataset.displayMode // "standalone" oppure "browser"
```

Il rilevamento non cambia routing o contenuti e non nasconde difetti di layout.

## Viewport, safe area e tastiera

`viewport-fit=cover` abilita le aree sicure; lo zoom rimane abilitato. `interactive-widget=resizes-content` chiede ai browser compatibili di ridimensionare il contenuto con la tastiera, senza dipendere da questa opzione su iOS. [Comportamento Chrome](https://developer.chrome.com/blog/viewport-resize-behavior/).

- Le altezze minime di pagine e login usano `svh`, per evitare che il contenuto corto cambi continuamente altezza con le toolbar.
- Dialoghi, lightbox e cinema usano la viewport visibile e continuano ad adattarsi alle barre/tastiera; non c'è una sostituzione indiscriminata di `dvh`.
- Il menu inferiore rispetta le safe area. Un `ResizeObserver` misura la sua altezza reale, compreso il padding dell'indicatore Home: tutti i pulsanti flottanti si posizionano sopra quel valore invece di presumere una distanza fissa.
- `VisualViewport` fornisce altezza/offset per i pannelli. Durante la scrittura, un forte restringimento della viewport su dispositivo touch suggerisce la tastiera: navigazione e launcher vengono temporaneamente nascosti; i pannelli con campi rimangono utilizzabili nella parte visibile. Lo scroll della pagina non viene bloccato. I dialoghi mantengono il proprio blocco di sfondo preesistente.
- È una rilevazione euristica, non un'API universale della tastiera. Non interviene sul pinch zoom. Gli input touch usano caratteri di almeno 16 px per evitare lo zoom automatico di iOS senza disabilitare lo zoom manuale.

## Privacy

Nessun service worker, Cache Storage, precache o modalità offline introdotti. Foto, originali, risposte API, cookie/CSRF e sessioni non vengono copiati in una cache PWA. Restano le politiche HTTP esistenti, inclusi `private, no-store` per le fotografie e `no-store` per le API. Senza rete il diario non promette accesso ai contenuti privati.

## Verifica su dispositivo

Con la nuova versione pubblicata e la nuova icona installata, verificare Android Chrome e iPhone Safari separatamente: display mode, cinque destinazioni, album → ricordo → mappa → ritorno, editor, login/logout, refresh delle route, filtri e menu Azioni. Scorrere pagine lunghe con barre visibili/nascoste, provare orientamento orizzontale, tastiera in editor/commenti/dialoghi e chiusura dei menu. Confermare touch target, assenza di tagli, focus e movimento ridotto. L'emulazione desktop di viewport/safe area/tastiera non sostituisce questa prova fisica né dimostra l'assenza di toolbar in un'installazione reale. Risultati realmente eseguiti in `HANDOFF.md`.

## Verifiche locali concluse

Typecheck, ESLint, 100 test automatici in 7 file, build di produzione Docker e container healthy. Chromium interpreta il manifest senza errori e non segnala errori con `Page.getInstallabilityErrors` su localhost. 184 controlli browser in suite separate coprono asset/scope/privacy, navigazione SPA, cambi d'altezza e safe area/tastiere artificiali, overlay e regressioni dei menu mappa/Timeline/album. Dimensioni 320–1440 px e modalità orizzontale 844×390; nessuna scrittura ai dati demo. Non è stata eseguita un'installazione reale su Android/iOS. La diagnostica iOS è stata simulata; la media query standalone è coperta da test unitari, senza dichiarare che una scheda headless sia una PWA installata.
