import Dexie, { type Table } from "dexie";
import {
  type Newsletter,
  type Category,
  type Program,
  type Doc,
  type Settings,
  type Recurring,
  type Asset,
  initialSettings,
  now,
  docErrors,
  newsletterSchema,
  categorySchema,
  programSchema,
  contentSchema,
} from "./domain";
export class Database extends Dexie {
  newsletters!: Table<Newsletter>;
  categories!: Table<Category>;
  programs!: Table<Program>;
  recurring!: Table<Recurring>;
  assets!: Table<Asset>;
  settings!: Table<Settings>;
  reservations!: Table<{ yearMonth: string; newsletterId: string }>;
  drafts!: Table<{
    id: string;
    newsletterId: string;
    baseRevision: number;
    raw: Doc;
    updatedAt: string;
  }>;
  constructor(name = "career-newsletter") {
    super(name);
    this.version(1).stores({
      newsletters: "id,yearMonth",
      categories: "id,newsletterId,[newsletterId+position]",
      programs:
        "id,newsletterId,categoryId,[categoryId+position],recurringTemplateId",
      recurring: "id,autoInclude",
      assets: "id",
      settings: "id",
      reservations: "yearMonth",
      drafts: "id,newsletterId",
    });
  }
}
export const db = new Database();
export async function getSettings() {
  return (await db.settings.get("singleton")) || initialSettings();
}
export async function loadDoc(id: string): Promise<Doc | undefined> {
  const n = await db.newsletters.get(id);
  if (!n || n.deletedAt) return;
  return {
    ...n,
    categories: await db.categories.where("newsletterId").equals(id).toArray(),
    programs: await db.programs.where("newsletterId").equals(id).toArray(),
  };
}
export function normalize(d: Doc) {
  d.categories
    .filter((c) => !c.deletedAt)
    .sort((a, b) => a.position - b.position)
    .forEach((c, i) => {
      c.position = i;
      d.programs
        .filter((p) => !p.deletedAt && p.categoryId === c.id)
        .sort((a, b) => a.position - b.position)
        .forEach((p, j) => (p.position = j));
    });
}
export async function insertDoc(
  d: Doc,
  assets: Asset[] = [],
  templates: Recurring[] = [],
) {
  if (Object.keys(docErrors(d)).length)
    throw Error("입력 내용을 확인해 주세요");
  normalize(d);
  await db.transaction(
    "rw",
    [
      db.newsletters,
      db.categories,
      db.programs,
      db.reservations,
      db.assets,
      db.recurring,
    ],
    async () => {
      if (await db.reservations.get(d.yearMonth))
        throw Error(
          "같은 월 뉴스레터가 있습니다. 해당 월 뉴스레터를 열어 주세요.",
        );
      const { categories, programs, ...n } = d;
      await db.reservations.add({ yearMonth: d.yearMonth, newsletterId: d.id });
      await db.newsletters.add(n);
      await db.categories.bulkAdd(categories);
      await db.programs.bulkAdd(programs);
      if (assets.length) await db.assets.bulkPut(assets);
      if (templates.length) await db.recurring.bulkAdd(templates);
    },
  );
}
// 잘못된 필드만 마지막 유효값으로 되돌리고 나머지 정상 입력을 저장합니다.
function fallbackFields<T>(
  raw: T,
  previous: T,
  issues: { path: PropertyKey[] }[],
): T {
  const copy = structuredClone(raw);
  for (const issue of issues) {
    const path = issue.path.map(String);
    if (!path.length) return previous;
    let target = copy as Record<string, unknown>,
      old = previous as Record<string, unknown>;
    for (const key of path.slice(0, -1)) {
      if (!target?.[key] || !old?.[key]) return previous;
      target = target[key] as Record<string, unknown>;
      old = old[key] as Record<string, unknown>;
    }
    const key = path.at(-1)!;
    target[key] = structuredClone(old[key]);
  }
  return copy;
}
export async function saveDoc(raw: Doc) {
  return db.transaction(
    "rw",
    [db.newsletters, db.categories, db.programs, db.drafts],
    async () => {
      const old = await loadDoc(raw.id);
      if (!old || old.revision !== raw.revision)
        throw Error(
          "다른 탭에서 변경되었습니다. 초안을 내려받고 최신 문서를 다시 불러와 주세요.",
        );
      const errors = docErrors(raw);
      let clean = structuredClone(raw);
      if (Object.keys(errors).length) {
        const nr = newsletterSchema.safeParse(raw);
        if (!nr.success) clean = fallbackFields(clean, old, nr.error.issues);
        clean.categories = clean.categories
          .map((c) => {
            const r = categorySchema.safeParse(c),
              prev = old.categories.find((o) => o.id === c.id);
            return r.success
              ? c
              : prev
                ? fallbackFields(c, prev, r.error.issues)
                : null;
          })
          .filter((x): x is Category => !!x);
        clean.programs = clean.programs
          .map((p) => {
            const r = contentSchema.safeParse(p.content),
              prev = old.programs.find((o) => o.id === p.id);
            if (r.success) return p;
            if (!prev) return null;
            const content = fallbackFields(
              p.content,
              prev.content,
              r.error.issues,
            );
            return {
              ...p,
              content: contentSchema.safeParse(content).success
                ? content
                : prev.content,
            };
          })
          .filter((x): x is Program => !!x);
        await db.drafts.put({
          id: raw.id,
          newsletterId: raw.id,
          baseRevision: raw.revision + 1,
          raw,
          updatedAt: now(),
        });
      } else await db.drafts.delete(raw.id);
      normalize(clean);
      const { categories, programs, ...n } = clean;
      n.revision = raw.revision + 1;
      n.updatedAt = now();
      newsletterSchema.parse(n);
      for (const c of categories) categorySchema.parse(c);
      for (const p of programs) programSchema.parse(p);
      await db.newsletters.put(n);
      await db.categories.bulkPut(categories);
      await db.programs.bulkPut(programs);
      return n.revision;
    },
  );
}
export async function deleteDoc(
  d: Doc,
  undo = false,
  restoreMonth = d.yearMonth,
) {
  await db.transaction(
    "rw",
    [db.newsletters, db.categories, db.programs, db.reservations],
    async () => {
      if (undo) {
        if (await db.reservations.get(restoreMonth))
          throw Error(
            "같은 월 자료가 생겨 복구할 수 없습니다. 새 자료를 다른 월에 복제한 뒤 다시 시도해 주세요.",
          );
        await db.reservations.add({
          yearMonth: restoreMonth,
          newsletterId: d.id,
        });
      } else await db.reservations.delete(d.yearMonth);
      const stamp = undo ? null : now();
      const { categories, programs, ...n } = d;
      await db.newsletters.put({
        ...n,
        yearMonth: undo ? restoreMonth : n.yearMonth,
        deletedAt: stamp,
        updatedAt: now(),
      });
      await db.categories.bulkPut(
        categories.map((c) => ({
          ...c,
          deletedAt: undo ? c.deletedAt : stamp,
        })),
      );
      await db.programs.bulkPut(
        programs.map((p) => ({ ...p, deletedAt: undo ? p.deletedAt : stamp })),
      );
    },
  );
}
export async function cleanup() {
  const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
  await db.transaction("rw", db.tables, async () => {
    for (const table of [
      db.newsletters,
      db.categories,
      db.programs,
      db.recurring,
    ])
      await table.filter((v) => !!v.deletedAt && v.deletedAt < cutoff).delete();
    const ids = new Set<string>();
    const scan = (v: unknown) => {
      if (v && typeof v === "object") {
        if ("assetId" in v) ids.add(String(v.assetId));
        Object.values(v).forEach(scan);
      }
    };
    for (const table of [
      db.newsletters,
      db.programs,
      db.recurring,
      db.settings,
      db.drafts,
    ])
      scan(await table.toArray());
    const unused = await db.assets
      .filter((a) => a.createdAt < cutoff && !ids.has(a.id))
      .primaryKeys();
    await db.assets.bulkDelete(unused);
  });
}
