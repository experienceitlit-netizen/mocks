// Contrato de layout da vista em níveis: espaçamento vertical FIXO
// (NIVEIS_ROW_Y) entre os itens de uma coluna — nunca comprimido pela
// quantidade — coluna centrada em y=0 e faixa (yMin/yMax) derivada do
// primeiro/último item, crescendo conforme itens entram.
import { describe, expect, it } from 'vitest'
import type { GraphLinkData, GraphNodeData, NivelDef } from './graph-types'
import { buildLineage, NIVEIS_ROW_Y } from './lineage'

const NIVEIS: NivelDef[] = [
  { slug: 'raiz', titulo: 'Raiz', ordem: 0, builtin: true },
  { slug: 'final', titulo: 'Produto final', ordem: 20, builtin: true },
  { slug: 'bronze', titulo: 'Bronze', ordem: 40, builtin: false },
]

const RAIZ: GraphNodeData = { id: 'raiz', nome: 'Atacado — Dados', nivel: 'raiz' }
const PROD: GraphNodeData = { id: 'prod', nome: 'Produto', nivel: 'final' }

/** Grafo mínimo: a entrada consome um produto final + n componentes Bronze
 *  isolados (sem aresta — entram pelo inventário do foco no nível de entrada). */
function grafoComBronzes(n: number): { nodes: GraphNodeData[]; links: GraphLinkData[] } {
  const bronzes: GraphNodeData[] = Array.from({ length: n }, (_, i) => ({
    id: `bronze-${i + 1}`,
    nome: `Tabela ${i + 1}`,
    nivel: 'bronze',
  }))
  return {
    nodes: [RAIZ, PROD, ...bronzes],
    links: [{ source: 'raiz', target: 'prod', label: 'consome' }],
  }
}

function colunaBronze(n: number) {
  const { nodes, links } = grafoComBronzes(n)
  const lineage = buildLineage('raiz', nodes, links, NIVEIS)
  if (!lineage) throw new Error('lineage null')
  const col = lineage.columns.find((c) => c.slug === 'bronze')
  if (!col) throw new Error('coluna Bronze ausente')
  const ys = lineage.graph.nodes
    .filter((node) => node.fx === col.x)
    .map((node) => node.fy ?? Number.NaN)
    .sort((a, b) => a - b)
  return { col, ys }
}

describe('layout vertical das colunas da vista em níveis', () => {
  it('espaçamento entre itens é NIVEIS_ROW_Y, independente da quantidade', () => {
    for (const n of [3, 9]) {
      const { ys } = colunaBronze(n)
      expect(ys).toHaveLength(n)
      const gaps = ys.slice(1).map((y, i) => y - ys[i])
      expect(gaps).toEqual(Array(n - 1).fill(NIVEIS_ROW_Y))
    }
  })

  it('coluna centrada em y=0 e faixa derivada do primeiro/último item', () => {
    const { col, ys } = colunaBronze(9)
    expect(ys[0] + ys[ys.length - 1]).toBe(0)
    expect(col.yMin).toBe(ys[0])
    expect(col.yMax).toBe(ys[ys.length - 1])
  })

  it('faixa cresce com a quantidade de itens (nunca altura fixa)', () => {
    const altura = (n: number) => {
      const { col } = colunaBronze(n)
      return col.yMax - col.yMin
    }
    expect(altura(3)).toBe(2 * NIVEIS_ROW_Y)
    expect(altura(9)).toBe(8 * NIVEIS_ROW_Y)
  })
})
