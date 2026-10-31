import {
  useEffect,
  useRef,
  useState,
  createContext,
  useContext,
  cloneElement,
  isValidElement,
  useId,
  type ReactNode,
} from "react";
import { X, CheckCircle2, Info, Undo2 } from "lucide-react";
type Notice = {
  id: string;
  text: string;
  undo?: () => void | Promise<unknown>;
  remaining: number;
  paused: boolean;
};
export const NoticeContext = createContext<
  (text: string, undo?: () => void | Promise<unknown>) => void
>(() => {});
export const useNotice = () => useContext(NoticeContext);
export function Notices({ children }: { children: ReactNode }) {
  const [items, set] = useState<Notice[]>([]);
  const notify = (text: string, undo?: () => void | Promise<unknown>) =>
    set((a) => [
      ...a,
      {
        id: crypto.randomUUID(),
        text,
        undo,
        remaining: undo
          ? 8000
          : /실패|못했|잘못|충돌|오류|부족|확인해/.test(text)
            ? Infinity
            : 5000,
        paused: false,
      },
    ]);
  useEffect(() => {
    const i = setInterval(
      () =>
        set((a) =>
          a
            .map((n) => ({
              ...n,
              remaining: n.paused ? n.remaining : n.remaining - 250,
            }))
            .filter((n) => n.remaining > 0),
        ),
      250,
    );
    return () => clearInterval(i);
  }, []);
  const pause = (id: string, p: boolean) =>
    set((a) => a.map((n) => (n.id === id ? { ...n, paused: p } : n)));
  return (
    <NoticeContext.Provider value={notify}>
      {children}
      <div className="notices" aria-live="polite">
        {items.map((n) => (
          <div
            className="notice"
            key={n.id}
            onMouseEnter={() => pause(n.id, true)}
            onMouseLeave={() => pause(n.id, false)}
            onFocus={() => pause(n.id, true)}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget))
                pause(n.id, false);
            }}
          >
            <Info size={18} />
            <span>{n.text}</span>
            {n.undo && (
              <button
                onClick={async () => {
                  try {
                    await n.undo!();
                    set((a) => a.filter((v) => v.id !== n.id));
                  } catch (e) {
                    notify((e as Error).message);
                  }
                }}
              >
                <Undo2 size={16} />
                실행취소
              </button>
            )}
            <button
              aria-label="알림 닫기"
              onClick={() => set((a) => a.filter((v) => v.id !== n.id))}
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </NoticeContext.Provider>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const active = document.activeElement as HTMLElement;
    ref.current?.showModal();
    return () => active?.focus();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={"modal " + (wide ? "wide" : "")}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-head">
        <h2 id={titleId}>{title}</h2>
        <button className="icon" onClick={onClose} aria-label="대화상자 닫기">
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Field({
  label,
  error,
  children,
  hint,
}: {
  label: string;
  error?: string;
  children: ReactNode;
  hint?: string;
}) {
  const id = useId();
  const control =
    isValidElement(children) && typeof children.type === "string"
      ? cloneElement(children as React.ReactElement<Record<string, unknown>>, {
          "aria-label": label,
          "aria-invalid": !!error,
          "aria-describedby": error || hint ? id : undefined,
        })
      : children;
  return (
    <label className={"field " + (error ? "invalid" : "")}>
      <span>{label}</span>
      {control}
      {error ? (
        <small id={id} role="alert">
          {error}
        </small>
      ) : hint ? (
        <small id={id}>{hint}</small>
      ) : null}
    </label>
  );
}
export function Check({
  checked,
  onChange,
  children,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className="check">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{children}</span>
    </label>
  );
}
export function SaveBadge({ text }: { text: string }) {
  return (
    <span className="save-badge">
      <CheckCircle2 size={15} />
      {text}
    </span>
  );
}
