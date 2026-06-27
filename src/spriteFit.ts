/**
 * Sprite art is authored at arbitrary source resolutions — some PNGs are 2048×2732. Rendering
 * them at scale 1.0 would make them gigantic, so on-screen size must be enforced independently of
 * the source pixel resolution. {@link fitHeightScale} returns the scale that renders `sourceHeight`
 * source pixels as `targetPx` on screen (aspect ratio preserved). Multiply in any extra art scale
 * (e.g. a random size variation) after.
 */
export function fitHeightScale(sourceHeight: number, targetPx: number): number {
  return sourceHeight > 0 ? targetPx / sourceHeight : 1;
}
