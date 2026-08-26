import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildGraph,
  carregarNiveis,
  COLUNAS,
  criarRaiz,
  derivarDominios,
  derivarSistemasOrigens,
  parseCatalogo,
  parseCsv,
  slugify,
  type GraphNode,
} from './graph-lib.ts'

// Helpers: montam um catalogo.csv sintético a partir de registros parciais.
const CABECALHO = COLUNAS.join(';')

const aspas = (v: string): string =>
  /[";\n\r]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v

const linha = (campos: Partial<Record<(typeof COLUNAS)[number], string>>): string =>
  COLUNAS.map((c) => aspas(campos[c] ?? '')).join(';')

const csv = (...linhas: string[]): string => [CABECALHO, ...linhas].join('\r\n') + '\r\n'

const completo = (extra: Partial<Record<(typeof COLUNAS)[number], string>>): string =>
  linha({
    nome: 'X',
    nivel: 'primario',
    dominio: 'Risco',
    origem: 'o',
    fonte_sistema: 's',
    descricao: 'd',
    debito: 'nao',
    status: 'producao',
    ...extra,
  })

describe('parseCsv', () => {
  it('separa células por ";" e registros por quebra de linha (\\n e \\r\\n)', () => {
    expect(parseCsv('a;b;c\nd;e;f\r\ng;h;i')).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
      ['g', 'h', 'i'],
    ])
  })

  it('célula entre aspas preserva ";", quebras de linha e aspas escapadas ("")', () => {
    expect(parseCsv('a;"x; y";b\r\n"linha 1\nlinha 2";"diz ""oi""";c')).toEqual([
      ['a', 'x; y', 'b'],
      ['linha 1\nlinha 2', 'diz "oi"', 'c'],
    ])
  })

  it('remove o BOM UTF-8 do início do arquivo', () => {
    expect(parseCsv('\uFEFFnome;nivel\r\nA;primario\r\n')).toEqual([
      ['nome', 'nivel'],
      ['A', 'primario'],
    ])
  })

  it('descarta linhas totalmente vazias (inclusive a quebra final)', () => {
    expect(parseCsv('a;b\r\n\r\n;\r\nc;d\r\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ])
  })

  it('célula vazia e registro mais curto que o cabeçalho não quebram', () => {
    expect(parseCsv('a;;c\nd')).toEqual([
      ['a', '', 'c'],
      ['d'],
    ])
  })
})

describe('parseCatalogo', () => {
  it('parseia linha completa sem warnings; id = slug(nome); tipo derivado do nivel', () => {
    const { rows, warnings } = parseCatalogo(csv(completo({ nome: 'RAR 12M', nivel: 'final' })))
    expect(warnings).toEqual([])
    expect(rows).toHaveLength(1)
    expect(rows[0].node).toMatchObject({
      id: 'rar-12m',
      nome: 'RAR 12M',
      tipo: 'produto',
      nivel: 'final',
      owner: null,
      centroDeCusto: null,
      incompleto: true,
    })
  })

  it('nivel primario deriva tipo "insumo"; final/ambos derivam "produto"', () => {
    const { rows } = parseCatalogo(
      csv(
        completo({ nome: 'A', nivel: 'primario' }),
        completo({ nome: 'B', nivel: 'final' }),
        completo({ nome: 'C', nivel: 'ambos' }),
      ),
    )
    expect(rows.map((r) => r.node.tipo)).toEqual(['insumo', 'produto', 'produto'])
  })

  it('"secundario" é apelido de "final": canonizado sem warning', () => {
    const { rows, warnings } = parseCatalogo(csv(completo({ nome: 'A', nivel: 'secundario' })))
    expect(warnings).toEqual([])
    expect(rows[0].node).toMatchObject({ nivel: 'final', tipo: 'produto' })
  })

  it('incompleto = false quando owner e centro_de_custo preenchidos', () => {
    const { rows } = parseCatalogo(csv(completo({ owner: 'Fulano', centro_de_custo: 'CC-1' })))
    expect(rows[0].node.incompleto).toBe(false)
    expect(rows[0].node.centroDeCusto).toBe('CC-1')
  })

  it('observacoes vira corpo (markdown preservado, multilinha); vazia = sem corpo', () => {
    const { rows } = parseCatalogo(
      csv(
        completo({ nome: 'A', observacoes: 'Consome [[GDAD]].\n\nDetalhe em **negrito**.' }),
        completo({ nome: 'B' }),
      ),
    )
    expect(rows[0].node.corpo).toBe('Consome [[GDAD]].\n\nDetalhe em **negrito**.')
    expect(rows[1].node.corpo).toBeUndefined()
  })

  it('listas com " | ": consome e fontes_secundarias; vazio = nenhum', () => {
    const { rows, warnings } = parseCatalogo(
      csv(completo({ consome: 'GDAD | Capital Regulatório', fontes_secundarias: 'Tabela A - UCS |  Tabela B - UCS ' })),
    )
    expect(warnings).toEqual([])
    expect(rows[0].consome).toEqual(['GDAD', 'Capital Regulatório'])
    expect(rows[0].node.fontesSecundarias).toEqual(['Tabela A - UCS', 'Tabela B - UCS'])
    const semListas = parseCatalogo(csv(completo({})))
    expect(semListas.rows[0].consome).toEqual([])
    expect(semListas.rows[0].node.fontesSecundarias).toBeUndefined()
  })

  it('origem/fonte_sistema vazios viram null (não se aplica) sem warning', () => {
    const { rows, warnings } = parseCatalogo(csv(completo({ nivel: 'final', origem: '', fonte_sistema: '' })))
    expect(warnings).toEqual([])
    expect(rows[0].node.sistema).toBeNull()
    expect(rows[0].node.origem).toBeNull()
  })

  it('coluna obrigatória ausente do cabeçalho gera warning', () => {
    const semNivel = COLUNAS.filter((c) => c !== 'nivel').join(';')
    const { warnings } = parseCatalogo(`${semNivel}\r\n`)
    expect(warnings).toEqual(['catalogo.csv: coluna obrigatória "nivel" ausente do cabeçalho'])
  })

  it('coluna desconhecida gera warning e é ignorada', () => {
    const { rows, warnings } = parseCatalogo(`${CABECALHO};extra\r\n${completo({ nome: 'A' })};lixo\r\n`)
    expect(warnings).toEqual(['catalogo.csv: coluna desconhecida "extra" ignorada'])
    expect(rows[0].node.nome).toBe('A')
  })

  it('nivel inválido gera warning com a linha e o nome, assumindo "primario"', () => {
    const { rows, warnings } = parseCatalogo(csv(completo({ nome: 'Alfa', nivel: 'raiz' })))
    expect(warnings).toEqual([
      'catalogo.csv linha 2 ("Alfa"): nivel "raiz" inválido' +
        ' (use dominio, origem, fonte, fonte-secundaria, primario, final ou ambos) — assumindo "primario"',
    ])
    expect(rows[0].node.nivel).toBe('primario')
  })

  it('linha de componente sai em "componentes", não em "rows"; associações por nível', () => {
    const { rows, componentes, warnings } = parseCatalogo(
      csv(
        completo({ nome: 'Risco', nivel: 'dominio', debito: '', origem: '', fonte_sistema: '', descricao: 'domínio de risco', owner: 'Fulano' }),
        completo({ nome: 'Databricks', nivel: 'fonte', debito: '', origem: 'área de risco | cadastro', fonte_sistema: '', observacoes: 'Corpo.' }),
        completo({ nome: 'Tabela X - UCS', nivel: 'fonte-secundaria', debito: '', origem: '', fonte_sistema: 'Databricks' }),
      ),
    )
    expect(warnings).toEqual([])
    expect(rows).toEqual([])
    expect(componentes).toEqual([
      { nivel: 'dominio', nome: 'Risco', descricao: 'domínio de risco', owner: 'Fulano', centroDeCusto: null, associacoes: [] },
      { nivel: 'fonte', nome: 'Databricks', descricao: 'd', owner: null, centroDeCusto: null, corpo: 'Corpo.', associacoes: ['área de risco', 'cadastro'] },
      { nivel: 'fonte-secundaria', nome: 'Tabela X - UCS', descricao: 'd', owner: null, centroDeCusto: null, associacoes: ['Databricks'] },
    ])
  })

  it('linha sem nome gera warning e é ignorada', () => {
    const { rows, warnings } = parseCatalogo(csv(completo({ nome: '' }), completo({ nome: 'B' })))
    expect(warnings).toEqual(['catalogo.csv linha 2: célula "nome" vazia — linha ignorada'])
    expect(rows.map((r) => r.node.nome)).toEqual(['B'])
  })
})

describe('buildGraph', () => {
  const catalogo = csv(
    completo({ nome: 'Alfa', nivel: 'final', origem: '', fonte_sistema: '', consome: 'Beta' }),
    completo({ nome: 'Beta' }),
  )

  it('resolve consome por nome (case-insensitive) e gera aresta', () => {
    const { graph, warnings } = buildGraph(csv(
      completo({ nome: 'Alfa', consome: 'beta' }),
      completo({ nome: 'Beta' }),
    ))
    expect(warnings).toEqual([])
    expect(graph.links.filter((l) => l.label === 'consome')).toEqual([
      { source: 'alfa', target: 'beta', label: 'consome' },
    ])
  })

  it('consome quebrado gera warning e nó fantasma', () => {
    const { graph, warnings } = buildGraph(csv(completo({ nome: 'Alfa', consome: 'Não Existe' })))
    expect(warnings.some((w) => w.includes('consome quebrado') && w.includes('"Não Existe"'))).toBe(true)
    const fantasma = graph.nodes.find((n) => n.fantasma === true)
    expect(fantasma).toMatchObject({ id: 'nao-existe', nome: 'Não Existe', incompleto: true })
    expect(graph.links.filter((l) => l.label === 'consome')).toEqual([
      { source: 'alfa', target: 'nao-existe', label: 'consome' },
    ])
  })

  it('nome duplicado (mesmo slug) gera warning e mantém só a primeira linha', () => {
    const { graph, warnings } = buildGraph(csv(
      completo({ nome: 'Alfa', descricao: 'primeira' }),
      completo({ nome: 'alfa', descricao: 'repetida' }),
    ))
    expect(warnings).toEqual(['nome duplicado "alfa" (id "alfa") — a linha repetida foi ignorada'])
    const dados = graph.nodes.filter((n): n is GraphNode => n.derivado !== true && n.nivel !== 'raiz')
    expect(dados).toHaveLength(1)
    expect(dados[0].descricao).toBe('primeira')
  })

  it('raiz automática: criada sem linha no CSV, agrega todos os final/ambos', () => {
    const { graph, warnings } = buildGraph(csv(
      completo({ nome: 'Alfa', nivel: 'final', origem: '', fonte_sistema: '' }),
      completo({ nome: 'Beta', nivel: 'ambos' }),
      completo({ nome: 'Gama', nivel: 'primario' }),
    ))
    expect(warnings).toEqual([])
    const raiz = graph.nodes.find((n) => n.id === 'atacado-dados')
    expect(raiz).toMatchObject({ ...criarRaiz() })
    const agrega = graph.links.filter((l) => l.label === 'agrega')
    // raiz → dom-risco → {alfa, beta}; gama (primário) fica de fora
    expect(agrega).toEqual([
      { source: 'atacado-dados', target: 'dom-risco', label: 'agrega' },
      { source: 'dom-risco', target: 'alfa', label: 'agrega' },
      { source: 'dom-risco', target: 'beta', label: 'agrega' },
    ])
  })

  it('linha com o mesmo nome da raiz é rejeitada como duplicada', () => {
    const { warnings } = buildGraph(csv(completo({ nome: 'Atacado — Dados' })))
    expect(warnings).toEqual(['nome duplicado "Atacado — Dados" (id "atacado-dados") — a linha repetida foi ignorada'])
  })

  it('saída é determinística independentemente da ordem das linhas', () => {
    const invertido = csv(
      completo({ nome: 'Beta' }),
      completo({ nome: 'Alfa', nivel: 'final', origem: '', fonte_sistema: '', consome: 'Beta' }),
    )
    expect(buildGraph(invertido).graph).toEqual(buildGraph(catalogo).graph)
  })
})

describe('derivarDominios', () => {
  const catalogo = csv(
    completo({ nome: 'Alfa', nivel: 'final', dominio: 'Risco', origem: '', fonte_sistema: '' }),
    completo({ nome: 'Beta', nivel: 'final', dominio: 'Risco', origem: '', fonte_sistema: '' }),
    completo({ nome: 'Gama', nivel: 'final', dominio: 'Regulatorio', origem: '', fonte_sistema: '' }),
  )

  it('substitui raiz→produto por raiz→domínio→produto, deduplicando raiz→domínio', () => {
    const { graph, warnings } = buildGraph(catalogo)
    expect(warnings).toEqual([])
    const doms = graph.nodes.filter((n) => n.derivado === true && n.tipo === 'dominio')
    expect(doms).toEqual([
      { id: 'dom-regulatorio', nome: 'Regulatório', tipo: 'dominio', derivado: true, incompleto: false },
      { id: 'dom-risco', nome: 'Risco', tipo: 'dominio', derivado: true, incompleto: false },
    ])
    expect(graph.links).toEqual([
      { source: 'atacado-dados', target: 'dom-regulatorio', label: 'agrega' },
      { source: 'atacado-dados', target: 'dom-risco', label: 'agrega' },
      { source: 'dom-regulatorio', target: 'gama', label: 'agrega' },
      { source: 'dom-risco', target: 'alfa', label: 'agrega' },
      { source: 'dom-risco', target: 'beta', label: 'agrega' },
    ])
  })

  it('função pura: arestas não-"agrega" passam intactas', () => {
    const nodes = parseCatalogo(catalogo).rows.map((r) => r.node)
    const { nodes: doms, links } = derivarDominios(nodes, [
      { source: 'alfa', target: 'beta', label: 'consome' },
      { source: 'raiz', target: 'alfa', label: 'agrega' },
    ])
    expect(doms.map((n) => n.id)).toEqual(['dom-risco'])
    expect(links).toEqual([
      { source: 'alfa', target: 'beta', label: 'consome' },
      { source: 'raiz', target: 'dom-risco', label: 'agrega' },
      { source: 'dom-risco', target: 'alfa', label: 'agrega' },
    ])
  })

  it('determinismo: mesma saída independentemente da ordem das linhas', () => {
    const invertido = csv(
      completo({ nome: 'Gama', nivel: 'final', dominio: 'Regulatorio', origem: '', fonte_sistema: '' }),
      completo({ nome: 'Beta', nivel: 'final', dominio: 'Risco', origem: '', fonte_sistema: '' }),
      completo({ nome: 'Alfa', nivel: 'final', dominio: 'Risco', origem: '', fonte_sistema: '' }),
    )
    expect(buildGraph(invertido).graph).toEqual(buildGraph(catalogo).graph)
  })
})

describe('derivarSistemasOrigens', () => {
  it('sistema compartilhado vira UM nó, com aresta sistema→origem deduplicada', () => {
    const { graph } = buildGraph(csv(
      completo({ nome: 'Alfa', fonte_sistema: 'Databricks', origem: 'área de risco' }),
      completo({ nome: 'Beta', fonte_sistema: '  databricks ', origem: 'área de risco' }),
    ))
    const sistemas = graph.nodes.filter((n) => n.derivado === true && n.tipo === 'sistema')
    expect(sistemas).toEqual([
      { id: 'sys-databricks', nome: 'Databricks', tipo: 'sistema', derivado: true, incompleto: false },
    ])
    expect(graph.links).toEqual([
      { source: 'alfa', target: 'sys-databricks', label: 'vem de' },
      { source: 'beta', target: 'sys-databricks', label: 'vem de' },
      { source: 'sys-databricks', target: 'org-area-de-risco', label: 'origina de' },
    ])
  })

  it('valores desconhecidos ("a confirmar" etc., case-insensitive) não viram nó nem aresta', () => {
    const { graph } = buildGraph(csv(
      completo({ nome: 'Alfa', fonte_sistema: 'A Confirmar', origem: 'a detalhar' }),
      completo({ nome: 'Beta', fonte_sistema: 'a identificar', origem: '' }),
    ))
    expect(graph.nodes.filter((n) => n.derivado === true)).toEqual([])
    expect(graph.links).toEqual([])
  })

  it('células vazias (produtos finais) não geram nó derivado nem aresta', () => {
    const { graph, warnings } = buildGraph(csv(
      completo({ nome: 'Alfa', nivel: 'primario', fonte_sistema: '', origem: '' }),
    ))
    expect(warnings).toEqual([])
    expect(graph.nodes.filter((n) => n.derivado === true)).toEqual([])
    expect(graph.links).toEqual([])
  })

  it('sistema desconhecido com origem conhecida liga dado → origem direto', () => {
    const { graph } = buildGraph(csv(
      completo({ nome: 'Alfa', fonte_sistema: 'a confirmar', origem: 'Banco Central' }),
    ))
    expect(graph.nodes.filter((n) => n.derivado === true)).toEqual([
      { id: 'org-banco-central', nome: 'Banco Central', tipo: 'origem', derivado: true, incompleto: false },
    ])
    expect(graph.links).toEqual([{ source: 'alfa', target: 'org-banco-central', label: 'origina de' }])
  })

  it('os nós de dados continuam idênticos e os derivados entram na ordenação por id', () => {
    const catalogo = csv(
      completo({ nome: 'Alfa', fonte_sistema: 'Zeta', origem: 'Ypsilon' }),
      completo({ nome: 'Beta', fonte_sistema: 'Zeta', origem: 'Ômega' }),
    )
    const { graph } = buildGraph(catalogo)
    expect(graph.nodes.map((n) => n.id)).toEqual(['alfa', 'atacado-dados', 'beta', 'org-omega', 'org-ypsilon', 'sys-zeta'])
    expect(graph.nodes.filter((n) => n.derivado !== true)).toEqual(
      buildGraph(catalogo).graph.nodes.filter((n) => n.derivado !== true),
    )
  })

  it('função pura: aceita nós de dados e devolve derivados + arestas', () => {
    const { rows } = parseCatalogo(csv(completo({ nome: 'Alfa', fonte_sistema: 'SF', origem: 'RM' })))
    const derivados = derivarSistemasOrigens(rows.map((r) => r.node))
    expect(derivados.nodes.map((n) => n.id)).toEqual(['sys-sf', 'org-rm'])
    expect(derivados.links).toEqual([
      { source: 'alfa', target: 'sys-sf', label: 'vem de' },
      { source: 'sys-sf', target: 'org-rm', label: 'origina de' },
    ])
  })
})

describe('fontes secundárias (UCS)', () => {
  it('substitui a aresta direta dado→sistema por dado→fsec→sistema (sistema→origem mantida)', () => {
    const { graph, warnings } = buildGraph(csv(
      completo({
        nome: 'Alfa',
        fonte_sistema: 'SQL Legado',
        origem: 'comercial',
        fontes_secundarias: 'Alfa Diário - UCS | Alfa Mensal - UCS',
      }),
    ))
    expect(warnings).toEqual([])
    const fsecs = graph.nodes.filter((n) => n.derivado === true && n.tipo === 'fonte-secundaria')
    expect(fsecs).toEqual([
      { id: 'fsec-alfa-diario-ucs', nome: 'Alfa Diário - UCS', tipo: 'fonte-secundaria', derivado: true, incompleto: false },
      { id: 'fsec-alfa-mensal-ucs', nome: 'Alfa Mensal - UCS', tipo: 'fonte-secundaria', derivado: true, incompleto: false },
    ])
    expect(graph.links).toEqual([
      { source: 'alfa', target: 'fsec-alfa-diario-ucs', label: 'vem de' },
      { source: 'alfa', target: 'fsec-alfa-mensal-ucs', label: 'vem de' },
      { source: 'fsec-alfa-diario-ucs', target: 'sys-sql-legado', label: 'vem de' },
      { source: 'fsec-alfa-mensal-ucs', target: 'sys-sql-legado', label: 'vem de' },
      { source: 'sys-sql-legado', target: 'org-comercial', label: 'origina de' },
    ])
  })

  it('dedup global por nome normalizado entre dados diferentes', () => {
    const { graph } = buildGraph(csv(
      completo({ nome: 'Alfa', fonte_sistema: 'S1', origem: 'o', fontes_secundarias: 'Base Comum - UCS' }),
      completo({ nome: 'Beta', fonte_sistema: 'S2', origem: 'o', fontes_secundarias: '  base comum - ucs ' }),
    ))
    const fsecs = graph.nodes.filter((n) => n.derivado === true && n.tipo === 'fonte-secundaria')
    expect(fsecs).toEqual([
      { id: 'fsec-base-comum-ucs', nome: 'Base Comum - UCS', tipo: 'fonte-secundaria', derivado: true, incompleto: false },
    ])
    // a fsec compartilhada ingere dos dois sistemas
    expect(graph.links.filter((l) => l.source === 'fsec-base-comum-ucs').map((l) => l.target).sort()).toEqual([
      'sys-s1',
      'sys-s2',
    ])
  })

  it('sistema desconhecido: fsec liga direto na origem ("origina de")', () => {
    const { graph } = buildGraph(csv(
      completo({
        nome: 'Alfa',
        fonte_sistema: 'a confirmar',
        origem: 'Banco Central',
        fontes_secundarias: 'Alfa - UCS',
      }),
    ))
    expect(graph.links).toEqual([
      { source: 'alfa', target: 'fsec-alfa-ucs', label: 'vem de' },
      { source: 'fsec-alfa-ucs', target: 'org-banco-central', label: 'origina de' },
    ])
  })

  it('dado sem a célula segue intacto (ligação direta dado→sistema)', () => {
    const { graph } = buildGraph(csv(
      completo({ nome: 'Alfa', fonte_sistema: 'S1', origem: 'o', fontes_secundarias: 'Alfa - UCS' }),
      completo({ nome: 'Beta', fonte_sistema: 'S1', origem: 'o' }),
    ))
    expect(graph.links.filter((l) => l.source === 'beta')).toEqual([
      { source: 'beta', target: 'sys-s1', label: 'vem de' },
    ])
    expect(graph.links.filter((l) => l.source === 'alfa' && l.target === 'sys-s1')).toEqual([])
  })

  it('determinismo: mesma saída independentemente da ordem das linhas', () => {
    const a = completo({ nome: 'Alfa', fonte_sistema: 'S1', origem: 'o', fontes_secundarias: 'X - UCS | Y - UCS' })
    const b = completo({ nome: 'Beta', fonte_sistema: 'S1', origem: 'o', fontes_secundarias: 'x - ucs' })
    expect(buildGraph(csv(b, a)).graph).toEqual(buildGraph(csv(a, b)).graph)
  })
})

describe('componentes cadastrados (linhas dominio/origem/fonte/fonte-secundaria)', () => {
  it('fusão: componente com o mesmo slug de um nó derivado vira UM nó com cadastrado: true', () => {
    const { graph, warnings } = buildGraph(csv(
      completo({ nome: 'Alfa', fonte_sistema: 'Databricks (governado)', origem: 'área de risco' }),
      completo({
        nome: 'databricks (GOVERNADO)',
        nivel: 'fonte',
        debito: '',
        origem: 'área de risco',
        fonte_sistema: '',
        descricao: 'plataforma corporativa',
        owner: 'Plataforma',
        centro_de_custo: 'CC-9',
        observacoes: 'Corpo do componente.',
      }),
    ))
    expect(warnings).toEqual([])
    const sistemas = graph.nodes.filter((n) => n.derivado === true && n.tipo === 'sistema')
    expect(sistemas).toEqual([
      {
        id: 'sys-databricks-governado',
        nome: 'Databricks (governado)', // nome do nó derivado é mantido
        tipo: 'sistema',
        derivado: true,
        incompleto: false,
        cadastrado: true,
        descricao: 'plataforma corporativa',
        owner: 'Plataforma',
        centroDeCusto: 'CC-9',
        corpo: 'Corpo do componente.',
      },
    ])
    // a associação repete a rota já derivada do produto: aresta deduplicada
    expect(graph.links.filter((l) => l.source === 'sys-databricks-governado')).toEqual([
      { source: 'sys-databricks-governado', target: 'org-area-de-risco', label: 'origina de' },
    ])
  })

  it('linha fonte com 2 origens gera 2 arestas "origina de", criando as origens que faltarem', () => {
    const { graph, warnings } = buildGraph(csv(
      completo({ nome: 'SF', nivel: 'fonte', debito: '', origem: 'RM (relacionamento) | cadastro corporativo', fonte_sistema: '' }),
    ))
    expect(warnings).toEqual([])
    expect(graph.links.filter((l) => l.label === 'origina de')).toEqual([
      { source: 'sys-sf', target: 'org-cadastro-corporativo', label: 'origina de' },
      { source: 'sys-sf', target: 'org-rm-relacionamento', label: 'origina de' },
    ])
    const origens = graph.nodes.filter((n) => n.derivado === true && n.tipo === 'origem')
    expect(origens.map((n) => ({ id: n.id, cadastrado: n.cadastrado }))).toEqual([
      { id: 'org-cadastro-corporativo', cadastrado: undefined },
      { id: 'org-rm-relacionamento', cadastrado: undefined },
    ])
  })

  it('linha fonte-secundaria com fontes gera arestas fsec→sys "vem de"', () => {
    const { graph } = buildGraph(csv(
      completo({ nome: 'Tabela X - UCS', nivel: 'fonte-secundaria', debito: '', origem: '', fonte_sistema: 'SQL Legado | Mainframe' }),
    ))
    expect(graph.links).toEqual([
      { source: 'fsec-tabela-x-ucs', target: 'sys-mainframe', label: 'vem de' },
      { source: 'fsec-tabela-x-ucs', target: 'sys-sql-legado', label: 'vem de' },
    ])
  })

  it('componente sem produto que o referencie vira nó isolado', () => {
    const { graph, warnings } = buildGraph(csv(
      completo({ nome: 'Compliance', nivel: 'dominio', debito: '', origem: '', fonte_sistema: '', descricao: 'domínio novo' }),
    ))
    expect(warnings).toEqual([])
    expect(graph.nodes.filter((n) => n.derivado === true)).toEqual([
      {
        id: 'dom-compliance',
        nome: 'Compliance',
        tipo: 'dominio',
        derivado: true,
        incompleto: false,
        cadastrado: true,
        descricao: 'domínio novo',
        owner: null,
        centroDeCusto: null,
      },
    ])
    expect(graph.links).toEqual([])
  })

  it('componente dominio funde com o domínio derivado dos produtos finais', () => {
    const { graph } = buildGraph(csv(
      completo({ nome: 'Alfa', nivel: 'final', origem: '', fonte_sistema: '', dominio: 'Regulatorio' }),
      completo({ nome: 'Regulatorio', nivel: 'dominio', debito: '', origem: '', fonte_sistema: '', owner: 'Fulano' }),
    ))
    const dom = graph.nodes.find((n) => n.id === 'dom-regulatorio')
    expect(dom).toMatchObject({ nome: 'Regulatório', cadastrado: true, owner: 'Fulano' })
    expect(graph.links).toEqual([
      { source: 'atacado-dados', target: 'dom-regulatorio', label: 'agrega' },
      { source: 'dom-regulatorio', target: 'alfa', label: 'agrega' },
    ])
  })

  it('componente duplicado (mesmo slug no mesmo nível) gera warning e é ignorado', () => {
    const { graph, warnings } = buildGraph(csv(
      completo({ nome: 'Área de Risco', nivel: 'origem', debito: '', origem: '', fonte_sistema: '', descricao: 'primeira' }),
      completo({ nome: 'area de risco', nivel: 'origem', debito: '', origem: '', fonte_sistema: '', descricao: 'repetida' }),
    ))
    expect(warnings).toEqual([
      'componente duplicado "area de risco" (id "org-area-de-risco") — a linha repetida foi ignorada',
    ])
    const org = graph.nodes.find((n) => n.id === 'org-area-de-risco')
    expect(org).toMatchObject({ descricao: 'primeira', cadastrado: true })
  })

  it('mesmo nome em níveis diferentes convive: produto, fonte e fonte-secundaria', () => {
    const { graph, warnings } = buildGraph(csv(
      completo({ nome: 'Databricks' }),
      completo({ nome: 'Databricks', nivel: 'fonte', debito: '', origem: '', fonte_sistema: '' }),
      completo({ nome: 'Databricks', nivel: 'fonte-secundaria', debito: '', origem: '', fonte_sistema: '' }),
    ))
    expect(warnings).toEqual([])
    expect(graph.nodes.filter((n) => n.nome === 'Databricks').map((n) => n.id).sort()).toEqual([
      'databricks',
      'fsec-databricks',
      'sys-databricks',
    ])
  })

  it('determinismo: mesma saída independentemente da ordem das linhas', () => {
    const produto = completo({ nome: 'Alfa', fonte_sistema: 'SF', origem: 'RM' })
    const fonte = completo({ nome: 'SF', nivel: 'fonte', debito: '', origem: 'RM | Outra', fonte_sistema: '' })
    const origem = completo({ nome: 'Outra', nivel: 'origem', debito: '', origem: '', fonte_sistema: '', owner: 'Beltrano' })
    expect(buildGraph(csv(origem, fonte, produto)).graph).toEqual(buildGraph(csv(produto, origem, fonte)).graph)
  })
})

describe('slugify', () => {
  it('gera kebab-case sem acentos', () => {
    expect(slugify('Capital Regulatório')).toBe('capital-regulatorio')
    expect(slugify('Custo de Capital (KE)')).toBe('custo-de-capital-ke')
  })
})

describe('catalogo.csv real (catálogo em 4 níveis + níveis medalhão)', () => {
  const caminho = resolve(import.meta.dirname, '..', 'catalogo.csv')
  const { niveis } = carregarNiveis(
    readFileSync(resolve(import.meta.dirname, '..', 'niveis.csv'), 'utf8'),
  )
  const { graph, warnings } = buildGraph(readFileSync(caminho, 'utf8'), niveis)
  const dados = graph.nodes.filter((n): n is GraphNode => n.derivado !== true)
  const consome = graph.links.filter((l) => l.label === 'consome')

  it('builda sem warnings e sem nós fantasma', () => {
    expect(warnings).toEqual([])
    expect(graph.nodes.filter((n) => n.fantasma === true)).toEqual([])
  })

  it('50 linhas no CSV (33 produtos + 16 de nível medalhão + 1 componente) + raiz = 34 dados', () => {
    const registros = parseCsv(readFileSync(caminho, 'utf8'))
    expect(registros).toHaveLength(51) // cabeçalho + 33 + 16 + 1
    expect(registros[0]).toEqual([...COLUNAS])
    expect(dados).toHaveLength(34)
    // As 16 linhas de nível medalhão (Gold/Silver/Broze) são nós niv-*.
    expect(graph.nodes.filter((n) => n.tipo === 'nivel-custom')).toHaveLength(16)
  })

  it('34 nós de dados: 1 raiz, 20 primários, 11 finais e 2 "ambos"', () => {
    expect(dados.filter((n) => n.nivel === 'raiz').map((n) => n.id)).toEqual(['atacado-dados'])
    expect(dados.filter((n) => n.nivel === 'primario')).toHaveLength(20)
    expect(dados.filter((n) => n.nivel === 'final')).toHaveLength(11)
    expect(dados.filter((n) => n.nivel === 'ambos').map((n) => n.id).sort()).toEqual([
      'rating',
      'restritivos-e-tipos',
    ])
  })

  it('grafo íntegro: ids únicos e toda aresta entre nós existentes', () => {
    // O catálogo é editável pelo app, então o teste fixa invariantes em vez de
    // contagens — números exatos quebrariam a cada cadastro do usuário.
    const ids = graph.nodes.map((n) => n.id)
    expect(new Set(ids).size).toBe(ids.length)
    const existe = new Set(ids)
    for (const l of graph.links) {
      expect(existe.has(String(l.source))).toBe(true)
      expect(existe.has(String(l.target))).toBe(true)
      expect(l.source).not.toBe(l.target)
    }
    expect(new Set(graph.links.map((l) => l.label))).toEqual(
      new Set(['consome', 'agrega', 'vem de', 'origina de']),
    )
  })

  it('Databricks (governado): um só sistema compartilhado por 5 dados', () => {
    const sysDatabricks = graph.nodes.filter(
      (n) => n.derivado === true && n.tipo === 'sistema' && n.nome.toLowerCase().includes('databricks'),
    )
    expect(sysDatabricks.map((n) => n.id).sort()).toEqual([
      'sys-databricks-dado-curado',
      'sys-databricks-governado',
    ])
    const ligados = graph.links
      .filter((l) => l.target === 'sys-databricks-governado' && l.label === 'vem de')
      .map((l) => l.source)
    // Fonte compartilhada: vários dados apontam para o mesmo nó (quais, o
    // catálogo decide — o teste garante que não há duplicação do sistema).
    expect(ligados.length).toBeGreaterThan(1)
    expect(ligados).toContain('psdc')
  })

  it('as tabelas UCS viraram linhas Silver: nenhum nó fsec-* paralelo', () => {
    expect(graph.nodes.filter((n) => n.tipo === 'fonte-secundaria')).toEqual([])
    // o débito do dado não muda com a ingestão: Mercado Alvo segue "sim"
    expect(dados.find((n) => n.id === 'mercado-alvo')?.debito).toBe('sim')
  })

  it('raiz atacado-dados: automática, incompleto false e "agrega" só para os 5 nós de domínio', () => {
    const raiz = dados.find((n) => n.id === 'atacado-dados')
    expect(raiz).toMatchObject({
      nivel: 'raiz',
      tipo: 'dominio',
      dominio: 'Atacado',
      incompleto: false,
      sistema: null,
      origem: null,
    })
    const daRaiz = graph.links.filter((l) => l.source === 'atacado-dados')
    expect(daRaiz.every((l) => l.label === 'agrega')).toBe(true)
    expect(daRaiz.map((l) => l.target).sort()).toEqual([
      'dom-cadastro',
      'dom-mercado',
      'dom-regulatorio',
      'dom-resultado',
      'dom-risco',
    ])
    // a raiz não deriva sistema/origem nem consome ninguém
    expect(graph.links.filter((l) => l.target === 'atacado-dados')).toEqual([])
  })

  it('6 nós de domínio (5 entre a raiz e os 13 produtos finais + 1 cadastrado isolado)', () => {
    const doms = graph.nodes.filter((n) => n.derivado === true && n.tipo === 'dominio')
    expect(doms.map((n) => n.nome).sort()).toEqual([
      'Bacen (DOM)',
      'Cadastro',
      'Mercado',
      'Regulatório',
      'Resultado',
      'Risco',
    ])
    const produtosDe = (id: string) =>
      graph.links
        .filter((l) => l.source === id && l.label === 'agrega')
        .map((l) => l.target)
        .sort()
    expect(produtosDe('dom-cadastro')).toEqual(['account', 'faturamento'])
    expect(produtosDe('dom-mercado')).toEqual([
      'localizacao',
      'segmentacao-e-encarteiramento',
      'setorizacao',
    ])
    expect(produtosDe('dom-risco')).toEqual(['rating', 'restritivos-e-tipos'])
    expect(produtosDe('dom-resultado')).toEqual([
      'estoque-carteira',
      'evolucao-do-resultado',
      'evolucao-do-resultado-por-produto',
      'rar-12m',
      'resultado',
    ])
    expect(produtosDe('dom-regulatorio')).toEqual(['endividamento-de-mercado'])
  })

  it('nenhum self-loop e nada consumido pelos itens a mapear', () => {
    expect(consome.length).toBeGreaterThan(0)
    expect(graph.links.filter((l) => l.source === l.target)).toEqual([])
    const alvosDe = (id: string) => consome.filter((l) => l.source === id)
    expect(alvosDe('recta-fedrl')).toEqual([])
    expect(alvosDe('pcam-57')).toEqual([])
    expect(alvosDe('rating')).toEqual([])
    expect(alvosDe('restritivos-e-tipos')).toEqual([])
  })

  it('produtos finais com as cadeias esperadas', () => {
    const alvos = (id: string) =>
      consome
        .filter((l) => l.source === id)
        .map((l) => l.target)
        .sort()
    expect(alvos('setorizacao')).toEqual(['bacen', 'classificacao-de-setores', 'gdp', 'rfb'])
    // GDAD foi transferido para o nível Gold: quem o consome segue apontando
    // para o nó real (agora niv-gold-gdad), sem fantasma.
    expect(alvos('rar-12m')).toEqual([
      'capital-regulatorio',
      'custo-de-capital-ke',
      'estatag',
      'niv-gold-gdad',
    ])
    expect(alvos('evolucao-do-resultado-por-produto')).toEqual(['niv-broze-de-para-de-produtos'])
  })

  it('produtos finais não derivam sistema/origem (células vazias)', () => {
    for (const n of dados.filter((d) => d.nivel === 'final')) {
      expect(n.sistema).toBeNull()
      expect(n.origem).toBeNull()
      expect(graph.links.filter((l) => l.source === n.id && l.label !== 'consome')).toEqual([])
    }
  })
})
