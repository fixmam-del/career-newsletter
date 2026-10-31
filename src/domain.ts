import { z } from "zod";
export const uuid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const today = () =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const monthTitle = (m: string) =>
  `${m.slice(0, 4)}년 ${Number(m.slice(5))}월 진로·취업 뉴스레터`;
export const nextMonth = (m: string) => {
  const [y, n] = m.split("-").map(Number);
  return `${y + (n === 12 ? 1 : 0)}-${String(n === 12 ? 1 : n + 1).padStart(2, "0")}`;
};
export const themeNames = [
  "새로운 시작",
  "준비와 도약",
  "캠퍼스의 봄",
  "성장의 계절",
  "가능성의 확장",
  "경험의 연결",
  "여름의 도전",
  "다음 단계",
  "가을의 출발",
  "커리어 탐색",
  "기회의 발견",
  "돌아봄과 계획",
];
export const themeColors = [
  "#1D4ED8",
  "#6D28D9",
  "#047857",
  "#0F766E",
  "#15803D",
  "#0369A1",
  "#1E40AF",
  "#4338CA",
  "#9A3412",
  "#92400E",
  "#9F1239",
  "#334155",
];
export const themeTexts = [
  "새로운 목표, 새로운 커리어",
  "나의 가능성을 준비하는 시간",
  "새로운 학기, 함께 시작해요",
  "오늘의 경험이 내일의 역량으로",
  "더 넓은 기회를 만나보세요",
  "배움과 현장을 연결하는 시간",
  "방학을 나만의 기회로",
  "다음 도약을 준비하세요",
  "새로운 학기, 새로운 도전",
  "나에게 맞는 길을 찾아보세요",
  "준비한 역량을 기회로",
  "올해의 경험에서 내년의 가능성으로",
];
export const defaults = [
  ["extracurricular", "비교과 프로그램"],
  ["ongoing", "상시지원 프로그램"],
  ["internship", "현장실습 프로그램"],
  ["recruitment", "채용설명회/기업 프로그램"],
  ["related", "유관부서 프로그램"],
  ["youth-policy", "청년정책 서비스"],
];
export const characterCount = (v: string) =>
  typeof Intl.Segmenter === "function"
    ? [...new Intl.Segmenter("ko", { granularity: "grapheme" }).segment(v)]
        .length
    : Array.from(v).length;
const limited = (min: number, max: number) =>
  z
    .string()
    .refine(
      (v) => characterCount(v.trim()) >= min && characterCount(v) <= max,
      `${min}~${max}자로 입력해 주세요`,
    );
export const validDate = (v: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !isNaN(Date.parse(v)) &&
  new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v;
const date = z
  .string()
  .refine(validDate, "실제 달력 날짜를 입력해 주세요")
  .nullable();
export const urlSchema = z
  .string()
  .max(2048)
  .refine((v) => {
    try {
      return ["https:", "http:"].includes(new URL(v).protocol);
    } catch {
      return false;
    }
  }, "http 또는 https 주소를 입력해 주세요")
  .nullable();
const imageSchema = z
  .object({
    assetId: z.string().uuid(),
    alt: limited(0, 200),
    decorative: z.boolean(),
    publicIncluded: z.boolean(),
  })
  .refine(
    (v) => v.decorative || v.alt.trim().length > 0,
    "대체텍스트를 입력해 주세요",
  );
export const contentSchema = z
  .object({
    type: z.enum(["program", "youthPolicy"]),
    name: limited(1, 120),
    operationStart: date,
    operationEnd: date,
    operationNote: limited(0, 100),
    target: limited(0, 300),
    description: limited(0, 3000),
    application: z.object({
      mode: z.enum(["unknown", "range", "always"]),
      startDate: date,
      endDate: date,
    }),
    applicationMethod: limited(0, 500),
    department: limited(0, 100),
    url: urlSchema,
    benefits: limited(0, 2000),
    images: z.array(imageSchema).max(5),
    attachments: z
      .array(
        z.object({ assetId: z.string().uuid(), publicIncluded: z.boolean() }),
      )
      .max(5),
  })
  .superRefine((v, c) => {
    if (v.operationStart && v.operationEnd && v.operationEnd < v.operationStart)
      c.addIssue({
        code: "custom",
        path: ["operationEnd"],
        message: "운영 종료일은 시작일 이후여야 합니다",
      });
    const a = v.application;
    if (a.mode === "range" && !a.endDate)
      c.addIssue({
        code: "custom",
        path: ["application", "endDate"],
        message: "신청 종료일을 입력해 주세요",
      });
    if (
      a.mode === "range" &&
      a.startDate &&
      a.endDate &&
      a.endDate < a.startDate
    )
      c.addIssue({
        code: "custom",
        path: ["application", "endDate"],
        message: "신청 종료일은 시작일 이후여야 합니다",
      });
    if (a.mode !== "range" && (a.startDate || a.endDate))
      c.addIssue({
        code: "custom",
        path: ["application"],
        message: "상시/미정의 날짜는 비워 주세요",
      });
  });
export type Content = z.infer<typeof contentSchema>;
export type ImageRef = Content["images"][number];
const stamp = {
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
};
export const categorySchema = z.object({
  id: z.string().uuid(),
  newsletterId: z.string().uuid(),
  key: z.string(),
  name: limited(1, 40),
  defaultItemType: z.enum(["program", "youthPolicy"]),
  position: z.number().int().nonnegative(),
  visible: z.boolean(),
  deletedAt: z.string().nullable(),
  ...stamp,
});
export type Category = z.infer<typeof categorySchema>;
export const programSchema = z.object({
  id: z.string().uuid(),
  newsletterId: z.string().uuid(),
  categoryId: z.string().uuid(),
  content: contentSchema,
  position: z.number().int().nonnegative(),
  visible: z.boolean(),
  recommendedThisMonth: z.boolean(),
  recurringTemplateId: z.string().nullable(),
  scheduleNeedsReview: z.boolean(),
  deletedAt: z.string().nullable(),
  ...stamp,
});
export type Program = z.infer<typeof programSchema>;
export const institutionSchema = z.object({
  institutionName: limited(0, 100),
  departmentName: limited(0, 100),
  contactText: limited(0, 300),
  websiteUrl: urlSchema,
  logo: imageSchema.nullable(),
});
export const settingsSchema = institutionSchema.extend({
  id: z.literal("singleton"),
  schemaVersion: z.literal(1),
  defaultImportRecurring: z.boolean(),
  lastBackupDownloadedAt: z.string().nullable(),
  ...stamp,
});
export type Settings = z.infer<typeof settingsSchema>;
export const newsletterSchema = z.object({
  id: z.string().uuid(),
  yearMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  title: limited(1, 120),
  institutionSnapshot: institutionSchema,
  design: z.object({
    themeId: z.number().int().min(1).max(12),
    accentColor: z.string().regex(/^#[\da-fA-F]{6}$/),
    headerText: limited(0, 100),
    headerImage: imageSchema.nullable(),
    headerFit: z.enum(["cover", "contain"]),
  }),
  hideExpired: z.boolean(),
  revision: z.number().int().nonnegative(),
  deletedAt: z.string().nullable(),
  ...stamp,
});
export type Newsletter = z.infer<typeof newsletterSchema>;
export type Doc = Newsletter & { categories: Category[]; programs: Program[] };
export const recurringSchema = z.object({
  id: z.string().uuid(),
  content: contentSchema,
  targetCategory: z.object({
    key: z.string(),
    name: limited(1, 40),
    defaultItemType: z.enum(["program", "youthPolicy"]),
  }),
  autoInclude: z.boolean(),
  deletedAt: z.string().nullable(),
  ...stamp,
});
export type Recurring = z.infer<typeof recurringSchema>;
export type Asset = {
  id: string;
  originalName: string;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  originalBlob: Blob;
  thumbnailBlob: Blob | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
export const initialSettings = (): Settings => ({
  id: "singleton",
  schemaVersion: 1,
  institutionName: "",
  departmentName: "",
  contactText: "",
  websiteUrl: null,
  logo: null,
  defaultImportRecurring: true,
  lastBackupDownloadedAt: null,
  createdAt: now(),
  updatedAt: now(),
});
export const blankContent = (
  type: Content["type"] = "program",
  name = "",
  department = "",
): Content => ({
  type,
  name,
  department,
  target: "",
  description: "",
  operationStart: null,
  operationEnd: null,
  operationNote: "",
  application: { mode: "unknown", startDate: null, endDate: null },
  applicationMethod: "",
  url: null,
  benefits: "",
  images: [],
  attachments: [],
});
export function status(c: Content, todayDate: string) {
  const a = c.application;
  if (a.mode === "unknown") return "일정 미정";
  if (a.mode === "always") return "상시모집";
  if (!a.endDate) return "일정 미정";
  if (a.endDate < todayDate) return "모집종료";
  if (a.endDate === todayDate) return "오늘마감";
  if (a.startDate && a.startDate > todayDate) return "모집예정";
  const days =
    (Date.parse(a.endDate + "T00:00:00Z") -
      Date.parse(todayDate + "T00:00:00Z")) /
    86400000;
  return days <= 7 ? `D-${days}` : "모집중";
}
export const selected = (d: Doc, t: string) =>
  d.categories
    .filter((c) => !c.deletedAt && c.visible)
    .sort((a, b) => a.position - b.position)
    .map((c) => ({
      ...c,
      items: d.programs
        .filter(
          (p) =>
            !p.deletedAt &&
            p.visible &&
            p.categoryId === c.id &&
            (!d.hideExpired || status(p.content, t) !== "모집종료"),
        )
        .sort((a, b) => a.position - b.position),
    }))
    .filter((c) => c.items.length);
export function makeCategory(
  nid: string,
  key: string,
  name: string,
  position: number,
  type: Content["type"] = "program",
): Category {
  return {
    id: uuid(),
    newsletterId: nid,
    key,
    name,
    position,
    defaultItemType: type,
    visible: true,
    deletedAt: null,
    createdAt: now(),
    updatedAt: now(),
  };
}
export function makeProgram(d: Doc, c: Category, name: string): Program {
  return {
    id: uuid(),
    newsletterId: d.id,
    categoryId: c.id,
    content: blankContent(
      c.defaultItemType,
      name,
      d.institutionSnapshot.departmentName,
    ),
    position: d.programs.filter((p) => p.categoryId === c.id && !p.deletedAt)
      .length,
    visible: true,
    recommendedThisMonth: false,
    recurringTemplateId: null,
    scheduleNeedsReview: false,
    deletedAt: null,
    createdAt: now(),
    updatedAt: now(),
  };
}
export function mergeRecurring(
  d: Doc,
  templates: Recurring[],
  restore = false,
) {
  for (const r of templates.filter((x) => !x.deletedAt)) {
    const existing = d.programs.find((p) => p.recurringTemplateId === r.id);
    if (existing) {
      if (restore && existing.deletedAt) {
        existing.content = structuredClone(r.content);
        existing.deletedAt = null;
        existing.updatedAt = now();
      }
      continue;
    }
    let cat = d.categories.find(
      (c) => c.key === r.targetCategory.key && !c.deletedAt,
    );
    if (!cat) {
      cat = makeCategory(
        d.id,
        r.targetCategory.key,
        r.targetCategory.name,
        d.categories.filter((c) => !c.deletedAt).length,
        r.targetCategory.defaultItemType,
      );
      d.categories.push(cat);
    }
    const p = makeProgram(d, cat, r.content.name);
    p.content = structuredClone(r.content);
    p.recurringTemplateId = r.id;
    d.programs.push(p);
  }
  return d;
}
export function createDoc(
  month: string,
  s: Settings,
  templates: Recurring[] = [],
  source?: Doc,
  opts = { normal: true, recurring: true, theme: true },
): Doc {
  const id = uuid(),
    n = Number(month.slice(5)),
    time = now();
  const inst = {
    institutionName: s.institutionName,
    departmentName: s.departmentName,
    contactText: s.contactText,
    websiteUrl: s.websiteUrl,
    logo: s.logo,
  };
  const d: Doc = {
    id,
    yearMonth: month,
    title: monthTitle(month),
    institutionSnapshot: structuredClone(source?.institutionSnapshot || inst),
    design: {
      themeId: n,
      accentColor: themeColors[n - 1],
      headerText: themeTexts[n - 1],
      headerImage: null,
      headerFit: "cover",
    },
    hideExpired: source?.hideExpired ?? false,
    revision: 0,
    deletedAt: null,
    createdAt: time,
    updatedAt: time,
    categories: [],
    programs: [],
  };
  if (source && !opts.theme) d.design = structuredClone(source.design);
  if (source) {
    const map = new Map<string, string>();
    d.categories = source.categories
      .filter((c) => !c.deletedAt)
      .map((c) => {
        const x = {
          ...structuredClone(c),
          id: uuid(),
          newsletterId: id,
          createdAt: time,
          updatedAt: time,
        };
        map.set(c.id, x.id);
        return x;
      });
    if (opts.normal)
      d.programs = source.programs
        .filter(
          (p) =>
            !p.deletedAt && !p.recurringTemplateId && map.has(p.categoryId),
        )
        .map((p) => ({
          ...structuredClone(p),
          id: uuid(),
          newsletterId: id,
          categoryId: map.get(p.categoryId)!,
          scheduleNeedsReview: true,
          createdAt: time,
          updatedAt: time,
        }));
  } else
    d.categories = defaults.map(([k, name], i) =>
      makeCategory(
        id,
        k,
        name,
        i,
        k === "youth-policy" ? "youthPolicy" : "program",
      ),
    );
  if (opts.recurring)
    mergeRecurring(
      d,
      templates.filter((r) => r.autoInclude),
    );
  return d;
}
export const reorder = <T extends { position: number }>(
  items: T[],
  from: number,
  to: number,
) => {
  const a = [...items].sort((x, y) => x.position - y.position);
  const [v] = a.splice(from, 1);
  a.splice(to, 0, v);
  a.forEach((x, i) => (x.position = i));
  return a;
};
export function docErrors(d: Doc) {
  const errors: Record<string, string> = {};
  const n = newsletterSchema.safeParse(d);
  if (!n.success)
    for (const e of n.error.issues) errors[e.path.join(".")] = e.message;
  for (const c of d.categories.filter((c) => !c.deletedAt)) {
    const s = categorySchema.safeParse(c);
    if (!s.success) errors[c.id] = s.error.issues[0].message;
  }
  for (const p of d.programs.filter((p) => !p.deletedAt)) {
    const r = contentSchema.safeParse(p.content);
    if (!r.success)
      for (const e of r.error.issues)
        errors[`${p.id}.${e.path.join(".")}`] = e.message;
  }
  return errors;
}
export function sampleDoc(month = today().slice(0, 7)) {
  const s = initialSettings();
  s.institutionName = "미래대학교 (가상)";
  s.departmentName = "대학일자리플러스센터";
  s.contactText = "진로와 취업의 다음 걸음을 함께합니다.";
  const d = createDoc(month, s);
  const names = [
    ["나를 발견하는 커리어 워크숍", "실전! 자기소개서 완성 클래스"],
    ["1:1 진로·취업 상담", "현직자와 함께하는 커리어 멘토링"],
    ["겨울방학 현장실습 사전교육", "직무 체험 프로젝트"],
    ["미래를 여는 기업 직무설명회", "산업 트렌드 오픈 세미나"],
    ["글로벌 역량 성장 프로그램", "함께하는 창업 아이디어 캠프"],
    ["청년 커리어 도약 지원 (가상)", "청년 배움 지원 서비스 (가상)"],
  ];
  const base = today();
  d.categories.forEach((c, i) =>
    names[i].forEach((name, j) => {
      const p = makeProgram(d, c, name);
      if (i === 0 && j === 0)
        p.content.images = [
          {
            assetId: "fd28461b-2629-4dc1-870b-509452df9e80",
            alt: "블루 구체와 민트 곡선으로 그린 가상 커리어 프로그램 안내",
            decorative: false,
            publicIncluded: true,
          },
        ];
      p.content.description =
        "새로운 경험이 나만의 가능성이 되는 시간. 관심 있는 여러분의 참여를 기다립니다. 이 내용은 기능 체험용 가상 샘플입니다.";
      p.content.target = "재학생 및 졸업생";
      p.content.url = "https://example.com";
      p.content.operationNote = "온라인 및 교내 프로그램실";
      if (i === 1) {
        p.content.application.mode = "always";
        if (j === 0) p.recurringTemplateId = uuid();
      } else {
        const date = new Date(base + "T00:00:00Z");
        date.setUTCDate(date.getUTCDate() + [7, 3, 0, -1, 14, 20][i]);
        p.content.application = {
          mode: "range",
          startDate: null,
          endDate: date.toISOString().slice(0, 10),
        };
      }
      if (i === 5) {
        p.content.benefits = "직무교육 및 역량 개발 기회 제공 (가상 혜택)";
        p.recommendedThisMonth = j === 0;
      }
      d.programs.push(p);
    }),
  );
  return d;
}
