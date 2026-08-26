// Contrato da vista em níveis DINÂMICA: as colunas vêm do bloco `niveis` do
// graph.json (ordem asc = esquerda → direita), níveis customizados entram na
// posição cadastrada (ex.: Bronze ordem 46 fica entre Fonte secundária 40 e
// Fonte 50), componentes custom cadastrados aparecem no inventário da raiz e
// suas associações (arestas custom→alvo "vem de") entram quando os dois lados
// estão na vista.
import { describe, expect, it } from 'vitest'
import type { GraphLinkData, GraphNodeData, NivelDef } from './graph-types'
import { NIVEIS_BUILTIN, linkEndId } from './graph-types'
import { buildLineage } from './lineage'

const NIVEIS: NivelDef[] = [
  ...NIVEIS_BUILTIN,
  { slug: 'bronze', titulo: 'Bronze', ordem: 46, builtin: false },
]

const NODES: GraphNodeData[] = [
  { id: 'raiz', nome: 'Atacado — Dados', tipo: 'dominio', nivel: 'raiz' },
  { id: 'prod', nome: 'Produto', nivel: 'final', sistema: 'Sys A', origem: null },
  { id: 'fsec-1', nome: 'Tabela UCS', tipo: 'fonte-secundaria', derivado: true, cadastrado: true },
  { id: 'sys-a', nome: 'Sys A', tipo: 'sistema', derivado: true },
  {
    id: 'niv-bronze-tabela-bronze',
    nome: 'Tabela Bronze',
    tipo: 'nivel-custom',
    nivelCustom: 'bronze',
    derivado: true,
    cadastrado: true,
  },
]

const LINKS: GraphLinkData[] = [
  { source: 'raiz', target: 'prod', label: 'agrega' },
  { source: 'prod', target: 'fsec-1', label: 'vem de' },
  { source: 'niv-bronze-tabela-bronze', target: 'sys-a', label: 'vem de' },
]

/** Dado transferido para um nível customizado (o caso do GDAD): a linha segue
 *  sendo insumo de um produto final, só que numa coluna própria. */
const NODES_TRANSFERIDO: GraphNodeData[] = [
  { id: 'raiz', nome: 'Atacado — Dados', tipo: 'dominio', nivel: 'raiz' },
  { id: 'rar', nome: 'RAR 12M', nivel: 'final', sistema: null, origem: null },
  {
    id: 'niv-bronze-gdad',
    nome: 'GDAD',
    tipo: 'nivel-custom',
    nivelCustom: 'bronze',
    derivado: true,
    cadastrado: true,
    debito: 'nao',
    sistema: 'Sys A',
    origem: null,
  },
  { id: 'sys-a', nome: 'Sys A', tipo: 'sistema', derivado: true },
]

const LINKS_TRANSFERIDO: GraphLinkData[] = [
  { source: 'raiz', target: 'rar', label: 'agrega' },
  { source: 'rar', target: 'niv-bronze-gdad', label: 'consome' },
  { source: 'niv-bronze-gdad', target: 'sys-a', label: 'vem de' },
]

describe('vista em níveis com bloco `niveis` dinâmico', () => {
  it('coluna do nível custom entra na posição da sua ordem (46: entre fsec e fonte)', () => {
    const lineage = buildLineage('raiz', NODES, LINKS, NIVEIS)
    if (!lineage) throw new Error('lineage null')
    expect(lineage.columns.map((c) => c.label)).toEqual([
      'Atacado — Dados',
      'Produto final',
      'Fonte secundária',
      'Bronze',
      'Fonte (sistema)',
    ])
    const colBronze = lineage.columns.find((c) => c.label === 'Bronze')
    const bronze = lineage.graph.nodes.find((n) => n.id === 'niv-bronze-tabela-bronze')
    expect(bronze?.fx).toBe(colBronze?.x)
  })

  it('associação custom→alvo ("vem de") aparece na vista da raiz', () => {
    const lineage = buildLineage('raiz', NODES, LINKS, NIVEIS)
    if (!lineage) throw new Error('lineage null')
    const pares = lineage.graph.links.map((l) => [linkEndId(l.source), linkEndId(l.target)])
    expect(pares).toContainEqual(['niv-bronze-tabela-bronze', 'sys-a'])
  })

  it('dado transferido para um nível custom continua na árvore de quem o consome', () => {
    const lineage = buildLineage('rar', NODES_TRANSFERIDO, LINKS_TRANSFERIDO, NIVEIS)
    if (!lineage) throw new Error('lineage null')
    // O insumo entra na sub-árvore do produto — na coluna do seu nível — e
    // arrasta a própria rota (fonte), como faria um produto primário.
    expect(lineage.root.insumos.map((i) => i.data.id)).toEqual(['niv-bronze-gdad'])
    expect(lineage.columns.map((c) => c.label)).toEqual([
      'Produto final',
      'Bronze',
      'Fonte (sistema)',
    ])
    const pares = lineage.graph.links.map((l) => [linkEndId(l.source), linkEndId(l.target)])
    expect(pares).toContainEqual(['rar', 'niv-bronze-gdad'])
    expect(pares).toContainEqual(['niv-bronze-gdad', 'sys-a'])
  })

  it('foco no próprio nó de nível custom abre a vista em níveis', () => {
    const lineage = buildLineage('niv-bronze-gdad', NODES_TRANSFERIDO, LINKS_TRANSFERIDO, NIVEIS)
    expect(lineage?.root.data.id).toBe('niv-bronze-gdad')
    expect(lineage?.columns.map((c) => c.label)).toEqual(['Bronze', 'Fonte (sistema)'])
  })

  it('sem o bloco niveis (graph.json antigo), slug desconhecido cai à direita', () => {
    const lineage = buildLineage('raiz', NODES, LINKS)
    if (!lineage) throw new Error('lineage null')
    expect(lineage.columns[lineage.columns.length - 1].label).toBe('bronze')
  })
})
