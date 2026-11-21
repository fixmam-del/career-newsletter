export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function aiApi<T>(
  path: string,
  method = "GET",
  data?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/${path}`, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      signal,
      ...(method !== "GET"
        ? {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data || {}),
          }
        : {}),
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new ApiError(
      0,
      "서버에 연결하지 못했습니다. 네트워크를 확인해 주세요.",
    );
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw new ApiError(
      response.status,
      "서버 응답을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    );
  }
  if (!response.ok)
    throw new ApiError(
      response.status,
      result.error || "요청을 처리하지 못했습니다.",
    );
  return result as T;
}
