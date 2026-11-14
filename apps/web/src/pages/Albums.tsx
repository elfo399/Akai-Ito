import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, Images } from "lucide-react";
import { api, photoUrl, formatDate } from "../api";
import type { Album, AlbumPhoto } from "../types";
import { PageHeading, Loading, ErrorState, Empty } from "../components";
import { Pagination } from "./Timeline";
export default function Albums() {
  const { category } = useParams();
  return category ? (
    <AlbumDetail key={category} category={category} />
  ) : (
    <AlbumIndex />
  );
}
function AlbumIndex() {
  const query = useQuery({
    queryKey: ["albums"],
    queryFn: () => api<Album[]>("/albums"),
  });
  return (
    <div className="page">
      <PageHeading
        eyebrow="PICCOLE COLLEZIONI DI NOI"
        title="I nostri album"
        subtitle="Ogni capitolo ha il suo colore."
      />
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : (
        <div className="album-grid">
          {query.data.map((a, i) => (
            <Link
              key={a.category}
              to={"/albums/" + encodeURIComponent(a.category)}
              className={"album-cover album-color-" + i}
            >
              <div className="album-photo polaroid">
                <span className="tape" />
                {a.coverId ? (
                  <img
                    src={photoUrl(a.coverId)}
                    alt={a.category}
                    loading="lazy"
                  />
                ) : (
                  <div className="photo-placeholder">
                    <Images size={42} strokeWidth={1} />
                    <span>Le foto arriveranno qui.</span>
                  </div>
                )}
              </div>
              <div className="album-title">
                <h2>{a.category}</h2>
                <ArrowUpRight size={20} />
              </div>
              <span className="tiny">
                {a.count} FOTOGRAFIE · UN PEZZO DELLA NOSTRA STORIA
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
function AlbumDetail({ category }: { category: string }) {
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["album", category, page],
    queryFn: () =>
      api<{ items: AlbumPhoto[]; total: number }>(
        "/albums/" + encodeURIComponent(category) + "?page=" + page,
      ),
  });
  return (
    <div className="page">
      <Link className="back-link" to="/albums">
        <ArrowLeft size={16} />
        Tutti gli album
      </Link>
      <PageHeading
        eyebrow="UN CAPITOLO DELLA NOSTRA STORIA"
        title={category}
        subtitle="Le fotografie ci riportano sempre lì."
      />
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : !query.data.items.length ? (
        <Empty
          title="Un album pronto a riempirsi."
          text="Le fotografie dei ricordi di questo capitolo troveranno posto qui. Una piccola collezione da sfogliare insieme."
        />
      ) : (
        <>
          <div className="album-photos">
            {query.data.items.map((p) => (
              <Link
                key={p.id}
                to={"/memories/" + p.memoryId}
                className="polaroid"
              >
                <img src={photoUrl(p.id)} alt={p.title} loading="lazy" />
                <span className="handwritten">{p.title}</span>
                <small>
                  {formatDate(p.eventDate)}
                  <ArrowUpRight size={15} />
                </small>
              </Link>
            ))}
          </div>
          <Pagination
            page={page}
            total={query.data.total}
            size={40}
            onChange={setPage}
          />
        </>
      )}
    </div>
  );
}
