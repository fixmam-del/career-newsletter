import { db } from "./storage";
import { uuid, now, type Asset } from "./domain";
export const attachmentTypes: Record<string, string[]> = {
  pdf: ["application/pdf"],
  docx: [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  pptx: [
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ],
  txt: ["text/plain"],
  csv: ["text/csv", "application/vnd.ms-excel", "text/plain"],
};
export const imageTypes: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};
export async function upload(file: File, image: boolean): Promise<Asset> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  if (
    image
      ? imageTypes[ext] !== file.type
      : !attachmentTypes[ext]?.includes(file.type)
  )
    throw Error(
      image
        ? "JPEG, PNG, WebP 이미지만 업로드해 주세요."
        : "PDF, DOCX, XLSX, PPTX, TXT, CSV 첨부만 지원합니다.",
    );
  if (file.size > (image ? 10 : 20) * 1024 * 1024)
    throw Error(`파일은 ${image ? 10 : 20}MB 이하여야 합니다.`);
  const estimate = await navigator.storage?.estimate?.();
  if (
    estimate?.quota &&
    estimate.usage &&
    estimate.quota - estimate.usage < file.size * 2
  )
    throw Error("저장공간이 부족합니다. 백업 후 파일을 정리해 주세요.");
  let width = null,
    height = null,
    thumb: Blob | null = null;
  if (image) {
    const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const actual =
      bytes[0] === 0xff && bytes[1] === 0xd8
        ? "image/jpeg"
        : bytes[0] === 137 &&
            bytes[1] === 80 &&
            bytes[2] === 78 &&
            bytes[3] === 71
          ? "image/png"
          : String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
              String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
            ? "image/webp"
            : null;
    if (actual !== file.type)
      throw Error(
        "이미지 내용과 확장자·형식이 다릅니다. 원본 형식으로 다시 저장해 주세요.",
      );
    const bitmap = await createImageBitmap(file).catch(() => {
      throw Error("이미지를 해독할 수 없습니다. 다른 파일을 선택해 주세요.");
    });
    width = bitmap.width;
    height = bitmap.height;
    if (width * height > 25000000) {
      bitmap.close();
      throw Error("이미지는 25메가픽셀 이하여야 합니다.");
    }
    const factor = Math.min(1, 1600 / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * factor);
    canvas.height = Math.round(height * factor);
    canvas
      .getContext("2d")!
      .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    thumb = await new Promise<Blob | null>((r) =>
      canvas.toBlob(r, file.type, 0.9),
    );
  }
  const a: Asset = {
    id: uuid(),
    originalName: file.name,
    mimeType: file.type,
    byteSize: file.size,
    width,
    height,
    originalBlob: file,
    thumbnailBlob: thumb,
    createdAt: now(),
    updatedAt: now(),
    deletedAt: null,
  };
  await db.assets.add(a);
  return a;
}
export const dataUrl = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(Error("파일을 읽을 수 없습니다"));
    r.readAsDataURL(b);
  });
export const download = (data: Blob, name: string) => {
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
};
