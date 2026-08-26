// Testes dos níveis dinâmicos: niveis.csv (parse/serialize/validação),
// remoção de nível em uso, coluna 14 (associacoes) do catalogo.csv,
// componentes de nível custom no build e bloco `niveis` do graph.json.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildGraph,
  carregarNiveis,
  COLUNAS,
  defsDeNiveis,
  montarNiveis,
  NIVEIS_BUILTIN,
  parseCatalogo,
  parseCatalogoRows,
  parseNiveisRows,
  serializarCatalogo,
  serializarNiveis,
  validarCatalogo,
  validarNiveis,
  validarNiveisContraCatalogo,
  type CatalogoRow,
  type NivelRow,
} from './graph-lib.ts'
import { niveisDoBody } from './vite-plugin-catalogo.ts'

// Helpers: mesmo estilo do graph-lib.test.ts (CSV sintético por registro).
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

const nivelRow = (titulo: string, ordem: number): NivelRow => ({ titulo, ordem })

const MEDALHAO = [nivelRow('Bronze', 46), nivelRow('Prata', 44), nivelRow('Ouro', 42)]

const catalogoRow = (extra: Partial<CatalogoRow>): CatalogoRow => ({
  nome: 'X',
  nivel: 'primario',
  dominio: 'Risco',
  origem: 'o',
  fonte_sistema: 's',
  fontes_secundarias: [],
  consome: [],
  descricao: 'd',
  debito: 'nao',
  status: 'producao',
  owner: null,
  centro_de_custo: null,
  observacoes: '',
  associacoes: [],
  ...extra,
})

describe('niveis.csv — parse e serialize', () => {
  it('formato canônico: BOM, cabeçalho titulo;ordem, ";", CRLF e aspas mínimas', () => {
    const texto = serializarNiveis([nivelRow('Bronze', 46), nivelRow('Prata; fina', 44.5)])
    expect(texto).toBe('﻿titulo;ordem\r\nBronze;46\r\n"Prata; fina";44.5\r\n')
  })

  it('round-trip: parse(serialize(rows)) === rows, com ordem float', () => {
    const rows = [nivelRow('Bronze', 46), nivelRow('Prata', 44.5), nivelRow('Ouro', 42)]
    expect(parseNiveisRows(serializarNiveis(rows))).toEqual(rows)
    // e o serializador é idempotente sobre o próprio round-trip
    const texto = serializarNiveis(rows)
    expect(serializarNiveis(parseNiveisRows(texto))).toBe(texto)
  })

  it('ordem vazia ou não-numérica vira NaN (pega na validação, não no parse)', () => {
    const rows = parseNiveisRows('﻿titulo;ordem\r\nBronze;\r\nPrata;abc\r\n')
    expect(rows.map((r) => r.titulo)).toEqual(['Bronze', 'Prata'])
    expect(rows.every((r) => Number.isNaN(r.ordem))).toBe(true)
  })

  it('arquivo só com cabeçalho = nenhum nível custom, sem warnings', () => {
    const texto = serializarNiveis([])
    expect(parseNiveisRows(texto)).toEqual([])
    expect(carregarNiveis(texto)).toEqual({ niveis: [], warnings: [] })
  })
})

describe('validarNiveis', () => {
  it('Bronze/Prata/Ouro entre fonte-secundaria (40) e fonte (50) passam limpos', () => {
    expect(validarNiveis(MEDALHAO)).toEqual({ errors: [], warnings: [] })
  })

  it('titulo vazio ou sem letras/números é erro', () => {
    const { errors } = validarNiveis([nivelRow('  ', 42), nivelRow('---', 44)])
    expect(errors).toEqual([
      'linha 2: "titulo" é obrigatório',
      'linha 3 ("---"): titulo inválido — precisa conter letras ou números',
    ])
  })

  it('título que colide com nível built-in (por slug, case/acento-insensitive) é erro', () => {
    const { errors } = validarNiveis([nivelRow('ORIGEM', 42), nivelRow('Fonte secundária', 44)])
    expect(errors).toEqual([
      'linha 2 ("ORIGEM"): título colide com o nível built-in "Origem"',
      'linha 3 ("Fonte secundária"): título colide com o nível built-in "Fonte secundária"',
    ])
  })

  it('"ambos" e "secundario" são reservados mesmo sem serem níveis de coluna', () => {
    const { errors } = validarNiveis([nivelRow('Ambos', 42)])
    expect(errors).toEqual([
      'linha 2 ("Ambos"): título reservado — "ambos" já tem significado na coluna nivel do catálogo',
    ])
  })

  it('título duplicado entre customs (mesmo slug) é erro apontando as duas linhas', () => {
    const { errors } = validarNiveis([nivelRow('Ouro', 42), nivelRow('ouro', 44)])
    expect(errors).toEqual(['linha 3 ("ouro"): título duplicado — colide com "Ouro" (linha 2)'])
  })

  it('ordem não-numérica, igual à de built-in ou repetida entre customs são erros', () => {
    const { errors } = validarNiveis([
      nivelRow('Bronze', Number.NaN),
      nivelRow('Prata', 40),
      nivelRow('Ouro', 42),
      nivelRow('Cobre', 42),
    ])
    expect(errors).toEqual([
      'linha 2 ("Bronze"): ordem inválida — use um número (decimais aceitos)',
      'linha 3 ("Prata"): ordem 40 colide com o nível built-in "Fonte secundária" — use um valor intermediário',
      'linha 5 ("Cobre"): ordem 42 duplicada — colide com "Ouro" (linha 4)',
    ])
  })
})

describe('montarNiveis (bloco `niveis` do graph.json)', () => {
  it('built-ins + customs ordenados por ordem, com flag builtin', () => {
    const niveis = montarNiveis(defsDeNiveis(MEDALHAO))
    expect(niveis.map((n) => `${n.slug}:${n.ordem}:${n.builtin ? 'b' : 'c'}`)).toEqual([
      'raiz:0:b',
      'dominio:10:b',
      'final:20:b',
      'primario:30:b',
      'fonte-secundaria:40:b',
      'ouro:42:c',
      'prata:44:c',
      'bronze:46:c',
      'fonte:50:b',
      'origem:60:b',
    ])
  })

  it('sem customs, são exatamente os 7 built-in na ordem canônica', () => {
    expect(montarNiveis([])).toEqual(NIVEIS_BUILTIN.map((n) => ({ ...n, builtin: true })))
  })
})

describe('validarNiveisContraCatalogo (remoção de nível em uso)', () => {
  const catalogo = [
    catalogoRow({ nome: 'Tabela Raw X', nivel: 'bronze' }),
    catalogoRow({ nome: 'Tabela Raw Y', nivel: 'bronze' }),
    catalogoRow({ nome: 'Produto Z' }),
  ]

  it('remover nível custom com componentes cadastrados é erro citando as linhas', () => {
    const errors = validarNiveisContraCatalogo([nivelRow('Prata', 44)], catalogo)
    expect(errors).toEqual([
      'nível custom "bronze" está em uso por 2 linha(s) do catálogo ("Tabela Raw X", "Tabela Raw Y")' +
        ' — mova essas linhas para outro nível antes de removê-lo',
    ])
  })

  it('mantendo o nível (ou sem uso), remoção passa limpa', () => {
    expect(validarNiveisContraCatalogo([nivelRow('Bronze', 46)], catalogo)).toEqual([])
    expect(validarNiveisContraCatalogo([], [catalogoRow({ nome: 'Só produto' })])).toEqual([])
  })
})

describe('catalogo.csv — coluna 14 (associacoes)', () => {
  it('arquivo legado com 13 colunas parseia sem warning e associacoes sai []', () => {
    const colunas13 = COLUNAS.filter((c) => c !== 'associacoes')
    const legado =
      colunas13.join(';') + '\r\n' + 'Alfa;primario;Risco;o;s;;;d;nao;producao;;;\r\n'
    const { warnings } = parseCatalogo(legado)
    expect(warnings).toEqual([])
    expect(parseCatalogoRows(legado)[0].associacoes).toEqual([])
  })

  it('round-trip da linha custom: associacoes "A | B" vai e volta como lista', () => {
    const row = catalogoRow({
      nome: 'Tabela Raw X',
      nivel: 'bronze',
      debito: '',
      origem: null,
      fonte_sistema: null,
      associacoes: ['banco SQL legado (on-premise)', 'ADAT'],
    })
    const texto = serializarCatalogo([row])
    expect(texto).toContain(';banco SQL legado (on-premise) | ADAT\r\n')
    expect(parseCatalogoRows(texto)[0]).toEqual(row)
  })

  it('associacoes vale em qualquer nível; em fonte/fonte-secundaria a lista mora na rota', () => {
    const texto = serializarCatalogo([
      catalogoRow({ nome: 'Produto', associacoes: ['Alfa'] }),
      catalogoRow({ nome: 'Fonte X', nivel: 'fonte', debito: '', associacoes: ['lixo'] }),
    ])
    // Produto guarda a lista; a linha 'fonte' a guarda na coluna `origem`.
    expect(parseCatalogoRows(texto).map((r) => r.associacoes)).toEqual([['Alfa'], []])
  })
})

describe('buildGraph com níveis custom', () => {
  const NIVEIS = defsDeNiveis(MEDALHAO)

  it('linha de nível custom só com identificação vira componente simples', () => {
    const { graph, warnings } = buildGraph(
      csv(
        completo({
          nome: 'Tabela Raw X',
          nivel: 'bronze',
          dominio: '',
          debito: '',
          status: '',
          origem: '',
          fonte_sistema: '',
          descricao: 'ingestão crua',
          owner: 'Plataforma',
          centro_de_custo: 'CC-7',
          observacoes: 'Corpo da tabela.',
        }),
      ),
      NIVEIS,
    )
    expect(warnings).toEqual([])
    expect(graph.nodes.filter((n) => n.derivado === true)).toEqual([
      {
        id: 'niv-bronze-tabela-raw-x',
        nome: 'Tabela Raw X',
        tipo: 'nivel-custom',
        nivelCustom: 'bronze',
        derivado: true,
        incompleto: false,
        cadastrado: true,
        descricao: 'ingestão crua',
        owner: 'Plataforma',
        centroDeCusto: 'CC-7',
        corpo: 'Corpo da tabela.',
      },
    ])
    expect(graph.links).toEqual([])
    expect(graph.niveis.filter((n) => !n.builtin).map((n) => n.slug)).toEqual([
      'ouro',
      'prata',
      'bronze',
    ])
  })

  it('associação resolve por nome (case/acento-insensitive) e gera aresta "vem de"', () => {
    const { graph, warnings } = buildGraph(
      csv(
        completo({ nome: 'Alfa', fonte_sistema: 'banco SQL legado (on-premise)', origem: 'comercial' }),
        completo({
          nome: 'Tabela Raw X',
          nivel: 'bronze',
          debito: '',
          origem: '',
          fonte_sistema: '',
          associacoes: 'BANCO sql LEGADO (on-premise)',
        }),
      ),
      NIVEIS,
    )
    expect(warnings).toEqual([])
    expect(graph.links.filter((l) => l.source === 'niv-bronze-tabela-raw-x')).toEqual([
      { source: 'niv-bronze-tabela-raw-x', target: 'sys-banco-sql-legado-on-premise', label: 'vem de' },
    ])
  })

  it('associação entre níveis custom (Ouro vem de Prata vem de Bronze)', () => {
    const { graph, warnings } = buildGraph(
      csv(
        completo({ nome: 'Raw', nivel: 'bronze', debito: '', origem: '', fonte_sistema: '' }),
        completo({ nome: 'Curada', nivel: 'prata', debito: '', origem: '', fonte_sistema: '', associacoes: 'Raw' }),
        completo({ nome: 'Consumo', nivel: 'ouro', debito: '', origem: '', fonte_sistema: '', associacoes: 'Curada' }),
      ),
      NIVEIS,
    )
    expect(warnings).toEqual([])
    expect(graph.links).toEqual([
      { source: 'niv-ouro-consumo', target: 'niv-prata-curada', label: 'vem de' },
      { source: 'niv-prata-curada', target: 'niv-bronze-raw', label: 'vem de' },
    ])
  })

  it('nível custom é nível de DADO: a linha carrega domínio, débito, status e rota', () => {
    const { graph, warnings } = buildGraph(
      csv(
        completo({
          nome: 'GDAD',
          nivel: 'ouro',
          dominio: 'Resultado',
          origem: 'resultado gerencial',
          fonte_sistema: 'Databricks (dado curado)',
          debito: 'nao',
          status: 'producao',
          descricao: 'resultado realizado',
        }),
      ),
      NIVEIS,
    )
    expect(warnings).toEqual([])
    expect(graph.nodes.find((n) => n.id === 'niv-ouro-gdad')).toMatchObject({
      tipo: 'nivel-custom',
      nivelCustom: 'ouro',
      dominio: 'Resultado',
      debito: 'nao',
      status: 'producao',
      sistema: 'Databricks (dado curado)',
      origem: 'resultado gerencial',
      // sem owner nem centro de custo: gap de governança, como num produto
      incompleto: true,
    })
    // e a rota vira as mesmas arestas de um produto
    expect(graph.links).toEqual([
      { source: 'niv-ouro-gdad', target: 'sys-databricks-dado-curado', label: 'vem de' },
      { source: 'sys-databricks-dado-curado', target: 'org-resultado-gerencial', label: 'origina de' },
    ])
  })

  it('transferir um produto para um nível custom preserva as arestas de quem o consome', () => {
    const consumidores = [
      completo({ nome: 'RAR 12M', nivel: 'final', origem: '', fonte_sistema: '', consome: 'GDAD' }),
      completo({
        nome: 'Evolução do Resultado',
        nivel: 'final',
        origem: '',
        fonte_sistema: '',
        consome: 'GDAD',
      }),
    ]
    const comoProduto = buildGraph(csv(...consumidores, completo({ nome: 'GDAD' })), NIVEIS)
    const comoOuro = buildGraph(
      csv(...consumidores, completo({ nome: 'GDAD', nivel: 'ouro' })),
      NIVEIS,
    )
    expect(comoProduto.warnings).toEqual([])
    expect(comoOuro.warnings).toEqual([])
    // Nenhum fantasma dos dois lados: muda só o id (a coluna), não a aresta.
    expect(comoOuro.graph.nodes.filter((n) => n.fantasma === true)).toEqual([])
    const alvos = (b: typeof comoOuro) =>
      b.graph.links.filter((l) => l.label === 'consome').map((l) => `${l.source} → ${l.target}`)
    expect(alvos(comoProduto)).toEqual(['evolucao-do-resultado → gdad', 'rar-12m → gdad'])
    expect(alvos(comoOuro)).toEqual([
      'evolucao-do-resultado → niv-ouro-gdad',
      'rar-12m → niv-ouro-gdad',
    ])
  })

  it('consome resolve componente built-in e linha de nível custom, sem fantasma', () => {
    const { graph, warnings } = buildGraph(
      csv(
        completo({ nome: 'Curada', nivel: 'prata', origem: '', fonte_sistema: '' }),
        completo({ nome: 'Databricks', nivel: 'fonte', debito: '', origem: '', fonte_sistema: '' }),
        completo({
          nome: 'Alfa',
          origem: '',
          fonte_sistema: '',
          // a linha custom pelo id; o componente pelo nome, em outra caixa
          consome: 'niv-prata-curada | DATABRICKS',
        }),
      ),
      NIVEIS,
    )
    expect(warnings).toEqual([])
    expect(graph.nodes.filter((n) => n.fantasma === true)).toEqual([])
    expect(graph.links.filter((l) => l.label === 'consome')).toEqual([
      { source: 'alfa', target: 'niv-prata-curada', label: 'consome' },
      { source: 'alfa', target: 'sys-databricks', label: 'consome' },
    ])
  })

  it('linha de nível custom também consome, e nome inexistente segue virando fantasma', () => {
    const { graph, warnings } = buildGraph(
      csv(
        completo({ nome: 'Alfa', origem: '', fonte_sistema: '' }),
        completo({
          nome: 'Curada',
          nivel: 'prata',
          origem: '',
          fonte_sistema: '',
          consome: 'Alfa | Sumida',
        }),
      ),
      NIVEIS,
    )
    expect(warnings).toEqual([
      'consome quebrado: "Sumida" em "Curada" não corresponde a nenhuma linha do catálogo' +
        ' — criado nó fantasma "sumida"',
    ])
    expect(graph.links.filter((l) => l.source === 'niv-prata-curada')).toEqual([
      { source: 'niv-prata-curada', target: 'alfa', label: 'consome' },
      { source: 'niv-prata-curada', target: 'sumida', label: 'consome' },
    ])
  })

  it('fonte secundária que virou linha de nível custom não duplica em fsec-*', () => {
    const { graph, warnings } = buildGraph(
      csv(
        completo({ nome: 'Tabela UCS', nivel: 'prata', origem: '', fonte_sistema: '' }),
        completo({
          nome: 'Mercado Alvo',
          fonte_sistema: 'banco SQL legado (on-premise)',
          origem: 'base comercial legada',
          fontes_secundarias: 'Tabela UCS',
        }),
      ),
      NIVEIS,
    )
    expect(warnings).toEqual([])
    expect(graph.nodes.filter((n) => n.tipo === 'fonte-secundaria')).toEqual([])
    expect(graph.links.filter((l) => l.label === 'vem de')).toEqual([
      { source: 'mercado-alvo', target: 'niv-prata-tabela-ucs', label: 'vem de' },
      { source: 'niv-prata-tabela-ucs', target: 'sys-banco-sql-legado-on-premise', label: 'vem de' },
    ])
  })

  it('associação ambígua gera warning e vence o componente do nível de menor ordem', () => {
    const { graph, warnings } = buildGraph(
      csv(
        completo({ nome: 'Databricks', nivel: 'fonte', debito: '', origem: '', fonte_sistema: '' }),
        completo({ nome: 'Databricks', nivel: 'fonte-secundaria', debito: '', origem: '', fonte_sistema: '' }),
        completo({ nome: 'Raw', nivel: 'bronze', debito: '', origem: '', fonte_sistema: '', associacoes: 'Databricks' }),
      ),
      NIVEIS,
    )
    expect(warnings).toEqual([
      '"Raw": associação "Databricks" é ambígua (2 componentes) — usando "Databricks" (fonte-secundaria)',
    ])
    expect(graph.links).toEqual([
      { source: 'niv-bronze-raw', target: 'fsec-databricks', label: 'vem de' },
    ])
  })

  it('associação inexistente gera warning SEM criar nó nem aresta', () => {
    const { graph, warnings } = buildGraph(
      csv(completo({ nome: 'Raw', nivel: 'bronze', debito: '', origem: '', fonte_sistema: '', associacoes: 'Não Existe' })),
      NIVEIS,
    )
    expect(warnings).toEqual([
      '"Raw": associação "Não Existe" não corresponde a nenhum componente do mapa — ignorada (nenhum nó criado)',
    ])
    expect(graph.nodes.filter((n) => n.derivado === true)).toHaveLength(1)
    expect(graph.links).toEqual([])
  })

  it('produto com associacoes ganha aresta "vem de" para o alvo resolvido', () => {
    const { graph, warnings } = buildGraph(
      csv(
        completo({ nome: 'Alfa' }),
        completo({ nome: 'Beta', associacoes: 'Alfa' }),
      ),
      NIVEIS,
    )
    expect(warnings).toEqual([])
    expect(graph.links).toContainEqual({ source: 'beta', target: 'alfa', label: 'vem de' })
  })

  it('componente custom duplicado (mesmo slug no mesmo nível) gera warning e é ignorado', () => {
    const { graph, warnings } = buildGraph(
      csv(
        completo({ nome: 'Tabela Raw', nivel: 'bronze', debito: '', origem: '', fonte_sistema: '', descricao: 'primeira' }),
        completo({ nome: 'tabela raw', nivel: 'bronze', debito: '', origem: '', fonte_sistema: '', descricao: 'repetida' }),
      ),
      NIVEIS,
    )
    expect(warnings).toEqual([
      'componente duplicado "tabela raw" (id "niv-bronze-tabela-raw") — a linha repetida foi ignorada',
    ])
    expect(graph.nodes.find((n) => n.id === 'niv-bronze-tabela-raw')).toMatchObject({ descricao: 'primeira' })
  })

  it('mesmo nome convive em níveis custom diferentes (namespace por nível)', () => {
    const { graph, warnings } = buildGraph(
      csv(
        completo({ nome: 'Clientes', nivel: 'bronze', debito: '', origem: '', fonte_sistema: '' }),
        completo({ nome: 'Clientes', nivel: 'prata', debito: '', origem: '', fonte_sistema: '' }),
      ),
      NIVEIS,
    )
    expect(warnings).toEqual([])
    expect(graph.nodes.filter((n) => n.derivado === true).map((n) => n.id)).toEqual([
      'niv-bronze-clientes',
      'niv-prata-clientes',
    ])
  })

  it('determinismo: mesma saída independentemente da ordem das linhas', () => {
    const a = completo({ nome: 'Raw', nivel: 'bronze', debito: '', origem: '', fonte_sistema: '' })
    const b = completo({ nome: 'Curada', nivel: 'prata', debito: '', origem: '', fonte_sistema: '', associacoes: 'Raw' })
    const c = completo({ nome: 'Alfa', fonte_sistema: 'SF', origem: 'RM' })
    expect(buildGraph(csv(c, b, a), NIVEIS).graph).toEqual(buildGraph(csv(a, b, c), NIVEIS).graph)
  })

  it('sem o nível cadastrado, a linha custom cai no aviso de nivel inválido', () => {
    const { warnings } = buildGraph(csv(completo({ nome: 'Raw', nivel: 'bronze', debito: 'nao' })))
    expect(warnings).toEqual([
      'catalogo.csv linha 2 ("Raw"): nivel "bronze" inválido' +
        ' (use dominio, origem, fonte, fonte-secundaria, primario, final ou ambos) — assumindo "primario"',
    ])
  })
})

describe('validarCatalogo com níveis custom', () => {
  const NIVEIS = defsDeNiveis(MEDALHAO)

  it('linha de nível custom vale como componente: sem debito, namespace por nível', () => {
    const { errors, warnings } = validarCatalogo(
      [
        catalogoRow({ nome: 'Raw', nivel: 'bronze', debito: '' }),
        catalogoRow({ nome: 'Raw', nivel: 'prata', debito: '' }),
        catalogoRow({ nome: 'Raw' }),
      ],
      NIVEIS,
    )
    expect(errors).toEqual([])
    expect(warnings).toEqual([])
  })

  it('sem o nível cadastrado, nivel custom é erro e a mensagem cita os válidos', () => {
    // linha de nivel desconhecido é tratada como produto: o debito "" também acusa
    const { errors } = validarCatalogo([catalogoRow({ nome: 'Raw', nivel: 'cobre', debito: '' })], NIVEIS)
    expect(errors).toEqual([
      'linha 2 ("Raw"): nivel "cobre" inválido (use dominio, origem, fonte, fonte-secundaria,' +
        ' primario, final ou ambos — ou um nível customizado: bronze, prata, ouro)',
      'linha 2 ("Raw"): debito "" inválido (use sim, nao ou avaliar)',
    ])
  })

  it('componente custom duplicado no mesmo nível é erro', () => {
    const { errors } = validarCatalogo(
      [
        catalogoRow({ nome: 'Tabela Raw', nivel: 'bronze', debito: '' }),
        catalogoRow({ nome: 'tabela raw', nivel: 'bronze', debito: '' }),
      ],
      NIVEIS,
    )
    expect(errors).toEqual([
      'linha 3 ("tabela raw"): nome duplicado — colide com "Tabela Raw" (linha 2)',
    ])
  })
})

describe('niveisDoBody (forma do body do POST /api/niveis)', () => {
  it('aceita {"rows": [{titulo, ordem}]}, com ordem number ou string numérica', () => {
    const { rows, errors } = niveisDoBody({ rows: [{ titulo: 'Bronze', ordem: 46 }, { titulo: ' Prata ', ordem: '44.5' }] })
    expect(errors).toEqual([])
    expect(rows).toEqual([nivelRow('Bronze', 46), nivelRow('Prata', 44.5)])
  })

  it('ordem ausente ou string vazia vira NaN (erro só em validarNiveis)', () => {
    const { rows, errors } = niveisDoBody({ rows: [{ titulo: 'Bronze' }] })
    expect(errors).toEqual([])
    expect(Number.isNaN(rows[0].ordem)).toBe(true)
  })

  it('body sem "rows" ou com campo de tipo errado é rejeitado', () => {
    expect(niveisDoBody({}).errors).toEqual(['body deve ser um objeto {"rows": [{titulo, ordem}]}'])
    const { rows, errors } = niveisDoBody({ rows: [{ titulo: 42, ordem: 1 }, { titulo: 'Ok', ordem: true }] })
    expect(errors).toEqual(['rows[0].titulo: deve ser string', 'rows[1].ordem: deve ser number (ou string numérica)'])
    expect(rows).toEqual([])
  })
})

describe('catálogo e niveis.csv reais', () => {
  const raiz = resolve(import.meta.dirname, '..')
  const catalogoReal = readFileSync(resolve(raiz, 'catalogo.csv'), 'utf8')
  const niveisReal = readFileSync(resolve(raiz, 'niveis.csv'), 'utf8')

  it('niveis.csv real: os três níveis medalhão, sem warnings', () => {
    expect(carregarNiveis(niveisReal)).toEqual({
      niveis: [
        { slug: 'broze', titulo: 'Broze', ordem: 45 },
        { slug: 'silver', titulo: 'Silver', ordem: 44 },
        { slug: 'gold', titulo: 'Gold', ordem: 43 },
      ],
      warnings: [],
    })
  })

  it('o grafo real builda limpo, com as colunas medalhão entre fonte-secundaria e fonte', () => {
    const { graph, warnings } = buildGraph(catalogoReal, carregarNiveis(niveisReal).niveis)
    expect(warnings).toEqual([])
    expect(graph.nodes.filter((n) => n.fantasma === true)).toEqual([])
    expect(graph.niveis.map((n) => n.slug)).toEqual([
      ...NIVEIS_BUILTIN.map((n) => n.slug).slice(0, 5),
      'gold',
      'silver',
      'broze',
      'fonte',
      'origem',
    ])
    // Quantos componentes cada nível tem depende do que o usuário cadastrou:
    // o invariante é que todo nó custom pertence a um nível declarado.
    const slugs = new Set(graph.niveis.map((n) => n.slug))
    const custom = graph.nodes.filter((n) => n.derivado === true && n.tipo === 'nivel-custom')
    expect(custom.length).toBeGreaterThan(0)
    for (const n of custom) {
      expect(slugs.has(String((n as { nivelCustom?: string }).nivelCustom))).toBe(true)
    }
  })

  it('sem o niveis.csv, as linhas medalhão caem em "nivel inválido" (e nada some)', () => {
    const { graph, warnings } = buildGraph(catalogoReal)
    const custom = buildGraph(catalogoReal, carregarNiveis(niveisReal).niveis).graph.nodes
      .filter((n) => n.derivado === true && n.tipo === 'nivel-custom').length
    expect(warnings.filter((w) => w.includes('nivel')).length).toBe(custom)
    expect(graph.niveis).toEqual(NIVEIS_BUILTIN.map((n) => ({ ...n, builtin: true })))
  })
})
