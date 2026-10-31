import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Plus,
  Search,
  LibraryBig,
  ArrowLeft,
  Trash2,
  Save,
} from "lucide-react";
import {
  type Recurring,
  blankContent,
  defaults,
  uuid,
  now,
  recurringSchema,
  contentSchema,
} from "./domain";
import { db } from "./storage";
import { Field, Check, Modal, useNotice } from "./ui";
import { ContentForm } from "./ContentEditor";
export function RecurringPage() {
  const [items, setItems] = useState<Recurring[]>([]),
    [search, setSearch] = useState(""),
    [edit, setEdit] = useState<Recurring>(),
    [deleting, setDeleting] = useState<Recurring>(),
    [busy, setBusy] = useState(false);
  const notify = useNotice();
  const refresh = async () =>
    setItems(await db.recurring.filter((r) => !r.deletedAt).toArray());
  useEffect(() => {
    void refresh().then(() => {
      const id = new URLSearchParams(location.hash.split("?")[1]).get("open");
      if (id)
        void db.recurring.get(id).then((r) => {
          if (r && !r.deletedAt) setEdit(r);
        });
    });
  }, []);
  const add = () =>
    setEdit({
      id: uuid(),
      content: blankContent(),
      targetCategory: {
        key: "ongoing",
        name: "상시지원 프로그램",
        defaultItemType: "program",
      },
      autoInclude: true,
      deletedAt: null,
      createdAt: now(),
      updatedAt: now(),
    });
  const save = async () => {
    if (!edit) return;
    setBusy(true);
    try {
      const r = recurringSchema.parse({ ...edit, updatedAt: now() });
      await db.recurring.put(r);
      setEdit(undefined);
      await refresh();
      notify("상시 프로그램을 저장했습니다. 기존 월의 내용은 유지됩니다.");
    } catch (e) {
      notify("입력을 확인해 주세요. " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="page recurring-page">
      <div className="section-heading">
        <div>
          <span className="eyebrow">REUSABLE OPPORTUNITIES</span>
          <h1>상시 프로그램</h1>
          <p className="page-description">
            한 번 담아 두면, 다음 달에도 이어지는 기회.
          </p>
        </div>
        <button className="primary" onClick={add}>
          <Plus size={18} />
          상시 프로그램 추가
        </button>
      </div>
      <div className="recurring-info">
        <LibraryBig size={25} />
        <p>
          자동 불러오기가 켜진 원본은 새 뉴스레터를 만들 때 한 번씩 복사됩니다.
          <br />
          <strong>
            원본을 수정해도 이미 발행한 월의 내용은 바뀌지 않습니다.
          </strong>
        </p>
      </div>
      {edit ? (
        <section className="settings-panel recurring-form">
          <button className="back-link" onClick={() => setEdit(undefined)}>
            <ArrowLeft size={16} />
            상시 목록으로 · 변경 취소
          </button>
          <h2>상시 프로그램 편집</h2>
          <Field label="항목 유형">
            <select
              value={edit.content.type}
              onChange={(e) =>
                setEdit({
                  ...edit,
                  content: {
                    ...edit.content,
                    type: e.target.value as "program" | "youthPolicy",
                    benefits: "",
                  },
                })
              }
            >
              <option value="program">일반 프로그램</option>
              <option value="youthPolicy">청년정책</option>
            </select>
          </Field>
          <ContentForm
            content={edit.content}
            onChange={(c) => setEdit({ ...edit, content: c })}
          />
          <Field label="기본 카테고리">
            <select
              value={edit.targetCategory.key}
              onChange={(e) => {
                const [key, name] = defaults.find(
                  ([k]) => k === e.target.value,
                )!;
                setEdit({
                  ...edit,
                  targetCategory: {
                    key,
                    name,
                    defaultItemType:
                      key === "youth-policy" ? "youthPolicy" : "program",
                  },
                });
              }}
            >
              {defaults.map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </select>
          </Field>
          <Check
            checked={edit.autoInclude}
            onChange={(v) => setEdit({ ...edit, autoInclude: v })}
          >
            월 생성 시 자동 불러오기
          </Check>
          <button
            className="primary"
            disabled={busy || !contentSchema.safeParse(edit.content).success}
            onClick={() => void save()}
          >
            <Save size={16} />
            상시 원본 저장
          </button>
        </section>
      ) : (
        <>
          <label className="search-box recurring-search">
            <Search size={18} />
            <input
              aria-label="상시 프로그램 이름 검색"
              placeholder="프로그램 이름 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          {items.length === 0 ? (
            <div className="empty-state">
              <LibraryBig size={36} />
              <h3>자주 만나는 프로그램을 담아 두세요</h3>
              <p>
                진로상담, 상시 멘토링 등 매달 반복되는 프로그램을 등록하세요.
              </p>
              <button onClick={add}>
                첫 상시 프로그램 추가 <Plus size={16} />
              </button>
            </div>
          ) : (
            <div className="recurring-list">
              {items
                .filter((r) =>
                  r.content.name
                    .toLowerCase()
                    .includes(search.trim().toLowerCase()),
                )
                .map((r) => (
                  <article key={r.id}>
                    <div className="recurring-item-icon">
                      <LibraryBig size={23} />
                    </div>
                    <button
                      className="recurring-item-title"
                      onClick={() => setEdit(structuredClone(r))}
                    >
                      <small>{r.targetCategory.name}</small>
                      <strong>{r.content.name}</strong>
                      <span>{r.content.target || "대상 미입력"}</span>
                    </button>
                    <Check
                      checked={r.autoInclude}
                      onChange={async (v) => {
                        await db.recurring.put({
                          ...r,
                          autoInclude: v,
                          updatedAt: now(),
                        });
                        await refresh();
                      }}
                    >
                      자동 불러오기 {r.autoInclude ? "ON" : "OFF"}
                    </Check>
                    <button onClick={() => setEdit(structuredClone(r))}>
                      편집
                    </button>
                    <button
                      className="icon"
                      aria-label={`${r.content.name} 삭제`}
                      onClick={() => setDeleting(r)}
                    >
                      <Trash2 size={17} />
                    </button>
                  </article>
                ))}
            </div>
          )}
        </>
      )}
      {deleting && (
        <Modal
          title="상시 원본을 삭제할까요?"
          onClose={() => setDeleting(undefined)}
        >
          <p>「{deleting.content.name}」</p>
          <p>
            기존 월에 들어간 내용은 유지됩니다. 이후 새 월에 자동으로 불러오지
            않습니다.
          </p>
          <div className="modal-actions">
            <button onClick={() => setDeleting(undefined)}>취소</button>
            <button
              className="danger"
              onClick={async () => {
                await db.recurring.put({ ...deleting, deletedAt: now() });
                setDeleting(undefined);
                await refresh();
                notify("상시 원본을 삭제했습니다.");
              }}
            >
              상시 원본 삭제
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
