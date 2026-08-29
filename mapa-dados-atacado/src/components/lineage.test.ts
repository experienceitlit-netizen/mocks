// Contrato de layout da vista em níveis: coluna centrada em y=0, faixa
// (yMin/yMax) derivada do primeiro/último item e crescendo conforme itens
// entram, e passo vertical NUNCA comprimido pela quantidade.
//
// O passo era uma constante; virou um PISO. NIVEIS_ROW_Y continua sendo o que se
// vê em quase todo o mapa — só perde a vez quando dois vizinhos são grandes o
// bastante para que o rótulo de um encoste no outro, o que hoje só acontece por
// GRAU de conexões (um hub bem ligado passa do dobro do raio comum). Os testes
// travam as duas metades: que o caso comum não mudou nada, e que o hub de fato
// abre espaço.
import { describe, expect, it } from 'vitest'
import type { GraphLinkData, GraphNodeData, NivelDef } from './graph-types'
import { buildLineage, NIVEIS_ROW_Y } from './lineage'
import { baseDaFaixa, topoDaFaixa } from './band-resize'
import { extentDoDado, grausPorId, ROTULO_E_FOLGA } from './node-size'

const NIVEIS: NivelDef[] = [
  { slug: 'raiz', titulo: 'Raiz', ordem: 0, builtin: true },
  { slug: 'final', titulo: 'Produto final', ordem: 20, builtin: true },
  { slug: 'bronze', titulo: 'Bronze', ordem: 40, builtin: false },
]

const RAIZ: GraphNodeData = { id: 'raiz', nome: 'Atacado — Dados', nivel: 'raiz' }
const PROD: GraphNodeData = { id: 'prod', nome: 'Produto', nivel: 'final' }

/** Grafo mínimo: a entrada consome um produto final + n componentes Bronze
 *  isolados (sem aresta — entram pelo INVENTÁRIO, a vista sem foco).
 *
 *  O assunto daqui é o layout vertical da coluna, não o que a põe na tela: o
 *  inventário é só o jeito de montar uma coluna cheia de nós isolados. */
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
  const lineage = buildLineage(null, nodes, links, NIVEIS)
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

// --- o passo se adapta aos nós grandes -------------------------------------

/** Coluna Bronze com `n` componentes iguais, cada um com `grau` arestas para
 *  fontes próprias — o grau é o outro fator do tamanho do nó, junto com o tipo. */
function colunaDeTipo(n: number, extras: Partial<GraphNodeData>, grau = 0) {
  const itens: GraphNodeData[] = Array.from({ length: n }, (_, i) => ({
    id: `b-${i + 1}`,
    nome: `Comp ${i + 1}`,
    nivel: 'bronze',
    ...extras,
  }))
  const links: GraphLinkData[] = [{ source: 'raiz', target: 'prod', label: 'consome' }]
  const fontes: GraphNodeData[] = []
  itens.forEach((item) => {
    for (let k = 0; k < grau; k++) {
      const id = `${item.id}-f${k}`
      fontes.push({ id, nome: id, nivel: 'fonte' })
      links.push({ source: item.id, target: id, label: 'vem de' })
    }
  })
  const nodes = [RAIZ, PROD, ...itens, ...fontes]
  const lineage = buildLineage(null, nodes, links, NIVEIS)
  if (!lineage) throw new Error('lineage null')
  const col = lineage.columns.find((c) => c.slug === 'bronze')
  if (!col) throw new Error('coluna Bronze ausente')
  const ys = lineage.graph.nodes
    .filter((node) => node.fx === col.x)
    .map((node) => node.fy ?? Number.NaN)
    .sort((a, b) => a - b)
  return { col, ys, gaps: ys.slice(1).map((y, i) => y - ys[i]), graus: grausPorId(nodes, links) }
}

/** O nó mais volumoso possível: produto de dados (o losango chega 45% além do
 *  círculo) e MUITO bem ligado. O tipo não entra na conta — nenhum tipo aumenta
 *  o raio —, e por isso o que faz o nó crescer aqui é só o grau. */
const GRANDE: Partial<GraphNodeData> = { produtoDeDados: true }
/** Grau que leva o passo além do piso. Precisa ser alto porque o piso é
 *  folgado: com o losango, o passo só passa de 70 a partir de ~14 arestas. */
const GRAU_ALTO = 25

describe('passo vertical adaptativo', () => {
  it('o nó comum não mudou de lugar: o passo continua sendo NIVEIS_ROW_Y', () => {
    // O piso é generoso de propósito, e é isso que mantém o mapa de sempre
    // parado: no grau comum nada chega a precisar de mais que 70 — nem o produto
    // de dados, nem nenhum tipo, de categoria ou de marca.
    const casos: Partial<GraphNodeData>[] = [
      {},
      { tipoComponente: 'Default' },
      { produtoDeDados: true },
      { tipoComponente: 'Processos', produtoDeDados: true },
      { tipoComponente: 'Salesforce' },
      { tipoComponente: 'SQL Server', produtoDeDados: true },
    ]
    for (const extras of casos) {
      expect(colunaDeTipo(5, extras).gaps).toEqual(Array(4).fill(NIVEIS_ROW_Y))
    }
  })

  it('o TIPO não afasta ninguém, em grau nenhum', () => {
    // Nem categoria nem marca mexem no raio, então nenhum dos dois mexe no
    // passo: no mesmo grau, os três casos dão exatamente o mesmo espaçamento.
    // É o par deste teste em glifos.test.ts, do lado do layout.
    const semTipo = colunaDeTipo(3, { produtoDeDados: true }, GRAU_ALTO)
    for (const tipoComponente of ['Processos', 'SQL Server'] as const) {
      const comTipo = colunaDeTipo(3, { tipoComponente, produtoDeDados: true }, GRAU_ALTO)
      expect(comTipo.gaps, tipoComponente).toEqual(semTipo.gaps)
    }
  })

  it('dois nós grandes vizinhos afastam-se além do piso', () => {
    const { gaps } = colunaDeTipo(4, GRANDE, GRAU_ALTO)
    for (const gap of gaps) expect(gap).toBeGreaterThan(NIVEIS_ROW_Y)
    // Todos iguais: nós iguais, passos iguais.
    expect(new Set(gaps).size).toBe(1)
  })

  it('o passo é a soma das duas extensões mais o rótulo — a mesma medida do desenho', () => {
    const { gaps, graus } = colunaDeTipo(3, GRANDE, GRAU_ALTO)
    const no: GraphNodeData = { id: 'b-1', nome: 'Comp 1', nivel: 'bronze', ...GRANDE }
    expect(gaps[0]).toBeCloseTo(2 * extentDoDado(no, graus) + ROTULO_E_FOLGA)
  })

  it('mais arestas = mais espaço, no mesmo tipo', () => {
    // Isola o único eixo que ainda mexe no tamanho vindo do dado.
    const magro = colunaDeTipo(3, GRANDE, 2)
    const gordo = colunaDeTipo(3, GRANDE, GRAU_ALTO)
    expect(gordo.gaps[0]).toBeGreaterThan(magro.gaps[0])
  })

  it('a faixa acompanha: um nó grande na ponta não fica cortado por ela', () => {
    const comum = colunaDeTipo(4, {})
    const grande = colunaDeTipo(4, GRANDE, GRAU_ALTO)
    // O topo da faixa fica ACIMA do topo do desenho do primeiro nó, nos dois
    // casos — e o da coluna grande abre mais espaço que o da comum.
    for (const { col, ys } of [comum, grande]) {
      expect(topoDaFaixa(col)).toBeLessThan(ys[0] - (col.extentTopo ?? 0))
      expect(baseDaFaixa(col)).toBeGreaterThan(ys[ys.length - 1] + (col.extentBase ?? 0))
    }
    expect(grande.col.extentTopo).toBeGreaterThan(comum.col.extentTopo ?? 0)
    const folga = (c: typeof comum.col, y: number) => y - topoDaFaixa(c)
    expect(folga(grande.col, grande.ys[0])).toBeGreaterThan(folga(comum.col, comum.ys[0]))
  })

  it('coluna de um item só continua sem miolo nenhum', () => {
    const { col, gaps } = colunaDeTipo(1, { tipoComponente: 'Salesforce' })
    expect(gaps).toEqual([])
    expect(col.yMax - col.yMin).toBe(0)
  })
})
