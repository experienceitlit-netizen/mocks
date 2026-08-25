// Contrato de layout da vista em níveis: espaçamento vertical FIXO
// (NIVEIS_ROW_Y) entre os itens de uma coluna — nunca comprimido pela
// quantidade — coluna centrada em y=0 e faixa (yMin/yMax) derivada do
// primeiro/último item, crescendo conforme itens entram (ex.: cadastro de
// novas fontes secundárias).
import { describe, expect, it } from 'vitest'
import type { GraphLinkData, GraphNodeData } from './graph-types'
import { buildLineage, NIVEIS_ROW_Y } from './lineage'

const RAIZ: GraphNodeData = { id: 'raiz', nome: 'Atacado — Dados', tipo: 'dominio', nivel: 'raiz' }
const PROD: GraphNodeData = { id: 'prod', nome: 'Produto', nivel: 'final', sistema: null, origem: null }

/** Grafo mínimo: raiz agrega um produto final + n tabelas UCS cadastradas
 *  (isoladas, sem associações — entram pelo inventário do foco na raiz). */
function grafoComFsecs(n: number): { nodes: GraphNodeData[]; links: GraphLinkData[] } {
  const fsecs: GraphNodeData[] = Array.from({ length: n }, (_, i) => ({
    id: `fsec-t${i + 1}`,
    nome: `Teste FS ${i + 1}`,
    tipo: 'fonte-secundaria',
    derivado: true,
    cadastrado: true,
  }))
  return {
    nodes: [RAIZ, PROD, ...fsecs],
    links: [{ source: 'raiz', target: 'prod', label: 'agrega' }],
  }
}

function colunaFsec(n: number) {
  const { nodes, links } = grafoComFsecs(n)
  const lineage = buildLineage('raiz', nodes, links)
  if (!lineage) throw new Error('lineage null')
  const col = lineage.columns.find((c) => c.label === 'Fonte secundária')
  if (!col) throw new Error('coluna Fonte secundária ausente')
  const ys = lineage.graph.nodes
    .filter((node) => node.fx === col.x)
    .map((node) => node.fy ?? Number.NaN)
    .sort((a, b) => a - b)
  return { col, ys }
}

describe('layout vertical das colunas da vista em níveis', () => {
  it('espaçamento entre itens é NIVEIS_ROW_Y, independente da quantidade', () => {
    for (const n of [3, 9]) {
      const { ys } = colunaFsec(n)
      expect(ys).toHaveLength(n)
      const gaps = ys.slice(1).map((y, i) => y - ys[i])
      expect(gaps).toEqual(Array(n - 1).fill(NIVEIS_ROW_Y))
    }
  })

  it('coluna centrada em y=0 e faixa derivada do primeiro/último item', () => {
    const { col, ys } = colunaFsec(9)
    expect(ys[0] + ys[ys.length - 1]).toBe(0)
    expect(col.yMin).toBe(ys[0])
    expect(col.yMax).toBe(ys[ys.length - 1])
  })

  it('faixa cresce com a quantidade de itens (nunca altura fixa)', () => {
    const altura = (n: number) => {
      const { col } = colunaFsec(n)
      return col.yMax - col.yMin
    }
    expect(altura(3)).toBe(2 * NIVEIS_ROW_Y)
    expect(altura(9)).toBe(8 * NIVEIS_ROW_Y)
  })
})
