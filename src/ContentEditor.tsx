import { useState, useEffect, useRef } from "react";
import {
  Plus,
  ArrowLeft,
  GripVertical,
  ArrowUp,
  ArrowDown,
  Trash2,
  EyeOff,
  ArrowRight,
  Paperclip,
  ImagePlus,
  LibraryBig,
  ExternalLink,
} from "lucide-react";
import {
  type Content,
  type Program,
  type Category,
  type Doc,
  type ImageRef,
  type Asset,
  type Recurring,
  contentSchema,
  uuid,
  now,
  defaults,
  status,
  makeProgram,
  makeCategory,
  reorder,
  mergeRecurring,
} from "./domain";
import { Field, Check, Modal, useNotice } from "./ui";
import { db } from "./storage";
import { upload } from "./assets";
export function FileEditor({
  images,
  attachments,
  onChange,
  allowAttachments = true,
  imageLimit = 5,
}: {
  images: Content["images"];
  attachments: Content["attachments"];
  allowAttachments?: boolean;
  imageLimit?: number;
  onChange: (
    images: Content["images"],
    attachments: Content["attachments"],
  ) => void;
}) {
  const notify = useNotice();
  const [assets, setAssets] = useState<Record<string, Asset>>({}),
    [urls, setUrls] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false);
  const key = [...images, ...attachments].map((x) => x.assetId).join(",");
  useEffect(() => {
    let alive = true;
    const local: string[] = [];
    void Promise.all(
      [...images, ...attachments].map((r) => db.assets.get(r.assetId)),
    ).then((arr) => {
      if (!alive) return;
      const a: Record<string, Asset> = {},
        u: Record<string, string> = {};
      arr.forEach((x) => {
        if (x) {
          a[x.id] = x;
          if (x.mimeType.startsWith("image/")) {
            u[x.id] = URL.createObjectURL(x.thumbnailBlob || x.originalBlob);
            local.push(u[x.id]);
          }
        }
      });
      setAssets(a);
      setUrls(u);
    });
    return () => {
      alive = false;
      local.forEach(URL.revokeObjectURL);
    };
  }, [key]);
  const add = async (files: FileList | null, image: boolean) => {
    if (!files) return;
    setBusy(true);
    try {
      if (!image && !allowAttachments)
        throw Error("이 영역에는 이미지만 추가할 수 있습니다");
      const list = image ? [...images] : [...attachments];
      if (list.length + files.length > (image ? imageLimit : 5))
        throw Error(
          `최대 ${image ? imageLimit : 5}개까지 연결할 수 있습니다. 기존 연결을 해제한 뒤 다시 선택해 주세요.`,
        );
      let im = [...images],
        at = [...attachments];
      for (const file of Array.from(files)) {
        const a = await upload(file, image);
        if (image)
          im.push({
            assetId: a.id,
            alt: file.name.replace(/\.[^.]+$/, ""),
            decorative: false,
            publicIncluded: true,
          });
        else at.push({ assetId: a.id, publicIncluded: false });
      }
      onChange(im, at);
    } catch (e) {
      notify("파일을 저장하지 못했습니다. " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="file-manager">
      <div className="upload-actions">
        <label className="button">
          <ImagePlus size={17} /> 이미지 추가
          <input
            type="file"
            multiple={imageLimit > 1}
            className="file-input"
            accept=".jpg,.jpeg,.png,.webp"
            disabled={busy}
            onChange={(e) => {
              void add(e.target.files, true);
              e.target.value = "";
            }}
          />
        </label>
        {allowAttachments && (
          <label className="button">
            <Paperclip size={17} /> 첨부 추가
            <input
              type="file"
              multiple
              className="file-input"
              accept=".pdf,.docx,.xlsx,.pptx,.txt,.csv"
              disabled={busy}
              onChange={(e) => {
                void add(e.target.files, false);
                e.target.value = "";
              }}
            />
          </label>
        )}
      </div>
      <div
        className="drop-zone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const image = Array.from(e.dataTransfer.files).every((f) =>
            f.type.startsWith("image/"),
          );
          void add(e.dataTransfer.files, image);
        }}
      >
        파일을 여기에 놓거나 위 버튼으로 선택하세요
        <br />
        <small>
          이미지 10MB · {imageLimit}개까지
          {allowAttachments ? " / 첨부 20MB · 5개까지" : ""}
        </small>
      </div>
      {busy && <p role="status">파일을 확인하고 저장하는 중…</p>}
      {images.map((r, i) => (
        <div className="file-row" key={r.assetId}>
          {urls[r.assetId] && (
            <img src={urls[r.assetId]} alt="업로드 미리보기" />
          )}
          <div>
            <strong>
              {i === 0 ? "대표 이미지" : "추가 이미지"} ·{" "}
              {assets[r.assetId]?.originalName}
            </strong>
            <small>
              {((assets[r.assetId]?.byteSize || 0) / 1024).toFixed(1)} KB
            </small>
            <Field
              label="이미지 대체텍스트"
              error={
                !r.decorative && !r.alt.trim()
                  ? "이미지 설명을 입력하거나 장식용으로 표시해 주세요"
                  : undefined
              }
            >
              <input
                maxLength={200}
                value={r.alt}
                onChange={(e) =>
                  onChange(
                    images.map((x) =>
                      x.assetId === r.assetId
                        ? { ...x, alt: e.target.value }
                        : x,
                    ),
                    attachments,
                  )
                }
              />
            </Field>
            <Check
              checked={r.decorative}
              onChange={(v) =>
                onChange(
                  images.map((x) =>
                    x.assetId === r.assetId ? { ...x, decorative: v } : x,
                  ),
                  attachments,
                )
              }
            >
              장식용 이미지
            </Check>
            <Check
              checked={r.publicIncluded}
              onChange={(v) =>
                onChange(
                  images.map((x) =>
                    x.assetId === r.assetId ? { ...x, publicIncluded: v } : x,
                  ),
                  attachments,
                )
              }
            >
              독자 공개 포함
            </Check>
          </div>
          <button
            className="icon"
            aria-label="이미지 연결 해제"
            onClick={() =>
              onChange(
                images.filter((x) => x.assetId !== r.assetId),
                attachments,
              )
            }
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      {attachments.map((r) => (
        <div className="file-row" key={r.assetId}>
          <Paperclip size={20} />
          <div>
            <strong>{assets[r.assetId]?.originalName}</strong>
            <small>
              {((assets[r.assetId]?.byteSize || 0) / 1024).toFixed(1)} KB
            </small>
            <Check
              checked={r.publicIncluded}
              onChange={(v) =>
                onChange(
                  images,
                  attachments.map((x) =>
                    x.assetId === r.assetId ? { ...x, publicIncluded: v } : x,
                  ),
                )
              }
            >
              독자 공개 포함 · 기본은 비공개
            </Check>
          </div>
          <button
            className="icon"
            aria-label="첨부 연결 해제"
            onClick={() =>
              onChange(
                images,
                attachments.filter((x) => x.assetId !== r.assetId),
              )
            }
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
export function ContentForm({
  content,
  onChange,
}: {
  content: Content;
  onChange: (v: Content) => void;
}) {
  const c = content;
  const result = contentSchema.safeParse(c);
  const errors: Record<string, string> = {};
  if (!result.success)
    for (const e of result.error.issues) errors[e.path.join(".")] = e.message;
  const put = <K extends keyof Content>(k: K, v: Content[K]) =>
    onChange({ ...c, [k]: v });
  return (
    <>
      <Field
        label={c.type === "youthPolicy" ? "정책명 *" : "프로그램명 *"}
        error={errors.name}
      >
        <input value={c.name} onChange={(e) => put("name", e.target.value)} />
      </Field>
      <Field label="대상" error={errors.target}>
        <input
          placeholder="예: 재학생 및 졸업생"
          value={c.target}
          onChange={(e) => put("target", e.target.value)}
        />
      </Field>
      <div className="two-fields">
        <Field label="운영 시작일" error={errors.operationStart}>
          <input
            type="date"
            value={c.operationStart || ""}
            onChange={(e) => put("operationStart", e.target.value || null)}
          />
        </Field>
        <Field label="운영 종료일" error={errors.operationEnd}>
          <input
            type="date"
            value={c.operationEnd || ""}
            onChange={(e) => put("operationEnd", e.target.value || null)}
          />
        </Field>
      </div>
      <Field label="운영기간 보충설명" error={errors.operationNote}>
        <input
          placeholder="예: 매주 수요일 14시, 온라인"
          value={c.operationNote}
          onChange={(e) => put("operationNote", e.target.value)}
        />
      </Field>
      <Field label="주요내용" error={errors.description}>
        <textarea
          rows={5}
          placeholder="프로그램을 소개해 주세요. 줄바꿈을 그대로 표시합니다."
          value={c.description}
          onChange={(e) => put("description", e.target.value)}
        />
      </Field>
      {c.type === "youthPolicy" && (
        <Field label="정책 혜택" error={errors.benefits}>
          <textarea
            rows={3}
            placeholder="지원금, 교육 기회 등 혜택을 입력하세요"
            value={c.benefits}
            onChange={(e) => put("benefits", e.target.value)}
          />
        </Field>
      )}
      <Field label="신청기간 유형">
        <select
          value={c.application.mode}
          onChange={(e) =>
            put("application", {
              mode: e.target.value as Content["application"]["mode"],
              startDate: null,
              endDate: null,
            })
          }
        >
          <option value="unknown">일정 미정</option>
          <option value="range">기간 지정</option>
          <option value="always">상시모집</option>
        </select>
      </Field>
      <small className="muted">
        상시·미정으로 전환하면 기존 신청 날짜가 지워집니다.
      </small>
      {c.application.mode === "range" && (
        <div className="two-fields">
          <Field label="신청 시작일" error={errors["application.startDate"]}>
            <input
              type="date"
              value={c.application.startDate || ""}
              onChange={(e) =>
                put("application", {
                  ...c.application,
                  startDate: e.target.value || null,
                })
              }
            />
          </Field>
          <Field label="신청 종료일 *" error={errors["application.endDate"]}>
            <input
              type="date"
              value={c.application.endDate || ""}
              onChange={(e) =>
                put("application", {
                  ...c.application,
                  endDate: e.target.value || null,
                })
              }
            />
          </Field>
        </div>
      )}
      <Field label="신청방법" error={errors.applicationMethod}>
        <textarea
          rows={2}
          value={c.applicationMethod}
          onChange={(e) => put("applicationMethod", e.target.value)}
        />
      </Field>
      <Field label="담당부서" error={errors.department}>
        <input
          value={c.department}
          onChange={(e) => put("department", e.target.value)}
        />
      </Field>
      <Field
        label={c.type === "youthPolicy" ? "신청사이트" : "신청 URL"}
        error={errors.url}
        hint="http:// 또는 https://로 시작하는 주소 · 미입력 시 신청 버튼 생략"
      >
        <input
          type="text"
          inputMode="url"
          placeholder="https://example.com"
          value={c.url || ""}
          onChange={(e) => put("url", e.target.value || null)}
        />
      </Field>
      <h3 className="form-section-title">이미지와 첨부자료</h3>
      <FileEditor
        images={c.images}
        attachments={c.attachments}
        onChange={(images, attachments) =>
          onChange({ ...c, images, attachments })
        }
      />
      {Object.keys(errors).length > 0 && (
        <p className="error">
          입력 오류 {Object.keys(errors).length}개를 해결하면 내보낼 수
          있습니다. 잘못된 원문은 복구 초안으로 보관합니다.
        </p>
      )}
    </>
  );
}
export function ContentEditor({
  doc,
  change,
  date,
  onStructural,
  focusProgram,
  readOnly = false,
}: {
  doc: Doc;
  change: (f: (d: Doc) => void) => void;
  date: string;
  onStructural: () => Promise<void>;
  focusProgram?: string;
  readOnly?: boolean;
}) {
  const [selected, setSelected] = useState(""),
    [categoryEdit, setCategoryEdit] = useState<Category>(),
    [deleting, setDeleting] = useState<Category>(),
    [destination, setDestination] = useState(""),
    [deleteItems, setDeleteItems] = useState(false),
    [recurring, setRecurring] = useState<Recurring[]>(),
    [picked, setPicked] = useState<string[]>([]);
  const notify = useNotice();
  useEffect(() => {
    if (focusProgram) setSelected(focusProgram);
  }, [focusProgram]);
  const p = doc.programs.find((p) => p.id === selected && !p.deletedAt);
  const cats = doc.categories
    .filter((c) => !c.deletedAt)
    .sort((a, b) => a.position - b.position);
  function structural(fn: (d: Doc) => void) {
    change(fn);
    return onStructural().then(
      () => true,
      () => false,
    );
  }
  function remove(p: Program) {
    const before = structuredClone(p);
    structural((d) => {
      d.programs.find((x) => x.id === p.id)!.deletedAt = now();
    });
    setSelected("");
    notify(`「${p.content.name}」을 삭제했습니다.`, () => {
      structural((d) => {
        const i = d.programs.findIndex((x) => x.id === p.id);
        if (i >= 0) d.programs[i] = before;
      });
    });
  }
  const moveCategory = (id: string, to: number) =>
    structural((d) => {
      const a = d.categories
        .filter((c) => !c.deletedAt)
        .sort((a, b) => a.position - b.position);
      reorder(
        a,
        a.findIndex((c) => c.id === id),
        to,
      );
    });
  const moveProgram = (p: Program, to: number) =>
    structural((d) => {
      const a = d.programs
        .filter((x) => x.categoryId === p.categoryId && !x.deletedAt)
        .sort((a, b) => a.position - b.position);
      reorder(
        a,
        a.findIndex((x) => x.id === p.id),
        to,
      );
    });
  const register = async (p: Program) => {
    if (!contentSchema.safeParse(p.content).success) {
      notify("입력 오류를 먼저 해결해 주세요.");
      return;
    }
    const c = cats.find((x) => x.id === p.categoryId)!;
    const id = uuid();
    await db.recurring.add({
      id,
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
    });
    structural((d) => {
      d.programs.find((x) => x.id === p.id)!.recurringTemplateId = id;
    });
    notify("상시 프로그램으로 등록했습니다. 다음 월부터 자동으로 불러옵니다.");
  };
  return (
    <fieldset className="editor-fieldset" disabled={readOnly}>
      {p ? (
        <div className="detail-panel">
          <button className="back-link" onClick={() => setSelected("")}>
            <ArrowLeft size={16} /> 프로그램 목록
          </button>
          <div className="detail-heading">
            <div>
              <span className="eyebrow">PROGRAM DETAILS</span>
              <h2>프로그램 상세</h2>
            </div>
            <button className="danger-ghost" onClick={() => remove(p)}>
              <Trash2 size={16} />
              삭제
            </button>
          </div>
          {p.scheduleNeedsReview && (
            <div className="warning">
              이전 월 일정이 복사되었습니다.
              <button
                onClick={() =>
                  structural((d) => {
                    d.programs.find((x) => x.id === p.id)!.scheduleNeedsReview =
                      false;
                  })
                }
              >
                일정 확인 완료
              </button>
            </div>
          )}
          <ContentForm
            content={p.content}
            onChange={(content) =>
              change((d) => {
                d.programs.find((x) => x.id === p.id)!.content = content;
              })
            }
          />
          <Field label="카테고리 이동">
            <select
              value={p.categoryId}
              onChange={(e) =>
                structural((d) => {
                  const x = d.programs.find((x) => x.id === p.id)!;
                  x.categoryId = e.target.value;
                  x.position =
                    d.programs.filter(
                      (q) => q.categoryId === e.target.value && !q.deletedAt,
                    ).length - 1;
                })
              }
            >
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Check
            checked={p.visible}
            onChange={(v) =>
              change((d) => {
                d.programs.find((x) => x.id === p.id)!.visible = v;
              })
            }
          >
            뉴스레터에 표시
          </Check>
          {p.content.type === "youthPolicy" && (
            <Check
              checked={p.recommendedThisMonth}
              onChange={(v) =>
                change((d) => {
                  d.programs.find((x) => x.id === p.id)!.recommendedThisMonth =
                    v;
                })
              }
            >
              이번 달 추천
            </Check>
          )}
          {p.recurringTemplateId ? (
            <a
              className="button full"
              href={"#/recurring?open=" + p.recurringTemplateId}
            >
              <ExternalLink size={16} />
              상시 원본 보기
            </a>
          ) : (
            <button className="full" onClick={() => void register(p)}>
              <LibraryBig size={17} />
              상시 프로그램으로 등록
            </button>
          )}
          <p className="inline-note">
            입력하면 자동으로 저장됩니다. 목록으로 돌아가도 변경 사항이
            유지됩니다.
          </p>
        </div>
      ) : (
        <>
          <div className="content-intro">
            <div>
              <span className="eyebrow">BUILD YOUR LETTER</span>
              <h2>이번 달의 소식을 담아보세요</h2>
              <p>이름을 입력하고 Enter. 자세한 내용은 나중에 채워도 좋아요.</p>
            </div>
            <button
              className="compact"
              onClick={async () => {
                setRecurring(
                  await db.recurring.filter((r) => !r.deletedAt).toArray(),
                );
                setPicked([]);
              }}
            >
              <LibraryBig size={16} />
              상시 불러오기
            </button>
          </div>
          {cats.map((c, index) => {
            const items = doc.programs
              .filter((p) => p.categoryId === c.id && !p.deletedAt)
              .sort((a, b) => a.position - b.position);
            return (
              <section
                className={"category " + (!c.visible ? "hidden-category" : "")}
                key={c.id}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const pid = e.dataTransfer.getData("program"),
                    cid = e.dataTransfer.getData("category");
                  if (pid)
                    structural((d) => {
                      const p = d.programs.find((x) => x.id === pid);
                      if (p) {
                        p.categoryId = c.id;
                        p.position = items.length;
                      }
                    });
                  if (cid && cid !== c.id) moveCategory(cid, index);
                }}
              >
                <div className="category-head">
                  <span
                    className="drag-handle"
                    draggable
                    onDragStart={(e) =>
                      e.dataTransfer.setData("category", c.id)
                    }
                    title="카테고리 드래그"
                  >
                    <GripVertical size={17} />
                  </span>
                  <span className="category-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <button
                    className="category-name"
                    onClick={() => setCategoryEdit(structuredClone(c))}
                  >
                    {c.name}
                  </button>
                  <span className="count">{items.length}</span>
                  <div className="order-actions">
                    <button
                      className="icon"
                      aria-label={`${c.name} 위로`}
                      disabled={index === 0}
                      onClick={() => moveCategory(c.id, index - 1)}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      className="icon"
                      aria-label={`${c.name} 아래로`}
                      disabled={index === cats.length - 1}
                      onClick={() => moveCategory(c.id, index + 1)}
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      className="icon"
                      aria-label={`${c.name} 삭제`}
                      onClick={() => {
                        setDeleting(c);
                        setDestination(
                          cats.find((x) => x.id !== c.id)?.id || "",
                        );
                        setDeleteItems(false);
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                {items.map((p, i) => (
                  <div
                    className={"program-row " + (!p.visible ? "muted-row" : "")}
                    key={p.id}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      const pid = e.dataTransfer.getData("program");
                      if (pid) {
                        e.preventDefault();
                        e.stopPropagation();
                        structural((d) => {
                          const x = d.programs.find((x) => x.id === pid)!;
                          const a = d.programs
                            .filter(
                              (x) =>
                                x.categoryId === c.id &&
                                !x.deletedAt &&
                                x.id !== pid,
                            )
                            .sort((a, b) => a.position - b.position);
                          x.categoryId = c.id;
                          a.splice(i, 0, x);
                          a.forEach((x, j) => (x.position = j));
                        });
                      }
                    }}
                  >
                    <span
                      className="drag-handle"
                      draggable
                      onDragStart={(e) =>
                        e.dataTransfer.setData("program", p.id)
                      }
                      title="프로그램 드래그"
                    >
                      <GripVertical size={15} />
                    </span>
                    <button
                      className="program-main"
                      onClick={() => setSelected(p.id)}
                    >
                      <strong>{p.content.name}</strong>
                      <span>
                        {!p.visible ? "숨김 · " : ""}
                        {status(p.content, date)}
                        {p.scheduleNeedsReview ? " · 일정 확인 필요" : ""}
                        {p.recurringTemplateId ? " · 상시 원본 연결" : ""}
                      </span>
                    </button>
                    <div className="order-actions">
                      <button
                        className="icon"
                        aria-label={`${p.content.name} 위로`}
                        disabled={i === 0}
                        onClick={() => moveProgram(p, i - 1)}
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        className="icon"
                        aria-label={`${p.content.name} 아래로`}
                        disabled={i === items.length - 1}
                        onClick={() => moveProgram(p, i + 1)}
                      >
                        <ArrowDown size={14} />
                      </button>
                      <button
                        className="icon"
                        aria-label={`${p.content.name} 삭제`}
                        onClick={() => remove(p)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
                <QuickAdd
                  category={c}
                  doc={doc}
                  onExisting={setSelected}
                  onAdd={(name) =>
                    structural((d) => d.programs.push(makeProgram(d, c, name)))
                  }
                />
                {!c.visible && (
                  <small className="inline-note">
                    <EyeOff size={12} /> 독자에게 보이지 않는 카테고리입니다.
                  </small>
                )}
              </section>
            );
          })}
          <button
            className="add-category"
            onClick={() => {
              const c = makeCategory(
                doc.id,
                "custom:" + uuid(),
                "새 카테고리",
                cats.length,
              );
              structural((d) => d.categories.push(c));
              setCategoryEdit(c);
            }}
          >
            <Plus size={17} /> 카테고리 추가
          </button>
        </>
      )}
      {categoryEdit && (
        <Modal title="카테고리 설정" onClose={() => setCategoryEdit(undefined)}>
          <Field label="카테고리 이름">
            <input
              maxLength={40}
              value={categoryEdit.name}
              onChange={(e) =>
                setCategoryEdit({ ...categoryEdit, name: e.target.value })
              }
            />
          </Field>
          <Check
            checked={categoryEdit.visible}
            onChange={(v) => setCategoryEdit({ ...categoryEdit, visible: v })}
          >
            뉴스레터에 표시
          </Check>
          <div className="modal-actions">
            <button onClick={() => setCategoryEdit(undefined)}>취소</button>
            <button
              className="primary"
              disabled={!categoryEdit.name.trim()}
              onClick={() => {
                structural((d) => {
                  const i = d.categories.findIndex(
                    (x) => x.id === categoryEdit.id,
                  );
                  d.categories[i] = categoryEdit;
                });
                setCategoryEdit(undefined);
              }}
            >
              설정 저장
            </button>
          </div>
        </Modal>
      )}
      {deleting && (
        <Modal title="카테고리 삭제" onClose={() => setDeleting(undefined)}>
          <p>「{deleting.name}」의 프로그램을 어떻게 할까요?</p>
          <Check checked={deleteItems} onChange={setDeleteItems}>
            포함 프로그램 함께 삭제
          </Check>
          {!deleteItems && (
            <Field label="프로그램을 이동할 카테고리">
              <select
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
              >
                <option value="">목적지 선택</option>
                {cats
                  .filter((c) => c.id !== deleting.id)
                  .map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </Field>
          )}
          <div className="modal-actions">
            <button onClick={() => setDeleting(undefined)}>취소</button>
            <button
              className="danger"
              disabled={!deleteItems && !destination}
              onClick={() => {
                const cat = structuredClone(deleting),
                  old = structuredClone(
                    doc.programs.filter((p) => p.categoryId === cat.id),
                  );
                structural((d) => {
                  d.categories.find((c) => c.id === cat.id)!.deletedAt = now();
                  d.programs
                    .filter((p) => p.categoryId === cat.id)
                    .forEach((p) => {
                      if (deleteItems) p.deletedAt = now();
                      else {
                        p.categoryId = destination;
                        p.position =
                          d.programs.filter(
                            (x) => x.categoryId === destination && !x.deletedAt,
                          ).length - 1;
                      }
                    });
                });
                setDeleting(undefined);
                notify("카테고리를 삭제했습니다.", () =>
                  structural((d) => {
                    d.categories[
                      d.categories.findIndex((c) => c.id === cat.id)
                    ] = cat;
                    for (const p of old)
                      d.programs[d.programs.findIndex((x) => x.id === p.id)] =
                        p;
                  }),
                );
              }}
            >
              삭제하기
            </button>
          </div>
        </Modal>
      )}
      {recurring && (
        <Modal
          title="상시 프로그램 불러오기"
          onClose={() => setRecurring(undefined)}
        >
          <p>
            직접 선택한 삭제 항목은 최신 원본으로 복구합니다. 이미 포함된 항목은
            중복 생성하지 않습니다.
          </p>
          {recurring.length === 0 ? (
            <p className="inline-note">
              상시 라이브러리가 비어 있습니다. 프로그램 상세에서 등록하거나 상시
              프로그램 메뉴에서 추가하세요.
            </p>
          ) : (
            recurring.map((r) => (
              <Check
                key={r.id}
                checked={picked.includes(r.id)}
                onChange={(v) =>
                  setPicked((a) =>
                    v ? [...a, r.id] : a.filter((x) => x !== r.id),
                  )
                }
              >
                {r.content.name}
                {doc.programs.some((p) => p.recurringTemplateId === r.id)
                  ? doc.programs.some(
                      (p) => p.recurringTemplateId === r.id && p.deletedAt,
                    )
                    ? " · 삭제됨 (선택 시 최신 내용 복구)"
                    : " · 이미 포함됨"
                  : ""}
              </Check>
            ))
          )}
          <div className="modal-actions">
            <button onClick={() => setRecurring(undefined)}>취소</button>
            <button
              className="primary"
              disabled={!picked.length}
              onClick={async () => {
                structural((d) => {
                  mergeRecurring(
                    d,
                    recurring.filter((r) => picked.includes(r.id)),
                    true,
                  );
                });
                setRecurring(undefined);
              }}
            >
              선택 항목 불러오기
            </button>
          </div>
        </Modal>
      )}
    </fieldset>
  );
}
function QuickAdd({
  category,
  doc,
  onAdd,
  onExisting,
}: {
  category: Category;
  doc: Doc;
  onAdd: (name: string) => Promise<boolean>;
  onExisting: (id: string) => void;
}) {
  const [value, set] = useState(""),
    [error, setError] = useState(""),
    [duplicate, setDuplicate] = useState("");
  const pending = useRef(false);
  async function submit() {
    if (pending.current) return;
    const name = value.trim();
    if (!name) return;
    if (Array.from(name).length > 120) {
      setError("이름은 120자 이내로 입력해 주세요");
      return;
    }
    const p = doc.programs.find(
      (p) =>
        !p.deletedAt &&
        p.categoryId === category.id &&
        p.content.name.trim() === name,
    );
    if (p) {
      setError("같은 이름이 있습니다");
      setDuplicate(p.id);
      return;
    }
    pending.current = true;
    const original = value;
    const saved = await onAdd(name);
    pending.current = false;
    if (!saved) {
      set(original);
      setError(
        "추가 내용을 저장하지 못했습니다. 원문을 유지했습니다. 상단에서 저장을 재시도해 주세요.",
      );
      return;
    }
    set((v) => (v === original ? "" : v));
    setError("");
    setDuplicate("");
  }
  return (
    <>
      <div className="quick-add">
        <Plus size={16} />
        <input
          aria-label={`${category.name} 프로그램명`}
          placeholder="프로그램명을 입력하고 Enter"
          value={value}
          onChange={(e) => set(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.nativeEvent.isComposing &&
              e.keyCode !== 229
            ) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button onClick={submit}>추가</button>
      </div>
      {error && (
        <p className="error">
          {error}{" "}
          {duplicate && (
            <button onClick={() => onExisting(duplicate)}>
              기존 항목 열기
            </button>
          )}
        </p>
      )}
    </>
  );
}
