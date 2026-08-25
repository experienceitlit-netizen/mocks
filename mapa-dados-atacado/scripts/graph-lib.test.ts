import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildGraph,
  derivarSistemasOrigens,
  extractWikilinks,
  parseVaultFile,
  slugify,
  type GraphNode,
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
      nivel: 'primario',
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

  it('propaga nivel do frontmatter para o nó', () => {
    const parsed = parseVaultFile({ name: 'x.md', raw: completo({ nivel: 'ambos' }) })
    expect(parsed.warnings).toEqual([])
    expect(parsed.node.nivel).toBe('ambos')
  })

  it('nivel "raiz" é aceito e nunca marca incompleto (agregador: owner/CC não se aplicam)', () => {
    const parsed = parseVaultFile({
      name: 'x.md',
      raw: completo({
        nivel: 'raiz',
        tipo: 'dominio',
        dominio: 'Atacado',
        sistema: null,
        origem: null,
        owner: null,
        centro_de_custo: null,
      }),
    })
    expect(parsed.warnings).toEqual([])
    expect(parsed.node.nivel).toBe('raiz')
    expect(parsed.node.incompleto).toBe(false)
  })

  it('nivel ausente gera warning e assume "primario"', () => {
    const raw = fm({
      id: 'a',
      nome: 'A',
      tipo: 'insumo',
      dominio: 'Risco',
      origem: 'o',
      sistema: 's',
      descricao: 'd',
      debito: 'nao',
      status: 'producao',
      owner: null,
      centro_de_custo: null,
    })
    const parsed = parseVaultFile({ name: 'a.md', raw })
    expect(parsed.warnings).toEqual(['a.md: frontmatter sem o campo obrigatório "nivel" — assumindo "primario"'])
    expect(parsed.node.nivel).toBe('primario')
  })

  it('sistema/origem null explícito são válidos: sem warning, node com null', () => {
    const parsed = parseVaultFile({ name: 'x.md', raw: completo({ sistema: null, origem: null }) })
    expect(parsed.warnings).toEqual([])
    expect(parsed.node.sistema).toBeNull()
    expect(parsed.node.origem).toBeNull()
  })

  it('sistema/origem ausentes do frontmatter continuam gerando warning', () => {
    const raw = fm({
      id: 'a',
      nome: 'A',
      tipo: 'produto',
      nivel: 'secundario',
      dominio: 'Risco',
      descricao: 'd',
      debito: 'nao',
      status: 'producao',
      owner: null,
      centro_de_custo: null,
    })
    const parsed = parseVaultFile({ name: 'a.md', raw })
    expect(parsed.warnings.some((w) => w.includes('"sistema"'))).toBe(true)
    expect(parsed.warnings.some((w) => w.includes('"origem"'))).toBe(true)
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

  it('sistema/origem null (secundários) não geram nó derivado nem aresta', () => {
    const { graph, warnings } = buildGraph([
      { name: 'a.md', raw: completo({ id: 'a', nome: 'Alfa', nivel: 'secundario', sistema: null, origem: null }) },
    ])
    expect(warnings).toEqual([])
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

describe('vault real (catálogo em 4 níveis)', () => {
  const vaultDir = resolve(import.meta.dirname, '..', 'vault')
  const arquivos: VaultFile[] = readdirSync(vaultDir)
    .filter((n) => n.endsWith('.md') && !n.startsWith('_'))
    .map((n) => ({ name: n, raw: readFileSync(join(vaultDir, n), 'utf8') }))
  const { graph, warnings } = buildGraph(arquivos)
  const dados = graph.nodes.filter((n): n is GraphNode => n.derivado !== true)
  const consome = graph.links.filter((l) => l.label === 'consome')

  it('builda sem warnings e sem nós fantasma', () => {
    expect(warnings).toEqual([])
    expect(graph.nodes.filter((n) => n.fantasma === true)).toEqual([])
  })

  it('36 nós de dados: 1 raiz, 22 primários, 11 secundários e 2 "ambos"', () => {
    expect(dados).toHaveLength(36)
    expect(dados.filter((n) => n.nivel === 'raiz').map((n) => n.id)).toEqual(['atacado-dados'])
    expect(dados.filter((n) => n.nivel === 'primario')).toHaveLength(22)
    expect(dados.filter((n) => n.nivel === 'secundario')).toHaveLength(11)
    expect(dados.filter((n) => n.nivel === 'ambos').map((n) => n.id).sort()).toEqual([
      'rating',
      'restritivos-e-tipos',
    ])
  })

  it('68 nós e 76 arestas no total: 25 consome + 13 agrega + 19 vem de + 19 origina de', () => {
    expect(graph.nodes).toHaveLength(68)
    expect(graph.links).toHaveLength(76)
    const porLabel = (label: string) => graph.links.filter((l) => l.label === label).length
    expect(porLabel('consome')).toBe(25)
    expect(porLabel('agrega')).toBe(13)
    expect(porLabel('vem de')).toBe(19)
    expect(porLabel('origina de')).toBe(19)
  })

  it('raiz atacado-dados: incompleto false e 13 arestas "agrega" para todos os produtos finais', () => {
    const raiz = dados.find((n) => n.id === 'atacado-dados')
    expect(raiz).toMatchObject({
      nivel: 'raiz',
      tipo: 'dominio',
      dominio: 'Atacado',
      incompleto: false,
      sistema: null,
      origem: null,
    })
    const agrega = graph.links.filter((l) => l.label === 'agrega')
    expect(agrega.every((l) => l.source === 'atacado-dados')).toBe(true)
    expect(agrega.map((l) => l.target).sort()).toEqual([
      'account',
      'endividamento-de-mercado',
      'estoque-carteira',
      'evolucao-do-resultado',
      'evolucao-do-resultado-por-produto',
      'faturamento',
      'localizacao',
      'rar-12m',
      'rating',
      'restritivos-e-tipos',
      'resultado',
      'segmentacao-e-encarteiramento',
      'setorizacao',
    ])
    // a raiz não deriva sistema/origem nem consome ninguém
    expect(graph.links.filter((l) => l.source === 'atacado-dados' && l.label !== 'agrega')).toEqual([])
    expect(graph.links.filter((l) => l.target === 'atacado-dados')).toEqual([])
  })

  it('25 arestas "consome", sem self-loop e sem consumo nos itens a mapear', () => {
    expect(consome).toHaveLength(25)
    expect(graph.links.filter((l) => l.source === l.target)).toEqual([])
    const alvosDe = (id: string) => consome.filter((l) => l.source === id)
    expect(alvosDe('recta-fedrl')).toEqual([])
    expect(alvosDe('pcam-57')).toEqual([])
    expect(alvosDe('rating')).toEqual([])
    expect(alvosDe('restritivos-e-tipos')).toEqual([])
  })

  it('secundários com as cadeias esperadas', () => {
    const alvos = (id: string) =>
      consome
        .filter((l) => l.source === id)
        .map((l) => l.target)
        .sort()
    expect(alvos('setorizacao')).toEqual(['bacen', 'classificacao-de-setores', 'gdp', 'rfb'])
    expect(alvos('rar-12m')).toEqual(['capital-regulatorio', 'custo-de-capital-ke', 'estatag', 'gdad'])
  })

  it('secundários não derivam sistema/origem (frontmatter null)', () => {
    for (const n of dados.filter((d) => d.nivel === 'secundario')) {
      expect(n.sistema).toBeNull()
      expect(n.origem).toBeNull()
      expect(graph.links.filter((l) => l.source === n.id && l.label !== 'consome')).toEqual([])
    }
  })
})
