// What the page offers for an image: read from the manifest the picture maker writes before every
// build (scripts/pictures/). Used by src/components/ui/Picture.astro at build time.
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { ImageMetadata } from "astro";

export interface PictureRecord {
  kind: "photo" | "lossless";
  width: number;
  height: number;
  /** JPEG XL and AVIF, smallest first, only where smaller than the original format. */
  sources: { type: string; srcset: string }[];
  /** The original format, which every browser shows. */
  fallback: { type: string; src: string; srcset: string };
}

const manifestFile = join(
  process.cwd(),
  "node_modules",
  ".cache",
  "dilettante-pictures",
  "manifest.json",
);

/** The record for an imported image, or undefined while the dev server is still making it. */
export const pictureFor = (image: ImageMetadata): PictureRecord | undefined => {
  // Astro keeps the source file's path on imported images, hidden from enumeration.
  const fsPath = (image as ImageMetadata & { fsPath?: string }).fsPath;
  const manifest: Record<string, PictureRecord> = existsSync(manifestFile)
    ? JSON.parse(readFileSync(manifestFile, "utf8"))
    : {};
  const record = fsPath
    ? manifest[relative(process.cwd(), fsPath).split("\\").join("/")]
    : undefined;
  if (!record && import.meta.env.PROD)
    throw new Error(
      `No pictures were made for ${fsPath ?? image.src}. Is it under src/content/blog or src/assets?`,
    );
  return record;
};
