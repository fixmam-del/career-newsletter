import { describe, it, expect } from "vitest";
import {
  blankContent,
  status,
  createDoc,
  initialSettings,
  uuid,
  now,
  selected,
  nextMonth,
  contentSchema,
  sampleDoc,
} from "../src/domain";
describe("서울 달력과 신청 상태", () => {
  it("연말의 다음 달", () => expect(nextMonth("2026-12")).toBe("2027-01"));
  it("마감·예정·상시·미정을 구분한다", () => {
    const c = blankContent("program", "안내");
    for (const [end, label] of [
      ["2026-11-17", "D-7"],
      ["2026-11-13", "D-3"],
      ["2026-11-10", "오늘마감"],
      ["2026-11-09", "모집종료"],
      ["2026-12-10", "모집중"],
    ]) {
      c.application = { mode: "range", startDate: null, endDate: end };
      expect(status(c, "2026-11-10")).toBe(label);
    }
    c.application.startDate = "2026-11-11";
    expect(status(c, "2026-11-10")).toBe("모집예정");
    c.application = { mode: "always", startDate: null, endDate: null };
    expect(status(c, "2026-11-10")).toBe("상시모집");
    c.application.mode = "unknown";
    expect(status(c, "2026-11-10")).toBe("일정 미정");
  });
});
describe("문서 생성·복제·독자 투영", () => {
  it("12개월 기본 테마·6개 카테고리", () => {
    for (let i = 1; i <= 12; i++) {
      const d = createDoc(
        `2026-${String(i).padStart(2, "0")}`,
        initialSettings(),
      );
      expect(d.design.themeId).toBe(i);
      expect(d.categories).toHaveLength(6);
    }
  });
  it("상시 ON만 생성하고 원본과 독립적이다", () => {
    const a = {
      id: uuid(),
      content: blankContent("program", "상시 A"),
      autoInclude: true,
      targetCategory: {
        key: "ongoing",
        name: "상시",
        defaultItemType: "program" as const,
      },
      deletedAt: null,
      createdAt: now(),
      updatedAt: now(),
    };
    const b = { ...a, id: uuid(), autoInclude: false };
    const d = createDoc("2026-11", initialSettings(), [a, b]);
    expect(d.programs).toHaveLength(1);
    a.content.name = "변경";
    expect(d.programs[0].content.name).toBe("상시 A");
    const copy = createDoc("2026-12", initialSettings(), [a, b], d);
    expect(copy.programs).toHaveLength(1);
    expect(copy.programs[0].content.name).toBe("변경");
    expect(copy.programs[0].id).not.toBe(d.programs[0].id);
  });
  it("숨김·삭제·종료는 독자 투영에 포함하지 않는다", () => {
    const d = sampleDoc("2026-11");
    d.programs[0].visible = false;
    d.programs[1].deletedAt = now();
    d.categories[1].visible = false;
    d.hideExpired = true;
    const items = selected(d, "2099-01-01").flatMap((c) => c.items);
    expect(items).toHaveLength(0);
  });
  it("잘못된 URL·날짜·역전 기간을 차단한다", () => {
    const c = blankContent("program", "안내");
    c.url = "javascript:alert(1)";
    expect(contentSchema.safeParse(c).success).toBe(false);
    c.url = null;
    c.operationStart = "2026-02-30";
    expect(contentSchema.safeParse(c).success).toBe(false);
    c.operationStart = null;
    c.application = {
      mode: "range",
      startDate: "2026-11-10",
      endDate: "2026-11-09",
    };
    expect(contentSchema.safeParse(c).success).toBe(false);
  });
});
