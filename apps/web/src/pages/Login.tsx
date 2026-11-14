import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { LockKeyhole, ArrowRight } from "lucide-react";
import { useAuth } from "../auth";
import { Logo, Thread } from "../components";
import { WashiTape, ThreadMark } from "../scrapbook";
export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate(),
    location = useLocation();
  const [error, setError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<{ username: string; password: string }>();
  return (
    <div className="login-page">
      <div className="login-story">
        <Logo />
        <span className="eyebrow">Solo noi, e tutto ciò che siamo.</span>
        <h1>
          Le cose belle
          <br />
          restano <em>tra noi.</em>
        </h1>
        <p className="handwritten">
          Un filo invisibile. Una storia tutta nostra.
        </p>
        <div className="login-art">
          <div className="paper art-note">
            <WashiTape rose />
            <ThreadMark />
            <p>
              Ogni ricordo è un nodo
              <br />
              nel filo che ci unisce.
            </p>
            <span>赤い糸</span>
          </div>
          <Thread />
        </div>
        <span className="tiny">IL NOSTRO PICCOLO POSTO NEL MONDO</span>
      </div>
      <section className="login-form paper">
        <WashiTape />
        <LockKeyhole size={23} strokeWidth={1} />
        <span className="eyebrow">Il nostro diario privato</span>
        <h2>Bentornato a casa.</h2>
        <p>Accedi per ritrovare le nostre pagine.</p>
        <form
          onSubmit={handleSubmit(async (data) => {
            setError("");
            try {
              await login(data.username, data.password);
              const from = location.state?.from;
              navigate(
                typeof from === "string" &&
                  from.startsWith("/") &&
                  !from.startsWith("//")
                  ? from
                  : "/",
                { replace: true },
              );
            } catch (e) {
              setError((e as Error).message);
            }
          })}
        >
          <label>
            Nome utente
            <input autoComplete="username" required {...register("username")} />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              {...register("password")}
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="button" disabled={isSubmitting}>
            {isSubmitting ? "Apro il diario…" : "Entra nel nostro diario"}
            <ArrowRight size={17} />
          </button>
        </form>
        <p className="tiny">
          Uno spazio soltanto nostro. Nessuna registrazione pubblica.
        </p>
      </section>
    </div>
  );
}
