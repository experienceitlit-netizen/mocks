// Mapeamento ÚNICO tipo de componente → forma do nó. O canvas (Graph.tsx)
// desenha a partir de `forma`; a legenda (Legend.tsx) usa a classe CSS
// equivalente, para que as duas nunca divirjam.
//
// As quatro formas foram escolhidas para se distinguirem no raio mínimo do
// mapa (~5 px): silhueta redonda, quadrada, girada e de cantos macios.
import type { TipoComponente } from './graph-types'
import { TIPOS_COMPONENTE } from './graph-types'

export type Forma = 'circulo' | 'quadrado' | 'losango' | 'quadrado-arredondado'

export interface FormaDef {
  forma: Forma
  /** Classe da amostra na legenda (definida em App.css). */
  css: string
  /** Complemento do rótulo da legenda. */
  nota?: string
}

export const FORMA_DE: Record<TipoComponente, FormaDef> = {
  'Tabela SQL': { forma: 'quadrado', css: 'legend__shape legend__shape--quadrado' },
  'Tabela Delta': {
    forma: 'losango',
    css: 'legend__shape legend__shape--losango',
    nota: 'glifo de tijolos (Databricks)',
  },
  Excel: { forma: 'quadrado-arredondado', css: 'legend__shape legend__shape--arredondado' },
  Default: { forma: 'circulo', css: 'legend__shape legend__shape--circulo' },
}

/** Ordem de exibição da legenda (a mesma do select do formulário). */
export const FORMAS_LEGENDA: ReadonlyArray<{ tipo: TipoComponente; def: FormaDef }> =
  TIPOS_COMPONENTE.map((tipo) => ({ tipo, def: FORMA_DE[tipo] }))

/** Meia-diagonal do losango em função do raio: a forma girada precisa de mais
 *  extensão para ter peso visual equivalente ao círculo. */
export const LOSANGO_S = 1.15

/** Extensão visual do nó além do centro, por forma (halo, âncora do balão e
 *  posição do rótulo). */
export function extentOf(tipo: TipoComponente, r: number): number {
  return FORMA_DE[tipo].forma === 'losango' ? r * LOSANGO_S : r
}

/** Silhueta do componente no path atual, pela forma do seu tipo. Deixa o path
 *  fechado e pronto para fill/stroke — quem chama decide cor e traço. */
export function traceShape(
  ctx: CanvasRenderingContext2D,
  tipo: TipoComponente,
  x: number,
  y: number,
  r: number,
): void {
  ctx.beginPath()
  switch (FORMA_DE[tipo].forma) {
    case 'quadrado': {
      // Quadrado com área ~equivalente ao círculo de raio r.
      const s = r * 0.9
      ctx.rect(x - s, y - s, 2 * s, 2 * s)
      return
    }
    case 'losango': {
      const s = r * LOSANGO_S
      ctx.moveTo(x, y - s)
      ctx.lineTo(x + s, y)
      ctx.lineTo(x, y + s)
      ctx.lineTo(x - s, y)
      ctx.closePath()
      return
    }
    case 'quadrado-arredondado': {
      const s = r * 0.9
      ctx.roundRect(x - s, y - s, 2 * s, 2 * s, s * 0.55)
      return
    }
    default:
      ctx.arc(x, y, r, 0, 2 * Math.PI)
  }
}
