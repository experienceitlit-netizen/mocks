import { describe, expect, it } from 'vitest'
import { buildGraph, extractWikilinks, parseVaultFile, slugify, type VaultFile } from './graph-lib.ts'

const fm = (campos: Record<string, string | null>, corpo = ''): string => {
  const linhas = Object.entries(campos).map(([k, v]) => `${k}: ${v === null ? 'null' : JSON.stringify(v)}`)
  return `---\n${linhas.join('\n')}\n---\n${corpo}\n`
}

const completo = (extra: Record<string, string | null>, corpo = ''): string =>
  fm(
    {
      id: 'x',
      nome: 'X',
      tipo: 'insumo',
      dominio: 'Risco',
      origem: 'o',
      sistema: 's',
      descricao: 'd',
      centro_de_custo: null,
      owner: null,
      debito: 'nao',
      status: 'producao',
      ...extra,
    },
    corpo,
  )

describe('extractWikilinks', () => {
  it('extrai wikilink simples com rótulo default "consome"', () => {
    expect(extractWikilinks('Consome [[GDAD]] e [[Capital Regulatório]].')).toEqual([
      { target: 'GDAD', label: 'consome' },
      { target: 'Capital Regulatório', label: 'consome' },
    ])
  })

  it('extrai wikilink com rótulo customizado [[Alvo|produz]]', () => {
    expect(extractWikilinks('Gera [[RAR 12M|produz]].')).toEqual([{ target: 'RAR 12M', label: 'produz' }])
  })

  it('ignora corpo sem links', () => {
    expect(extractWikilinks('Texto sem links [colchete solto].')).toEqual([])
  })
})

describe('parseVaultFile', () => {
  it('parseia frontmatter completo sem warnings', () => {
    const parsed = parseVaultFile({ name: 'x.md', raw: completo({ id: 'rar-12m', nome: 'RAR 12M' }) })
    expect(parsed.warnings).toEqual([])
    expect(parsed.node).toMatchObject({
      id: 'rar-12m',
      nome: 'RAR 12M',
      tipo: 'insumo',
      owner: null,
      centroDeCusto: null,
      incompleto: true,
    })
  })

  it('incompleto = false quando owner e centro_de_custo preenchidos', () => {
    const parsed = parseVaultFile({
      name: 'x.md',
      raw: completo({ owner: 'Fulano', centro_de_custo: 'CC-1' }),
    })
    expect(parsed.node.incompleto).toBe(false)
    expect(parsed.node.centroDeCusto).toBe('CC-1')
  })

  it('emite o corpo markdown sem o frontmatter; omite quando vazio', () => {
    const comCorpo = parseVaultFile({
      name: 'x.md',
      raw: completo({}, 'Consome [[GDAD]].\n\nDetalhe em **negrito**.'),
    })
    expect(comCorpo.node.corpo).toBe('Consome [[GDAD]].\n\nDetalhe em **negrito**.')
    const semCorpo = parseVaultFile({ name: 'x.md', raw: completo({}, '  \n') })
    expect(semCorpo.node.corpo).toBeUndefined()
  })

  it('warning para campo obrigatório faltando', () => {
    const raw = fm({ id: 'a', nome: 'A', owner: null, centro_de_custo: null })
    const parsed = parseVaultFile({ name: 'a.md', raw })
    expect(parsed.warnings.some((w) => w.includes('"tipo"'))).toBe(true)
  })
})

describe('buildGraph', () => {
  const arquivos: VaultFile[] = [
    { name: 'a.md', raw: completo({ id: 'a', nome: 'Alfa' }, 'Consome [[Beta]].') },
    { name: 'b.md', raw: completo({ id: 'b', nome: 'Beta' }) },
  ]

  it('resolve link por nome (case-insensitive) e gera aresta', () => {
    const { graph, warnings } = buildGraph(arquivos)
    expect(warnings).toEqual([])
    expect(graph.links).toEqual([{ source: 'a', target: 'b', label: 'consome' }])
  })

  it('link quebrado gera warning e nó fantasma', () => {
    const { graph, warnings } = buildGraph([
      { name: 'a.md', raw: completo({ id: 'a', nome: 'Alfa' }, 'Consome [[Não Existe]].') },
    ])
    expect(warnings.some((w) => w.includes('link quebrado') && w.includes('[[Não Existe]]'))).toBe(true)
    const fantasma = graph.nodes.find((n) => n.fantasma === true)
    expect(fantasma).toMatchObject({ id: 'nao-existe', nome: 'Não Existe', incompleto: true })
    expect(graph.links).toEqual([{ source: 'a', target: 'nao-existe', label: 'consome' }])
  })

  it('id duplicado gera warning e mantém só o primeiro arquivo', () => {
    const { graph, warnings } = buildGraph([
      ...arquivos,
      { name: 'c.md', raw: completo({ id: 'a', nome: 'Alfa 2' }) },
    ])
    expect(warnings.some((w) => w.includes('id duplicado'))).toBe(true)
    expect(graph.nodes).toHaveLength(2)
  })

  it('saída é determinística independentemente da ordem dos arquivos', () => {
    const invertido = [...arquivos].reverse()
    expect(buildGraph(invertido).graph).toEqual(buildGraph(arquivos).graph)
  })
})

describe('slugify', () => {
  it('gera kebab-case sem acentos', () => {
    expect(slugify('Capital Regulatório')).toBe('capital-regulatorio')
    expect(slugify('Custo de Capital (KE)')).toBe('custo-de-capital-ke')
  })
})
