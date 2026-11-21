import {
  createHmac,
  timingSafeEqual,
  scrypt as scryptCallback,
  randomBytes,
} from "node:crypto";
import { promisify } from "node:util";
import { HttpError } from "./http.js";
const scrypt = promisify(scryptCallback);
const cookieName = "career_admin";
const lifetime = 8 * 60 * 60;
function secret() {
  const value = process.env.AI_SESSION_SECRET;
  if (!value || value.length < 32 || !process.env.AI_ADMIN_PASSWORD_HASH)
    throw new Error("Auth configuration missing");
  return value;
}
function sign(payload: string) {
  return createHmac("sha256", secret())
    .update(payload + process.env.AI_ADMIN_PASSWORD_HASH)
    .digest("base64url");
}
export function authenticated(request: Request) {
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(cookieName + "="))
    ?.slice(cookieName.length + 1);
  if (!token || token.length > 1024) return false;
  try {
    const [payload, signature, extra] = token.split(".");
    if (!payload || !signature || extra) return false;
    const actual = Buffer.from(signature),
      expected = Buffer.from(sign(payload));
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      return false;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return (
      data.role === "admin" &&
      data.exp > Date.now() &&
      data.exp <= Date.now() + lifetime * 1000
    );
  } catch {
    return false;
  }
}
export function requireAdmin(request: Request) {
  if (!authenticated(request))
    throw new HttpError(401, "관리자 로그인이 필요합니다.");
}
export async function validLogin(id: string, password: string) {
  secret();
  const [scheme, salt, hash] = (process.env.AI_ADMIN_PASSWORD_HASH || "").split(
    ":",
  );
  if (scheme !== "scrypt" || !salt || !hash)
    throw new Error("Invalid password configuration");
  const actual = (await scrypt(password, salt, 64)) as Buffer,
    expected = Buffer.from(hash, "hex");
  return (
    actual.length === expected.length &&
    timingSafeEqual(actual, expected) &&
    id === (process.env.AI_ADMIN_ID || "FIXMAM")
  );
}
export function sessionCookie(request: Request, clear = false) {
  const payload = Buffer.from(
    JSON.stringify({
      role: "admin",
      exp: Date.now() + lifetime * 1000,
      nonce: randomBytes(16).toString("hex"),
    }),
  ).toString("base64url");
  const token = clear ? "" : `${payload}.${sign(payload)}`;
  return `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : lifetime}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}
