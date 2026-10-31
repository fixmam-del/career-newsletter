import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  HashRouter,
  Routes,
  Route,
  NavLink,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  ArrowUpRight,
  BookOpen,
  LibraryBig,
  Settings2,
  HardDrive,
  ChevronRight,
} from "lucide-react";
import { ListPage } from "./List";
import { EditorPage } from "./Editor";
import { RecurringPage } from "./Recurring";
import { SettingsPage } from "./Settings";
import { Notices } from "./ui";
import { db, getSettings, cleanup } from "./storage";
import { editor } from "./store";
import "./tokens.css";
import "./style.css";
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: string }
> {
  state = { error: "" };
  static getDerivedStateFromError(e: Error) {
    return { error: e.message };
  }
  render() {
    return this.state.error ? (
      <main className="page">
        <h1>화면을 표시하지 못했습니다</h1>
        <p>저장된 자료를 초기화하지 않았습니다. 다시 불러와 주세요.</p>
        <pre>{this.state.error}</pre>
        <button onClick={() => location.reload()}>다시 불러오기</button>
        <button
          onClick={async () => {
            const doc = editor.getState().doc;
            if (doc) {
              const { download } = await import("./assets");
              download(
                new Blob([JSON.stringify(doc, null, 2)], {
                  type: "application/json",
                }),
                "unsaved-draft.json",
              );
            }
          }}
        >
          미저장 초안 받기
        </button>
        <a
          className="button"
          href="#/newsletters"
          onClick={() => this.setState({ error: "" })}
        >
          목록으로
        </a>
      </main>
    ) : (
      this.props.children
    );
  }
}
function App() {
  const [error, setError] = useState(""),
    [ready, setReady] = useState(false);
  const location = useLocation(),
    navigate = useNavigate();
  useEffect(() => {
    void db
      .open()
      .then(async () => {
        if (!(await db.settings.get("singleton")))
          await db.settings.put(await getSettings());
        await cleanup();
        setReady(true);
      })
      .catch((e) =>
        setError(
          "브라우저 저장소를 열지 못했습니다. 브라우저의 사이트 저장 허용 여부를 확인해 주세요. " +
            e.message,
        ),
      );
  }, []);
  const nav = async (e: React.MouseEvent<HTMLAnchorElement>, path: string) => {
    if (
      location.pathname.startsWith("/newsletters/") &&
      editor.getState().version !== editor.getState().savedVersion
    ) {
      e.preventDefault();
      try {
        await editor.getState().save();
        navigate(path);
      } catch {}
    }
  };
  return (
    <>
      <header className="app-header">
        <NavLink
          to="/newsletters"
          className="brand"
          onClick={(e) => void nav(e, "/newsletters")}
        >
          <span className="brand-symbol">
            <span />
            <span />
            <span />
          </span>
          <div>
            월간 커리어<small>NEWSLETTER STUDIO</small>
          </div>
        </NavLink>
        <nav aria-label="주 메뉴">
          <NavLink
            to="/newsletters"
            onClick={(e) => void nav(e, "/newsletters")}
          >
            <BookOpen size={17} />
            뉴스레터
          </NavLink>
          <NavLink to="/recurring" onClick={(e) => void nav(e, "/recurring")}>
            <LibraryBig size={17} />
            상시 프로그램
          </NavLink>
          <NavLink to="/settings" onClick={(e) => void nav(e, "/settings")}>
            <Settings2 size={17} />
            설정·백업
          </NavLink>
        </nav>
        <span className="header-local">
          <span className="status-dot" />
          로컬 저장소 <HardDrive size={15} />
        </span>
      </header>
      {error ? (
        <main className="page">
          <h1>저장소 연결 확인이 필요합니다</h1>
          <p role="alert">{error}</p>
          <button onClick={() => window.location.reload()}>재시도</button>
        </main>
      ) : !ready ? (
        <main className="page">저장소를 연결하는 중…</main>
      ) : (
        <Routes>
          <Route path="/newsletters" element={<ListPage />} />
          <Route path="/newsletters/:id" element={<EditorPage />} />
          <Route path="/recurring" element={<RecurringPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/newsletters" replace />} />
        </Routes>
      )}
      {!location.pathname.match(/\/newsletters\/.+/) && (
        <footer className="app-footer">
          <span>
            <b>월간 커리어</b> · 당신의 다음 이야기를 함께.
          </span>
          <span>
            LOCAL FIRST <span className="footer-dot">·</span> MADE FOR YOUR NEXT
            CHAPTER <ArrowUpRight size={14} />
          </span>
        </footer>
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <HashRouter>
      <Notices>
        <App />
      </Notices>
    </HashRouter>
  </ErrorBoundary>,
);
