import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  KeyRound,
  LockKeyhole,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { Field, Check, useNotice } from "./ui";
import { aiApi, ApiError } from "./ai-client";
import { providers, type ProviderView } from "./ai-types";

export function AdminGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<"loading" | "guest" | "admin" | "error">(
    "loading",
  );
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [id, setId] = useState(""),
    [password, setPassword] = useState("");
  const check = () => {
    setStatus("loading");
    void aiApi<{ authenticated: boolean }>("session")
      .then((r) => setStatus(r.authenticated ? "admin" : "guest"))
      .catch((e) => {
        setError(e.message);
        setStatus("error");
      });
  };
  useEffect(check, []);
  useEffect(() => {
    if (status !== "admin") return;
    const interval = window.setInterval(
      () => {
        void aiApi<{ authenticated: boolean }>("session")
          .then((r) => {
            if (!r.authenticated) setStatus("guest");
          })
          .catch(() => {});
      },
      5 * 60 * 1000,
    );
    const expired = () => setStatus("guest");
    window.addEventListener("admin-session-expired", expired);
    return () => {
      clearInterval(interval);
      window.removeEventListener("admin-session-expired", expired);
    };
  }, [status]);
  if (status === "admin") return <>{children}</>;
  if (status === "loading")
    return (
      <main className="page" role="status">
        관리자 세션을 확인하는 중…
      </main>
    );
  return (
    <main className="page login-page">
      <section className="login-story">
        <span className="eyebrow">YOUR NEXT CHAPTER, WITH AI</span>
        <h1>
          생각의 시작을,
          <br />
          함께 만드는 공간.
        </h1>
        <p>
          뉴스레터의 첫 문장부터 새로운 아이디어까지.
          <br />세 가지 AI와 나만의 편집 파트너를 만나세요.
        </p>
        <div className="ai-orbit" aria-hidden="true">
          <span>AI</span>
          <i />
          <b />
        </div>
        <div className="ai-pills">
          {providers.map((p) => (
            <span key={p.id}>{p.name}</span>
          ))}
        </div>
      </section>
      <section className="login-card">
        <span className="ai-icon">
          <LockKeyhole size={25} />
        </span>
        <span className="eyebrow">ADMIN ACCESS</span>
        <h2>관리자 로그인</h2>
        <p>AI 채팅과 API 키 설정은 관리자만 사용할 수 있습니다.</p>
        {status === "error" ? (
          <>
            <p className="ai-error" role="alert">
              {error}
            </p>
            <button onClick={check}>다시 연결</button>
          </>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                await aiApi("session", "POST", { id, password });
                setPassword("");
                setStatus("admin");
              } catch (e) {
                setError((e as Error).message);
                setPassword("");
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="아이디">
              <input
                autoComplete="username"
                value={id}
                onChange={(e) => setId(e.target.value)}
                required
                maxLength={80}
              />
            </Field>
            <Field label="비밀번호">
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                maxLength={256}
              />
            </Field>
            {error && (
              <p className="ai-error" role="alert">
                {error}
              </p>
            )}
            <button className="primary" disabled={busy}>
              {busy ? "확인하는 중…" : "로그인"}
              <ArrowUpRight size={17} />
            </button>
          </form>
        )}
        <small>
          <ShieldCheck size={15} /> 로그인은 8시간 동안 유지됩니다.
        </small>
      </section>
    </main>
  );
}
export function AdminToolbar() {
  const [busy, setBusy] = useState(false),
    notify = useNotice();
  return (
    <div className="ai-toolbar">
      <span>
        <ShieldCheck size={16} /> 관리자 전용
      </span>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await aiApi("session", "DELETE");
            window.dispatchEvent(new Event("admin-session-expired"));
          } catch (e) {
            notify((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <LogOut size={16} />
        로그아웃
      </button>
    </div>
  );
}
export function expireIfNeeded(error: unknown) {
  if (error instanceof ApiError && error.status === 401)
    window.dispatchEvent(new Event("admin-session-expired"));
}
function ProviderCard({
  value,
  onSave,
}: {
  value: ProviderView;
  onSave: (values: ProviderView[]) => void;
}) {
  const info = providers.find((p) => p.id === value.id)!;
  const [key, setKey] = useState(""),
    [model, setModel] = useState(value.model),
    [enabled, setEnabled] = useState(value.enabled),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const notify = useNotice();
  async function save(removeKey = false) {
    setBusy(true);
    setError("");
    try {
      const result = await aiApi<{ providers: ProviderView[] }>(
        "providers",
        "PUT",
        { id: value.id, model, key, enabled, removeKey },
      );
      setKey("");
      onSave(result.providers);
      notify(
        removeKey
          ? `${info.name} API 키를 삭제했습니다.`
          : `${info.name} 설정을 저장했습니다.`,
      );
    } catch (e) {
      expireIfNeeded(e);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className={`provider-card provider-${info.id}`}>
      <header>
        <span className="provider-mark">{info.name.slice(0, 1)}</span>
        <div>
          <h2>{info.name}</h2>
          <p>{info.note}</p>
        </div>
        <span
          className={`provider-status ${value.configured ? "configured" : ""}`}
        >
          {value.configured ? "키 등록됨" : "미등록"}
        </span>
      </header>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field
          label={`${info.name} API 키`}
          hint={
            value.configured
              ? "등록된 키는 표시하지 않습니다. 비워 두면 기존 키를 유지합니다."
              : "제공업체에서 발급한 API 키를 입력해 주세요."
          }
        >
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            maxLength={400}
            placeholder={
              value.configured ? "새 키로 교체할 때만 입력" : "API 키 입력"
            }
          />
        </Field>
        <Field
          label={`${info.name} 모델 ID`}
          hint="계정에서 사용 가능한 정확한 모델 ID를 입력하세요."
        >
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            required
            maxLength={100}
            pattern="[a-zA-Z0-9._:\-]+"
          />
        </Field>
        <Check checked={enabled} onChange={setEnabled}>
          AI 채팅에서 사용
        </Check>
        {error && (
          <p className="ai-error" role="alert">
            {error}
          </p>
        )}
        <div className="provider-actions">
          <button className="primary" disabled={busy}>
            {busy ? "저장 중…" : `${info.name} 설정 저장`}
          </button>
          {value.configured && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (window.confirm(`${info.name} API 키를 삭제할까요?`))
                  void save(true);
              }}
            >
              키 삭제
            </button>
          )}
        </div>
      </form>
      <small>
        {value.updatedAt
          ? `최근 저장 ${new Date(value.updatedAt).toLocaleString("ko-KR")}`
          : "설정을 저장하면 여기에 표시됩니다."}
      </small>
    </article>
  );
}
function AdminSettings() {
  const [values, setValues] = useState<ProviderView[]>(),
    [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void aiApi<{ providers: ProviderView[] }>(
      "providers",
      "GET",
      undefined,
      controller.signal,
    )
      .then((r) => setValues(r.providers))
      .catch((e) => {
        if (e.name !== "AbortError") {
          expireIfNeeded(e);
          setError(e.message);
        }
      });
    return () => controller.abort();
  }, []);
  return (
    <main className="page ai-page">
      <AdminToolbar />
      <div className="ai-heading">
        <div>
          <span className="eyebrow">AI CONTROL ROOM</span>
          <h1>
            나의 AI, 나의 설정<span className="mint-period">.</span>
          </h1>
          <p>세 가지 편집 파트너를 한곳에서 연결하세요.</p>
        </div>
        <Link className="button primary" to="/ai-chat">
          AI 채팅 열기
          <ArrowUpRight size={17} />
        </Link>
      </div>
      <div className="ai-security">
        <KeyRound size={21} />
        <p>
          <b>API 키는 서버에 암호화해 보관합니다.</b>
          <span>
            브라우저에는 등록 여부만 전달됩니다. 저장은 연결 검사를 수행하지
            않으며, 메시지를 보낼 때 제공업체의 API 요금이 발생할 수 있습니다.
          </span>
        </p>
      </div>
      {error ? (
        <p className="ai-error" role="alert">
          {error}
        </p>
      ) : !values ? (
        <p role="status">설정을 불러오는 중…</p>
      ) : (
        <div className="provider-grid">
          {values.map((value) => (
            <ProviderCard key={value.id} value={value} onSave={setValues} />
          ))}
        </div>
      )}
      <p className="ai-footnote">
        키를 삭제하거나 사용을 끄면 해당 AI로 새 메시지를 보낼 수 없습니다. 모델
        접근 권한과 사용 한도는 각 제공업체 계정을 따릅니다.
      </p>
    </main>
  );
}
export function AdminPage() {
  return (
    <AdminGate>
      <AdminSettings />
    </AdminGate>
  );
}
