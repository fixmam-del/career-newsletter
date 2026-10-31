const sampleUrl = "/sample-career.png";
import { now, type Asset } from "./domain";
export const sampleAssetId = "fd28461b-2629-4dc1-870b-509452df9e80";
export const sampleAssetView = {
  [sampleAssetId]: { url: sampleUrl, name: "sample-career.png" },
};
export async function sampleAssets(): Promise<Asset[]> {
  const blob = await (await fetch(sampleUrl)).blob();
  return [
    {
      id: sampleAssetId,
      originalName: "sample-career.png",
      mimeType: "image/png",
      byteSize: blob.size,
      width: 800,
      height: 300,
      originalBlob: blob,
      thumbnailBlob: null,
      deletedAt: null,
      createdAt: now(),
      updatedAt: now(),
    },
  ];
}
