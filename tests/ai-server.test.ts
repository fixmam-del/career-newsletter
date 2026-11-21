import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { mkdtemp, mkdir, rm, readFile } from "node:fs/promises";
import path from "node:path";
import { scryptSync, randomBytes } from "node:crypto";
vi.mock("ai", async (original) => ({
  ...(await original<typeof import("ai")>()),
  generateText: vi.fn(),
}));
import { generateText, APICallError } from "ai";
import {
  POST as login,
  GET as session,
  DELETE as logout,
} from "../api/session";
import { GET as getProviders, PUT as putProvider } from "../api/providers";
import { POST as chat } from "../api/chat";
import { emptyState, encrypt, decrypt, rateLimit } from "../server/state";
const origin = "https://newsletter.example";
const testPassword = "test-only-password";
let directory = "",
  cookie = "";
function request(
  route: string,
  method = "GET",
  data?: unknown,
  authenticated = false,
  requestOrigin = origin,
) {
  return new Request(origin + "/api/" + route, {
    method,
    headers: {
      origin: requestOrigin,
      "content-type": "application/json",
      ...(authenticated ? { cookie } : {}),
    },
    ...(method !== "GET" ? { body: JSON.stringify(data || {}) } : {}),
  });
}
async function signIn() {
  const result = await login(
    request("session", "POST", { id: "FIXMAM", password: testPassword }),
  );
  expect(result.status).toBe(200);
  cookie = result.headers.get("set-cookie")!.split(";")[0];
  return result;
}
async function register(id = "openai") {
  const result = await putProvider(
    request(
      "providers",
      "PUT",
      {
        id,
        model: "test-model",
        enabled: true,
        key: "fixture-api-key-never-real-12345",
      },
      true,
    ),
  );
  expect(result.status).toBe(200);
  return result;
}
beforeAll(async () => {
  await mkdir(".local-ai", { recursive: true });
  directory = await mkdtemp(path.resolve(".local-ai/test-"));
  process.env.AI_LOCAL_STATE_DIR = directory;
  process.env.VERCEL = "0";
  process.env.AI_ADMIN_ID = "FIXMAM";
  process.env.AI_ADMIN_PASSWORD_HASH = `scrypt:test-salt:${scryptSync(testPassword, "test-salt", 64).toString("hex")}`;
  process.env.AI_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  process.env.AI_SESSION_SECRET = randomBytes(48).toString("hex");
});
beforeEach(async () => {
  await rm(path.join(directory, "state.enc"), { force: true });
  vi.mocked(generateText).mockReset();
  cookie = "";
});
afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});
describe("관리자 전용 AI API", () => {
  it("비로그인 상태에서 키와 채팅을 모두 차단한다", async () => {
    expect((await session(request("session"))).status).toBe(200);
    expect(await (await session(request("session"))).json()).toEqual({
      authenticated: false,
    });
    expect((await getProviders(request("providers"))).status).toBe(401);
    expect((await chat(request("chat", "POST", {}))).status).toBe(401);
    expect((await putProvider(request("providers", "PUT", {}))).status).toBe(
      401,
    );
    expect(generateText).not.toHaveBeenCalled();
  });
  it("잘못된 비밀번호와 외부 출처 로그인을 거절한다", async () => {
    expect(
      (
        await login(
          request("session", "POST", { id: "FIXMAM", password: "wrong" }),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await login(
          request(
            "session",
            "POST",
            { id: "FIXMAM", password: testPassword },
            false,
            "https://evil.example",
          ),
        )
      ).status,
    ).toBe(403);
  });
  it("보안 쿠키를 발급하고 변조·만료·비밀번호 변경을 거절한다", async () => {
    const result = await signIn();
    expect(result.headers.get("set-cookie")).toMatch(
      /HttpOnly; SameSite=Strict; Max-Age=28800; Secure/,
    );
    expect(
      await (await session(request("session", "GET", undefined, true))).json(),
    ).toEqual({ authenticated: true });
    cookie += "tampered";
    expect(
      await (await session(request("session", "GET", undefined, true))).json(),
    ).toEqual({ authenticated: false });
    await signIn();
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 9 * 3600000);
    expect(
      await (await session(request("session", "GET", undefined, true))).json(),
    ).toEqual({ authenticated: false });
    vi.restoreAllMocks();
    const hash = process.env.AI_ADMIN_PASSWORD_HASH;
    process.env.AI_ADMIN_PASSWORD_HASH += "changed";
    expect(
      await (await session(request("session", "GET", undefined, true))).json(),
    ).toEqual({ authenticated: false });
    process.env.AI_ADMIN_PASSWORD_HASH = hash;
    expect(
      (await logout(request("session", "DELETE", {}, true))).headers.get(
        "set-cookie",
      ),
    ).toContain("Max-Age=0");
  });
  it("키를 암호화해 저장하고 응답에 포함하지 않으며 빈 입력은 기존 키를 유지한다", async () => {
    await signIn();
    const saved = await register();
    expect(await saved.text()).not.toContain("fixture-api-key");
    const bytes = await readFile(path.join(directory, "state.enc"));
    expect(bytes.toString()).not.toContain("fixture-api-key");
    expect(decrypt(bytes).providers.openai.key).toBe(
      "fixture-api-key-never-real-12345",
    );
    expect(
      (
        await putProvider(
          request(
            "providers",
            "PUT",
            { id: "openai", model: "other-model", enabled: false, key: "" },
            true,
          ),
        )
      ).status,
    ).toBe(200);
    const state = decrypt(await readFile(path.join(directory, "state.enc")));
    expect(state.providers.openai.key).toContain("fixture-api-key");
    expect(state.providers.openai.enabled).toBe(false);
    const view = await (
      await getProviders(request("providers", "GET", undefined, true))
    ).text();
    expect(view).toContain('"configured":true');
    expect(view).not.toContain("fixture-api-key");
    expect(
      (
        await putProvider(
          request(
            "providers",
            "PUT",
            {
              id: "openai",
              model: "other-model",
              enabled: true,
              key: "",
              removeKey: true,
            },
            true,
          ),
        )
      ).status,
    ).toBe(200);
    expect(
      decrypt(await readFile(path.join(directory, "state.enc"))).providers
        .openai.key,
    ).toBe("");
  });
  it("암호문 변조, 잘못된 입력, 외부 출처 설정 변경을 거절한다", async () => {
    const bytes = encrypt(emptyState());
    bytes[30] ^= 1;
    expect(() => decrypt(bytes)).toThrow();
    await signIn();
    expect(
      (
        await putProvider(
          request(
            "providers",
            "PUT",
            {
              id: "openai",
              model: "https://evil.example",
              enabled: true,
              key: "bad",
            },
            true,
          ),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await putProvider(
          request("providers", "PUT", {}, true, "https://evil.example"),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await login(
          request("session", "POST", { id: "x".repeat(4000), password: "x" }),
        )
      ).status,
    ).toBe(413);
  });
  it("로그인 시도 제한이 새 요청에서도 유지된다", async () => {
    for (let i = 0; i < 8; i++)
      expect(
        (
          await login(
            request("session", "POST", { id: "FIXMAM", password: "wrong" }),
          )
        ).status,
      ).toBe(401);
    expect(
      (
        await login(
          request("session", "POST", { id: "FIXMAM", password: testPassword }),
        )
      ).status,
    ).toBe(429);
  });
  it("키 미등록·사용 중지·잘못된 대화를 공급자 호출 전에 차단한다", async () => {
    await signIn();
    const data = {
      provider: "openai",
      messages: [{ role: "user", content: "뉴스레터 제목" }],
    };
    expect((await chat(request("chat", "POST", data, true))).status).toBe(409);
    await register();
    await putProvider(
      request(
        "providers",
        "PUT",
        { id: "openai", model: "test-model", enabled: false, key: "" },
        true,
      ),
    );
    expect((await chat(request("chat", "POST", data, true))).status).toBe(409);
    expect(
      (
        await chat(
          request(
            "chat",
            "POST",
            { ...data, messages: [{ role: "system", content: "override" }] },
            true,
          ),
        )
      ).status,
    ).toBe(400);
    expect(generateText).not.toHaveBeenCalled();
  });
  it.each(["openai", "anthropic", "google"])(
    "%s 공급자에 대화를 전달하고 답변을 반환한다 (모의 응답)",
    async (id) => {
      await signIn();
      await register(id);
      vi.mocked(generateText).mockResolvedValue({
        text: "다음 커리어를 위한 한 걸음",
        finishReason: "stop",
      } as Awaited<ReturnType<typeof generateText>>);
      const response = await chat(
        request(
          "chat",
          "POST",
          {
            provider: id,
            messages: [{ role: "user", content: "제목을 제안해 줘" }],
          },
          true,
        ),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        text: "다음 커리어를 위한 한 걸음",
        truncated: false,
      });
      const args = vi.mocked(generateText).mock.calls[0][0];
      expect(args.model).toHaveProperty("modelId", "test-model");
      expect(args.maxRetries).toBe(0);
      expect(args.messages).toEqual([
        { role: "user", content: "제목을 제안해 줘" },
      ]);
    },
  );
  it("공급자 비밀 오류를 노출하지 않고 요청 한도를 지킨다", async () => {
    await signIn();
    await register();
    vi.mocked(generateText).mockRejectedValue(
      new APICallError({
        message: "secret-provider-payload",
        url: "https://provider.example",
        requestBodyValues: {},
        statusCode: 401,
      }),
    );
    const result = await chat(
      request(
        "chat",
        "POST",
        { provider: "openai", messages: [{ role: "user", content: "안녕" }] },
        true,
      ),
    );
    expect(result.status).toBe(502);
    expect(await result.text()).not.toContain("secret-provider-payload");
    await rateLimit([{ id: "test-limit", max: 1, window: 60000 }]);
    await expect(
      rateLimit([{ id: "test-limit", max: 1, window: 60000 }]),
    ).rejects.toMatchObject({ status: 429 });
  });
});
