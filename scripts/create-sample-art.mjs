// 외부 이미지가 필요 없는 번들 샘플 그래픽입니다.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
const w = 800,
  h = 300,
  rows = Buffer.alloc(h * (w * 3 + 1));
for (let y = 0; y < h; y++)
  for (let x = 0; x < w; x++) {
    let color = [237, 245, 253];
    if (x % 40 === 0 || y % 40 === 0) color = [218, 233, 246];
    const dx = x - 590,
      dy = y - 145,
      dist = Math.hypot(dx, dy);
    if (dist < 119) {
      const light = Math.max(0, 1 - Math.hypot(x - 545, y - 100) / 240);
      color = [
        Math.round(light * 55),
        Math.round(60 + light * 100),
        Math.round(120 + light * 100),
      ];
    }
    const ellipse = Math.abs(
      ((dx * 0.87 + dy * 0.5) / 200) ** 2 +
        ((-dx * 0.5 + dy * 0.87) / 65) ** 2 -
        1,
    );
    if (ellipse < 0.025) color = [66, 219, 176];
    if (x > 50 && x < 350 && y > 90 && y < 102) color = [0, 91, 172];
    if (x > 50 && x < 280 && y > 125 && y < 133) color = [138, 171, 204];
    if (x > 50 && x < 325 && y > 148 && y < 156) color = [182, 204, 225];
    if (x > 50 && x < 160 && y > 190 && y < 218) color = [0, 91, 172];
    const i = y * (w * 3 + 1) + 1 + x * 3;
    for (let c = 0; c < 3; c++) rows[i + c] = color[c];
  }
const crc = (b) => {
  let n = 0xffffffff;
  for (const v of b) {
    n ^= v;
    for (let i = 0; i < 8; i++) n = (n >>> 1) ^ (n & 1 ? 0xedb88320 : 0);
  }
  return (n ^ 0xffffffff) >>> 0;
};
const chunk = (name, data) => {
  const body = Buffer.concat([Buffer.from(name), data]),
    size = Buffer.alloc(4),
    sum = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  sum.writeUInt32BE(crc(body));
  return Buffer.concat([size, body, sum]);
};
const header = Buffer.alloc(13);
header.writeUInt32BE(w);
header.writeUInt32BE(h, 4);
header[8] = 8;
header[9] = 2;
mkdirSync("public", { recursive: true });
writeFileSync(
  "public/sample-career.png",
  Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]),
);
