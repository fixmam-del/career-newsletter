import { type CSSProperties } from "react";
import { type Doc, type ImageRef, selected, status } from "./domain";
import "./document.css";
export type AssetView = { url: string; name: string };
export function contrast(hex: string) {
  const rgb = hex
    .slice(1)
    .match(/../g)!
    .map((s) => {
      const v = parseInt(s, 16) / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
  const luminance = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  return (luminance + 0.05) / (0.026 + 0.05) >= 1.05 / (luminance + 0.05)
    ? "#172D4E"
    : "#FFFFFF";
}
export function NewsletterDocument({
  doc,
  date,
  assets = {},
  mode = "html",
}: {
  doc: Doc;
  date: string;
  assets?: Record<string, AssetView>;
  mode?: "html" | "image" | "print";
}) {
  const image = (r: ImageRef | null, cls?: string) =>
    r?.publicIncluded && assets[r.assetId] ? (
      <img
        className={cls}
        src={assets[r.assetId].url}
        alt={r.decorative ? "" : r.alt}
      />
    ) : null;
  const inst = doc.institutionSnapshot;
  return (
    <article
      className="newsletter"
      style={
        {
          "--accent": /^#[\da-f]{6}$/i.test(doc.design.accentColor)
            ? doc.design.accentColor
            : "#005bac",
          "--decoration-turn": `${doc.design.themeId * 27}deg`,
          "--decoration-round": `${35 + (doc.design.themeId % 4) * 15}%`,
          "--decoration-top": `${-130 + (doc.design.themeId % 4) * 23}px`,
          "--head-ink": contrast(
            /^#[\da-f]{6}$/i.test(doc.design.accentColor)
              ? doc.design.accentColor
              : "#005bac",
          ),
        } as CSSProperties
      }
    >
      <header className="doc-head">
        <div className="doc-brand">
          {image(inst.logo, "doc-logo")}
          <strong>
            {inst.institutionName || "우리의 내일을 위한 뉴스레터"}
          </strong>
          <span>{inst.departmentName}</span>
        </div>
        <div className="doc-month">
          CAREER LETTER · {doc.yearMonth.replace("-", " / ")}
        </div>
        <h1>{doc.title}</h1>
        <p>{doc.design.headerText}</p>
      </header>
      {doc.design.headerImage?.publicIncluded &&
        assets[doc.design.headerImage.assetId] && (
          <img
            className="doc-header-image"
            style={{ objectFit: doc.design.headerFit }}
            src={assets[doc.design.headerImage.assetId].url}
            alt={doc.design.headerImage.alt}
          />
        )}
      {selected(doc, date).map((c, i) => (
        <section className="doc-section" key={c.id}>
          <h2>
            <span>{String(i + 1).padStart(2, "0")}</span>
            {c.name}
          </h2>
          {c.items.map((p) => {
            const x = p.content,
              s = status(x, date);
            const fields = [
              ["대상", x.target],
              [
                "운영기간",
                [x.operationStart, x.operationEnd].filter(Boolean).join(" ~ ") +
                  (x.operationNote ? ` ${x.operationNote}` : ""),
              ],
              ["주요내용", x.description],
              ["혜택", x.type === "youthPolicy" ? x.benefits : ""],
              [
                "신청기간",
                x.application.mode === "range"
                  ? [x.application.startDate, x.application.endDate]
                      .filter(Boolean)
                      .join(" ~ ")
                  : x.application.mode === "always"
                    ? "상시모집"
                    : "",
              ],
              ["신청방법", x.applicationMethod],
              ["담당부서", x.department],
            ];
            return (
              <div
                className={
                  "doc-card" + (x.description.length > 1000 ? " tall" : "")
                }
                key={p.id}
              >
                {image(x.images[0])}
                <h3>{x.name}</h3>
                {p.recommendedThisMonth && (
                  <span className="doc-badge recommended">이번 달 추천</span>
                )}
                <span
                  className={
                    "doc-badge " + (/D-[1-3]$|오늘/.test(s) ? "urgent" : "")
                  }
                >
                  {s}
                </span>
                <dl>
                  {fields
                    .filter(([, v]) => v.trim())
                    .map(([k, v]) => (
                      <FragmentPair key={k} label={k} value={v} />
                    ))}
                </dl>
                {x.url && /^https?:\/\//i.test(x.url) && (
                  <>
                    <a
                      className="doc-link"
                      href={x.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {x.type === "youthPolicy"
                        ? "신청사이트"
                        : "자세히 보기 · 신청"}{" "}
                      ↗
                    </a>
                    {mode === "print" && (
                      <div className="print-url">{x.url}</div>
                    )}
                  </>
                )}
                {x.images.slice(1).map((r) => (
                  <span key={r.assetId}>{image(r)}</span>
                ))}
                {x.attachments
                  .filter((r) => r.publicIncluded && assets[r.assetId])
                  .map((r) =>
                    mode === "html" ? (
                      <a
                        className="doc-attachment"
                        key={r.assetId}
                        href={assets[r.assetId].url}
                        download={assets[r.assetId].name}
                      >
                        첨부: {assets[r.assetId].name} · 파일 다운로드
                      </a>
                    ) : (
                      <p className="doc-attachment" key={r.assetId}>
                        첨부: {assets[r.assetId].name} (원문 웹 뉴스레터 참고)
                      </p>
                    ),
                  )}
              </div>
            );
          })}
        </section>
      ))}
      <footer className="doc-foot">
        <strong>
          {inst.institutionName} {inst.departmentName}
        </strong>
        {inst.contactText && <p>{inst.contactText}</p>}
        {inst.websiteUrl && (
          <p>
            <a href={inst.websiteUrl} target="_blank" rel="noopener noreferrer">
              {inst.websiteUrl}
            </a>
          </p>
        )}
        <p>생성 기준일 {date} · 함께 여는 내일의 가능성</p>
      </footer>
    </article>
  );
}
function FragmentPair({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}
