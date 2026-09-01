// Contrato da visão de tabela: uma linha POR COMPONENTE, com as relações de
// SAÍDA resolvidas nos nós de destino — e, desde o verbo por referência, com o
// verbo de cada relação junto.
//
// O verbo padrão é o que quase toda linha do catálogo declara: ele entra na
// linha como qualquer outro, mas quem desenha a célula o omite (RelacaoCell) —
// senão a coluna inteira viraria "Consome · " repetido.
import { describe, expect, it } from 'vitest'
import type { GraphLinkData, GraphNodeData, NivelDef, VerboDef } from './graph-types'
import { buildRows, matchesFilter, sortRows } from './table-utils'

const NIVEIS: NivelDef[] = [
  { slug: 'final', titulo: 'Produto final', ordem: 20, builtin: true },
  { slug: 'bronze', titulo: 'Bronze', ordem: 40, builtin: false },
]

const VERBOS: VerboDef[] = [
  { slug: 'consome', titulo: 'Consome', sentido: 'montante', seta: true },
  { slug: 'envia', titulo: 'Envia', sentido: 'jusante', seta: true },
  { slug: 'relaciona', titulo: 'Relaciona', sentido: 'nenhum', seta: false },
]

const NODES: GraphNodeData[] = [
  { id: 'rar', nome: 'RAR 12M', nivel: 'final' },
  { id: 'bulk', nome: 'Ingestion API bulk', nivel: 'bronze' },
  { id: 'account', nome: 'Account', nivel: 'bronze' },
]

const linhaDe = (rows: ReturnType<typeof buildRows>, id: string) => {
  const row = rows.find((r) => r.node.id === id)
  if (!row) throw new Error(`linha "${id}" ausente`)
  return row
}

describe('buildRows carrega o verbo de cada relação', () => {
  const LINKS: GraphLinkData[] = [
    { source: 'rar', target: 'bulk', label: 'envia' },
    { source: 'rar', target: 'account', label: 'consome' },
  ]

  it('cada relação traz o slug do verbo e o título do vocabulário', () => {
    const rar = linhaDe(buildRows(NODES, LINKS, NIVEIS, VERBOS), 'rar')
    expect(rar.consome.map((r) => [r.node.id, r.verbo, r.verboTitulo])).toEqual([
      ['account', 'consome', 'Consome'],
      ['bulk', 'envia', 'Envia'],
    ])
  })

  // A célula esconde o verbo padrão comparando com o SLUG, então ele tem de
  // chegar à linha como qualquer outro — a omissão é do desenho, não do dado.
  it('o verbo padrão entra na linha (quem o omite é a célula)', () => {
    const rar = linhaDe(buildRows(NODES, LINKS, NIVEIS, VERBOS), 'rar')
    const account = rar.consome.find((r) => r.node.id === 'account')
    expect(account?.verbo).toBe('consome')
  })

  // Aresta sem rótulo é o formato antigo do build; sem vocabulário, o título
  // de um verbo desconhecido é o próprio slug — nunca fica vazio.
  it('aresta sem rótulo vale consome, e sem vocabulário o título é o slug', () => {
    const rows = buildRows(NODES, [{ source: 'rar', target: 'bulk' }], NIVEIS)
    expect(linhaDe(rows, 'rar').consome.map((r) => [r.verbo, r.verboTitulo])).toEqual([
      ['consome', 'consome'],
    ])
  })

  // Dois verbos entre os MESMOS dois componentes são duas relações, e a
  // ordem entre elas não pode depender da ordem das arestas.
  it('duas relações com o mesmo alvo e verbos diferentes são duas linhas', () => {
    const links: GraphLinkData[] = [
      { source: 'rar', target: 'bulk', label: 'relaciona' },
      { source: 'rar', target: 'bulk', label: 'envia' },
    ]
    const rar = linhaDe(buildRows(NODES, links, NIVEIS, VERBOS), 'rar')
    expect(rar.consome.map((r) => r.verboTitulo)).toEqual(['Envia', 'Relaciona'])
  })

  it('componente sem relação nenhuma tem a lista vazia', () => {
    expect(linhaDe(buildRows(NODES, LINKS, NIVEIS, VERBOS), 'account').consome).toEqual([])
  })
})

describe('matchesFilter acha pelo verbo', () => {
  const LINKS: GraphLinkData[] = [
    { source: 'rar', target: 'bulk', label: 'envia' },
    { source: 'account', target: 'bulk', label: 'consome' },
  ]
  const rows = buildRows(NODES, LINKS, NIVEIS, VERBOS)

  it('procurar pelo título do verbo acha a linha que o declara', () => {
    expect(rows.filter((r) => matchesFilter(r, 'envia')).map((r) => r.node.id)).toEqual(['rar'])
  })

  it('a busca continua tolerante a caixa e acento', () => {
    expect(matchesFilter(linhaDe(rows, 'rar'), 'ENVIA')).toBe(true)
  })

  // "Ingestion API bulk" é o alvo das duas relações — e também o próprio nome
  // de uma linha, que casa por si.
  it('o nome do alvo continua achando, como antes do verbo', () => {
    expect(rows.filter((r) => matchesFilter(r, 'ingestion')).map((r) => r.node.id).sort()).toEqual([
      'account',
      'bulk',
      'rar',
    ])
  })

  it('verbo que ninguém declara não acha nada', () => {
    expect(rows.filter((r) => matchesFilter(r, 'relaciona'))).toEqual([])
  })
})

describe('sortRows não é afetada pelo verbo', () => {
  it('a ordenação continua sendo do componente, não da relação', () => {
    const rows = buildRows(NODES, [{ source: 'rar', target: 'bulk', label: 'envia' }], NIVEIS, VERBOS)
    expect(sortRows(rows, 'nome', 'asc').map((r) => r.node.nome)).toEqual([
      'Account',
      'Ingestion API bulk',
      'RAR 12M',
    ])
  })
})
