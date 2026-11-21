import { test, expect } from "@playwright/test";
const views = ["openai", "anthropic", "google"].map((id, i) => ({
  id,
  model: ["gpt-6.2-sol", "claude-sonnet-5-5", "gemini-4-hydrogen"][i],
  configured: i === 0,
  enabled: true,
}));
test("관리자 로그인 화면과 비로그인 API 보호", async ({ page, request }) => {
  await page.goto("/#/admin");
  await expect(
    page.getByRole("heading", { name: "관리자 로그인" }),
  ).toBeVisible();
  expect((await request.get("/api/providers")).status()).toBe(401);
  expect((await request.post("/api/chat", { data: {} })).status()).toBe(401);
  await page.setViewportSize({ width: 360, height: 800 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("관리자 설정과 채팅의 UI 흐름 (API 모의 응답)", async ({ page }) => {
  await page.route("**/api/session", (route) =>
    route.fulfill({ json: { authenticated: true } }),
  );
  await page.route("**/api/providers", async (route) => {
    if (route.request().method() === "PUT") {
      const data = route.request().postDataJSON();
      expect(data.key).toBe("ui-fixture-key-never-real-123456");
    }
    await route.fulfill({ json: { providers: views } });
  });
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      json: {
        text: "너의 다음 걸음을 응원하는 커리어 이야기",
        truncated: false,
      },
    }),
  );
  await page.goto("/#/admin");
  await expect(
    page.getByRole("heading", { name: "나의 AI, 나의 설정." }),
  ).toBeVisible();
  await page
    .getByLabel("OpenAI API 키", { exact: true })
    .fill("ui-fixture-key-never-real-123456");
  await page.getByRole("button", { name: "OpenAI 설정 저장" }).click();
  await expect(page.getByLabel("OpenAI API 키", { exact: true })).toHaveValue(
    "",
  );
  await page.getByRole("link", { name: "AI 채팅 열기" }).click();
  await page.getByLabel("AI에게 보낼 메시지").fill("뉴스레터 제목을 제안해 줘");
  await page.getByRole("button", { name: "메시지 보내기" }).click();
  await expect(page.getByRole("log")).toContainText(
    "너의 다음 걸음을 응원하는 커리어 이야기",
  );
  await page.setViewportSize({ width: 360, height: 800 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Claude 설정 필요" }).click();
  await expect(page.getByText("관리자 페이지에서 API 키를 등록")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "메시지 보내기" }),
  ).toBeDisabled();
});
