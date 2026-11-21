import { z } from "zod";
import { generateText, APICallError } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { requireAdmin } from "../server/auth.js";
import { endpoint, json, body, sameOrigin, HttpError } from "../server/http.js";
import { getState, rateLimit } from "../server/state.js";
export const maxDuration = 60;
export const POST = (request: Request) =>
  endpoint(async () => {
    requireAdmin(request);
    sameOrigin(request);
    const input = z
      .object({
        provider: z.enum(["openai", "anthropic", "google"]),
        messages: z
          .array(
            z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string().trim().min(1).max(6000),
            }),
          )
          .min(1)
          .max(15),
      })
      .safeParse(await body(request, 96000));
    if (
      !input.success ||
      input.data.messages.at(-1)?.role !== "user" ||
      input.data.messages.reduce((n, m) => n + m.content.length, 0) > 24000
    )
      throw new HttpError(
        400,
        "메시지가 너무 깁니다. 새 대화를 시작하거나 내용을 줄여 주세요.",
      );
    const config = (await getState()).providers[input.data.provider];
    if (!config.enabled || !config.key)
      throw new HttpError(
        409,
        "관리자 설정에서 이 AI의 API 키를 등록하고 사용을 켜 주세요.",
      );
    await rateLimit([
      { id: "chat:minute", max: 15, window: 60000 },
      { id: "chat:hour", max: 180, window: 3600000 },
    ]);
    const model =
      input.data.provider === "openai"
        ? createOpenAI({ apiKey: config.key }).responses(config.model)
        : input.data.provider === "anthropic"
          ? createAnthropic({ apiKey: config.key })(config.model)
          : createGoogleGenerativeAI({ apiKey: config.key }).interactions(
              config.model,
            );
    try {
      const result = await generateText({
        model,
        instructions:
          "당신은 대학 커리어 뉴스레터 편집 도우미입니다. 한국어로 명확하고 실용적으로 답하세요. 제공되지 않은 채용 일정·링크·통계는 지어내지 말고 확인이 필요하다고 표시하세요. 요청에 맞게 제목, 소개, 프로그램 안내, 초안을 제안하세요.",
        messages: input.data.messages,
        maxOutputTokens: 3000,
        maxRetries: 0,
        abortSignal: AbortSignal.any([
          request.signal,
          AbortSignal.timeout(50000),
        ]),
        providerOptions: {
          openai: { store: false, reasoningEffort: "low" },
          google: { store: false, thinkingLevel: "low" },
        },
      });
      if (!result.text.trim())
        throw new HttpError(
          502,
          "AI가 텍스트를 반환하지 않았습니다. 다시 질문해 주세요.",
        );
      return json({
        text: result.text,
        truncated: result.finishReason === "length",
      });
    } catch (error) {
      if (error instanceof HttpError) throw error;
      if (APICallError.isInstance(error)) {
        const status = error.statusCode;
        throw new HttpError(
          status === 429 ? 429 : 502,
          status === 401 || status === 403
            ? "API 키의 유효성과 해당 모델의 사용 권한을 확인해 주세요."
            : status === 429
              ? "AI 제공업체의 사용 한도 또는 잔액을 확인해 주세요."
              : status === 404
                ? "모델 ID 또는 해당 모델의 접근 권한을 확인해 주세요."
                : "AI 제공업체 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        );
      }
      throw new HttpError(
        502,
        "AI 응답을 받지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
    }
  });
