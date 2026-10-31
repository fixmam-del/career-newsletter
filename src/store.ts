import { create } from "zustand";
import { type Doc, docErrors } from "./domain";
import { db, loadDoc, saveDoc } from "./storage";
type State = {
  doc: Doc | null;
  version: number;
  savedVersion: number;
  status: string;
  error: string;
  readOnly: boolean;
  open: (id: string) => Promise<void>;
  change: (fn: (d: Doc) => void) => void;
  save: () => Promise<void>;
};
let timer: ReturnType<typeof setTimeout> | undefined,
  maxTimer: ReturnType<typeof setTimeout> | undefined,
  queue = Promise.resolve();
let releaseLock: (() => void) | undefined;
export const closeEditor = () => {
  releaseLock?.();
  releaseLock = undefined;
};
const channel =
  typeof window !== "undefined" && window.BroadcastChannel
    ? new BroadcastChannel("career-newsletter-revisions")
    : null;
channel?.addEventListener("message", (event) => {
  const state = editor.getState(),
    msg = event.data;
  if (state.doc?.id === msg.id && msg.revision > state.doc!.revision)
    editor.setState({
      readOnly: true,
      error:
        "다른 탭에서 최신 자료를 저장했습니다. 초안을 받은 뒤 최신 문서를 다시 불러와 주세요.",
    });
});
export const editor = create<State>((set, get) => ({
  doc: null,
  version: 0,
  savedVersion: 0,
  status: "불러오는 중",
  error: "",
  readOnly: false,
  open: async (id) => {
    releaseLock?.();
    releaseLock = undefined;
    clearTimeout(timer);
    clearTimeout(maxTimer);
    const d = await loadDoc(id);
    const recovery = await db.drafts.get(id);
    set({
      doc: d
        ? recovery
          ? { ...recovery.raw, revision: d.revision }
          : d
        : null,
      version: 0,
      savedVersion: 0,
      status: recovery ? "입력 확인 필요" : "저장됨",
      error: "",
      readOnly: false,
    });
    if (navigator.locks) {
      void navigator.locks.request(
        "newsletter:" + id,
        { ifAvailable: true },
        async (lock) => {
          if (!lock) {
            set({
              readOnly: true,
              error: "다른 탭에서 편집 중입니다. 이 탭은 읽기 전용입니다.",
            });
            return;
          }
          await new Promise<void>((r) => {
            releaseLock = r;
          });
        },
      );
    }
  },
  change: (fn) => {
    if (get().readOnly) return;
    const d = get().doc;
    if (!d) return;
    const copy = structuredClone(d);
    fn(copy);
    set({
      doc: copy,
      version: get().version + 1,
      status: "저장되지 않은 변경",
    });
    clearTimeout(timer);
    timer = setTimeout(() => {
      void get()
        .save()
        .catch(() => {});
    }, 800);
    if (!maxTimer)
      maxTimer = setTimeout(() => {
        maxTimer = undefined;
        void get()
          .save()
          .catch(() => {});
      }, 5000);
  },
  save: () => {
    clearTimeout(timer);
    clearTimeout(maxTimer);
    maxTimer = undefined;
    const task = queue
      .catch(() => {})
      .then(async () => {
        const { doc, version, savedVersion, readOnly } = get();
        if (!doc || readOnly || version === savedVersion) return;
        set({ status: "저장 중" });
        try {
          const revision = await saveDoc(doc);
          channel?.postMessage({ id: doc.id, revision });
          set((s) => ({
            doc: s.doc?.id === doc.id ? { ...s.doc, revision } : s.doc,
            savedVersion: s.doc?.id === doc.id ? version : s.savedVersion,
            status:
              s.version === version
                ? Object.keys(docErrors(s.doc!)).length
                  ? "입력 확인 필요"
                  : `저장됨 ${new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`
                : "저장되지 않은 변경",
            error: "",
          }));
        } catch (e) {
          set({ status: "저장 실패", error: (e as Error).message });
          throw e;
        }
      });
    queue = task;
    return task;
  },
}));
