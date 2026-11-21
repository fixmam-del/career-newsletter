import { z } from "zod";
import { authenticated, validLogin, sessionCookie } from "../server/auth.js";
import { endpoint, json, body, sameOrigin, HttpError } from "../server/http.js";
import { rateLimit, loginLimits } from "../server/state.js";
export const GET = (request: Request) =>
  endpoint(async () => json({ authenticated: authenticated(request) }));
export const POST = (request: Request) =>
  endpoint(async () => {
    sameOrigin(request);
    const input = z
      .object({ id: z.string().max(80), password: z.string().min(1).max(256) })
      .safeParse(await body(request, 2048));
    if (!input.success)
      throw new HttpError(400, "아이디와 비밀번호를 입력해 주세요.");
    await rateLimit(loginLimits(request));
    if (!(await validLogin(input.data.id, input.data.password)))
      throw new HttpError(401, "아이디 또는 비밀번호를 확인해 주세요.");
    return json({ authenticated: true }, 200, {
      "Set-Cookie": sessionCookie(request),
    });
  });
export const DELETE = (request: Request) =>
  endpoint(async () => {
    sameOrigin(request);
    return json({ authenticated: false }, 200, {
      "Set-Cookie": sessionCookie(request, true),
    });
  });
