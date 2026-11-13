// How alike two pictures are. SSIM (structural similarity) scores a saved photo against its
// original: 1 means identical. It is measured on brightness, which is what the eye notices first,
// as the website does for its photos (scripts/lib/photo.mjs in romitraj.dev). "samePixels" checks
// that a lossless file gives back exactly the original pixels.

// A Gaussian blur (11 taps, sigma 1.5, as in the SSIM paper), along rows then columns. Edges
// repeat their last pixel.
const kernel = (() => {
  const taps = Array.from({ length: 11 }, (_, index) =>
    Math.exp(-((index - 5) ** 2) / (2 * 1.5 ** 2)),
  );
  const total = taps.reduce((sum, tap) => sum + tap, 0);
  return Float64Array.from(taps, (tap) => tap / total);
})();

function blur(values, width, height) {
  const across = new Float64Array(values.length);
  const result = new Float64Array(values.length);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let k = 0; k < 11; k++) {
        const at = Math.min(width - 1, Math.max(0, x + k - 5));
        sum += kernel[k] * values[row + at];
      }
      across[row + x] = sum;
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let k = 0; k < 11; k++) {
        const at = Math.min(height - 1, Math.max(0, y + k - 5));
        sum += kernel[k] * across[at * width + x];
      }
      result[y * width + x] = sum;
    }
  }
  return result;
}

/** The mean structural similarity of two grey pictures of the same size (Wang et al., 2004). */
export function ssim(a, b, width, height) {
  if (a.length !== width * height || b.length !== width * height)
    throw new Error("ssim: both pictures must be width x height in size.");
  const [c1, c2] = [(0.01 * 255) ** 2, (0.03 * 255) ** 2];
  const product = (x, y) => Float64Array.from(x, (value, index) => value * y[index]);
  const meanA = blur(a, width, height);
  const meanB = blur(b, width, height);
  const squaresA = blur(product(a, a), width, height);
  const squaresB = blur(product(b, b), width, height);
  const products = blur(product(a, b), width, height);
  let total = 0;
  for (let index = 0; index < a.length; index++) {
    const [ma, mb] = [meanA[index], meanB[index]];
    const varianceA = squaresA[index] - ma * ma;
    const varianceB = squaresB[index] - mb * mb;
    const covariance = products[index] - ma * mb;
    total +=
      ((2 * ma * mb + c1) * (2 * covariance + c2)) /
      ((ma * ma + mb * mb + c1) * (varianceA + varianceB + c2));
  }
  return total / a.length;
}

/** The brightness of each pixel of an RGBA picture (BT.601 weights). */
export const luma = (rgba) =>
  Float64Array.from(
    { length: rgba.length / 4 },
    (_, index) =>
      0.299 * rgba[index * 4] + 0.587 * rgba[index * 4 + 1] + 0.114 * rgba[index * 4 + 2],
  );

/**
 * Whether two RGBA pictures show exactly the same thing: every pixel's see-through amount is the
 * same, and where a pixel can be seen at all, its colour is the same. (A fully see-through pixel
 * has no colour worth keeping, and an encoder may store any there.)
 */
export function samePixels(a, b) {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 4) {
    if (a[index + 3] !== b[index + 3]) return false;
    if (a[index + 3] === 0) continue;
    if (a[index] !== b[index] || a[index + 1] !== b[index + 1] || a[index + 2] !== b[index + 2])
      return false;
  }
  return true;
}

/**
 * The lowest quality (1 to 100) whose score reaches the target, found by halving the range each
 * time. "score" is an async function of the quality. If none reaches it, 100.
 */
export async function lowestQuality(score, target) {
  let [low, high] = [1, 100];
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((await score(middle)) >= target) high = middle;
    else low = middle + 1;
  }
  return low;
}
