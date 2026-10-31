import { renderToStaticMarkup } from "react-dom/server";
import { toBlob, toJpeg } from "html-to-image";
import { zipSync } from "fflate";
import { NewsletterDocument, type AssetView } from "./Document";
import { type Doc, selected } from "./domain";
import { db } from "./storage";
import { dataUrl, download } from "./assets";
import css from "./document.css?raw";
export async function publicAssets(d: Doc) {
  const ids = new Set<string>();
  const scan = (v: unknown) => {
    if (v && typeof v === "object") {
      if ("assetId" in v && "publicIncluded" in v && v.publicIncluded)
        ids.add(String(v.assetId));
      Object.values(v).forEach(scan);
    }
  };
  // 호출부에서 기준일에 맞는 독자용 프로그램만 넘깁니다.
  scan([d.institutionSnapshot, d.design, d.programs]);
  const assets: Record<string, AssetView> = {};
  for (const id of ids) {
    const a = await db.assets.get(id);
    if (!a) throw Error("공개 파일을 찾을 수 없습니다");
    assets[id] = { url: await dataUrl(a.originalBlob), name: a.originalName };
  }
  return assets;
}
export async function exportDoc(
  d: Doc,
  date: string,
  format: "html" | "png" | "jpg" | "pdf",
  width = 1600,
) {
  const safe = structuredClone(d);
  const visible = selected(safe, date);
  safe.programs = visible.flatMap((c) => c.items);
  safe.categories = visible.map(({ items: _, ...c }) => c);
  const assets = await publicAssets(safe);
  const mode =
    format === "html" ? "html" : format === "pdf" ? "print" : "image";
  const markup = renderToStaticMarkup(
    <NewsletterDocument doc={safe} date={date} assets={assets} mode={mode} />,
  );
  const html = `<!doctype html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>월간 커리어 뉴스레터</title><style>body{margin:0;background:#f1f5f9}${css}</style></head><body>${markup}</body></html>`;
  const stem = `career-newsletter-${d.yearMonth}`;
  if (format === "html") {
    const b = new Blob([html], { type: "text/html;charset=utf-8" });
    if (b.size > 50 * 1024 * 1024)
      throw Error("HTML이 50MB를 넘습니다. 공개 첨부를 줄여 주세요");
    if (
      b.size > 30 * 1024 * 1024 &&
      !confirm("HTML이 30MB를 넘습니다. 계속 다운로드할까요?")
    )
      return;
    download(b, stem + ".html");
    return;
  }
  if (format === "pdf") {
    const blob = new Blob([html], { type: "text/html" }),
      url = URL.createObjectURL(blob);
    const frame = document.createElement("iframe");
    frame.style.cssText =
      "position:fixed;left:-10000px;width:800px;height:1000px";
    frame.src = url;
    const loaded = new Promise<void>((resolve, reject) => {
      frame.onload = () => resolve();
      frame.onerror = () => reject(Error("인쇄 문서를 열 수 없습니다"));
    });
    document.body.append(frame);
    await loaded;
    await frame.contentDocument!.fonts.ready;
    await Promise.all(
      Array.from(frame.contentDocument!.images).map((i) => i.decode()),
    );
    frame.contentWindow!.focus();
    frame.contentWindow!.print();
    setTimeout(() => {
      frame.remove();
      URL.revokeObjectURL(url);
    }, 60000);
    return;
  }
  const root = document.createElement("div");
  root.style.cssText =
    "position:fixed;left:-10000px;top:0;width:800px;background:white;";
  root.innerHTML = markup;
  document.body.append(root);
  try {
    await document.fonts.ready;
    await Promise.all(
      Array.from(root.querySelectorAll("img")).map((i) => i.decode()),
    );
    const article = root.firstElementChild as HTMLElement;
    const blocks: HTMLElement[] = [];
    for (const el of Array.from(article.children)) {
      if (el.classList.contains("doc-section")) {
        const h = el.firstElementChild!;
        let first = true;
        for (const card of Array.from(el.children).slice(1)) {
          const section = document.createElement("section");
          section.className = "doc-section";
          if (first) section.append(h.cloneNode(true));
          section.append(card.cloneNode(true));
          first = false;
          blocks.push(section);
        }
      } else blocks.push(el.cloneNode(true) as HTMLElement);
    }
    const max = 8000 / (width / 800),
      parts: HTMLElement[] = [];
    let page = article.cloneNode(false) as HTMLElement;
    root.append(page);
    const segments: HTMLElement[] = [];
    for (const block of blocks) {
      page.append(block);
      const height = block.getBoundingClientRect().height;
      block.remove();
      if (height <= max) segments.push(block);
      else
        for (let top = 0; top < height; top += max - 32) {
          const crop = document.createElement("div");
          crop.style.cssText = `height:${Math.min(max - 32, height - top)}px;position:relative;overflow:hidden;`;
          const copy = block.cloneNode(true) as HTMLElement;
          copy.style.cssText = `position:absolute;left:0;right:0;top:-${top}px;`;
          crop.append(copy);
          segments.push(crop);
        }
    }
    for (const block of segments) {
      page.append(block);
      if (
        page.getBoundingClientRect().height > max &&
        page.children.length > 1
      ) {
        page.removeChild(block);
        parts.push(page);
        page = article.cloneNode(false) as HTMLElement;
        root.append(page);
        page.append(block);
      }
    }
    parts.push(page);
    article.remove();
    const files: Record<string, Uint8Array> = {};
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      const opt = {
        pixelRatio: width / 800,
        backgroundColor: "#ffffff",
        cacheBust: false,
      };
      let blob: Blob;
      if (format === "jpg") {
        const url = await toJpeg(p, { ...opt, quality: 0.9 });
        const [head, body] = url.split(",");
        blob = new Blob([Uint8Array.from(atob(body), (c) => c.charCodeAt(0))], {
          type: head.match(/data:([^;]+)/)?.[1] || "image/jpeg",
        });
      } else {
        const result = await toBlob(p, opt);
        if (!result) throw Error("이미지를 만들지 못했습니다");
        blob = result;
      }
      if (parts.length === 1) download(blob, stem + "." + format);
      else
        files[`${stem}-part-${String(i + 1).padStart(2, "0")}.${format}`] =
          new Uint8Array(await blob.arrayBuffer());
    }
    if (parts.length > 1)
      download(
        new Blob([new Uint8Array(zipSync(files))], { type: "application/zip" }),
        stem + "-images.zip",
      );
  } finally {
    root.remove();
  }
}
