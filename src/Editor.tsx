import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft,
  Save,
  Copy,
  Download,
  Monitor,
  Smartphone,
  Palette,
  AlignLeft,
  Eye,
  Check,
  ArrowRight,
  RotateCcw,
} from "lucide-react";
import { editor, closeEditor } from "./store";
import { db, getSettings } from "./storage";
import {
  type Doc,
  type ImageRef,
  themeNames,
  themeColors,
  themeTexts,
  today,
  selected,
  docErrors,
  validDate,
} from "./domain";
import { Field, Check as Checkbox, Modal, SaveBadge, useNotice } from "./ui";
import { ContentEditor, FileEditor } from "./ContentEditor";
import { NewsletterDocument, type AssetView } from "./Document";
import { CreateModal } from "./List";
import { download } from "./assets";
export function EditorPage() {
  const { id } = useParams(),
    navigate = useNavigate(),
    state = editor(),
    notify = useNotice();
  const [loaded, setLoaded] = useState(false),
    [tab, setTab] = useState("content"),
    [mobileTab, setMobileTab] = useState("edit"),
    [device, setDevice] = useState("pc"),
    [date, setDate] = useState(today()),
    [fixed, setFixed] = useState(false),
    [assets, setAssets] = useState<Record<string, AssetView>>({}),
    [clone, setClone] = useState(false),
    [output, setOutput] = useState(false),
    [format, setFormat] = useState<"html" | "png" | "jpg" | "pdf">("html"),
    [width, setWidth] = useState(1600),
    [busy, setBusy] = useState(false),
    [focusProgram, setFocusProgram] = useState("");
  const doc = state.doc;
  useEffect(() => {
    setLoaded(false);
    void state
      .open(id!)
      .then(() => setLoaded(true))
      .catch((e) => {
        notify((e as Error).message);
        setLoaded(true);
      });
    return () => {
      void editor
        .getState()
        .save()
        .finally(closeEditor)
        .catch(() => {});
    };
  }, [id]);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      const s = editor.getState();
      if (
        s.version !== s.savedVersion ||
        s.error ||
        (s.doc && Object.keys(docErrors(s.doc)).length)
      ) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const keys = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        void state.save().catch(() => {});
      }
    };
    window.addEventListener("beforeunload", before);
    window.addEventListener("keydown", keys);
    return () => {
      window.removeEventListener("beforeunload", before);
      window.removeEventListener("keydown", keys);
    };
  }, []);
  useEffect(() => {
    const tick = () => {
      if (!fixed) setDate(today());
    };
    const i = setInterval(tick, 60000);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(i);
      window.removeEventListener("focus", tick);
    };
  }, [fixed]);
  const assetKey = doc
    ? JSON.stringify([
        doc.design.headerImage,
        doc.institutionSnapshot.logo,
        doc.programs.map((p) => [p.content.images, p.content.attachments]),
      ])
    : "";
  useEffect(() => {
    if (!doc) return;
    let alive = true;
    const urls: string[] = [];
    const ids = new Set<string>();
    const walk = (v: unknown) => {
      if (v && typeof v === "object") {
        if ("assetId" in v) ids.add(String(v.assetId));
        Object.values(v).forEach(walk);
      }
    };
    walk(doc);
    void Promise.all(
      [...ids].map(async (id) => {
        const a = await db.assets.get(id);
        if (!a) return null;
        const url = URL.createObjectURL(a.originalBlob);
        urls.push(url);
        return [id, { url, name: a.originalName }] as const;
      }),
    ).then((entries) => {
      if (alive)
        setAssets(Object.fromEntries(entries.filter((e) => e !== null)));
      else urls.forEach(URL.revokeObjectURL);
    });
    return () => {
      alive = false;
      urls.forEach(URL.revokeObjectURL);
    };
  }, [assetKey]);
  const structural = () => state.save();
  const focusError = () => {
    const d = editor.getState().doc;
    if (!d) return;
    const key = Object.keys(docErrors(d))[0];
    const p = d.programs.find((p) => key?.startsWith(p.id));
    setMobileTab("edit");
    setOutput(false);
    setTab(p ? "content" : "design");
    if (p) setFocusProgram(p.id);
    setTimeout(
      () =>
        document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      100,
    );
  };
  async function startExport() {
    if (!doc) return;
    try {
      if (Object.keys(docErrors(doc)).length) {
        notify(
          "입력 오류를 먼저 해결해 주세요. 콘텐츠와 디자인 필드를 확인해 주세요.",
        );
        return;
      }
      const count = selected(doc, date).reduce((s, c) => s + c.items.length, 0);
      if (
        !count &&
        !confirm("표시할 프로그램이 없습니다. 빈 뉴스레터를 내보낼까요?")
      )
        return;
      setBusy(true);
      const { exportDoc } = await import("./exports");
      if (editor.getState().error)
        throw Error("저장 오류를 해결한 뒤 다시 시도해 주세요.");
      do {
        await state.save();
      } while (
        editor.getState().version !== editor.getState().savedVersion &&
        !editor.getState().readOnly
      );
      if (editor.getState().version !== editor.getState().savedVersion)
        throw Error(
          "읽기 전용 초안은 출력할 수 없습니다. 최신 자료를 다시 불러와 주세요.",
        );
      await exportDoc(
        structuredClone(editor.getState().doc!),
        date,
        format,
        width,
      );
      notify(
        format === "pdf"
          ? "인쇄창에서 PDF로 저장을 선택해 주세요."
          : "내보내기를 완료했습니다. 다운로드 파일을 확인해 주세요.",
      );
      setOutput(false);
    } catch (e) {
      notify("내보내기에 실패했습니다. " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!loaded)
    return (
      <main className="page">
        <p>뉴스레터를 불러오는 중…</p>
      </main>
    );
  if (!doc)
    return (
      <main className="page empty-state">
        <h1>뉴스레터를 찾을 수 없습니다</h1>
        <Link className="button primary" to="/newsletters">
          목록으로 이동
        </Link>
      </main>
    );
  const count = selected(doc, date).reduce((n, c) => n + c.items.length, 0),
    errors = docErrors(doc);
  const publicRefs = [
    doc.institutionSnapshot.logo,
    doc.design.headerImage,
    ...selected(doc, date)
      .flatMap((c) => c.items)
      .flatMap((p) => [...p.content.images, ...p.content.attachments]),
  ].filter((r): r is NonNullable<typeof r> => !!r && r.publicIncluded);
  return (
    <main className="editor-page">
      <div className="workbar">
        <Link
          className="icon"
          aria-label="목록으로"
          to="/newsletters"
          onClick={async (e) => {
            e.preventDefault();
            try {
              await state.save();
              navigate("/newsletters");
            } catch {
              notify(
                "저장에 실패했습니다. 다시 저장하거나 초안을 다운로드해 주세요.",
              );
            }
          }}
        >
          <ArrowLeft size={20} />
        </Link>
        <div className="workbar-title">
          <span>
            {doc.yearMonth} <span className="working-tag">편집 중</span>
          </span>
          <strong>{doc.title}</strong>
        </div>
        <SaveBadge text={state.status} />
        <div className="workbar-actions">
          <button
            disabled={state.readOnly}
            onClick={() => void state.save().catch(() => {})}
          >
            <Save size={16} />
            지금 저장
          </button>
          <button
            onClick={async () => {
              try {
                await state.save();
                setClone(true);
              } catch {}
            }}
          >
            <Copy size={16} />
            복제
          </button>
          <button className="primary" onClick={() => setOutput(true)}>
            <Download size={17} />
            내보내기
          </button>
        </div>
      </div>
      {state.error && (
        <div className="error-banner" role="alert">
          {state.error}
          <button onClick={() => void state.save().catch(() => {})}>
            저장 재시도
          </button>
          <button onClick={() => void state.open(doc.id)}>
            최신 문서 다시 불러오기
          </button>
          <button
            onClick={() =>
              download(
                new Blob([JSON.stringify(doc, null, 2)], {
                  type: "application/json",
                }),
                "unsaved-draft.json",
              )
            }
          >
            미저장 초안 받기 (.json)
          </button>
        </div>
      )}
      {Object.keys(errors).length > 0 && (
        <div className="error-banner">
          입력 오류 {Object.keys(errors).length}개 · 원문을 유지하며 마지막 정상
          값까지 저장합니다. 출력 전에 해결해 주세요.
          <button onClick={focusError}>첫 오류 수정하기</button>
        </div>
      )}
      <div className="mobile-switch" role="group" aria-label="편집 화면 전환">
        <button
          className={mobileTab === "edit" ? "active" : ""}
          onClick={() => setMobileTab("edit")}
        >
          편집
        </button>
        <button
          className={mobileTab === "preview" ? "active" : ""}
          onClick={() => setMobileTab("preview")}
        >
          미리보기
        </button>
      </div>
      <div className={"editor-layout mobile-" + mobileTab}>
        <section className="edit-pane">
          <div className="pane-tabs">
            <button
              className={tab === "content" ? "active" : ""}
              aria-pressed={tab === "content"}
              onClick={() => setTab("content")}
            >
              <AlignLeft size={17} />
              콘텐츠
            </button>
            <button
              className={tab === "design" ? "active" : ""}
              aria-pressed={tab === "design"}
              onClick={() => setTab("design")}
            >
              <Palette size={17} />
              디자인
            </button>
            <span>
              {doc.programs.filter((p) => !p.deletedAt).length}개 프로그램
            </span>
          </div>
          <div
            className="pane-content"
            style={{ display: tab === "content" ? "block" : "none" }}
          >
            <ContentEditor
              doc={doc}
              change={state.change}
              date={date}
              onStructural={structural}
              focusProgram={focusProgram}
              readOnly={state.readOnly}
            />
          </div>
          <div
            className="pane-content"
            style={{ display: tab === "design" ? "block" : "none" }}
          >
            <DesignEditor
              doc={doc}
              change={state.change}
              readOnly={state.readOnly}
            />
          </div>
        </section>
        <section className="preview-pane">
          <div className="preview-bar">
            <span>
              <Eye size={16} />
              실시간 미리보기
            </span>
            <div className="device-switch">
              <button
                className={device === "pc" ? "active" : ""}
                aria-label="PC 미리보기"
                aria-pressed={device === "pc"}
                onClick={() => setDevice("pc")}
              >
                <Monitor size={17} />
              </button>
              <button
                className={device === "mobile" ? "active" : ""}
                aria-label="모바일 미리보기"
                aria-pressed={device === "mobile"}
                onClick={() => setDevice("mobile")}
              >
                <Smartphone size={17} />
              </button>
            </div>
            <span className="preview-count">독자에게 {count}개 표시</span>
          </div>
          <div className="preview-options">
            <label>
              기준일로 보기{" "}
              <input
                type="date"
                value={date}
                onChange={(e) => {
                  if (validDate(e.target.value)) {
                    setDate(e.target.value);
                    setFixed(true);
                  }
                }}
              />
            </label>
            {fixed && (
              <button
                className="icon"
                aria-label="오늘로 보기"
                onClick={() => {
                  setDate(today());
                  setFixed(false);
                }}
              >
                <RotateCcw size={14} />
              </button>
            )}
            <Checkbox
              checked={doc.hideExpired}
              onChange={(v) =>
                state.change((d) => {
                  d.hideExpired = v;
                })
              }
            >
              종료 자동 숨김
            </Checkbox>
          </div>
          <div className="preview-canvas">
            {!count && (
              <p className="preview-empty">
                아직 표시할 프로그램이 없습니다. 왼쪽에서 첫 소식을 추가해
                보세요.
              </p>
            )}
            <div className={"preview-sheet " + device}>
              <NewsletterDocument doc={doc} date={date} assets={assets} />
            </div>
            <p className="preview-help">
              실제 독자가 보게 될 뉴스레터입니다. 편집 도구는 출력에 포함되지
              않습니다.
            </p>
          </div>
        </section>
      </div>
      {clone && <CreateModal source={doc} onClose={() => setClone(false)} />}{" "}
      {output && (
        <Modal
          title="뉴스레터 내보내기"
          onClose={() => {
            if (!busy) setOutput(false);
          }}
        >
          <p className="muted">완성한 소식을 원하는 형태로 전달하세요.</p>
          <div className="export-options">
            {(
              [
                ["html", "웹 뉴스레터", "독립 HTML · 이미지와 공개 첨부 포함"],
                ["png", "PNG 이미지", "선명한 이미지 · 긴 문서는 ZIP 분할"],
                ["jpg", "JPG 이미지", "흰 배경 · 품질 90%"],
                ["pdf", "PDF로 저장", "브라우저 인쇄창에서 PDF로 저장"],
              ] as const
            ).map(([id, title, desc]) => (
              <button
                className={format === id ? "chosen" : ""}
                key={id}
                onClick={() => setFormat(id)}
              >
                <span className="radio">
                  {format === id && <Check size={13} />}
                </span>
                <span>
                  <strong>{title}</strong>
                  <small>{desc}</small>
                </span>
              </button>
            ))}
          </div>
          <Field label="출력 기준일">
            <input
              type="date"
              value={date}
              onChange={(e) => {
                if (validDate(e.target.value)) {
                  setDate(e.target.value);
                  setFixed(true);
                }
              }}
            />
          </Field>
          {(format === "png" || format === "jpg") && (
            <Field label="이미지 가로 너비">
              <select
                value={width}
                onChange={(e) => setWidth(Number(e.target.value))}
              >
                <option value={1600}>1600px (권장)</option>
                <option value={800}>800px</option>
              </select>
            </Field>
          )}
          <div className="export-summary">
            <strong>내보내기 포함 내역</strong>
            <p>
              프로그램 {count}개 · 숨김·종료 제외{" "}
              {doc.programs.filter((p) => !p.deletedAt).length - count}개
            </p>
            <p>공개 파일 {publicRefs.length}개 (로고·헤더 포함)</p>
            <ul>
              {publicRefs.map((r, i) => (
                <li key={i}>{assets[r.assetId]?.name || "파일 불러오는 중"}</li>
              ))}
            </ul>
          </div>
          <p className="inline-note">
            {format === "html"
              ? "앱 없이 파일을 직접 열 수 있습니다. 비공개 첨부는 제외합니다."
              : format === "pdf"
                ? "인쇄 대상을 ‘PDF로 저장’으로 선택하세요. 배경·머리글·바닥글은 브라우저 설정에 따라 달라집니다. 첨부는 원문 HTML에서 확인하세요."
                : "이미지의 링크는 클릭되지 않습니다. 첨부는 파일명만 표시하며, 긴 단일 카드는 내부에서 분할될 수 있습니다."}
          </p>
          <div className="modal-actions">
            <button disabled={busy} onClick={() => setOutput(false)}>
              닫기
            </button>
            <button
              className="primary"
              disabled={busy || Object.keys(errors).length > 0}
              onClick={() => void startExport()}
            >
              <Download size={17} />
              {busy
                ? "만드는 중…"
                : format === "pdf"
                  ? "인쇄창 열기"
                  : "다운로드"}
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
function DesignEditor({
  doc,
  change,
  readOnly,
}: {
  doc: Doc;
  change: (f: (d: Doc) => void) => void;
  readOnly: boolean;
}) {
  const [theme, setTheme] = useState<number>(),
    [keep, setKeep] = useState(false);
  const errors = docErrors(doc);
  return (
    <fieldset className="editor-fieldset" disabled={readOnly}>
      <div className="content-intro">
        <span className="eyebrow">A DIFFERENT SEASON, A NEW STORY</span>
        <h2>이번 달에 어울리는 디자인</h2>
        <p>내용은 그대로, 계절의 분위기만 바꿔보세요.</p>
      </div>
      <div className="theme-grid">
        {themeNames.map((name, i) => (
          <button
            className={
              "theme-card " + (doc.design.themeId === i + 1 ? "selected" : "")
            }
            key={name}
            onClick={() => {
              setTheme(i + 1);
              setKeep(false);
            }}
          >
            <div style={{ background: themeColors[i] }}>
              <strong>{String(i + 1).padStart(2, "0")}</strong>
              <span className="theme-orbit" />
              {doc.design.themeId === i + 1 && <Check size={16} />}
            </div>
            <span>{name}</span>
          </button>
        ))}
      </div>
      <h3 className="form-section-title">헤더와 기본 정보</h3>
      <Field label="뉴스레터 제목" error={errors.title}>
        <input
          value={doc.title}
          onChange={(e) =>
            change((d) => {
              d.title = e.target.value;
            })
          }
        />
      </Field>
      <Field label="헤더 한 줄 문구" error={errors["design.headerText"]}>
        <input
          value={doc.design.headerText}
          onChange={(e) =>
            change((d) => {
              d.design.headerText = e.target.value;
            })
          }
        />
      </Field>
      <Field label="강조색 · HEX" error={errors["design.accentColor"]}>
        <div className="color-input">
          <input
            aria-label="강조색 선택"
            type="color"
            value={
              /^#[\da-f]{6}$/i.test(doc.design.accentColor)
                ? doc.design.accentColor
                : "#005bac"
            }
            onChange={(e) =>
              change((d) => {
                d.design.accentColor = e.target.value;
              })
            }
          />
          <input
            aria-label="강조색 HEX"
            value={doc.design.accentColor}
            onChange={(e) =>
              change((d) => {
                d.design.accentColor = e.target.value;
              })
            }
          />
        </div>
      </Field>
      <Field label="기관명">
        <input
          value={doc.institutionSnapshot.institutionName}
          onChange={(e) =>
            change((d) => {
              d.institutionSnapshot.institutionName = e.target.value;
            })
          }
        />
      </Field>
      <Field label="부서명">
        <input
          value={doc.institutionSnapshot.departmentName}
          onChange={(e) =>
            change((d) => {
              d.institutionSnapshot.departmentName = e.target.value;
            })
          }
        />
      </Field>
      <Field label="연락처 안내">
        <textarea
          rows={2}
          value={doc.institutionSnapshot.contactText}
          onChange={(e) =>
            change((d) => {
              d.institutionSnapshot.contactText = e.target.value;
            })
          }
        />
      </Field>
      <Field
        label="기관 웹사이트"
        error={errors["institutionSnapshot.websiteUrl"]}
      >
        <input
          value={doc.institutionSnapshot.websiteUrl || ""}
          onChange={(e) =>
            change((d) => {
              d.institutionSnapshot.websiteUrl = e.target.value || null;
            })
          }
        />
      </Field>
      <button
        className="full"
        onClick={async () => {
          const s = await getSettings();
          change((d) => {
            d.institutionSnapshot = {
              institutionName: s.institutionName,
              departmentName: s.departmentName,
              contactText: s.contactText,
              websiteUrl: s.websiteUrl,
              logo: s.logo,
            };
          });
        }}
      >
        기관 기본정보 다시 가져오기
      </button>
      <h3 className="form-section-title">기관 로고</h3>
      <FileEditor
        allowAttachments={false}
        imageLimit={1}
        images={
          doc.institutionSnapshot.logo ? [doc.institutionSnapshot.logo] : []
        }
        attachments={[]}
        onChange={(images) =>
          change((d) => {
            d.institutionSnapshot.logo = images.at(-1) || null;
          })
        }
      />
      <h3 className="form-section-title">헤더 이미지</h3>
      <FileEditor
        allowAttachments={false}
        imageLimit={1}
        images={doc.design.headerImage ? [doc.design.headerImage] : []}
        attachments={[]}
        onChange={(images) =>
          change((d) => {
            d.design.headerImage = images.at(-1) || null;
          })
        }
      />
      <Field label="헤더 이미지 맞춤">
        <select
          value={doc.design.headerFit}
          onChange={(e) =>
            change((d) => {
              d.design.headerFit = e.target.value as "cover" | "contain";
            })
          }
        >
          <option value="cover">영역 채우기 (cover)</option>
          <option value="contain">전체 이미지 (contain)</option>
        </select>
      </Field>
      {theme && (
        <Modal
          title={`${theme}월 · ${themeNames[theme - 1]}`}
          onClose={() => setTheme(undefined)}
        >
          <p>새 테마를 어떻게 적용할까요?</p>
          <Checkbox checked={keep} onChange={setKeep}>
            현재 사용자 설정 유지 · 색, 문구, 헤더 이미지 보존
          </Checkbox>
          <p className="inline-note">
            선택하지 않으면 테마 기본 색상·문구를 적용하고 사용자 헤더 이미지를
            해제합니다. 기관·제목은 유지합니다.
          </p>
          <div className="modal-actions">
            <button onClick={() => setTheme(undefined)}>취소</button>
            <button
              className="primary"
              onClick={() => {
                change((d) => {
                  d.design.themeId = theme;
                  if (!keep) {
                    d.design.accentColor = themeColors[theme - 1];
                    d.design.headerText = themeTexts[theme - 1];
                    d.design.headerImage = null;
                  }
                });
                setTheme(undefined);
              }}
            >
              테마 적용
            </button>
          </div>
        </Modal>
      )}
    </fieldset>
  );
}
