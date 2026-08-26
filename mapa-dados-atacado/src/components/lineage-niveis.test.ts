// Contrato da vista em níveis: as colunas vêm do bloco `niveis` do graph.json
// (ordem asc = esquerda → direita) e cada componente cai na coluna do seu
// `nivel` — sem categoria especial de nó. Focar no componente do nível de
// MENOR ORDEM abre o inventário completo; focar em qualquer outro mostra só a
// sub-árvore dele.
import { describe, expect, it } from 'vitest'
import type { GraphLinkData, GraphNodeData, NivelDef } from './graph-types'
import { linkEndId } from './graph-types'
import { buildLineage } from './lineage'

const NIVEIS: NivelDef[] = [
  { slug: 'raiz', titulo: 'Raiz', ordem: 0, builtin: true },
  { slug: 'final', titulo: 'Produto final', ordem: 20, builtin: true },
  { slug: 'bronze', titulo: 'Bronze', ordem: 46, builtin: false },
  { slug: 'fonte', titulo: 'Fonte (sistema)', ordem: 50, builtin: true },
]

const NODES: GraphNodeData[] = [
  { id: 'raiz', nome: 'Atacado — Dados', nivel: 'raiz' },
  { id: 'rar', nome: 'RAR 12M', nivel: 'final', tipoComponente: 'Tabela Delta' },
  { id: 'gdad', nome: 'GDAD', nivel: 'bronze', tipoComponente: 'Tabela SQL' },
  { id: 'sys-a', nome: 'Sys A', nivel: 'fonte', tipoComponente: 'Default' },
  // Isolado: só entra pelo inventário do nível de entrada.
  { id: 'solto', nome: 'Planilha solta', nivel: 'bronze', tipoComponente: 'Excel' },
]

const LINKS: GraphLinkData[] = [
  { source: 'raiz', target: 'rar', label: 'consome' },
  { source: 'rar', target: 'gdad', label: 'consome' },
  { source: 'gdad', target: 'sys-a', label: 'vem de' },
]

describe('vista em níveis com bloco `niveis` dinâmico', () => {
  it('cada componente cai na coluna do seu nível, na ordem cadastrada', () => {
    const lineage = buildLineage('raiz', NODES, LINKS, NIVEIS)
    if (!lineage) throw new Error('lineage null')
    expect(lineage.columns.map((c) => c.label)).toEqual([
      'Raiz',
      'Produto final',
      'Bronze',
      'Fonte (sistema)',
    ])
    const colBronze = lineage.columns.find((c) => c.slug === 'bronze')
    const gdad = lineage.graph.nodes.find((n) => n.id === 'gdad')
    expect(gdad?.fx).toBe(colBronze?.x)
  })

  it('foco no nível de MENOR ordem traz o inventário completo', () => {
    const lineage = buildLineage('raiz', NODES, LINKS, NIVEIS)
    if (!lineage) throw new Error('lineage null')
    expect([...lineage.ids].sort()).toEqual(['gdad', 'raiz', 'rar', 'solto', 'sys-a'])
  })

  it('foco em outro componente mostra só a sub-árvore dele', () => {
    const lineage = buildLineage('rar', NODES, LINKS, NIVEIS)
    if (!lineage) throw new Error('lineage null')
    expect([...lineage.ids].sort()).toEqual(['gdad', 'rar', 'sys-a'])
    expect(lineage.columns.map((c) => c.label)).toEqual([
      'Produto final',
      'Bronze',
      'Fonte (sistema)',
    ])
    const pares = lineage.graph.links.map((l) => [linkEndId(l.source), linkEndId(l.target)])
    expect(pares).toContainEqual(['rar', 'gdad'])
    expect(pares).toContainEqual(['gdad', 'sys-a'])
  })

  it('a aresta "vem de" cruza colunas como qualquer outra', () => {
    const lineage = buildLineage('gdad', NODES, LINKS, NIVEIS)
    expect(lineage?.root?.upstream.map((u) => [u.label, u.entry.data.id])).toEqual([
      ['vem de', 'sys-a'],
    ])
  })

  it('sem o bloco niveis, slug desconhecido entra em ordem alfabética', () => {
    const lineage = buildLineage('raiz', NODES, LINKS)
    if (!lineage) throw new Error('lineage null')
    expect(lineage.columns.map((c) => c.slug)).toEqual(['bronze', 'final', 'fonte', 'raiz'])
  })

  it('a coluna carrega as cores do nível, cruas — quem aplica o alpha é o desenho', () => {
    const coloridos = NIVEIS.map((n) =>
      n.slug === 'bronze' ? { ...n, corFundo: '#c0c0c0', corBorda: '#8fa3b8' } : n,
    )
    const lineage = buildLineage('raiz', NODES, LINKS, coloridos)
    if (!lineage) throw new Error('lineage null')
    const bronze = lineage.columns.find((c) => c.slug === 'bronze')
    expect([bronze?.corFundo, bronze?.corBorda]).toEqual(['#c0c0c0', '#8fa3b8'])
    // as demais seguem sem cor: colorir um nível não vaza para os vizinhos
    const outras = lineage.columns.filter((c) => c.slug !== 'bronze')
    expect(outras.every((c) => c.corFundo === undefined && c.corBorda === undefined)).toBe(true)
  })
})
