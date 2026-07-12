/**
 * Declaração de tipos para bwip-js
 * Necessária porque bwip-js não possui "main" ou "exports" declarados no package.json
 * TypeScript com moduleResolution: "bundler" não consegue resolver o entry point automaticamente
 */

declare module 'bwip-js' {
  interface BwipJsOptions {
    bcid: string
    text: string
    scale?: number
    height?: number
    width?: number
    includetext?: boolean
    [key: string]: string | number | boolean | undefined
  }

  interface BwipJs {
    toCanvas(
      canvas: HTMLCanvasElement,
      options: BwipJsOptions
    ): Promise<void>
  }

  const bwipjs: BwipJs
  export = bwipjs
}
