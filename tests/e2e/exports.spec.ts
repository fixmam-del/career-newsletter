import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
import { pathToFileURL } from "node:url";
async function seed(page: Page, amount = 12) {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "새 뉴스레터", exact: true }),
  ).toBeVisible();
  const id = await page.evaluate(async (amount) => {
    const domainUrl = "/src/domain.ts",
      storageUrl = "/src/storage.ts",
      sampleUrl = "/src/sample.ts";
    const domain = await import(domainUrl),
      storage = await import(storageUrl),
      sample = await import(sampleUrl);
    const d = domain.sampleDoc("2026-11");
    for (const p of d.programs) p.recurringTemplateId = null;
    while (d.programs.length < amount) {
      const p = structuredClone(d.programs[d.programs.length % 12]);
      p.id = domain.uuid();
      p.position = d.programs.length;
      p.content.name = "장문 프로그램 " + d.programs.length;
      p.content.description =
        "미래를 준비하는 나의 경험과 기회를 소개합니다.\n".repeat(10);
      d.programs.push(p);
    }
    const secret = {
      id: domain.uuid(),
      originalName: "비공개자료.txt",
      mimeType: "text/plain",
      byteSize: 23,
      width: null,
      height: null,
      originalBlob: new Blob(["PRIVATE_SENTINEL_7c9a22"]),
      thumbnailBlob: null,
      deletedAt: null,
      createdAt: domain.now(),
      updatedAt: domain.now(),
    };
    secret.byteSize = secret.originalBlob.size;
    d.programs[0].content.attachments = [
      { assetId: secret.id, publicIncluded: false },
    ];
    await storage.insertDoc(d, [...(await sample.sampleAssets()), secret]);
    return d.id;
  }, amount);
  await page.goto("/#/newsletters/" + id);
  await expect(page.locator(".program-main")).toHaveCount(amount);
  return id;
}
test("인쇄 문서는 같은 카드·텍스트 URL을 제공하고 print를 호출한다", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.print = () =>
      document.documentElement.setAttribute("data-print-requested", "true");
  });
  await seed(page);
  await page.getByRole("button", { name: "내보내기", exact: true }).click();
  await page.getByRole("button", { name: /^PDF로 저장/ }).click();
  await page.getByRole("button", { name: "인쇄창 열기" }).click();
  const frame = page.frameLocator("iframe");
  await expect(frame.locator("html")).toHaveAttribute(
    "data-print-requested",
    "true",
  );
  await expect(frame.locator(".doc-card")).toHaveCount(12);
  await expect(frame.locator(".print-url").first()).toHaveText(
    "https://example.com",
  );
  await expect(frame.locator(".doc-card img").first()).toBeVisible();
  await page.emulateMedia({ media: "print" });
  expect(
    await frame
      .locator(".print-url")
      .first()
      .evaluate((e) => getComputedStyle(e).display),
  ).toBe("block");
});
test("저장공간 실패 시 초안을 유지하고 정상 데이터는 덮어쓰지 않는다", async ({
  page,
}) => {
  await seed(page);
  await page.getByRole("button", { name: "디자인", exact: true }).click();
  const original = await page
    .getByLabel("뉴스레터 제목", { exact: true })
    .inputValue();
  await page.evaluate(() => {
    const originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (
      value: unknown,
      key?: IDBValidKey,
    ) {
      if (this.name === "newsletters")
        throw new DOMException("테스트 저장공간 부족", "QuotaExceededError");
      return key === undefined
        ? originalPut.call(this, value)
        : originalPut.call(this, value, key);
    };
  });
  await page
    .getByLabel("뉴스레터 제목", { exact: true })
    .fill("저장 실패 원문 보존");
  await page.getByRole("button", { name: "지금 저장" }).click();
  await expect(page.locator(".save-badge")).toContainText("저장 실패");
  await expect(page.getByLabel("뉴스레터 제목", { exact: true })).toHaveValue(
    "저장 실패 원문 보존",
  );
  const persisted = await page.evaluate(async () => {
    const path = "/src/storage.ts";
    const { db } = await import(path);
    return (await db.newsletters.toArray())[0].title;
  });
  expect(persisted).toBe(original);
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "미저장 초안 받기 (.json)" }).click();
  expect((await event).suggestedFilename()).toBe("unsaved-draft.json");
});
test("이미지 업로드 검증과 재실행 후 파일 보존", async ({ page }) => {
  await seed(page);
  await page.locator(".program-main").first().click();
  const input = page
    .locator('input[type=file][accept=".jpg,.jpeg,.png,.webp"]')
    .first();
  await input.setInputFiles({
    name: "forbidden.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from("<svg/>"),
  });
  await expect(page.getByText(/JPEG, PNG, WebP 이미지만/)).toBeVisible();
  await input.setInputFiles("public/sample-career.png");
  await expect(page.locator(".file-row img")).toHaveCount(2);
  await page.getByRole("button", { name: "지금 저장" }).click();
  await expect(page.locator(".save-badge")).toContainText("저장됨");
  await page.reload();
  await page.locator(".program-main").first().click();
  await expect(page.locator(".file-row img")).toHaveCount(2);
  expect(
    await page
      .locator(".file-row img")
      .first()
      .evaluate((e: HTMLImageElement) => e.naturalWidth > 0),
  ).toBe(true);
});
async function exportFormat(page: Page, name: string) {
  await page.getByRole("button", { name: "내보내기", exact: true }).click();
  await page.getByRole("button", { name: new RegExp("^" + name) }).click();
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "다운로드", exact: true }).click();
  return await dl;
}
test("독립 HTML의 한글·이미지·링크·비공개 분리 및 다섯 해상도", async ({
  page,
  context,
}) => {
  await seed(page);
  const file = await exportFormat(page, "웹 뉴스레터");
  const path = "test-results/standalone.html";
  await file.saveAs(path);
  const html = await readFile(path, "utf8");
  expect(html).toContain("data:image/png;base64,");
  expect(html).not.toContain("비공개자료");
  expect(html).not.toContain("PRIVATE_SENTINEL");
  expect(html).not.toContain("blob:");
  expect(html).not.toContain("<script");
  const reader = await context.newPage();
  await reader.goto(pathToFileURL(process.cwd() + "/" + path).href);
  await expect(reader.locator(".doc-card")).toHaveCount(12);
  expect(
    await reader
      .locator(".doc-card img")
      .first()
      .evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth === 800),
  ).toBe(true);
  await expect(
    reader.getByRole("link", { name: /자세히 보기/ }).first(),
  ).toHaveAttribute("href", "https://example.com");
  for (const width of [360, 390, 768, 1280, 1440]) {
    await reader.setViewportSize({ width, height: 900 });
    expect(
      await reader.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await reader.setViewportSize({ width: 800, height: 1000 });
  await reader.screenshot({
    path: "test-results/standalone-reader.png",
    fullPage: true,
  });
});
test("30개 카드 PNG/JPG를 8000px 이하 파트로 분할한다", async ({ page }) => {
  test.setTimeout(120000);
  await seed(page, 30);
  for (const format of ["PNG 이미지", "JPG 이미지"]) {
    const file = await exportFormat(page, format);
    expect(file.suggestedFilename()).toMatch(/images.zip$/);
    const path = `test-results/${format.startsWith("PNG") ? "png" : "jpg"}-parts.zip`;
    await file.saveAs(path);
    const files = unzipSync(new Uint8Array(await readFile(path)));
    expect(Object.keys(files).length).toBeGreaterThan(1);
    const heights: number[] = [];
    for (const [name, bytes] of Object.entries(files)) {
      expect(name).toMatch(/part-\d{2}\.(png|jpg)$/);
      const dimensions = await page.evaluate(
        async ({ bytes, name }) => {
          const b = new Blob([new Uint8Array(bytes)], {
              type: name.endsWith("png") ? "image/png" : "image/jpeg",
            }),
            bitmap = await createImageBitmap(b);
          return { width: bitmap.width, height: bitmap.height };
        },
        { bytes: Array.from(bytes), name },
      );
      expect(dimensions.width).toBe(1600);
      expect(dimensions.height).toBeLessThanOrEqual(8000);
      heights.push(dimensions.height);
    }
    expect(heights.reduce((s, h) => s + h, 0)).toBeGreaterThan(10000);
  }
});
test("ZIP 백업의 비공개 파일·이미지 왕복과 손상 파일 거절", async ({
  page,
}) => {
  await seed(page);
  await page.getByRole("link", { name: "설정·백업", exact: true }).click();
  const dl = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "전체 백업 다운로드", exact: true })
    .click();
  const file = await dl;
  const path = "test-results/backup.zip";
  await file.saveAs(path);
  const files = unzipSync(new Uint8Array(await readFile(path)));
  const data = JSON.parse(strFromU8(files["data.json"]));
  expect(data.programs).toHaveLength(12);
  expect(data.assets).toHaveLength(2);
  expect(
    data.assets.some(
      (a: { originalName: string }) => a.originalName === "비공개자료.txt",
    ),
  ).toBe(true);
  await page.evaluate(async () => {
    const u = "/src/storage.ts";
    const { db } = await import(u);
    await db.transaction("rw", db.tables, async () => {
      for (const t of db.tables) await t.clear();
    });
  });
  await page.locator('input[type=file][accept=".zip"]').setInputFiles(path);
  await expect(page.getByRole("dialog")).toContainText("뉴스레터 1개");
  await page
    .getByRole("checkbox", { name: "기존 데이터 전체 교체를 확인합니다" })
    .check();
  await page.getByRole("button", { name: "검증된 백업으로 교체" }).click();
  await expect(page.getByText("백업 복원을 완료했습니다.")).toBeVisible();
  await page.getByRole("link", { name: "뉴스레터", exact: true }).click();
  await expect(page.locator(".newsletter-card")).toHaveCount(1);
  await page.getByRole("link", { name: "설정·백업", exact: true }).click();
  await page.locator('input[type=file][accept=".zip"]').setInputFiles({
    name: "broken.zip",
    mimeType: "application/zip",
    buffer: Buffer.from("corrupted"),
  });
  await expect(
    page.getByText(/invalid zip|invalid|백업|실패/).first(),
  ).toBeVisible();
  const count = await page.evaluate(async () => {
    const u = "/src/storage.ts";
    const { db } = await import(u);
    return db.newsletters.count();
  });
  expect(count).toBe(1);
});
test("다른 탭 읽기 전용·연속 삭제 각각 취소·프로그램 숨김", async ({
  page,
  context,
}) => {
  await seed(page);
  const url = page.url();
  const second = await context.newPage();
  await second.goto(url);
  await expect(
    second.getByText("다른 탭에서 편집 중입니다. 이 탭은 읽기 전용입니다."),
  ).toBeVisible();
  await expect(
    second.getByRole("textbox", {
      name: "비교과 프로그램 프로그램명",
      exact: true,
    }),
  ).toBeDisabled();
  await second.close();
  const first = page.locator(".category").first();
  await first
    .getByRole("button", {
      name: "나를 발견하는 커리어 워크숍 삭제",
      exact: true,
    })
    .click();
  await first
    .getByRole("button", {
      name: "실전! 자기소개서 완성 클래스 삭제",
      exact: true,
    })
    .click();
  await expect(first.locator(".program-main")).toHaveCount(0);
  await page
    .getByRole("button", { name: "실행취소", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "실행취소", exact: true })
    .first()
    .click();
  await expect(first.locator(".program-main")).toHaveCount(2);
  await page.getByRole("button", { name: "지금 저장" }).click();
  await page.reload();
  await expect(first.locator(".program-main")).toHaveCount(2);
});
