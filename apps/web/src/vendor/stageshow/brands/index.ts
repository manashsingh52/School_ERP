// @ts-nocheck: vendored Stageshow kit (MIT), written for a looser TypeScript config; see README.md
/**
 * Bastaa ships without the upstream brand artwork (third-party marks under their own licences).
 * The registry is empty; BrandMark falls back to a custom `name` and `src`.
 */
export type BrandAsset = {
  name: string
  category: 'Payments' | 'Banks' | 'Apps' | 'Crypto'
  light: string
  dark: string
  tileArtwork?: string
  tileBackground?: string
  proportion: number
  scale: number
}

export const brandMarks = {} as Record<string, BrandAsset>
export type BrandName = string
