import { useState, useEffect } from "react";
import {
  Download,
  Upload,
  HardDrive,
  ShieldCheck,
  ArrowRight,
  Save,
} from "lucide-react";
import { type Settings, initialSettings, settingsSchema, now } from "./domain";
import { db, getSettings } from "./storage";
const backup = async () => (await import("./backup")).backup();
const inspectBackup = async (file: File) =>
  (await import("./backup")).inspectBackup(file);
const restoreBackup = async (
  checked: Awaited<ReturnType<typeof inspectBackup>>,
) => (await import("./backup")).restoreBackup(checked);
import { Field, Check, Modal, useNotice } from "./ui";
import { FileEditor } from "./ContentEditor";
export function SettingsPage() {
  const [s, set] = useState<Settings>(initialSettings()),
    [usage, setUsage] = useState("확인 중"),
    [checked, setChecked] =
      useState<Awaited<ReturnType<typeof inspectBackup>>>(),
    [confirmReplace, setConfirm] = useState(false),
    [busy, setBusy] = useState(false);
  const notify = useNotice();
  useEffect(() => {
    void getSettings().then(set);
    void navigator.storage
      ?.estimate?.()
      .then((e) =>
        setUsage(
          `${((e.usage || 0) / 1024 / 1024).toFixed(1)} MB 사용 / ${((e.quota || 0) / 1024 / 1024 / 1024).toFixed(1)} GB 추정 할당`,
        ),
      );
  }, []);
  const result = settingsSchema.safeParse(s);
  const errors: Record<string, string> = {};
  if (!result.success)
    for (const e of result.error.issues) errors[e.path.join(".")] = e.message;
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      notify("처리에 실패했습니다. " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="page settings-page">
      <span className="eyebrow">YOUR WORKSPACE, YOUR DATA</span>
      <h1>설정·백업</h1>
      <p className="page-description">
        우리 기관의 기본 정보를 설정하고, 소중한 자료를 보관하세요.
      </p>
      <div className="settings-grid">
        <section className="settings-panel">
          <div className="panel-title">
            <div className="panel-icon">
              <ShieldCheck size={23} />
            </div>
            <div>
              <h2>기관 기본정보</h2>
              <p>새 뉴스레터에만 적용됩니다.</p>
            </div>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const parsed = settingsSchema.parse({ ...s, updatedAt: now() });
                await db.settings.put(parsed);
                notify("기관 기본정보를 저장했습니다.");
              });
            }}
          >
            <Field label="기관명" error={errors.institutionName}>
              <input
                placeholder="기관명을 입력해 주세요"
                value={s.institutionName}
                onChange={(e) => set({ ...s, institutionName: e.target.value })}
              />
            </Field>
            <Field label="부서명" error={errors.departmentName}>
              <input
                placeholder="예: 대학일자리플러스센터"
                value={s.departmentName}
                onChange={(e) => set({ ...s, departmentName: e.target.value })}
              />
            </Field>
            <Field label="기본 연락처" error={errors.contactText}>
              <textarea
                rows={2}
                placeholder="전화, 이메일, 운영시간 등"
                value={s.contactText}
                onChange={(e) => set({ ...s, contactText: e.target.value })}
              />
            </Field>
            <Field label="웹사이트" error={errors.websiteUrl}>
              <input
                placeholder="https://example.com"
                value={s.websiteUrl || ""}
                onChange={(e) =>
                  set({ ...s, websiteUrl: e.target.value || null })
                }
              />
            </Field>
            <Check
              checked={s.defaultImportRecurring}
              onChange={(v) => set({ ...s, defaultImportRecurring: v })}
            >
              새 월에 활성 상시 프로그램 자동 불러오기
            </Check>
            <button className="primary" disabled={busy || !result.success}>
              <Save size={16} />
              기본정보 저장
            </button>
          </form>
          <h3 className="form-section-title">기관 로고</h3>
          <FileEditor
            allowAttachments={false}
            imageLimit={1}
            images={s.logo ? [s.logo] : []}
            attachments={[]}
            onChange={(images) => set({ ...s, logo: images.at(-1) || null })}
          />
          <p className="inline-note">
            로고 변경 후 ‘기본정보 저장’을 눌러 주세요. 기존 월에는 편집기의
            ‘기관 기본정보 다시 가져오기’로 적용합니다.
          </p>
        </section>
        <div>
          <section className="settings-panel backup-panel">
            <span className="eyebrow">KEEP YOUR STORIES SAFE</span>
            <h2>
              기록은 오래,
              <br />
              보관은 안전하게.
            </h2>
            <p>
              백업 파일 하나에 뉴스레터, 디자인, 상시 프로그램과 모든 연결
              파일을 담습니다.
            </p>
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await backup();
                  set(await getSettings());
                  notify(
                    "전체 백업을 다운로드했습니다. 안전한 곳에 보관해 주세요.",
                  );
                })
              }
            >
              <Download size={17} />
              전체 백업 다운로드
            </button>
            <small>비공개 첨부도 포함하는 내부 보관용 ZIP입니다.</small>
            <div className="backup-last">
              마지막 백업{" "}
              <strong>
                {s.lastBackupDownloadedAt
                  ? new Date(s.lastBackupDownloadedAt).toLocaleString("ko-KR", {
                      timeZone: "Asia/Seoul",
                    })
                  : "아직 다운로드하지 않았습니다"}
              </strong>
            </div>
          </section>
          <section className="settings-panel">
            <h3>백업 가져오기</h3>
            <p className="muted">
              파일 검증 후 현재 자료를 전체 교체합니다. 먼저 현재 자료를 백업해
              주세요.
            </p>
            <label className={"button " + (busy ? "disabled" : "")}>
              <Upload size={17} />
              백업 ZIP 선택
              <input
                type="file"
                accept=".zip"
                hidden
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f)
                    void run(async () => {
                      const c = await inspectBackup(f);
                      setChecked(c);
                      setConfirm(false);
                    });
                  e.target.value = "";
                }}
              />
            </label>
          </section>
          <section className="settings-panel storage-panel">
            <HardDrive size={22} />
            <div>
              <h3>이 브라우저의 저장공간</h3>
              <p>{usage}</p>
              <p>
                같은 주소 · 같은 포트 · 같은 브라우저 프로필에 저장됩니다. 공용
                PC에서는 자료가 남습니다. 시크릿 모드 종료나 브라우저 데이터
                삭제 시 사라질 수 있습니다.
              </p>
              <button
                onClick={() =>
                  void navigator.storage
                    ?.persist?.()
                    .then((ok) =>
                      notify(
                        ok
                          ? "영구 저장 권한이 허용되었습니다."
                          : "브라우저가 영구 저장 권한을 허용하지 않았습니다. 기본 저장은 계속 사용할 수 있습니다.",
                      ),
                    )
                }
              >
                저장공간 유지 권한 요청 <ArrowRight size={15} />
              </button>
            </div>
          </section>
        </div>
      </div>
      {busy && (
        <p className="busy-banner" role="status">
          파일을 검증하고 처리하는 중입니다. 잠시 기다려 주세요.
        </p>
      )}
      {checked && (
        <Modal
          title="백업으로 전체 교체"
          onClose={() => {
            if (!busy) setChecked(undefined);
          }}
        >
          <p>검증된 백업입니다. 아래 자료로 현재 데이터를 교체합니다.</p>
          <div className="export-summary">
            <p>기관: {checked.data.settings[0]?.institutionName || "미설정"}</p>
            <p>
              뉴스레터 {checked.data.newsletters.length}개 · 프로그램{" "}
              {checked.data.programs.length}개 · 파일 {checked.assets.length}개
            </p>
          </div>
          <button disabled={busy} onClick={() => void run(backup)}>
            <Download size={16} />
            현재 자료 백업
          </button>
          <Check checked={confirmReplace} onChange={setConfirm}>
            기존 데이터 전체 교체를 확인합니다
          </Check>
          <div className="modal-actions">
            <button disabled={busy} onClick={() => setChecked(undefined)}>
              취소
            </button>
            <button
              className="danger"
              disabled={busy || !confirmReplace}
              onClick={() =>
                void run(async () => {
                  await restoreBackup(checked);
                  setChecked(undefined);
                  set(await getSettings());
                  notify("백업 복원을 완료했습니다.");
                })
              }
            >
              검증된 백업으로 교체
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
