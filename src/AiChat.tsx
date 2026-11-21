import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUp,
  Copy,
  MessageSquarePlus,
  Settings2,
  Sparkles,
  Square,
} from "lucide-react";
import { AdminGate, AdminToolbar, expireIfNeeded } from "./Admin";
import { aiApi } from "./ai-client";
import {
  providers,
  type ProviderId,
  type ProviderView,
  type ChatMessage,
} from "./ai-types";
import { useNotice } from "./ui";
const suggestions = [
  "대학생 취업 뉴스레터 제목 5개를 제안해 줘",
  "취업 특강 안내문을 친근한 말투로 쓰는 틀을 만들어 줘",
  "이번 달 커리어 뉴스레터의 구성 아이디어를 제안해 줘",
];
function Chat() {
  const [values, setValues] = useState<ProviderView[]>([]),
    [provider, setProvider] = useState<ProviderId>("openai");
  const [messages, setMessages] = useState<ChatMessage[]>([]),
    [input, setInput] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null),
    end = useRef<HTMLDivElement>(null),
    textarea = useRef<HTMLTextAreaElement>(null),
    notify = useNotice();
  useEffect(() => {
    const c = new AbortController();
    void aiApi<{ providers: ProviderView[] }>(
      "providers",
      "GET",
      undefined,
      c.signal,
    )
      .then((r) => {
        setValues(r.providers);
        const first = r.providers.find((p) => p.configured && p.enabled);
        if (first) setProvider(first.id);
      })
      .catch((e) => {
        if (e.name !== "AbortError") {
          expireIfNeeded(e);
          setError(e.message);
        }
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => {
      c.abort();
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, busy]);
  const selected = values.find((p) => p.id === provider),
    available = !!selected?.configured && selected.enabled;
  async function send() {
    if (busy || !input.trim() || !available) return;
    const next: ChatMessage[] = [
      ...messages.slice(-12),
      { role: "user", content: input.trim() },
    ];
    if (next.reduce((n, m) => n + m.content.length, 0) > 24000) {
      setError("대화가 길어졌습니다. 새 대화를 시작해 주세요.");
      return;
    }
    const prompt = input;
    setInput("");
    setMessages(next);
    setBusy(true);
    setError("");
    const c = new AbortController();
    controller.current = c;
    try {
      const result = await aiApi<{ text: string; truncated: boolean }>(
        "chat",
        "POST",
        { provider, messages: next },
        c.signal,
      );
      setMessages([...next, { role: "assistant", content: result.text }]);
      if (result.truncated)
        notify("답변이 길어 일부만 표시되었습니다. 이어서 질문해 주세요.");
    } catch (e) {
      setMessages(next.slice(0, -1));
      setInput(prompt);
      if ((e as Error).name !== "AbortError") {
        expireIfNeeded(e);
        setError((e as Error).message);
      }
    } finally {
      setBusy(false);
      controller.current = null;
      textarea.current?.focus();
    }
  }
  return (
    <main className="page ai-page">
      <AdminToolbar />
      <div className="ai-heading">
        <div>
          <span className="eyebrow">A LITTLE SPARK, A NEW STORY</span>
          <h1>
            다음 문장을 함께<span className="mint-period">.</span>
          </h1>
          <p>뉴스레터를 위한 나만의 AI 편집 파트너</p>
        </div>
        <Link className="button" to="/admin">
          <Settings2 size={17} />
          API 키 관리
        </Link>
      </div>
      <section className="chat-shell">
        <aside className="chat-sidebar">
          <span className="eyebrow">YOUR PARTNERS</span>
          <h2>누구와 이야기할까요?</h2>
          <div className="chat-providers">
            {providers.map((p) => {
              const value = values.find((v) => v.id === p.id);
              return (
                <button
                  key={p.id}
                  className={provider === p.id ? "selected" : ""}
                  aria-pressed={provider === p.id}
                  disabled={busy || loading}
                  onClick={() => {
                    if (
                      messages.length &&
                      !window.confirm(
                        "AI를 바꾸면 현재 대화가 지워집니다. 변경할까요?",
                      )
                    )
                      return;
                    setProvider(p.id);
                    setMessages([]);
                    setError("");
                  }}
                >
                  <span className={`provider-mark provider-${p.id}`}>
                    {p.name.slice(0, 1)}
                  </span>
                  <span>
                    <b>{p.name}</b>
                    <small>
                      {value?.configured && value.enabled
                        ? "사용 가능"
                        : "설정 필요"}
                    </small>
                  </span>
                  <i />
                </button>
              );
            })}
          </div>
          <div className="chat-model">
            <span>선택한 모델</span>
            <b>{selected?.model || "불러오는 중…"}</b>
          </div>
          <button
            disabled={busy || !messages.length}
            onClick={() => {
              if (window.confirm("현재 대화를 지울까요?")) {
                setMessages([]);
                setError("");
              }
            }}
          >
            <MessageSquarePlus size={16} />새 대화
          </button>
          <p>
            대화는 현재 화면에서만 유지됩니다. 전송한 내용은 선택한 AI
            제공업체에서 처리합니다.
          </p>
        </aside>
        <div className="chat-main">
          <header>
            <span>
              <Sparkles size={18} />
              {providers.find((p) => p.id === provider)?.name} 편집 도우미
            </span>
            <span className="chat-private">관리자 전용</span>
          </header>
          <div className="chat-messages" role="log" aria-label="AI 대화">
            <div className="chat-welcome">
              <span className="ai-icon">
                <Sparkles size={27} />
              </span>
              <h2>어떤 이야기를 시작할까요?</h2>
              <p>아이디어를 펼치고, 초안을 만들고, 문장을 다듬어 보세요.</p>
              {!messages.length && (
                <div className="chat-suggestions">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      disabled={busy || !available}
                      onClick={() => {
                        setInput(s);
                        textarea.current?.focus();
                      }}
                    >
                      {s}
                      <ArrowUp size={15} />
                    </button>
                  ))}
                </div>
              )}
            </div>
            {messages.map((m, index) => (
              <article className={`chat-message ${m.role}`} key={index}>
                <div>
                  <b>
                    {m.role === "user"
                      ? "나"
                      : providers.find((p) => p.id === provider)?.name}
                  </b>
                  {m.role === "assistant" && (
                    <button
                      className="icon"
                      aria-label="답변 복사"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(m.content);
                          notify("답변을 복사했습니다.");
                        } catch {
                          notify(
                            "복사하지 못했습니다. 텍스트를 선택해 복사해 주세요.",
                          );
                        }
                      }}
                    >
                      <Copy size={14} />
                    </button>
                  )}
                </div>
                <p>{m.content}</p>
              </article>
            ))}
            {busy && (
              <p className="chat-thinking" role="status">
                생각을 문장으로 정리하고 있어요…
              </p>
            )}
            <div ref={end} />
          </div>
          <div className="chat-compose">
            {error && (
              <p className="ai-error" role="alert">
                {error}
              </p>
            )}
            {!loading && !available && (
              <p className="chat-setup">
                이 AI를 사용하려면{" "}
                <Link to="/admin">관리자 페이지에서 API 키를 등록</Link>하고
                사용을 켜 주세요.
              </p>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <textarea
                ref={textarea}
                aria-label="AI에게 보낼 메시지"
                placeholder={
                  available
                    ? "뉴스레터를 위한 생각을 들려주세요…"
                    : "API 키 등록 후 대화를 시작할 수 있어요"
                }
                value={input}
                maxLength={6000}
                rows={3}
                disabled={busy || !available}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing
                  ) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              {busy ? (
                <button
                  type="button"
                  className="primary"
                  aria-label="응답 중지"
                  onClick={() => controller.current?.abort()}
                >
                  <Square size={17} />
                </button>
              ) : (
                <button
                  className="primary"
                  aria-label="메시지 보내기"
                  disabled={!input.trim() || !available || loading}
                >
                  <ArrowUp size={21} />
                </button>
              )}
            </form>
            <small>
              Enter로 전송 · Shift+Enter로 줄바꿈 · AI 답변의 사실과 일정은
              확인해 주세요.
            </small>
          </div>
        </div>
      </section>
    </main>
  );
}
export function AiChatPage() {
  return (
    <AdminGate>
      <Chat />
    </AdminGate>
  );
}
