/**
 * Ambient types for bwip-js.
 * Package ships without reliable types on Vercel/npm install; @types/bwip-js is v3-only.
 */
declare module 'bwip-js' {
  type BwipOptions = Record<string, string | number | boolean>

  interface BwipJs {
    toCanvas(
      canvas: HTMLCanvasElement,
      opts: BwipOptions,
    ): Promise<void>
  }

  const bwipjs: BwipJs
  export default bwipjs
}
