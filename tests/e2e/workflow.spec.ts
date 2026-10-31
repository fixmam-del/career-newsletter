import { test, expect } from "@playwright/test";
test("생성 → 한글 입력 → 상세 → 저장 복구 → HTML 및 복제", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByText("첫 번째 이야기를 기다리고 있어요"),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/dashboard-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "새 뉴스레터", exact: true }).click();
  await page.getByLabel("발행 연·월").fill("2026-11");
  await page.getByRole("button", { name: "생성하기" }).click();
  await expect(page.getByText("이번 달의 소식을 담아보세요")).toBeVisible();
  const quick = page.getByRole("textbox", {
    name: "비교과 프로그램 프로그램명",
    exact: true,
  });
  await quick.fill("한글 진로 워크숍");
  await quick.press("Enter");
  await expect(
    page.getByRole("button", { name: /한글 진로 워크숍 일정 미정/ }),
  ).toBeVisible();
  await quick.fill("한글 진로 워크숍");
  await quick.press("Enter");
  await expect(page.getByText("같은 이름이 있습니다")).toBeVisible();
  await quick.fill("취업 포트폴리오");
  await quick.press("Enter");
  await page
    .getByRole("button", { name: /한글 진로 워크숍 일정 미정/ })
    .click();
  await page.getByLabel("대상", { exact: true }).fill("재학생 및 졸업생");
  await page
    .getByLabel("주요내용", { exact: true })
    .fill("<script>문자 그대로</script>\n나의 다음 걸음");
  await page
    .getByLabel("신청 URL", { exact: true })
    .fill("https://example.com/career");
  await page.getByRole("button", { name: "지금 저장" }).click();
  await expect(page.locator(".save-badge")).toContainText("저장됨");
  await page.reload();
  await expect(
    page.getByRole("button", { name: /한글 진로 워크숍 일정 미정/ }),
  ).toBeVisible();
  await expect(page.locator(".newsletter")).toContainText("재학생 및 졸업생");
  await expect(page.locator(".newsletter")).toContainText(
    "<script>문자 그대로</script>",
  );
  await page.screenshot({
    path: "test-results/editor-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "내보내기", exact: true }).click();
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "다운로드", exact: true }).click();
  const file = await dl;
  expect(file.suggestedFilename()).toBe("career-newsletter-2026-11.html");
  await file.saveAs("test-results/export.html");
  await page.getByRole("button", { name: "복제", exact: true }).click();
  await expect(page.getByLabel("발행 연·월")).toHaveValue("2026-12");
  await page.getByRole("button", { name: "복제하기", exact: true }).click();
  await expect(page.locator(".workbar-title")).toContainText("2026-12");
  await expect(page.locator(".program-main")).toHaveCount(2);
  expect(errors).toEqual([]);
});
test("360px 반응형과 샘플은 사용자 DB를 변경하지 않는다", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  await page.getByRole("button", { name: /샘플 살펴보기/ }).click();
  await expect(page.getByRole("dialog")).toContainText("가상 자료");
  await page.getByRole("button", { name: "대화상자 닫기" }).click();
  await expect(
    page.getByText("첫 번째 이야기를 기다리고 있어요"),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/dashboard-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "새 뉴스레터", exact: true }).click();
  await page.getByRole("button", { name: "생성하기" }).click();
  await page
    .getByRole("textbox", { name: "비교과 프로그램 프로그램명", exact: true })
    .fill("모바일 테스트");
  await page
    .locator(".category")
    .first()
    .getByRole("button", { name: "추가", exact: true })
    .click();
  await page.getByRole("button", { name: "미리보기", exact: true }).click();
  await expect(page.locator(".preview-sheet")).toContainText("모바일 테스트");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/editor-mobile.png",
    fullPage: true,
  });
});
