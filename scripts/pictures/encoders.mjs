// The formats a picture is saved in, each with a way to save (encode) a picture given as RGBA pixels
// and to read (decode) the saved file back into RGBA pixels, so it can be scored. JPEG XL uses the
// jSquash WebAssembly build (sharp's own build has no JPEG XL); everything else uses sharp.
// "quality" is 1 to 100, or "lossless". "effort" says how hard each encoder tries (EFFORT): more
// effort makes smaller files, slowly.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import encodeJxl, { init as initJxlEncoder } from "@jsquash/jxl/encode.js";
import decodeJxl, { init as initJxlDecoder } from "@jsquash/jxl/decode.js";
import sharp from "sharp";

// The JPEG XL encoder and decoder are WebAssembly files inside their package, loaded once.
let jxlReady;
const loadJxl = () => {
  jxlReady ??= (async () => {
    const codec = join(dirname(createRequire(import.meta.url).resolve("@jsquash/jxl")), "codec");
    const compile = (file) => WebAssembly.compile(readFileSync(join(codec, file)));
    await initJxlEncoder(await compile("enc/jxl_enc.wasm"));
    await initJxlDecoder(await compile("dec/jxl_dec.wasm"));
  })();
  return jxlReady;
};

/**
 * How hard each encoder works. "full" is what picture-cache/ holds ("pnpm run pictures"). "quick"
 * is for an image that has nothing there yet, made during a build: each takes well under a minute,
 * and the files are a little larger.
 */
export const EFFORT = {
  full: { jxl: 7, avif: 4, png: 9 },
  quick: { jxl: 3, avif: 1, png: 6 },
};

const raw = (rgba, width, height) => sharp(rgba, { raw: { width, height, channels: 4 } });
const decodeWithSharp = async (buffer) =>
  new Uint8Array(await sharp(buffer).ensureAlpha().raw().toBuffer());

export const encoders = {
  jxl: {
    type: "image/jxl",
    extension: "jxl",
    async encode(rgba, width, height, quality, effort = EFFORT.full) {
      await loadJxl();
      const data = new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.length);
      const options =
        quality === "lossless"
          ? { lossless: true, effort: effort.jxl }
          : { quality, effort: effort.jxl };
      return Buffer.from(await encodeJxl({ data, width, height }, options));
    },
    async decode(buffer) {
      await loadJxl();
      const { data } = await decodeJxl(buffer);
      return new Uint8Array(data.buffer, data.byteOffset, data.length);
    },
  },
  avif: {
    type: "image/avif",
    extension: "avif",
    encode: (rgba, width, height, quality, effort = EFFORT.full) =>
      raw(rgba, width, height)
        .avif(
          quality === "lossless"
            ? { lossless: true, effort: effort.avif }
            : { quality, effort: effort.avif },
        )
        .toBuffer(),
    decode: decodeWithSharp,
  },
  jpg: {
    type: "image/jpeg",
    extension: "jpg",
    encode: (rgba, width, height, quality) =>
      raw(rgba, width, height)
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: quality === "lossless" ? 100 : quality, mozjpeg: true })
        .toBuffer(),
    decode: decodeWithSharp,
  },
  webp: {
    type: "image/webp",
    extension: "webp",
    encode: (rgba, width, height, quality) =>
      raw(rgba, width, height)
        .webp(quality === "lossless" ? { lossless: true } : { quality })
        .toBuffer(),
    decode: decodeWithSharp,
  },
  png: {
    type: "image/png",
    extension: "png",
    // Plain PNG (at its strongest compression for full effort): no palette, so no colour is ever changed.
    encode: (rgba, width, height, _quality, effort = EFFORT.full) =>
      raw(rgba, width, height).png({ compressionLevel: effort.png, palette: false }).toBuffer(),
    decode: decodeWithSharp,
  },
};

/** The encoder for a source file's own format, by its extension. */
export const originalEncoder = (extension) => {
  const name = extension.toLowerCase() === "jpeg" ? "jpg" : extension.toLowerCase();
  if (!(name in encoders) || name === "jxl" || name === "avif")
    throw new Error(`Pictures in .${extension} are not supported. Use JPEG, PNG or WebP.`);
  return encoders[name];
};
