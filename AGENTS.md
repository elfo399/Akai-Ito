# Continuità del progetto

Prima di modificare il progetto, leggere [HANDOFF.md](HANDOFF.md). Contiene stato del lavoro, decisioni dell'utente, architettura, avvio locale e verifiche; non è necessaria la chat precedente.

Controllare sempre lo stato Git effettivo e preservare il lavoro locale. La revisione immersiva e gli album per singolo viaggio sono implementati e accettati. Seguire la nuova richiesta dell'utente senza riprogettare automaticamente le parti già approvate.

Conservare il filo originale della timeline, la separazione fra gli album dei singoli viaggi e il rispetto delle preferenze di movimento ridotto. Per dettagli, leggere `docs/ALBUMS.md` e `docs/IMMERSIVE-EXPERIENCE.md`.

L'utente ha autorizzato commit, push e merge su `main` per la consegna che include questo handoff. `main` può avviare Jenkins e il deployment. Per lavori successivi attenersi alle nuove istruzioni dell'utente e verificare l'esito reale della pipeline; codice e dati Docker sono separati.
