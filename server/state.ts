import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  open,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import { get, put } from "@vercel/blob";
import { providers, type ProviderId } from "../src/ai-types.js";
import { HttpError } from "./http.js";
type Provider = {
  model: string;
  enabled: boolean;
  key: string;
  updatedAt?: string;
};
export type State = {
  version: 1;
  providers: Record<ProviderId, Provider>;
  limits: Record<string, { count: number; until: number }>;
};
const blobPath = "admin/ai-state-v1.enc";
function key() {
  const value = Buffer.from(process.env.AI_ENCRYPTION_KEY || "", "base64");
  if (value.length !== 32) throw new Error("Encryption configuration missing");
  return value;
}
export function emptyState(): State {
  return {
    version: 1,
    providers: Object.fromEntries(
      providers.map((p) => [p.id, { model: p.model, enabled: true, key: "" }]),
    ) as State["providers"],
    limits: {},
  };
}
export function encrypt(state: State) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(state), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}
export function decrypt(data: Uint8Array): State {
  const bytes = Buffer.from(data),
    cipher = createDecipheriv("aes-256-gcm", key(), bytes.subarray(0, 12));
  cipher.setAuthTag(bytes.subarray(12, 28));
  const state = JSON.parse(
    Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString(
      "utf8",
    ),
  ) as State;
  if (state.version !== 1 || !state.providers || !state.limits)
    throw new Error("Invalid state");
  return state;
}
const cloud = () => process.env.VERCEL === "1";
const directory = () =>
  path.resolve(process.env.AI_LOCAL_STATE_DIR || ".local-ai");
async function readState(): Promise<{ state: State; etag?: string }> {
  if (cloud()) {
    const result = await get(blobPath, { access: "private", useCache: false });
    if (!result) return { state: emptyState() };
    if (result.statusCode !== 200 || !result.stream)
      throw new Error("Storage read failed");
    return {
      state: decrypt(
        new Uint8Array(await new Response(result.stream).arrayBuffer()),
      ),
      etag: result.blob.etag,
    };
  }
  try {
    return {
      state: decrypt(await readFile(path.join(directory(), "state.enc"))),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return { state: emptyState() };
    throw error;
  }
}
export async function getState() {
  return (await readState()).state;
}
export async function updateState<T>(change: (state: State) => T): Promise<T> {
  let release: (() => Promise<void>) | undefined;
  if (!cloud()) {
    await mkdir(directory(), { recursive: true });
    const lockPath = path.join(directory(), "state.lock");
    try {
      const lock = await open(lockPath, "wx");
      release = async () => {
        await lock.close();
        await unlink(lockPath);
      };
    } catch {
      throw new HttpError(
        409,
        "다른 요청을 처리 중입니다. 잠시 후 다시 시도해 주세요.",
      );
    }
  }
  try {
    const { state, etag } = await readState();
    const result = change(state),
      encrypted = encrypt(state);
    if (cloud()) {
      try {
        await put(blobPath, encrypted, {
          access: "private",
          addRandomSuffix: false,
          cacheControlMaxAge: 60,
          ...(etag
            ? { allowOverwrite: true, ifMatch: etag }
            : { allowOverwrite: false }),
        });
      } catch (error) {
        if (
          (error as Error).name.includes("Precondition") ||
          (error as Error).name.includes("Conflict")
        )
          throw new HttpError(
            409,
            "다른 요청과 겹쳤습니다. 잠시 후 다시 시도해 주세요.",
          );
        throw error;
      }
    } else {
      const tmp = path.join(
        directory(),
        `state-${randomBytes(8).toString("hex")}.tmp`,
      );
      await writeFile(tmp, encrypted, { mode: 0o600 });
      await rename(tmp, path.join(directory(), "state.enc"));
    }
    return result;
  } finally {
    await release?.();
  }
}
export async function rateLimit(
  items: { id: string; max: number; window: number }[],
) {
  const allowed = await updateState((state) => {
    const now = Date.now();
    for (const [id, value] of Object.entries(state.limits))
      if (value.until <= now) delete state.limits[id];
    if (Object.keys(state.limits).length > 512) return false;
    if (items.some((i) => (state.limits[i.id]?.count || 0) >= i.max))
      return false;
    for (const i of items) {
      state.limits[i.id] ??= { count: 0, until: now + i.window };
      state.limits[i.id].count++;
    }
    return true;
  });
  if (!allowed)
    throw new HttpError(
      429,
      "요청 횟수가 많습니다. 잠시 후 다시 시도해 주세요.",
    );
}
export function loginLimits(request: Request) {
  // Vercel이 설정한 헤더만 신뢰한다. 로컬 환경에서는 하나의 버킷을 사용한다.
  const ip = cloud()
    ? request.headers.get("x-vercel-forwarded-for") || "unknown"
    : "local";
  const hash = createHash("sha256").update(ip).digest("hex").slice(0, 24);
  return [
    { id: `login:${hash}`, max: 8, window: 900000 },
    { id: "login:global", max: 40, window: 900000 },
  ];
}
