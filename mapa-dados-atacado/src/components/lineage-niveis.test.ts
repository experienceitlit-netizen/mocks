// Contrato da vista em níveis: as colunas vêm do bloco `niveis` do graph.json
// (ordem asc = esquerda → direita) e cada componente cai na coluna do seu
// `nivel` — sem categoria especial de nó. SEM foco, a vista é o inventário
// completo; focar em QUALQUER componente mostra só a sub-árvore dele, e o nível
// de menor ordem não é exceção.
import { describe, expect, it } from 'vitest'
import type { GraphLinkData, GraphNodeData, NivelDef, VerboDef } from './graph-types'
import { linkEndId } from './graph-types'
import { buildLineage, buildLineageTree } from './lineage'

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
  // Isolado: sem aresta nenhuma, só entra pelo inventário (a vista sem foco).
  { id: 'solto', nome: 'Planilha solta', nivel: 'bronze', tipoComponente: 'Excel' },
]

const LINKS: GraphLinkData[] = [
  { source: 'raiz', target: 'rar', label: 'consome' },
  { source: 'rar', target: 'gdad', label: 'consome' },
  { source: 'gdad', target: 'sys-a', label: 'consome' },
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

  it('SEM foco traz o inventário completo, inclusive o isolado', () => {
    const lineage = buildLineage(null, NODES, LINKS, NIVEIS)
    if (!lineage) throw new Error('lineage null')
    expect([...lineage.ids].sort()).toEqual(['gdad', 'raiz', 'rar', 'solto', 'sys-a'])
  })

  // O nível de MENOR ordem já foi exceção: focar num componente dele abria o
  // inventário, e o efeito era que a primeira coluna do mapa era a única em que
  // "Focar neste nó" não isolava nada. Isola como qualquer outra — `solto`, que
  // é do mesmo grafo mas não tem aresta com a raiz, fica de fora.
  it('foco no nível de MENOR ordem isola, como qualquer outro', () => {
    const lineage = buildLineage('raiz', NODES, LINKS, NIVEIS)
    if (!lineage) throw new Error('lineage null')
    expect([...lineage.ids].sort()).toEqual(['gdad', 'raiz', 'rar', 'sys-a'])
    expect(lineage.ids.has('solto')).toBe(false)
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

  // O rótulo da aresta chega inteiro à árvore. Hoje só existe "consome", mas o
  // mecanismo é o que o VERBO POR REFERÊNCIA (`envia:alvo`) vai reusar — por
  // isso o teste olha o label, e não só o alvo.
  it('a linhagem carrega o rótulo de cada aresta', () => {
    const lineage = buildLineage('gdad', NODES, LINKS, NIVEIS)
    expect(lineage?.root?.upstream.map((u) => [u.label, u.entry.data.id])).toEqual([
      ['consome', 'sys-a'],
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

// O SENTIDO do verbo, não a direção em que a aresta foi declarada, é quem
// decide por onde a linhagem anda. A seta continua apontando para o alvo
// declarado — isso é desenho, e vive no Graph; aqui só a travessia.
describe('a linhagem percorre cada aresta pelo SENTIDO do verbo', () => {
  const VERBOS: VerboDef[] = [
    { slug: 'consome', titulo: 'Consome', sentido: 'montante', seta: true },
    { slug: 'envia', titulo: 'Envia', sentido: 'jusante', seta: true },
    { slug: 'associado', titulo: 'Associado', sentido: 'ambos', seta: false },
    { slug: 'relaciona', titulo: 'Relaciona', sentido: 'nenhum', seta: false },
  ]

  const PAR: GraphNodeData[] = [
    { id: 'job', nome: 'Job de carga', nivel: 'final' },
    { id: 'bulk', nome: 'Ingestion API bulk', nivel: 'bronze' },
  ]

  const arvore = (raiz: string, links: GraphLinkData[]) =>
    buildLineageTree(raiz, PAR, links, VERBOS)

  // O Job DECLARA "envia:bulk", mas quem produz o dado é o Job: a linhagem do
  // Bulk tem de subir até ele, e não o contrário.
  it('verbo jusante sobe ao CONTRÁRIO: a origem vira montante do alvo', () => {
    const links: GraphLinkData[] = [{ source: 'job', target: 'bulk', label: 'envia' }]
    expect(arvore('bulk', links)?.upstream.map((u) => [u.label, u.invertida, u.entry.data.id])).toEqual([
      ['envia', true, 'job'],
    ])
    // E o alvo declarado NÃO é montante de quem enviou.
    expect(arvore('job', links)?.upstream).toEqual([])
  })

  it('verbo montante mantém o lado de sempre, sem marca de inversão', () => {
    const links: GraphLinkData[] = [{ source: 'job', target: 'bulk', label: 'consome' }]
    expect(arvore('job', links)?.upstream.map((u) => [u.label, u.invertida, u.entry.data.id])).toEqual([
      ['consome', false, 'bulk'],
    ])
    expect(arvore('bulk', links)?.upstream).toEqual([])
  })

  // "Sem ponta" não é "fora da linhagem": o associado carrega o dado, e sem
  // percorrê-lo a cadeia do consumidor pararia no meio do caminho.
  it('verbo ambos entra pelos DOIS lados, e a trilha guarda o ciclo', () => {
    const links: GraphLinkData[] = [{ source: 'job', target: 'bulk', label: 'associado' }]
    const daOrigem = arvore('job', links)
    expect(daOrigem?.upstream.map((u) => [u.invertida, u.entry.data.id])).toEqual([[false, 'bulk']])
    // O passo de volta existe no índice, mas a trilha o corta: sem isso a
    // recursão voltaria para quem acabou de chamá-la.
    expect(daOrigem?.upstream[0].entry.upstream).toEqual([])
    const doAlvo = arvore('bulk', links)
    expect(doAlvo?.upstream.map((u) => [u.invertida, u.entry.data.id])).toEqual([[true, 'job']])
  })

  it('verbo nenhum fica fora da árvore, dos dois lados', () => {
    const links: GraphLinkData[] = [{ source: 'job', target: 'bulk', label: 'relaciona' }]
    expect(arvore('job', links)?.upstream).toEqual([])
    expect(arvore('bulk', links)?.upstream).toEqual([])
  })

  // O hover acende a cadeia pelo chainOf, que é fecho NÃO direcionado: a
  // aresta sem sentido tem de sair dele também, senão "relaciona" acenderia
  // tudo o que está do outro lado.
  it('verbo nenhum some do chainOf — a aresta continua desenhada', () => {
    const links: GraphLinkData[] = [{ source: 'job', target: 'bulk', label: 'relaciona' }]
    const lineage = buildLineage(null, PAR, links, NIVEIS, VERBOS)
    if (!lineage) throw new Error('lineage null')
    expect([...lineage.chainOf('job')]).toEqual(['job'])
    expect([...lineage.chainOf('bulk')]).toEqual(['bulk'])
    expect(lineage.graph.links).toHaveLength(1)
  })

  // Verbo removido do vocabulário depois de gravado, ou graph.json de um build
  // anterior: nem a travessia nem o desenho podem ficar indefinidos.
  it('rótulo desconhecido cai no padrão — montante', () => {
    const links: GraphLinkData[] = [{ source: 'job', target: 'bulk', label: 'transporta' }]
    expect(arvore('job', links)?.upstream.map((u) => [u.label, u.invertida, u.entry.data.id])).toEqual([
      ['transporta', false, 'bulk'],
    ])
  })

  // Lista de verbos vazia é o estado de quem chama sem o vocabulário (graph.json
  // antigo, fixture de teste): tudo montante, exatamente como antes.
  it('sem vocabulário, toda aresta é montante', () => {
    const links: GraphLinkData[] = [{ source: 'job', target: 'bulk', label: 'envia' }]
    expect(buildLineageTree('job', PAR, links)?.upstream.map((u) => u.entry.data.id)).toEqual([
      'bulk',
    ])
  })
})
