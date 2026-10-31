import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Plus,
  ArrowUpRight,
  Search,
  Copy,
  Trash2,
  ArrowRight,
  Layers,
  HardDrive,
  CalendarDays,
  Sparkles,
  FileText,
} from "lucide-react";
import { db, getSettings, insertDoc, loadDoc, deleteDoc } from "./storage";
import {
  type Doc,
  type Newsletter,
  createDoc,
  today,
  nextMonth,
  monthTitle,
  sampleDoc,
  themeNames,
  themeColors,
  now,
  type Recurring,
} from "./domain";
import { Modal, Field, Check, useNotice } from "./ui";
import { NewsletterDocument } from "./Document";
import { sampleAssets, sampleAssetView } from "./sample";
export function CreateModal({
  source,
  sample,
  onClose,
  onCreated,
}: {
  source?: Doc;
  sample?: Doc;
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const navigate = useNavigate(),
    notify = useNotice();
  const [month, setMonth] = useState(
    source ? nextMonth(source.yearMonth) : today().slice(0, 7),
  );
  const [title, setTitle] = useState(monthTitle(month));
  const [normal, setNormal] = useState(true),
    [recurring, setRecurring] = useState(true),
    [theme, setTheme] = useState(true),
    [error, setError] = useState(""),
    [existing, setExisting] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    void getSettings().then((s) => setRecurring(s.defaultImportRecurring));
  }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const reservation = await db.reservations.get(month);
      if (reservation) {
        setExisting(reservation.newsletterId);
        throw Error("해당 월 뉴스레터가 이미 있습니다.");
      }
      const s = await getSettings(),
        r = await db.recurring.toArray();
      const d = sample
        ? structuredClone(sample)
        : createDoc(month, s, r, source, { normal, recurring, theme });
      if (sample) {
        d.yearMonth = month;
        d.title = title;
      } else d.title = title;
      const templates: Recurring[] = sample
        ? d.programs
            .filter((p) => p.recurringTemplateId)
            .map((p) => {
              const c = d.categories.find((c) => c.id === p.categoryId)!;
              return {
                id: p.recurringTemplateId!,
                content: structuredClone(p.content),
                targetCategory: {
                  key: c.key,
                  name: c.name,
                  defaultItemType: c.defaultItemType,
                },
                autoInclude: true,
                deletedAt: null,
                createdAt: now(),
                updatedAt: now(),
              };
            })
        : [];
      await insertDoc(d, sample ? await sampleAssets() : [], templates);
      onClose();
      notify(
        source
          ? "복제했습니다. 이전 월 일정은 그대로이므로 확인해 주세요."
          : "새 뉴스레터를 만들었습니다.",
      );
      if (onCreated) onCreated(d.id);
      else navigate("/newsletters/" + d.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={source ? "뉴스레터 복제" : sample ? "샘플로 시작" : "새 뉴스레터"}
      onClose={onClose}
    >
      <p className="muted">
        {source
          ? "지난달의 경험을 이번 달의 기회로 이어보세요."
          : "한 달의 소식을 담을 새로운 공간을 만듭니다."}
      </p>
      <form onSubmit={submit}>
        <Field label="발행 연·월">
          <input
            type="month"
            required
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              setTitle(monthTitle(e.target.value));
              setExisting("");
            }}
          />
        </Field>
        <Field label="뉴스레터 제목">
          <input
            required
            maxLength={120}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        {source && (
          <Check checked={normal} onChange={setNormal}>
            일반 프로그램 복사 · 날짜는 그대로 유지
          </Check>
        )}
        {!sample && (
          <Check checked={recurring} onChange={setRecurring}>
            활성 상시 프로그램 불러오기
          </Check>
        )}
        {sample && (
          <p className="inline-note">
            샘플 상시 원본 1개와 가상 프로그램·이미지를 함께 저장합니다.
          </p>
        )}
        {source && (
          <Check checked={theme} onChange={setTheme}>
            대상 월 테마 적용 · 사용자 헤더 이미지 해제
          </Check>
        )}
        <p className="inline-note">
          {Number(month.slice(5))}월 디자인 ·{" "}
          {themeNames[Number(month.slice(5)) - 1]}
        </p>
        {error && (
          <p className="error" role="alert">
            {error}{" "}
            {existing && (
              <Link onClick={onClose} to={"/newsletters/" + existing}>
                해당 월 뉴스레터 열기 →
              </Link>
            )}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            취소
          </button>
          <button className="primary" disabled={busy || !month}>
            {busy ? "만드는 중…" : source ? "복제하기" : "생성하기"}
            <ArrowRight size={17} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function ListPage() {
  const [list, setList] = useState<(Newsletter & { count: number })[]>([]),
    [search, setSearch] = useState(""),
    [year, setYear] = useState(""),
    [create, setCreate] = useState(false),
    [source, setSource] = useState<Doc>(),
    [sample, setSample] = useState<Doc>(),
    [adopt, setAdopt] = useState(false),
    [deleting, setDeleting] = useState<Doc>(),
    [recovering, setRecovering] = useState<Doc>(),
    [restoreMonth, setRestoreMonth] = useState(""),
    [restoreError, setRestoreError] = useState("");
  const notify = useNotice();
  const refresh = async () => {
    try {
      const ns = await db.newsletters.filter((n) => !n.deletedAt).toArray();
      setList(
        await Promise.all(
          ns
            .sort((a, b) => b.yearMonth.localeCompare(a.yearMonth))
            .map(async (n) => ({
              ...n,
              count: await db.programs
                .where("newsletterId")
                .equals(n.id)
                .filter((p) => !p.deletedAt)
                .count(),
            })),
        ),
      );
    } catch (e) {
      notify("저장된 목록을 불러오지 못했습니다. " + (e as Error).message);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  const items = list.filter(
    (n) =>
      (n.title.toLowerCase().includes(search.trim().toLowerCase()) ||
        n.yearMonth.includes(search.trim())) &&
      (!year || n.yearMonth.startsWith(year)),
  );
  return (
    <main className="page list-page">
      <div className="page-eyebrow">
        <span className="status-dot" /> 나의 로컬 워크스페이스
      </div>
      <section className="dashboard-hero">
        <div className="hero-copy">
          <span className="eyebrow">MONTHLY CAREER STUDIO</span>
          <h1>
            한 달의 소식,
            <br />
            다음 기회의 시작<span>.</span>
          </h1>
          <p>
            흩어진 프로그램을 모아, 읽고 싶은 뉴스레터로.
            <br />
            이번 달의 가능성을 함께 편집해 보세요.
          </p>
          <div className="hero-actions">
            <button className="primary" onClick={() => setCreate(true)}>
              <Plus size={19} />새 뉴스레터
            </button>
            <button
              className="text-button"
              onClick={() => setSample(sampleDoc())}
            >
              샘플 살펴보기 <ArrowUpRight size={18} />
            </button>
          </div>
          <div className="local-note">
            <HardDrive size={14} /> 이 브라우저에 안전하게 저장 · 로그인 없이
            시작
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="art-grid" />
          <div className="orb" />
          <svg className="orbit" viewBox="0 0 500 340">
            <ellipse
              cx="270"
              cy="180"
              rx="215"
              ry="83"
              transform="rotate(-28 270 180)"
              fill="none"
              stroke="#42DBB0"
              strokeWidth="2"
            />
            <ellipse
              cx="270"
              cy="180"
              rx="200"
              ry="125"
              transform="rotate(28 270 180)"
              fill="none"
              stroke="#9ec4e6"
              strokeWidth="1"
            />
          </svg>
          <div className="art-label">
            <span className="mini-dot" /> MAKE YOUR NEXT CHAPTER
          </div>
          <div className="floating-letter">
            <div className="float-top">
              CAREER LETTER <span>↗</span>
            </div>
            <small>{today().slice(0, 7).replace("-", " / ")}</small>
            <strong>
              가능성을 여는
              <br />
              우리의 이야기
            </strong>
            <div className="mock-line" />
            <div className="mock-line short" />
            <div className="float-bottom">
              <span>새로운 기회를 만나보세요</span>
              <ArrowRight size={15} />
            </div>
          </div>
          <div className="art-tag">
            <Sparkles size={17} />
            <div>
              매달 새롭게,
              <br />
              <b>12가지 계절의 디자인</b>
            </div>
          </div>
        </div>
      </section>
      <div className="summary-strip">
        <div>
          <FileText size={20} />
          <span>나의 뉴스레터</span>
          <strong>{String(list.length).padStart(2, "0")}</strong>
        </div>
        <div>
          <Layers size={20} />
          <span>담아 둔 프로그램</span>
          <strong>
            {String(list.reduce((s, n) => s + n.count, 0)).padStart(2, "0")}
          </strong>
        </div>
        <div>
          <span className="mint-dot" />
          <span>별도 서버 없이, 내 컴퓨터에서</span>
          <small>LOCAL FIRST</small>
        </div>
      </div>
      <section className="library">
        <div className="section-heading">
          <div>
            <span className="eyebrow">YOUR COLLECTION</span>
            <h2>
              월별 뉴스레터 <span>{list.length}</span>
            </h2>
          </div>
          <div className="filters">
            <label className="search-box">
              <Search size={18} />
              <input
                aria-label="제목 또는 연월 검색"
                placeholder="제목 또는 연월 검색"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <select
              aria-label="연도 필터"
              value={year}
              onChange={(e) => setYear(e.target.value)}
            >
              <option value="">모든 연도</option>
              {Array.from(
                new Set(list.map((n) => n.yearMonth.slice(0, 4))),
              ).map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>
        {list.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <FileText size={27} />
              <span>+</span>
            </div>
            <h3>첫 번째 이야기를 기다리고 있어요</h3>
            <p>
              빈 뉴스레터로 시작하거나 샘플을 살펴보세요.
              <br />
              프로그램을 입력하면 나만의 뉴스레터가 완성됩니다.
            </p>
            <button onClick={() => setCreate(true)}>
              첫 뉴스레터 만들기 <ArrowRight size={17} />
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="empty-state">검색 결과가 없습니다.</div>
        ) : (
          <div className="newsletter-grid">
            {items.map((n) => (
              <article className="newsletter-card" key={n.id}>
                <Link
                  className="cover"
                  style={
                    { "--cover": n.design.accentColor } as React.CSSProperties
                  }
                  to={"/newsletters/" + n.id}
                >
                  <div className="cover-brand">
                    MONTHLY CAREER LETTER <ArrowUpRight size={18} />
                  </div>
                  <div className="cover-month">
                    {n.yearMonth.slice(0, 4)}
                    <strong>{n.yearMonth.slice(5)}</strong>
                  </div>
                  <div className="cover-curve" />
                  <span>{n.design.headerText}</span>
                </Link>
                <div className="card-body">
                  <div className="card-month">
                    <CalendarDays size={14} />
                    {n.yearMonth.replace("-", "년 ")}월{" "}
                    <span>{n.count}개 프로그램 · 숨김 포함</span>
                  </div>
                  <h3>
                    <Link to={"/newsletters/" + n.id}>{n.title}</Link>
                  </h3>
                  <p className="card-time">
                    최근 수정{" "}
                    {new Date(n.updatedAt).toLocaleString("ko-KR", {
                      timeZone: "Asia/Seoul",
                      month: "long",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                  <div className="card-actions">
                    <Link
                      className="button primary soft"
                      to={"/newsletters/" + n.id}
                    >
                      편집하기 <ArrowRight size={16} />
                    </Link>
                    <button
                      onClick={async () => setSource(await loadDoc(n.id))}
                    >
                      <Copy size={15} />
                      복제
                    </button>
                    <button
                      className="icon"
                      aria-label={`${n.yearMonth} 뉴스레터 삭제`}
                      onClick={async () => setDeleting(await loadDoc(n.id))}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </article>
            ))}
            <button className="new-card" onClick={() => setCreate(true)}>
              <span>
                <Plus size={26} />
              </span>
              <strong>다음 이야기를 만들어 볼까요?</strong>
              <small>새 뉴스레터 만들기</small>
            </button>
          </div>
        )}
      </section>
      <div className="storage-info">
        <HardDrive size={17} />
        <p>
          자료는 현재 주소의 이 브라우저에만 저장됩니다. 브라우저 데이터 삭제
          또는 주소·포트 변경에 대비해 <Link to="/settings">전체 백업</Link>을
          보관하세요.
        </p>
      </div>
      {(create || source) && (
        <CreateModal
          source={source}
          onClose={() => {
            setCreate(false);
            setSource(undefined);
            void refresh();
          }}
        />
      )}
      {sample && (
        <Modal
          title="샘플 뉴스레터 · 가상 자료"
          wide
          onClose={() => setSample(undefined)}
        >
          <div className="sample-tools">
            <p>
              저장되지 않은 임시 미리보기입니다. 모든 정보는 가상의 예시입니다.
            </p>
            <button className="primary" onClick={() => setAdopt(true)}>
              샘플로 시작 <ArrowRight size={16} />
            </button>
          </div>
          <NewsletterDocument
            doc={sample}
            date={today()}
            assets={sampleAssetView}
          />
        </Modal>
      )}
      {adopt && sample && (
        <CreateModal
          sample={sample}
          onClose={() => {
            setAdopt(false);
            setSample(undefined);
          }}
        />
      )}
      {recovering && (
        <Modal
          title="복원할 다른 월 선택"
          onClose={() => setRecovering(undefined)}
        >
          <p>
            원래 월에 새 뉴스레터가 생겼습니다. 새 자료를 덮어쓰지 않고 다른
            월에 복원합니다.
          </p>
          <Field label="복원할 연·월">
            <input
              type="month"
              value={restoreMonth}
              onChange={(e) => setRestoreMonth(e.target.value)}
            />
          </Field>
          {restoreError && (
            <p className="error" role="alert">
              {restoreError}
            </p>
          )}
          <div className="modal-actions">
            <button onClick={() => setRecovering(undefined)}>취소</button>
            <button
              className="primary"
              disabled={!restoreMonth}
              onClick={async () => {
                try {
                  await deleteDoc(recovering, true, restoreMonth);
                  setRecovering(undefined);
                  await refresh();
                  notify("선택한 월에 뉴스레터를 복원했습니다.");
                } catch (e) {
                  setRestoreError((e as Error).message);
                }
              }}
            >
              선택한 월에 복원
            </button>
          </div>
        </Modal>
      )}
      {deleting && (
        <Modal
          title="뉴스레터를 삭제할까요?"
          onClose={() => setDeleting(undefined)}
        >
          <p>
            <strong>
              {deleting.yearMonth} · {deleting.title}
            </strong>
          </p>
          <p>
            프로그램과 파일 연결이 함께 삭제됩니다. 상시 라이브러리는
            유지됩니다. 8초 이내 실행취소할 수 있습니다.
          </p>
          <div className="modal-actions">
            <button onClick={() => setDeleting(undefined)}>취소</button>
            <button
              className="danger"
              onClick={async () => {
                const d = deleting;
                try {
                  await deleteDoc(d);
                  setDeleting(undefined);
                  await refresh();
                  notify("뉴스레터를 삭제했습니다.", async () => {
                    if (await db.reservations.get(d.yearMonth)) {
                      setRecovering(d);
                      setRestoreMonth(nextMonth(d.yearMonth));
                      setRestoreError("");
                      return;
                    }
                    await deleteDoc(d, true);
                    await refresh();
                  });
                } catch (e) {
                  notify((e as Error).message);
                }
              }}
            >
              뉴스레터 삭제
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
