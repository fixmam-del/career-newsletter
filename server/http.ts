export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin)
    throw new HttpError(403, "이 사이트에서 다시 요청해 주세요.");
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new HttpError(415, "올바른 요청 형식이 아닙니다.");
}
export async function body(request: Request, limit = 8192): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "입력 내용을 확인해 주세요.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new HttpError(413, "입력 내용이 너무 깁니다.");
    }
    chunks.push(part.value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "입력 내용을 확인해 주세요.");
  }
}
export async function endpoint(action: () => Promise<Response>) {
  try {
    return await action();
  } catch (error) {
    if (error instanceof HttpError)
      return json({ error: error.message }, error.status);
    // 원본 오류에는 공급자 응답이나 비밀 정보가 포함될 수 있어 출력하지 않는다.
    return json(
      {
        error:
          "서버 설정 또는 저장소 연결을 확인해 주세요. 잠시 후 다시 시도해 주세요.",
      },
      503,
    );
  }
}
