import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import { z } from "zod";
import { db } from "./storage";
import {
  settingsSchema,
  newsletterSchema,
  categorySchema,
  programSchema,
  recurringSchema,
  type Asset,
  now,
} from "./domain";
import { download, attachmentTypes, imageTypes } from "./assets";
const hash = async (b: Uint8Array) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(b))),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
const assetMeta = z.object({
  id: z.string().uuid(),
  originalName: z.string(),
  mimeType: z.string(),
  byteSize: z.number().nonnegative(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});
const schema = z.object({
  settings: z.array(settingsSchema).max(1),
  newsletters: z.array(newsletterSchema),
  categories: z.array(categorySchema),
  programs: z.array(programSchema),
  recurring: z.array(recurringSchema),
  assets: z.array(assetMeta),
});
export async function backup() {
  const all = await db.transaction("r", db.tables, async () => ({
    settings: await db.settings.toArray(),
    newsletters: await db.newsletters.filter((n) => !n.deletedAt).toArray(),
    categories: await db.categories.filter((c) => !c.deletedAt).toArray(),
    programs: await db.programs.filter((p) => !p.deletedAt).toArray(),
    recurring: await db.recurring.filter((r) => !r.deletedAt).toArray(),
    assets: await db.assets.toArray(),
  }));
  const nids = new Set(all.newsletters.map((x) => x.id));
  all.categories = all.categories.filter((c) => nids.has(c.newsletterId));
  all.programs = all.programs.filter((p) => nids.has(p.newsletterId));
  const refs = new Set<string>();
  const collect = (v: unknown) => {
    if (v && typeof v === "object") {
      if ("assetId" in v) refs.add(String(v.assetId));
      Object.values(v).forEach(collect);
    }
  };
  collect([all.settings, all.newsletters, all.programs, all.recurring]);
  all.assets = all.assets.filter((a) => refs.has(a.id));
  const files: Record<string, Uint8Array> = {};
  const metas = all.assets.map(
    ({ originalBlob, thumbnailBlob, ...meta }) => meta,
  );
  files["data.json"] = strToU8(JSON.stringify({ ...all, assets: metas }));
  for (const a of all.assets) {
    files[`assets/${a.id}/original`] = new Uint8Array(
      await a.originalBlob.arrayBuffer(),
    );
    if (a.thumbnailBlob)
      files[`assets/${a.id}/thumbnail`] = new Uint8Array(
        await a.thumbnailBlob.arrayBuffer(),
      );
  }
  const list = await Promise.all(
    Object.entries(files).map(async ([path, b]) => ({
      path,
      size: b.length,
      sha256: await hash(b),
    })),
  );
  files["manifest.json"] = strToU8(
    JSON.stringify({
      format: "career-newsletter-backup",
      formatVersion: 1,
      schemaVersion: 1,
      exportedAt: now(),
      counts: {
        newsletters: all.newsletters.length,
        assets: all.assets.length,
      },
      files: list,
    }),
  );
  download(
    new Blob([new Uint8Array(zipSync(files))], { type: "application/zip" }),
    `career-newsletter-backup-${now().slice(0, 10)}.zip`,
  );
  const s = all.settings[0];
  if (s) await db.settings.put({ ...s, lastBackupDownloadedAt: now() });
}
export async function inspectBackup(file: File) {
  if (file.size > 200 * 1024 * 1024)
    throw Error("백업은 200MB 이하여야 합니다");
  let total = 0,
    count = 0;
  const paths = new Set<string>();
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()), {
    filter: (e) => {
      count++;
      total += e.originalSize;
      if (
        paths.has(e.name) ||
        count > 5000 ||
        total > 500 * 1024 * 1024 ||
        e.name.includes("..") ||
        e.name.startsWith("/") ||
        e.name.includes("\\")
      )
        throw Error("안전하지 않거나 너무 큰 백업입니다");
      paths.add(e.name);
      return true;
    },
  });
  if (
    Object.values(files).reduce((n, b) => n + b.length, 0) >
    500 * 1024 * 1024
  )
    throw Error("실제 해제 크기가 500MB를 넘습니다");
  if (!files["manifest.json"] || !files["data.json"])
    throw Error("백업 구성 파일이 없습니다");
  const manifest = z
    .object({
      format: z.literal("career-newsletter-backup"),
      formatVersion: z.literal(1),
      schemaVersion: z.literal(1),
      files: z.array(
        z.object({ path: z.string(), size: z.number(), sha256: z.string() }),
      ),
    })
    .parse(JSON.parse(strFromU8(files["manifest.json"])));
  if (
    new Set(manifest.files.map((f) => f.path)).size !== manifest.files.length ||
    Object.keys(files).length !== manifest.files.length + 1
  )
    throw Error("백업 파일 목록이 일치하지 않습니다");
  for (const f of manifest.files)
    if (
      !files[f.path] ||
      files[f.path].length !== f.size ||
      (await hash(files[f.path])) !== f.sha256
    )
      throw Error("백업 파일의 크기 또는 해시가 일치하지 않습니다: " + f.path);
  const data = schema.parse(JSON.parse(strFromU8(files["data.json"])));
  for (const arr of Object.values(data))
    if (new Set(arr.map((x) => x.id)).size !== arr.length)
      throw Error("중복 ID가 있습니다");
  if (
    new Set(data.newsletters.map((n) => n.yearMonth)).size !==
    data.newsletters.length
  )
    throw Error("중복 월이 있습니다");
  const ns = new Set(data.newsletters.map((n) => n.id)),
    cats = new Map(data.categories.map((c) => [c.id, c]));
  for (const c of data.categories)
    if (!ns.has(c.newsletterId)) throw Error("카테고리 연결이 잘못되었습니다");
  for (const p of data.programs)
    if (
      !ns.has(p.newsletterId) ||
      cats.get(p.categoryId)?.newsletterId !== p.newsletterId
    )
      throw Error("프로그램 연결이 잘못되었습니다");
  const sequence = (positions: number[]) =>
    positions.sort((a, b) => a - b).every((p, i) => p === i);
  for (const n of data.newsletters) {
    const categories = data.categories.filter((c) => c.newsletterId === n.id);
    if (
      new Set(categories.map((c) => c.key)).size !== categories.length ||
      !sequence(categories.map((c) => c.position))
    )
      throw Error("카테고리 키 또는 순서가 잘못되었습니다");
  }
  for (const c of data.categories)
    if (
      !sequence(
        data.programs
          .filter((p) => p.categoryId === c.id)
          .map((p) => p.position),
      )
    )
      throw Error("프로그램 순서가 잘못되었습니다");
  const allowed = new Set([
    ...Object.values(imageTypes),
    ...Object.values(attachmentTypes).flat(),
  ]);
  const assets: Asset[] = data.assets.map((a) => {
    const b = files[`assets/${a.id}/original`];
    if (!allowed.has(a.mimeType) || !b || b.length !== a.byteSize)
      throw Error("첨부파일 정보가 잘못되었습니다");
    const t = files[`assets/${a.id}/thumbnail`];
    return {
      ...a,
      originalBlob: new Blob([new Uint8Array(b)], { type: a.mimeType }),
      thumbnailBlob: t
        ? new Blob([new Uint8Array(t)], { type: a.mimeType })
        : null,
    };
  });
  const aids = new Set(assets.map((a) => a.id));
  const refs = (v: unknown) => {
    if (v && typeof v === "object") {
      if ("assetId" in v && !aids.has(String(v.assetId)))
        throw Error("파일 연결이 없습니다");
      Object.values(v).forEach(refs);
    }
  };
  refs(data);
  return { data, assets };
}
export async function restoreBackup(
  checked: Awaited<ReturnType<typeof inspectBackup>>,
) {
  if (navigator.locks?.query) {
    const locks = await navigator.locks.query();
    if (locks.held?.some((l) => l.name?.startsWith("newsletter:")))
      throw Error(
        "다른 탭에서 뉴스레터를 편집 중입니다. 편집 탭을 닫은 뒤 복원해 주세요.",
      );
  }
  await db.transaction("rw", db.tables, async () => {
    for (const t of db.tables) await t.clear();
    for (const [key, value] of Object.entries(checked.data)) {
      if (key !== "assets") await db.table(key).bulkAdd(value);
    }
    await db.assets.bulkAdd(checked.assets);
    await db.reservations.bulkAdd(
      checked.data.newsletters.map((n) => ({
        yearMonth: n.yearMonth,
        newsletterId: n.id,
      })),
    );
  });
}
