# Album e diari di viaggio

La navigazione è **Album → capitolo (es. Viaggi) → album con nome (es. Barcellona) → diario o fotografie**. Ogni album contiene uno o più ricordi; ogni ricordo mantiene fotografie, testo, data, commenti e coordinate.

## Uso

1. Aprire Album e scegliere Viaggi, poi **Nuovo viaggio**. Dare un nome e, se desiderato, una descrizione. Sono consentiti più viaggi con lo stesso nome, distinguibili dalle date dei ricordi.
2. Nell'album scegliere **Aggiungi ricordi esistenti** e selezionare le pagine ancora da organizzare. L'assegnazione porta tutte le foto di ogni ricordo, senza duplicarle.
3. **Aggiungi un ricordo** apre l'editor con capitolo e album già selezionati. Nell'editor è anche possibile scegliere o creare un altro album.
4. **Il diario** mostra soltanto i ricordi dell'album in ordine cronologico; **Le fotografie** mostra soltanto le sue foto. La sequenza di **Sfoglia il diario** nel dettaglio rimane limitata allo stesso album.
5. Per spostare un ricordo cambiare Album da Modifica. Scegliendo Da organizzare viene tolta soltanto l'assegnazione. Cambiare capitolo azzera la selezione dell'album, evitando abbinamenti incoerenti.
6. La matita dell'album cambia nome e descrizione. **Elimina solo l'album** rimuove la copertina: ricordi, foto e commenti rimangono disponibili nei ricordi da organizzare, compresi quelli nel cestino.

Le categorie esistenti restano capitoli. I vecchi ricordi non vengono attribuiti automaticamente a viaggi immaginati dal titolo o dal GPS: finché non sono assegnati, restano in **Ricordi da organizzare**. Il sistema supporta lo stesso livello di album con nome anche negli altri capitoli.

**Sfoglia il diario è disponibile solo per i ricordi assegnati a un album.** Nei ricordi da organizzare non compare il comando e i vecchi link con `browse=1` tornano al dettaglio normale, senza creare una sequenza globale. Durante lo sfogliamento, se una pagina è stata spostata in un altro album o eliminata, si rimane sul ricordo corrente e la sequenza viene aggiornata. I caricamenti falliti permettono di riprovare; comandi ripetuti e uscita durante una richiesta non producono salti di pagina. Contesto di consegna e verifiche aggiornati in `HANDOFF.md`.

## Persistenza e API

Migrazione additiva `0003_collections.sql`: tabella `collections` e campo nullable `memories.collection_id`, con foreign key `ON DELETE SET NULL` e indici per categoria/album. Non vengono ricreati o cancellati ricordi, media o commenti. La migrazione è idempotente attraverso il registro `_migrations` ed è eseguita dal normale avvio Compose. Finora è applicata solo al database della preview locale.

`collections` conserva ID, nome, categoria, descrizione, versione e timestamp. Copertina, date iniziale/finale e conteggi sono derivati dai ricordi attivi; le pagine nel cestino sono escluse. La copertina usa una foto della prima giornata disponibile, rispettando la copertina del ricordo. Un ricordo appartiene al massimo a un album: non ci sono copie dei media né associazioni automatiche per coordinate.

| Endpoint                                                    | Funzione                                                            |
| ----------------------------------------------------------- | ------------------------------------------------------------------- |
| `GET /api/collections?category=Viaggi`                      | Album e riepiloghi                                                  |
| `POST /api/collections`                                     | Crea nome, capitolo e descrizione                                   |
| `GET /api/collections/:id?page=1`                           | Riepilogo e foto dell'album, 40 per pagina                          |
| `PUT /api/collections/:id`                                  | Aggiorna nome/descrizione, con versione                             |
| `DELETE /api/collections/:id`                               | Elimina solo l'album, con versione                                  |
| `POST /api/collections/:id/memories`                        | Assegna fino a 100 ricordi con le loro versioni, in una transazione |
| `GET /api/memories?collectionId=:id`                        | Diario filtrato, 20 ricordi per pagina                              |
| `GET /api/memories?category=Viaggi&collectionId=unassigned` | Pagine da organizzare                                               |

Gli endpoint precedenti `/api/albums` e `/api/albums/:category` restano compatibili. L'editor usa il campo opzionale `memory.collectionId`; gli aggiornamenti di vecchi client che lo omettono conservano l'assegnazione se il capitolo resta lo stesso.

Tutte le nuove route ereditano autenticazione, controllo origine e CSRF dell'app. Il server verifica che album e ricordo appartengano allo stesso capitolo. L'aggiunta di più pagine è atomica: un record mancante, una categoria incompatibile o una versione obsoleta annullano l'intera operazione. Spostamento e rimozione dell'album aggiornano le versioni dei ricordi per non consentire sovrascritture da editor già aperti. Non è possibile cambiare il capitolo dell'album dopo la creazione: si possono spostare i singoli ricordi dall'editor.

Frontend: `Albums.tsx`, `CollectionForm.tsx`, `CollectionPicker.tsx`, campo nell'editor, filtro in `DiaryBrowser.tsx`, route dedicata in `main.tsx`, tipi `Collection`. Nessuna nuova dipendenza.

## Rifiniture visive dello stesso intervento

- Foto principale subito dopo titolo e data compatti. Pulsanti, autore, luogo e barra Sfoglia vengono dopo la foto. Dimensioni adattate al rapporto originale, senza tagliare i soggetti e senza un contenitore alto vuoto per le foto orizzontali.
- Transizione della pagina di 850 ms; apertura carta più riconoscibile, con un solo effetto di ingresso fra transizione nativa e fallback CSS. Feedback di pressione prima della navigazione e apertura della galleria con un sollevamento di 650 ms.
- Nodi del filo: due pulsazioni finite, anello più visibile e stato rosso persistente per i nodi raggiunti. Un solo `TimelineThread`, invariato.
- Sviluppo fotografico più leggibile: prima visione in bianco e nero/sbiadita, poi colore in 1,7 secondi. Si avvia quando la foto caricata entra nella viewport, non mentre è ancora fuori schermo; non si ripete sui normali rerender o tornando alla stessa foto nella sessione dell'app.
- Stagioni: carta colorata più chiaramente, bordo e badge con nome/icona. Data del ricordo e preferenza centralizzata invariati; non si applicano filtri stagionali alle foto.
- Rifinitura successiva: etichette stagionali compatte senza riquadro, allineate alla data nelle card e raccolte con autore/luogo nel dettaglio. La voce Album è attiva anche nel dettaglio e nell'editor dei ricordi; Timeline rimane attiva nella sua pagina.
- Pulsanti del ricordo compatti: altezza 34 px su desktop e target touch di 44 px, icone ridotte, barra Sfoglia più bassa e invio commento allineato al campo senza pulsante a tutta larghezza su telefono.
- Stile uniforme per gli stessi comandi: identico fondo beige opaco, testo bruno, bordo sottile, angoli da 8 px e hover coerente anche per secondarie e icone. Niente sottolineature o accenti laterali. Dimensioni, etichette e comportamento invariati.
- Gli effetti restano disabilitati con preferenze ridotte/disattivate e con `prefers-reduced-motion`. Cinema, viaggio sulla mappa, intro e parallasse mantengono il comportamento precedente.

Gli interventi visivi sono in `refinements.css`, caricato dopo i fogli esistenti. I token restano in `experience.ts`; gli observer sono in `motion.tsx`.

## Preview e verifiche

URL locale: **http://localhost:3000**, utente `demo`, password `DiarioLocale2026!`. Dataset dimostrativo: album **Lago di Braies** con due giornate e quattro foto, **Tra le montagne** con un ricordo e una foto. La seconda giornata del lago è un'aggiunta dimostrativa locale e usa una copia di una fotografia demo, non contenuti di produzione.

71 test automatici superati, inclusi 8 nuovi test di migrazione, privacy/CSRF, separazione dei viaggi, categorie, assegnazione atomica, aggiornamento editor, rinomina e cancellazione senza perdita dei contenuti. TypeScript, lint e build Docker di produzione verificati. La migrazione è stata verificata anche su un database con ricordi precedenti e con `foreign_key_check`.

Le verifiche browser sono in Chromium con viewport 375, 430, 768 e 1440 px: foto iniziale visibile, assenza di overflow, categorie, sottoalbum, diario, galleria, isolamento dei contenuti, sfogliamento limitato al viaggio, gestione degli album, preferenze e animazioni. Gli artefatti locali sono in `.tools/album-refinement-qa/`, ignorati da Git. Non sono dichiarate prove su dispositivi fisici, Safari/Firefox o hardware Raspberry Pi.

Il collaudo browser è stato concluso in più passaggi: **36 controlli di layout e contenuti**, **20 controlli sui flussi** e **5 sullo sviluppo fotografico nella viewport**. La foto principale inizia a circa 270 px dal bordo superiore sui due formati smartphone, prima di autore, luogo e comandi. Creazione, aggiunta di ricordi esistenti, rinomina, persistenza dopo ricaricamento, preassegnazione nell'editor, rimozione dell'assegnazione ed eliminazione del solo album sono state provate dall'interfaccia; le fixture temporanee sono state rimosse. Nessun errore JavaScript nei flussi conclusi.

Il collaudo è stato svolto solo in locale sul branch `feat/immersive-experience`. Successivamente l'utente ha autorizzato commit, push e merge su `main`, con la pipeline Jenkins esistente. Contesto di consegna e ripresa del lavoro in `HANDOFF.md`.
