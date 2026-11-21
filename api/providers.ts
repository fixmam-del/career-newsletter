import { z } from "zod";
import { providers } from "../src/ai-types.js";
import { requireAdmin } from "../server/auth.js";
import { endpoint, json, body, sameOrigin, HttpError } from "../server/http.js";
import { getState, updateState, type State } from "../server/state.js";
function view(state: State) {
  return providers.map((p) => ({
    id: p.id,
    model: state.providers[p.id].model,
    enabled: state.providers[p.id].enabled,
    configured: !!state.providers[p.id].key,
    updatedAt: state.providers[p.id].updatedAt,
  }));
}
export const GET = (request: Request) =>
  endpoint(async () => {
    requireAdmin(request);
    return json({ providers: view(await getState()) });
  });
export const PUT = (request: Request) =>
  endpoint(async () => {
    requireAdmin(request);
    sameOrigin(request);
    const input = z
      .object({
        id: z.enum(["openai", "anthropic", "google"]),
        model: z
          .string()
          .min(1)
          .max(100)
          .regex(/^[a-zA-Z0-9._:-]+$/),
        enabled: z.boolean(),
        key: z
          .string()
          .trim()
          .max(400)
          .refine((v) => !v || (v.length >= 20 && !/\s/.test(v))),
        removeKey: z.boolean().optional(),
      })
      .safeParse(await body(request));
    if (!input.success)
      throw new HttpError(
        400,
        "모델 ID와 API 키 형식을 확인해 주세요. 키는 20자 이상이며 공백을 포함할 수 없습니다.",
      );
    const result = await updateState((state) => {
      const p = state.providers[input.data.id];
      p.model = input.data.model;
      p.enabled = input.data.enabled;
      if (input.data.removeKey) p.key = "";
      else if (input.data.key) p.key = input.data.key;
      p.updatedAt = new Date().toISOString();
      return view(state);
    });
    return json({ providers: result });
  });
