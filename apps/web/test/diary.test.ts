import { afterEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import DiaryBrowser from "../src/components/DiaryBrowser";
import type { Memory } from "../src/types";

const collectionId = "10000000-0000-4000-8000-000000000001";
const memory: Memory = {
  id: "20000000-0000-4000-8000-000000000001",
  title: "Prima giornata",
  eventDate: "2026-01-01",
  description: "Il nostro racconto",
  category: "Viaggi",
  location: "",
  collectionId: null,
  authorId: "30000000-0000-4000-8000-000000000001",
  author: "Una persona",
  version: 1,
  createdAt: "2026-01-01T12:00:00Z",
  updatedAt: "2026-01-01T12:00:00Z",
  deletedAt: null,
  photos: [],
};
const pages = [
  {
    id: memory.id,
    title: memory.title,
    eventDate: memory.eventDate,
    coverId: null,
  },
  {
    id: "20000000-0000-4000-8000-000000000002",
    title: "Seconda giornata",
    eventDate: "2026-01-02",
    coverId: null,
  },
];
const clients: QueryClient[] = [];
afterEach(() => {
  clients.forEach((client) => client.clear());
  clients.length = 0;
});
function render(item: Memory, browse = false, sequence?: typeof pages) {
  const client = new QueryClient();
  clients.push(client);
  if (sequence) client.setQueryData(["diary-sequence", collectionId], sequence);
  const html = renderToStaticMarkup(
    createElement(MemoryRouter, {
      initialEntries: ["/memories/" + item.id + (browse ? "?browse=1" : "")],
      children: createElement(QueryClientProvider, {
        client,
        children: createElement(DiaryBrowser, {
          memory: item,
          children: createElement("p", null, "Racconto sempre visibile"),
        }),
      }),
    }),
  );
  return { html, client };
}

describe("Il diario appartiene a un album, non ai ricordi da organizzare", () => {
  it("mostra il ricordo senza offrire lo sfogliamento quando manca l'album", () => {
    const { html, client } = render(memory);
    expect(html).toContain("Racconto sempre visibile");
    expect(html).not.toContain("Sfoglia il diario");
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });
  it("non crea una sequenza globale nemmeno aprendo un vecchio link con browse=1", () => {
    const { html, client } = render(memory, true);
    expect(html).not.toContain("diary-browser");
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });
  it("offre lo sfogliamento a un ricordo assegnato a un album", () => {
    const { html, client } = render({ ...memory, collectionId });
    expect(html).toContain("Sfoglia il diario");
    expect(html).toContain("Le pagine di questo album.");
    expect(
      client
        .getQueryCache()
        .getAll()
        .map((query) => query.queryKey),
    ).toEqual([["diary-sequence", collectionId]]);
  });
  it("parte dalla prima pagina dell'album con precedente disabilitato", () => {
    const { html } = render({ ...memory, collectionId }, true, pages);
    expect(html).toContain("Pagina 1 di 2");
    expect(
      html.match(/<button\b[^>]*aria-label="Ricordo precedente"[^>]*>/)?.[0],
    ).toContain('disabled=""');
  });
  it("si ferma all'ultima pagina dello stesso album", () => {
    const { html } = render(
      { ...memory, id: pages[1].id, collectionId },
      true,
      pages,
    );
    expect(html).toContain("Pagina 2 di 2");
    expect(
      html.match(/<button\b[^>]*aria-label="Ricordo successivo"[^>]*>/)?.[0],
    ).toContain('disabled=""');
  });
  it("gestisce una sequenza aggiornata senza il ricordo corrente, senza Pagina 0", () => {
    const { html } = render({ ...memory, collectionId }, true, [pages[1]]);
    expect(html).toContain(
      "Questo ricordo non è più tra le pagine dell’album.",
    );
    expect(html).not.toContain("Pagina 0");
    expect(
      html.match(/<button\b[^>]*aria-label="Ricordo successivo"[^>]*>/)?.[0],
    ).toContain('disabled=""');
  });
});
