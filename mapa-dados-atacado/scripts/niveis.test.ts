// Testes dos níveis dinâmicos: niveis.csv (parse/serialize/validação, modo
// legado x explícito), edição e remoção de QUALQUER nível (built-in incluso),
// colunas opcionais do catalogo.csv (tipo_componente e associacoes), linhas de
// nível cadastrado no build e bloco `niveis` do graph.json.
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
  normalizarCor,
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

// As colunas legadas (origem/fonte_sistema) vêm preenchidas de propósito: o
// build tem de ignorá-las em todos os casos abaixo.
const completo = (extra: Partial<Record<(typeof COLUNAS)[number], string>>): string =>
  linha({
    nome: 'X',
    nivel: 'primario',
    dominio: 'Risco',
    descricao: 'd',
    debito: 'nao',
    status: 'producao',
    ...extra,
  })

const nivelRow = (titulo: string, ordem: number): NivelRow => ({ titulo, ordem })

/** Lista completa de níveis com os built-ins indicados REMOVIDOS, passando
 *  pelo niveis.csv (é o caminho real: arquivo em modo explícito). */
const semNiveis = (...removidos: string[]) =>
  carregarNiveis(
    serializarNiveis(
      NIVEIS_BUILTIN.filter((n) => !removidos.includes(n.slug)).map((n) => ({ ...n })),
    ),
  ).niveis

const MEDALHAO = [nivelRow('Bronze', 46), nivelRow('Prata', 44), nivelRow('Ouro', 42)]

const catalogoRow = (extra: Partial<CatalogoRow>): CatalogoRow => ({
  nome: 'X',
  nivel: 'primario',
  tipo_componente: '',
  dominio: 'Risco',
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
  it('formato canônico: BOM, cabeçalho de 5 colunas, ";", CRLF e aspas mínimas', () => {
    const texto = serializarNiveis([nivelRow('Bronze', 46), nivelRow('Prata; fina', 44.5)])
    expect(texto).toBe(
      '﻿titulo;ordem;slug;cor_fundo;cor_borda\r\nBronze;46;;;\r\n"Prata; fina";44.5;;;\r\n',
    )
  })

  it('slug preenchido é gravado na 3ª coluna e volta no parse', () => {
    const rows = [{ titulo: 'Produto de dados', ordem: 20, slug: 'final' }]
    const texto = serializarNiveis(rows)
    expect(texto).toBe('﻿titulo;ordem;slug;cor_fundo;cor_borda\r\nProduto de dados;20;final;;\r\n')
    expect(parseNiveisRows(texto)).toEqual(rows)
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

  it('arquivo legado de 2 colunas parseia sem warning (slug ausente = derivar)', () => {
    const legado = '﻿titulo;ordem\r\nBronze;46\r\n'
    expect(parseNiveisRows(legado)).toEqual([nivelRow('Bronze', 46)])
    const { niveis, warnings } = carregarNiveis(legado)
    expect(warnings).toEqual([])
    expect(niveis.map((n) => n.slug)).toEqual([
      ...NIVEIS_BUILTIN.map((n) => n.slug).slice(0, 5),
      'bronze',
      'fonte',
      'origem',
    ])
  })

  it('arquivo só com cabeçalho = os sete built-in, sem warnings', () => {
    const texto = serializarNiveis([])
    expect(parseNiveisRows(texto)).toEqual([])
    expect(carregarNiveis(texto)).toEqual({
      niveis: NIVEIS_BUILTIN.map((n) => ({ ...n, builtin: true })),
      warnings: [],
    })
  })
})

// As cores são atributo LIVRE do nível — nenhum teste aqui espera que um nome
// ("Prata") produza cor nenhuma: quem escolhe é sempre o arquivo.
describe('niveis.csv — cores da faixa (cor_fundo e cor_borda)', () => {
  const prata: NivelRow = { titulo: 'Prata', ordem: 44, corFundo: '#c0c0c0', corBorda: '#8fa3b8' }

  it('as duas cores vão para as colunas 4 e 5 e voltam no round-trip', () => {
    const texto = serializarNiveis([prata])
    expect(texto).toBe('﻿titulo;ordem;slug;cor_fundo;cor_borda\r\nPrata;44;;#c0c0c0;#8fa3b8\r\n')
    expect(parseNiveisRows(texto)).toEqual([prata])
    expect(serializarNiveis(parseNiveisRows(texto))).toBe(texto)
  })

  it('só uma das duas também vale — a outra fica no padrão', () => {
    const rows: NivelRow[] = [{ titulo: 'Prata', ordem: 44, corBorda: '#8fa3b8' }]
    expect(parseNiveisRows(serializarNiveis(rows))).toEqual(rows)
    const { niveis, warnings } = carregarNiveis(serializarNiveis(rows))
    expect(warnings).toEqual([])
    const nivel = niveis.find((n) => n.slug === 'prata')
    expect(nivel?.corBorda).toBe('#8fa3b8')
    expect(nivel?.corFundo).toBeUndefined()
  })

  it('arquivo de 3 colunas (o formato anterior) parseia e carrega sem warning', () => {
    const antigo = '﻿titulo;ordem;slug\r\nPrata;44;\r\n'
    expect(parseNiveisRows(antigo)).toEqual([nivelRow('Prata', 44)])
    const { niveis, warnings } = carregarNiveis(antigo)
    expect(warnings).toEqual([])
    expect(niveis.find((n) => n.slug === 'prata')).toEqual({
      slug: 'prata',
      titulo: 'Prata',
      ordem: 44,
      builtin: false,
    })
  })

  it('"#RGB" e maiúsculas são normalizados para "#rrggbb" minúsculo', () => {
    expect(normalizarCor('#0AF')).toBe('#00aaff')
    expect(normalizarCor('  #C0C0C0  ')).toBe('#c0c0c0')
    expect(parseNiveisRows('﻿titulo;ordem;cor_fundo\r\nPrata;44;#0AF\r\n')).toEqual([
      { titulo: 'Prata', ordem: 44, corFundo: '#00aaff' },
    ])
    // e o que não é hex não vira cor
    expect(normalizarCor('prata')).toBeNull()
    expect(normalizarCor('#12345')).toBeNull()
    expect(normalizarCor('rgb(1,2,3)')).toBeNull()
    expect(normalizarCor('')).toBeNull()
  })

  it('cor inválida é ERRO no POST, citando coluna e valor', () => {
    const { errors } = validarNiveis([{ titulo: 'Prata', ordem: 44, corFundo: 'prateado' }])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('linha 2 ("Prata")')
    expect(errors[0]).toContain('cor_fundo "prateado"')
    expect(errors[0]).toContain('#RRGGBB')
  })

  it('cor inválida no arquivo é WARNING no build — e o nível sobrevive sem cor', () => {
    const { niveis, warnings } = carregarNiveis(
      '﻿titulo;ordem;cor_fundo;cor_borda\r\nPrata;44;prateado;#8fa3b8\r\n',
    )
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('cor ignorada')
    const nivel = niveis.find((n) => n.slug === 'prata')
    // O nível carrega as linhas do catálogo: cor ruim não pode derrubá-lo.
    expect(nivel).toBeDefined()
    expect(nivel?.corFundo).toBeUndefined()
    expect(nivel?.corBorda).toBe('#8fa3b8')
  })

  it('nível built-in aceita cor como qualquer outro (modo explícito)', () => {
    const { niveis, warnings } = carregarNiveis(
      serializarNiveis(
        NIVEIS_BUILTIN.map((n) =>
          n.slug === 'origem' ? { ...n, corFundo: '#3d2b1f' } : { ...n },
        ),
      ),
    )
    expect(warnings).toEqual([])
    expect(niveis.find((n) => n.slug === 'origem')).toEqual({
      slug: 'origem',
      titulo: 'Origem',
      ordem: 60,
      builtin: true,
      corFundo: '#3d2b1f',
    })
  })

  it('limpar a cor = gravar a coluna vazia; o nível volta ao padrão', () => {
    const comCor = serializarNiveis([prata])
    expect(carregarNiveis(comCor).niveis.find((n) => n.slug === 'prata')?.corFundo).toBe('#c0c0c0')
    const semCor = serializarNiveis([nivelRow('Prata', 44)])
    expect(carregarNiveis(semCor).niveis.find((n) => n.slug === 'prata')?.corFundo).toBeUndefined()
  })

  it('defsDeNiveis leva as cores canônicas junto com o slug', () => {
    expect(defsDeNiveis([{ titulo: 'Prata', ordem: 44, corFundo: '#0AF', corBorda: 'nada' }])).toEqual([
      { slug: 'prata', titulo: 'Prata', ordem: 44, corFundo: '#00aaff' },
    ])
  })
})

describe('bloco `niveis` do graph.json com cores', () => {
  it('as cores do niveis.csv chegam ao graph.json emitido pelo build', () => {
    const { niveis } = carregarNiveis(
      serializarNiveis([
        { titulo: 'Prata', ordem: 44, corFundo: '#c0c0c0', corBorda: '#8fa3b8' },
        nivelRow('Bronze', 46),
      ]),
    )
    const { graph } = buildGraph(
      csv(completo({ nome: 'Tabela P', nivel: 'prata' })),
      niveis,
    )
    expect(graph.niveis.find((n) => n.slug === 'prata')).toEqual({
      slug: 'prata',
      titulo: 'Prata',
      ordem: 44,
      builtin: false,
      corFundo: '#c0c0c0',
      corBorda: '#8fa3b8',
    })
    // Nível sem cor não ganha campo nenhum: o JSON continua o de sempre.
    expect(graph.niveis.find((n) => n.slug === 'bronze')).toEqual({
      slug: 'bronze',
      titulo: 'Bronze',
      ordem: 46,
      builtin: false,
    })
    // E a cor é do NÍVEL, não do nó — nada foi acrescentado ao componente.
    expect(graph.nodes[0]).not.toHaveProperty('corFundo')
  })

  it('determinismo: a cor não muda o resto do grafo', () => {
    const catalogo = csv(completo({ nome: 'Tabela P', nivel: 'prata' }))
    const semCor = carregarNiveis(serializarNiveis([nivelRow('Prata', 44)])).niveis
    const comCor = carregarNiveis(
      serializarNiveis([{ titulo: 'Prata', ordem: 44, corFundo: '#c0c0c0' }]),
    ).niveis
    expect(buildGraph(catalogo, comCor).graph.nodes).toEqual(buildGraph(catalogo, semCor).graph.nodes)
    expect(buildGraph(catalogo, comCor).graph.links).toEqual(buildGraph(catalogo, semCor).graph.links)
  })
})

describe('niveis.csv — modo legado x modo explícito', () => {
  it('LEGADO: nenhuma linha traz slug de built-in → built-ins + customs', () => {
    const { niveis, warnings } = carregarNiveis(serializarNiveis(MEDALHAO))
    expect(warnings).toEqual([])
    expect(niveis.filter((n) => n.builtin).map((n) => n.slug)).toEqual(
      NIVEIS_BUILTIN.map((n) => n.slug),
    )
    expect(niveis.filter((n) => !n.builtin).map((n) => n.slug)).toEqual(['ouro', 'prata', 'bronze'])
  })

  it('EXPLÍCITO: com slug de built-in, o arquivo é a lista completa (o que falta foi removido)', () => {
    const { niveis, warnings } = carregarNiveis(
      serializarNiveis([
        { titulo: 'Produto final', ordem: 20, slug: 'final' },
        { titulo: 'Produto primário', ordem: 30, slug: 'primario' },
        nivelRow('Bronze', 46),
      ]),
    )
    expect(warnings).toEqual([])
    expect(niveis).toEqual([
      { slug: 'final', titulo: 'Produto final', ordem: 20, builtin: true },
      { slug: 'primario', titulo: 'Produto primário', ordem: 30, builtin: true },
      { slug: 'bronze', titulo: 'Bronze', ordem: 46, builtin: false },
    ])
  })

  it('renomear built-in mantém o slug; o título novo é só rótulo', () => {
    const { niveis } = carregarNiveis(
      serializarNiveis([
        ...NIVEIS_BUILTIN.map((n) =>
          n.slug === 'final' ? { titulo: 'Produto de dados', ordem: n.ordem, slug: n.slug } : { ...n },
        ),
      ]),
    )
    expect(niveis.find((n) => n.slug === 'final')).toEqual({
      slug: 'final',
      titulo: 'Produto de dados',
      ordem: 20,
      builtin: true,
    })
  })

  it('em modo explícito, built-in pode assumir qualquer ordem (inclusive a de outro)', () => {
    const { niveis, warnings } = carregarNiveis(
      serializarNiveis(
        NIVEIS_BUILTIN.map((n) => ({ titulo: n.titulo, ordem: n.slug === 'fonte' ? 15 : n.ordem, slug: n.slug })),
      ),
    )
    expect(warnings).toEqual([])
    expect(niveis.map((n) => n.slug)).toEqual([
      'raiz',
      'dominio',
      'fonte',
      'final',
      'primario',
      'fonte-secundaria',
      'origem',
    ])
  })

  it('nível removido e recriado com o mesmo slug volta a ser built-in', () => {
    const semFonte = NIVEIS_BUILTIN.filter((n) => n.slug !== 'fonte').map((n) => ({ ...n }))
    expect(carregarNiveis(serializarNiveis(semFonte)).niveis.map((n) => n.slug)).not.toContain('fonte')
    const devolta = carregarNiveis(
      serializarNiveis([...semFonte, { titulo: 'Sistema de origem', ordem: 50, slug: 'fonte' }]),
    ).niveis
    expect(devolta.find((n) => n.slug === 'fonte')).toEqual({
      slug: 'fonte',
      titulo: 'Sistema de origem',
      ordem: 50,
      builtin: true,
    })
  })

  it('linha inválida vira warning e é descartada, sem derrubar o resto', () => {
    const { niveis, warnings } = carregarNiveis(
      serializarNiveis([nivelRow('Bronze', 46), nivelRow('bronze', 48)]),
    )
    expect(warnings).toEqual([
      'niveis.csv linha 3 ("bronze"): título duplicado — colide com "Bronze" (linha 2) — nível ignorado',
    ])
    expect(niveis.filter((n) => !n.builtin).map((n) => n.slug)).toEqual(['bronze'])
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
      'nível "bronze" está em uso por 2 linha(s) do catálogo ("Tabela Raw X", "Tabela Raw Y")' +
        ' — mova essas linhas para outro nível antes de removê-lo',
    ])
  })

  it('mantendo o nível (ou sem uso), remoção passa limpa', () => {
    expect(validarNiveisContraCatalogo([nivelRow('Bronze', 46)], catalogo)).toEqual([])
    expect(validarNiveisContraCatalogo([], [catalogoRow({ nome: 'Só produto' })])).toEqual([])
  })

  it('remover BUILT-IN em uso é erro igual ao do custom', () => {
    const explicito = NIVEIS_BUILTIN.filter((n) => n.slug !== 'primario').map((n) => ({ ...n }))
    expect(validarNiveisContraCatalogo(explicito, [catalogoRow({ nome: 'Produto Z' })])).toEqual([
      'nível "primario" está em uso por 1 linha(s) do catálogo ("Produto Z")' +
        ' — mova essas linhas para outro nível antes de removê-lo',
    ])
  })

  it('remover built-in estrutural sem linhas próprias passa limpo', () => {
    const semRaizNemDominio = [
      ...NIVEIS_BUILTIN.filter((n) => n.slug !== 'raiz' && n.slug !== 'dominio').map((n) => ({ ...n })),
      nivelRow('Bronze', 46),
    ]
    expect(validarNiveisContraCatalogo(semRaizNemDominio, catalogo)).toEqual([])
  })

  it('renomear built-in (mesmo slug) não conta como remoção', () => {
    const renomeado = NIVEIS_BUILTIN.map((n) =>
      n.slug === 'final' ? { titulo: 'Produto de dados', ordem: n.ordem, slug: n.slug } : { ...n },
    )
    expect(
      validarNiveisContraCatalogo(renomeado, [catalogoRow({ nome: 'Z', nivel: 'final' })]),
    ).toEqual([])
  })

  it('a mensagem resume quando há muitas linhas no nível', () => {
    const seteProdutos = Array.from({ length: 7 }, (_, i) => catalogoRow({ nome: `P${i + 1}` }))
    const semPrimario = NIVEIS_BUILTIN.filter((n) => n.slug !== 'primario').map((n) => ({ ...n }))
    expect(validarNiveisContraCatalogo(semPrimario, seteProdutos)).toEqual([
      'nível "primario" está em uso por 7 linha(s) do catálogo' +
        ' ("P1", "P2", "P3", "P4", "P5" e mais 2) — mova essas linhas para outro nível antes de removê-lo',
    ])
  })
})

describe('catalogo.csv — colunas opcionais (tipo_componente e associacoes)', () => {
  it('arquivo legado sem as duas parseia sem warning; ambas saem vazias', () => {
    const legado = COLUNAS.filter((c) => c !== 'associacoes' && c !== 'tipo_componente')
    const texto = legado.join(';') + '\r\n' + 'Alfa;primario;Risco;o;s;;;d;nao;producao;;;\r\n'
    expect(parseCatalogo(texto).warnings).toEqual([])
    expect(parseCatalogoRows(texto)[0]).toMatchObject({ tipo_componente: '', associacoes: [] })
    expect(parseCatalogo(texto).rows[0].node.tipoComponente).toBe('Default')
  })

  it('round-trip: tipo_componente e associacoes "A | B" vão e voltam', () => {
    const row = catalogoRow({
      nome: 'Tabela Raw X',
      nivel: 'bronze',
      tipo_componente: 'Tabela Delta',
      debito: '',
      associacoes: ['banco SQL legado (on-premise)', 'ADAT'],
    })
    const texto = serializarCatalogo([row])
    expect(texto).toContain(';banco SQL legado (on-premise) | ADAT\r\n')
    expect(parseCatalogoRows(texto)[0]).toEqual(row)
  })

  it('as duas colunas valem em qualquer nível, sem canonização por nível', () => {
    const rows = ['primario', 'fonte', 'fonte-secundaria', 'raiz'].map((nivel) =>
      catalogoRow({ nome: `N-${nivel}`, nivel, debito: '', tipo_componente: 'Excel', associacoes: ['Alfa'] }),
    )
    expect(parseCatalogoRows(serializarCatalogo(rows))).toEqual(rows)
  })
})

describe('buildGraph com níveis cadastrados', () => {
  const NIVEIS = montarNiveis(defsDeNiveis(MEDALHAO))
  const arestas = (g: ReturnType<typeof buildGraph>['graph']) =>
    g.links.map((l) => `${l.source} -${l.label}-> ${l.target}`)

  it('linha de nível cadastrado vira nó pelo mesmo caminho dos built-in', () => {
    const { graph, warnings } = buildGraph(
      csv(
        completo({ nome: 'Tabela Raw X', nivel: 'bronze', debito: '', descricao: 'raw' }),
        completo({ nome: 'Produto', nivel: 'final' }),
      ),
      NIVEIS,
    )
    expect(warnings).toEqual([])
    expect(graph.nodes.map((n) => n.id)).toEqual(['bronze-tabela-raw-x', 'final-produto'])
    // Mesmo schema, mesmos campos: nível cadastrado não é uma classe à parte.
    expect(Object.keys(graph.nodes[0]).sort()).toEqual(Object.keys(graph.nodes[1]).sort())
    expect(graph.nodes[0]).toMatchObject({ nivel: 'bronze', descricao: 'raw', tipoComponente: 'Default' })
  })

  it('associação resolve por nome (case/acento-insensitive) e gera aresta "vem de"', () => {
    const { graph, warnings } = buildGraph(
      csv(
        completo({ nome: 'Tabela Raw X', nivel: 'bronze', debito: '', associacoes: 'ADAT' }),
        completo({ nome: 'Adát', nivel: 'prata', debito: '' }),
      ),
      NIVEIS,
    )
    expect(warnings).toEqual([])
    expect(arestas(graph)).toEqual(['bronze-tabela-raw-x -vem de-> prata-adat'])
  })

  it('associação entre níveis cadastrados (Ouro vem de Prata vem de Bronze)', () => {
    const { graph, warnings } = buildGraph(
      csv(
        completo({ nome: 'O', nivel: 'ouro', debito: '', associacoes: 'P' }),
        completo({ nome: 'P', nivel: 'prata', debito: '', associacoes: 'B' }),
        completo({ nome: 'B', nivel: 'bronze', debito: '' }),
      ),
      NIVEIS,
    )
    expect(warnings).toEqual([])
    expect(arestas(graph)).toEqual(['ouro-o -vem de-> prata-p', 'prata-p -vem de-> bronze-b'])
  })

  it('consome cruza níveis cadastrados e built-in livremente, nos dois sentidos', () => {
    const { graph, warnings } = buildGraph(
      csv(
        completo({ nome: 'Final F', nivel: 'final', consome: 'Prata P' }),
        completo({ nome: 'Prata P', nivel: 'prata', debito: '', consome: 'Origem O' }),
        completo({ nome: 'Origem O', nivel: 'origem', debito: '', consome: 'Final F' }),
      ),
      NIVEIS,
    )
    expect(warnings).toEqual([])
    expect(arestas(graph)).toEqual([
      'final-final-f -consome-> prata-prata-p',
      'origem-origem-o -consome-> final-final-f',
      'prata-prata-p -consome-> origem-origem-o',
    ])
  })

  it('mudar um componente de nível preserva as arestas de quem o cita pelo nome', () => {
    const consumidor = completo({ nome: 'Alfa', nivel: 'final', consome: 'Mercado Alvo - UCS' })
    const comoPrata = buildGraph(
      csv(consumidor, completo({ nome: 'Mercado Alvo - UCS', nivel: 'prata', debito: '' })),
      NIVEIS,
    )
    const comoBronze = buildGraph(
      csv(consumidor, completo({ nome: 'Mercado Alvo - UCS', nivel: 'bronze', debito: '' })),
      NIVEIS,
    )
    expect(comoPrata.warnings).toEqual([])
    expect(comoBronze.warnings).toEqual([])
    // Só o id do alvo (e a coluna dele) muda; a ligação continua de pé.
    expect(arestas(comoPrata.graph)).toEqual(['final-alfa -consome-> prata-mercado-alvo-ucs'])
    expect(arestas(comoBronze.graph)).toEqual(['final-alfa -consome-> bronze-mercado-alvo-ucs'])
  })

  it('nome duplicado DENTRO do nível cadastrado gera warning e a repetida é ignorada', () => {
    const { graph, warnings } = buildGraph(
      csv(
        completo({ nome: 'Tabela Raw', nivel: 'bronze', debito: '', descricao: 'primeira' }),
        completo({ nome: 'tabela raw', nivel: 'bronze', debito: '', descricao: 'segunda' }),
      ),
      NIVEIS,
    )
    expect(graph.nodes).toHaveLength(1)
    expect(graph.nodes[0].descricao).toBe('primeira')
    expect(warnings).toEqual([
      'nome duplicado "tabela raw" no nível "bronze" (id "bronze-tabela-raw") — a linha repetida foi ignorada',
    ])
  })

  it('o mesmo nome convive em níveis diferentes (o id é que os separa)', () => {
    const { graph, warnings } = buildGraph(
      csv(
        completo({ nome: 'Resultado', nivel: 'bronze', debito: '' }),
        completo({ nome: 'Resultado', nivel: 'prata', debito: '' }),
        completo({ nome: 'Resultado', nivel: 'final' }),
      ),
      NIVEIS,
    )
    expect(warnings).toEqual([])
    expect(graph.nodes.map((n) => n.id)).toEqual(['bronze-resultado', 'final-resultado', 'prata-resultado'])
  })

  it('determinismo: mesma saída independentemente da ordem das linhas', () => {
    const a = completo({ nome: 'O', nivel: 'ouro', debito: '', associacoes: 'P', consome: 'Final F' })
    const b = completo({ nome: 'P', nivel: 'prata', debito: '' })
    const c = completo({ nome: 'Final F', nivel: 'final' })
    expect(buildGraph(csv(c, b, a), NIVEIS).graph).toEqual(buildGraph(csv(a, b, c), NIVEIS).graph)
  })
})

describe('buildGraph com built-in editado ou removido', () => {
  // Uma linha por nível da ponta à ponta da cadeia, ligadas por consome e
  // associacoes: é o que mostra que remover um nível só apaga as linhas DELE.
  const CATALOGO = csv(
    completo({ nome: 'Portfólio', nivel: 'raiz', debito: '', consome: 'Alfa' }),
    completo({ nome: 'Alfa', nivel: 'final', consome: 'Beta' }),
    completo({ nome: 'Beta', nivel: 'primario', associacoes: 'Risco' }),
    completo({ nome: 'Risco', nivel: 'dominio', debito: '' }),
  )
  const PADRAO = carregarNiveis('').niveis

  const ids = (g: ReturnType<typeof buildGraph>['graph']) => g.nodes.map((n) => n.id)
  const arestas = (g: ReturnType<typeof buildGraph>['graph']) =>
    g.links.map((l) => `${l.source} -${l.label}-> ${l.target}`)

  it('cadeia completa (referência dos casos abaixo)', () => {
    const { graph, warnings } = buildGraph(CATALOGO, PADRAO)
    expect(warnings).toEqual([])
    expect(ids(graph)).toEqual(['dominio-risco', 'final-alfa', 'primario-beta', 'raiz-portfolio'])
    expect(arestas(graph)).toEqual([
      'final-alfa -consome-> primario-beta',
      'primario-beta -vem de-> dominio-risco',
      'raiz-portfolio -consome-> final-alfa',
    ])
  })

  it('renomear "Produto final" mantém o slug, o catálogo e o grafo', () => {
    const renomeado = carregarNiveis(
      serializarNiveis(
        NIVEIS_BUILTIN.map((n) =>
          n.slug === 'final' ? { titulo: 'Produto de dados', ordem: n.ordem, slug: n.slug } : { ...n },
        ),
      ),
    ).niveis
    const antes = buildGraph(CATALOGO, PADRAO).graph
    const { graph, warnings } = buildGraph(CATALOGO, renomeado)
    expect(warnings).toEqual([])
    // Só o rótulo da faixa muda: nós e arestas são os mesmos, byte a byte.
    expect(graph.nodes).toEqual(antes.nodes)
    expect(graph.links).toEqual(antes.links)
    expect(graph.niveis.find((n) => n.slug === 'final')).toEqual({
      slug: 'final',
      titulo: 'Produto de dados',
      ordem: 20,
      builtin: true,
    })
  })

  it('remover um nível leva só as linhas DELE — e a raiz não é exceção', () => {
    const { graph, warnings } = buildGraph(CATALOGO, semNiveis('raiz'))
    expect(ids(graph)).toEqual(['dominio-risco', 'final-alfa', 'primario-beta'])
    expect(warnings).toEqual([
      'catalogo.csv linha 2 ("Portfólio"): nível "raiz" não existe na cadeia' +
        ' (use um destes: dominio, final, primario, fonte-secundaria, fonte, origem) — linha ignorada',
    ])
    // O resto da cadeia segue de pé, com as arestas que não passavam pela raiz.
    expect(arestas(graph)).toEqual([
      'final-alfa -consome-> primario-beta',
      'primario-beta -vem de-> dominio-risco',
    ])
  })

  it('remover `dominio` desfaz também a associação que apontava para lá', () => {
    const { graph, warnings } = buildGraph(CATALOGO, semNiveis('dominio'))
    expect(ids(graph)).not.toContain('dominio-risco')
    expect(arestas(graph)).toEqual([
      'final-alfa -consome-> primario-beta',
      'raiz-portfolio -consome-> final-alfa',
    ])
    expect(warnings).toHaveLength(2)
    expect(warnings[1]).toContain('associação "Risco" não corresponde a nenhum componente')
  })

  it('remover um nível vazio não mexe em nada', () => {
    const { graph, warnings } = buildGraph(CATALOGO, semNiveis('fonte', 'origem', 'fonte-secundaria'))
    expect(warnings).toEqual([])
    expect(graph.nodes).toEqual(buildGraph(CATALOGO, PADRAO).graph.nodes)
    expect(graph.links).toEqual(buildGraph(CATALOGO, PADRAO).graph.links)
  })

  it('determinismo: remover nível não depende da ordem das linhas', () => {
    const a = completo({ nome: 'Alfa', nivel: 'final', consome: 'Beta' })
    const b = completo({ nome: 'Beta', nivel: 'primario' })
    const niveis = semNiveis('dominio', 'fonte-secundaria')
    expect(buildGraph(csv(b, a), niveis).graph).toEqual(buildGraph(csv(a, b), niveis).graph)
  })
})

describe('validarCatalogo com níveis cadastrados', () => {
  const NIVEIS = montarNiveis(defsDeNiveis(MEDALHAO))

  it('linha de nível cadastrado vale como qualquer outra; namespace por nível', () => {
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

  it('nível não cadastrado é erro e a mensagem cita a cadeia inteira', () => {
    const { errors } = validarCatalogo([catalogoRow({ nome: 'Raw', nivel: 'cobre', debito: '' })], NIVEIS)
    expect(errors).toEqual([
      // os níveis saem na ordem das colunas (ordem asc), como no bloco `niveis`
      'linha 2 ("Raw"): nivel "cobre" inválido (use um destes: raiz, dominio, final,' +
        ' primario, fonte-secundaria, ouro, prata, bronze, fonte, origem)',
    ])
  })

  it('nome duplicado no mesmo nível cadastrado é erro', () => {
    const { errors } = validarCatalogo(
      [
        catalogoRow({ nome: 'Tabela Raw', nivel: 'bronze', debito: '' }),
        catalogoRow({ nome: 'tabela raw', nivel: 'bronze', debito: '' }),
      ],
      NIVEIS,
    )
    expect(errors).toEqual([
      'linha 3 ("tabela raw"): nome duplicado no nível "bronze" — colide com "Tabela Raw" (linha 2)',
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

  it('slug opcional: vazio não vira campo, preenchido é trimado', () => {
    const { rows, errors } = niveisDoBody({
      rows: [
        { titulo: 'Bronze', ordem: 46, slug: '' },
        { titulo: 'Produto de dados', ordem: 20, slug: ' final ' },
      ],
    })
    expect(errors).toEqual([])
    expect(rows).toEqual([nivelRow('Bronze', 46), { titulo: 'Produto de dados', ordem: 20, slug: 'final' }])
  })

  it('corFundo/corBorda: vazio não vira campo, hex entra canônico, cru segue para a validação', () => {
    expect(
      niveisDoBody({
        rows: [
          { titulo: 'Prata', ordem: 44, corFundo: ' #0AF ', corBorda: '' },
          { titulo: 'Ouro', ordem: 42, corFundo: 'dourado' },
          { titulo: 'Bronze', ordem: 46 },
        ],
      }),
    ).toEqual({
      rows: [
        { titulo: 'Prata', ordem: 44, corFundo: '#00aaff' },
        { titulo: 'Ouro', ordem: 42, corFundo: 'dourado' },
        { titulo: 'Bronze', ordem: 46 },
      ],
      errors: [],
    })
    // e o valor cru é o que validarNiveis recusa, citando-o
    expect(validarNiveis(niveisDoBody({ rows: [{ titulo: 'Ouro', ordem: 42, corFundo: 'dourado' }] }).rows).errors[0]).toContain(
      'cor_fundo "dourado"',
    )
  })

  it('cor de tipo errado é rejeitada na forma do body', () => {
    expect(niveisDoBody({ rows: [{ titulo: 'Prata', ordem: 44, corBorda: 123 }] })).toEqual({
      rows: [],
      errors: ['rows[0].corBorda: deve ser string'],
    })
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

  it('niveis.csv real carrega sem warnings, ordenado e sem slug repetido', () => {
    // O arquivo é editável pelo app (renomear, reordenar e remover qualquer
    // nível), então o teste checa a forma, não o conteúdo.
    const { niveis, warnings } = carregarNiveis(niveisReal)
    expect(warnings).toEqual([])
    expect(niveis.length).toBeGreaterThan(0)
    const ordens = niveis.map((n) => n.ordem)
    expect([...ordens].sort((a, b) => a - b)).toEqual(ordens)
    expect(new Set(niveis.map((n) => n.slug)).size).toBe(niveis.length)
    for (const n of niveis) expect(n.titulo.trim()).not.toBe('')
  })

  it('o grafo real builda limpo e todo nó pertence a um nível declarado', () => {
    const { graph, warnings } = buildGraph(catalogoReal, carregarNiveis(niveisReal).niveis)
    expect(warnings).toEqual([])
    expect(graph.nodes.filter((n) => n.fantasma === true)).toEqual([])
    // Os níveis do arquivo são editáveis pelo app: o invariante é a ordenação
    // crescente, os slugs únicos e o vínculo de todo nó com um nível existente.
    const ordens = graph.niveis.map((n) => n.ordem)
    expect([...ordens].sort((a, b) => a - b)).toEqual(ordens)
    expect(new Set(graph.niveis.map((n) => n.slug)).size).toBe(graph.niveis.length)
    const slugs = new Set(graph.niveis.map((n) => n.slug))
    expect(graph.nodes.length).toBeGreaterThan(0)
    for (const n of graph.nodes) expect(slugs.has(n.nivel)).toBe(true)
  })

  it('os níveis cadastrados carregam nós de verdade (o catálogo usa a cadeia inteira)', () => {
    const { niveis } = carregarNiveis(niveisReal)
    const { graph } = buildGraph(catalogoReal, niveis)
    // Quantos nós cada nível tem depende do que o usuário cadastrou; o
    // invariante é que os níveis NÃO built-in do arquivo estão em uso.
    const custom = graph.niveis.filter((n) => !n.builtin)
    expect(custom.length).toBeGreaterThan(0)
    const usados = new Set(graph.nodes.map((n) => n.nivel))
    for (const n of custom) expect(usados.has(n.slug)).toBe(true)
  })

  it('sem o niveis.csv, as linhas dos níveis cadastrados caem em "nível não existe"', () => {
    const { graph, warnings } = buildGraph(catalogoReal)
    expect(graph.niveis).toEqual(NIVEIS_BUILTIN.map((n) => ({ ...n, builtin: true })))
    // Uma linha por nó que vivia num nível cadastrado: some do mapa e avisa.
    const comNiveis = buildGraph(catalogoReal, carregarNiveis(niveisReal).niveis).graph
    const slugsBuiltin = new Set(NIVEIS_BUILTIN.map((n) => n.slug))
    const foraDoBuiltin = comNiveis.nodes.filter((n) => !slugsBuiltin.has(n.nivel)).length
    expect(foraDoBuiltin).toBeGreaterThan(0)
    expect(warnings.filter((w) => w.includes('não existe na cadeia'))).toHaveLength(foraDoBuiltin)
    expect(graph.nodes).toHaveLength(comNiveis.nodes.length - foraDoBuiltin)
  })
})
