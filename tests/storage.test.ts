import { beforeEach, it, expect } from "vitest";
import { db, insertDoc, loadDoc, saveDoc, deleteDoc } from "../src/storage";
import { createDoc, initialSettings, makeProgram } from "../src/domain";
it("삭제 후 같은 월을 만들었으면 다른 월로 명시적으로 복원한다", async () => {
  const d = createDoc("2026-11", initialSettings());
  await insertDoc(d);
  await deleteDoc(d);
  await insertDoc(createDoc("2026-11", initialSettings()));
  await expect(deleteDoc(d, true)).rejects.toThrow("같은 월");
  await deleteDoc(d, true, "2026-12");
  expect((await loadDoc(d.id))?.yearMonth).toBe("2026-12");
  expect(await db.reservations.count()).toBe(2);
});
beforeEach(async () => {
  await db.transaction("rw", db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
});
it("동일 월 생성은 원자적으로 하나만 허용한다", async () => {
  const a = createDoc("2026-11", initialSettings()),
    b = createDoc("2026-11", initialSettings());
  const results = await Promise.allSettled([insertDoc(a), insertDoc(b)]);
  expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  expect(await db.newsletters.count()).toBe(1);
  expect(await db.categories.count()).toBe(6);
});
it("revision 충돌 때 최신 자료를 덮어쓰지 않는다", async () => {
  const d = createDoc("2026-11", initialSettings());
  await insertDoc(d);
  const copy = structuredClone(d);
  d.title = "새 제목";
  await saveDoc(d);
  copy.title = "충돌";
  await expect(saveDoc(copy)).rejects.toThrow("다른 탭");
  expect((await loadDoc(d.id))?.title).toBe("새 제목");
});
it("정상 모델을 유지하고 잘못된 원문을 복구 초안에 보관한다", async () => {
  const d = createDoc("2026-11", initialSettings());
  d.programs.push(makeProgram(d, d.categories[0], "진로 워크숍"));
  await insertDoc(d);
  d.programs[0].content.url = "javascript:alert(1)";
  d.programs[0].content.target = "함께 저장되는 정상 대상";
  await saveDoc(d);
  expect((await loadDoc(d.id))?.programs[0].content.url).toBeNull();
  expect((await loadDoc(d.id))?.programs[0].content.target).toBe(
    "함께 저장되는 정상 대상",
  );
  expect((await db.drafts.get(d.id))?.raw.programs[0].content.url).toBe(
    "javascript:alert(1)",
  );
});
it("월 삭제 취소가 프로그램·순서·연결을 복원한다", async () => {
  const d = createDoc("2026-11", initialSettings());
  d.programs.push(makeProgram(d, d.categories[0], "A"));
  await insertDoc(d);
  await deleteDoc(d);
  expect(await loadDoc(d.id)).toBeUndefined();
  await deleteDoc(d, true);
  expect((await loadDoc(d.id))?.programs).toEqual(d.programs);
  expect(await db.reservations.count()).toBe(1);
});
