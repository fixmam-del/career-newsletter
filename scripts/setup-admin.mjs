import { randomBytes, scryptSync } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
const destination = new URL("../.env.local", import.meta.url);
try {
  await readFile(destination);
  console.error(
    ".env.local이 이미 있습니다. 기존 설정을 보존하기 위해 종료합니다.",
  );
  process.exit(1);
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
let muted = false;
const output = new Writable({
  write(chunk, _encoding, next) {
    if (!muted) process.stdout.write(chunk);
    next();
  },
});
const input = createInterface({ input: process.stdin, output, terminal: true });
try {
  const id =
    (await input.question("관리자 아이디 (기본 FIXMAM): ")).trim() || "FIXMAM";
  process.stdout.write("관리자 비밀번호 (8자 이상, 화면에 표시되지 않음): ");
  muted = true;
  const password = await input.question("");
  muted = false;
  process.stdout.write("\n");
  if (
    password.length < 8 ||
    password.length > 256 ||
    !/^[a-zA-Z0-9_-]{1,80}$/.test(id)
  )
    throw new Error("아이디 형식 또는 비밀번호 길이를 확인해 주세요.");
  const salt = randomBytes(16).toString("hex");
  const values = {
    AI_ADMIN_ID: id,
    AI_ADMIN_PASSWORD_HASH: `scrypt:${salt}:${scryptSync(password, salt, 64).toString("hex")}`,
    AI_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    AI_SESSION_SECRET: randomBytes(48).toString("base64url"),
  };
  await writeFile(
    destination,
    Object.entries(values)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n") + "\n",
    { flag: "wx", mode: 0o600 },
  );
  console.log(
    "관리자 설정을 .env.local에 저장했습니다. npm run dev로 실행하세요.",
  );
} catch (e) {
  muted = false;
  console.error(e.message);
  process.exitCode = 1;
} finally {
  input.close();
}
