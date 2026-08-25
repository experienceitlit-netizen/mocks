import { describe, expect, it } from 'vitest'
import {
  buildGraph,
  derivarSistemasOrigens,
  extractWikilinks,
  parseVaultFile,
  slugify,
  type VaultFile,
} from './graph-lib.ts'

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
    expect(graph.links.filter((l) => l.label === 'consome')).toEqual([
      { source: 'a', target: 'b', label: 'consome' },
    ])
  })

  it('link quebrado gera warning e nó fantasma', () => {
    const { graph, warnings } = buildGraph([
      { name: 'a.md', raw: completo({ id: 'a', nome: 'Alfa' }, 'Consome [[Não Existe]].') },
    ])
    expect(warnings.some((w) => w.includes('link quebrado') && w.includes('[[Não Existe]]'))).toBe(true)
    const fantasma = graph.nodes.find((n) => n.fantasma === true)
    expect(fantasma).toMatchObject({ id: 'nao-existe', nome: 'Não Existe', incompleto: true })
    expect(graph.links.filter((l) => l.label === 'consome')).toEqual([
      { source: 'a', target: 'nao-existe', label: 'consome' },
    ])
  })

  it('id duplicado gera warning e mantém só o primeiro arquivo', () => {
    const { graph, warnings } = buildGraph([
      ...arquivos,
      { name: 'c.md', raw: completo({ id: 'a', nome: 'Alfa 2' }) },
    ])
    expect(warnings.some((w) => w.includes('id duplicado'))).toBe(true)
    expect(graph.nodes.filter((n) => n.derivado !== true)).toHaveLength(2)
  })

  it('saída é determinística independentemente da ordem dos arquivos', () => {
    const invertido = [...arquivos].reverse()
    expect(buildGraph(invertido).graph).toEqual(buildGraph(arquivos).graph)
  })
})

describe('derivarSistemasOrigens', () => {
  it('sistema compartilhado vira UM nó, com aresta sistema→origem deduplicada', () => {
    const { graph } = buildGraph([
      { name: 'a.md', raw: completo({ id: 'a', nome: 'Alfa', sistema: 'Databricks', origem: 'área de risco' }) },
      { name: 'b.md', raw: completo({ id: 'b', nome: 'Beta', sistema: '  databricks ', origem: 'área de risco' }) },
    ])
    const sistemas = graph.nodes.filter((n) => n.derivado === true && n.tipo === 'sistema')
    expect(sistemas).toEqual([
      { id: 'sys-databricks', nome: 'Databricks', tipo: 'sistema', derivado: true, incompleto: false },
    ])
    expect(graph.links).toEqual([
      { source: 'a', target: 'sys-databricks', label: 'vem de' },
      { source: 'b', target: 'sys-databricks', label: 'vem de' },
      { source: 'sys-databricks', target: 'org-area-de-risco', label: 'origina de' },
    ])
  })

  it('valores desconhecidos ("a confirmar" etc., case-insensitive) não viram nó nem aresta', () => {
    const { graph } = buildGraph([
      { name: 'a.md', raw: completo({ id: 'a', nome: 'Alfa', sistema: 'A Confirmar', origem: 'a detalhar' }) },
      { name: 'b.md', raw: completo({ id: 'b', nome: 'Beta', sistema: 'a identificar', origem: '' }) },
    ])
    expect(graph.nodes.filter((n) => n.derivado === true)).toEqual([])
    expect(graph.links).toEqual([])
  })

  it('sistema desconhecido com origem conhecida liga dado → origem direto', () => {
    const { graph } = buildGraph([
      { name: 'a.md', raw: completo({ id: 'a', nome: 'Alfa', sistema: 'a confirmar', origem: 'Banco Central' }) },
    ])
    expect(graph.nodes.filter((n) => n.derivado === true)).toEqual([
      { id: 'org-banco-central', nome: 'Banco Central', tipo: 'origem', derivado: true, incompleto: false },
    ])
    expect(graph.links).toEqual([{ source: 'a', target: 'org-banco-central', label: 'origina de' }])
  })

  it('os nós de dados continuam idênticos e os derivados entram na ordenação por id', () => {
    const arquivos: VaultFile[] = [
      { name: 'a.md', raw: completo({ id: 'a', nome: 'Alfa', sistema: 'Zeta', origem: 'Ypsilon' }) },
      { name: 'b.md', raw: completo({ id: 'b', nome: 'Beta', sistema: 'Zeta', origem: 'Ômega' }) },
    ]
    const { graph } = buildGraph(arquivos)
    expect(graph.nodes.map((n) => n.id)).toEqual(['a', 'b', 'org-omega', 'org-ypsilon', 'sys-zeta'])
    expect(graph.nodes.filter((n) => n.derivado !== true)).toEqual(
      buildGraph(arquivos.map((a) => ({ ...a }))).graph.nodes.filter((n) => n.derivado !== true),
    )
  })

  it('determinismo: mesma saída independentemente da ordem dos arquivos', () => {
    const arquivos: VaultFile[] = [
      { name: 'a.md', raw: completo({ id: 'a', nome: 'Alfa', sistema: 'Databricks', origem: 'risco' }) },
      { name: 'b.md', raw: completo({ id: 'b', nome: 'Beta', sistema: 'databricks', origem: 'a identificar' }) },
      { name: 'c.md', raw: completo({ id: 'c', nome: 'Gama', sistema: 'a confirmar', origem: 'risco' }) },
    ]
    expect(buildGraph([...arquivos].reverse()).graph).toEqual(buildGraph(arquivos).graph)
  })

  it('função pura: aceita nós de dados e devolve derivados + arestas', () => {
    const { node } = parseVaultFile({
      name: 'a.md',
      raw: completo({ id: 'a', nome: 'Alfa', sistema: 'SF', origem: 'RM' }),
    })
    const derivados = derivarSistemasOrigens([node])
    expect(derivados.nodes.map((n) => n.id)).toEqual(['sys-sf', 'org-rm'])
    expect(derivados.links).toEqual([
      { source: 'a', target: 'sys-sf', label: 'vem de' },
      { source: 'sys-sf', target: 'org-rm', label: 'origina de' },
    ])
  })
})

describe('slugify', () => {
  it('gera kebab-case sem acentos', () => {
    expect(slugify('Capital Regulatório')).toBe('capital-regulatorio')
    expect(slugify('Custo de Capital (KE)')).toBe('custo-de-capital-ke')
  })
})
