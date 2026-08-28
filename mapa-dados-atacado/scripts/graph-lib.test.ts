// Testes do build do grafo no modelo "tudo é componente": todo nó vem de uma
// LINHA do catálogo, e o que separa um nó de outro é só o NÍVEL dele. Nada é
// derivado de campo, e nenhum nível tem tratamento especial — os testes abaixo
// existem em boa parte para garantir justamente isso.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  atribuirIds,
  buildGraph,
  canonizarCatalogo,
  carregarNiveis,
  COLUNAS,
  criarIndiceAlvos,
  montarNiveis,
  NIVEIS_PADRAO,
  parseCatalogo,
  parseCatalogoRows,
  parseCsv,
  serializarCatalogo,
  slugify,
  TIPOS_COMPONENTE,
  TIPO_COMPONENTE_DEFAULT,
  type GraphLink,
  type NivelInfo,
} from './graph-lib.ts'

// Helpers: montam um catalogo.csv sintético a partir de registros parciais.
const CABECALHO = COLUNAS.join(';')

const aspas = (v: string): string => (/[";\n\r]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v)

const linha = (campos: Partial<Record<(typeof COLUNAS)[number], string>>): string =>
  COLUNAS.map((c) => aspas(campos[c] ?? '')).join(';')

const csv = (...linhas: string[]): string => [CABECALHO, ...linhas].join('\r\n') + '\r\n'

const completo = (extra: Partial<Record<(typeof COLUNAS)[number], string>>): string =>
  linha({
    nome: 'X',
    nivel: 'primario',
    dominio: 'Risco',
    descricao: 'd',
    debito: 'nao',
    status: 'producao',
    owner: 'Fulano',
    centro_de_custo: 'CC-1',
    ...extra,
  })

/** Níveis medalhão entre os built-in, para os testes de nível cadastrado. */
const COM_MEDALHAO: NivelInfo[] = montarNiveis([
  { slug: 'gold', titulo: 'Gold', ordem: 43 },
  { slug: 'silver', titulo: 'Silver', ordem: 44 },
])

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

describe('slugify e atribuirIds', () => {
  it('slugify gera kebab-case sem acentos', () => {
    expect(slugify('Capital Regulatório')).toBe('capital-regulatorio')
    expect(slugify('Custo de Capital (KE)')).toBe('custo-de-capital-ke')
  })

  it('id vazio é gerado do nome, em kebab-case legível', () => {
    expect(atribuirIds([{ id: '', nome: 'RAR 12M' }, { id: '', nome: 'Atacado — Dados' }])).toEqual([
      'rar-12m',
      'atacado-dados',
    ])
  })

  it('colisão ganha sufixo numérico, e o id é único GLOBALMENTE (não por nível)', () => {
    expect(
      atribuirIds([
        { id: '', nome: 'Resultado' },
        { id: '', nome: 'RESULTADO' },
        { id: '', nome: 'Resultado' },
      ]),
    ).toEqual(['resultado', 'resultado-2', 'resultado-3'])
  })

  it('id declarado vale como está e é reservado ANTES de gerar qualquer outro', () => {
    // A linha nova não rouba o id da que já o declarou, venha ela antes ou
    // depois no arquivo: acrescentar uma linha no meio não renomeia ninguém.
    expect(
      atribuirIds([
        { id: '', nome: 'Beta' },
        { id: 'beta', nome: 'Outro nome qualquer' },
      ]),
    ).toEqual(['beta-2', 'beta'])
  })

  it('nome sem letras nem números ainda ganha id', () => {
    expect(atribuirIds([{ id: '', nome: '###' }, { id: '', nome: '???' }])).toEqual([
      'componente',
      'componente-2',
    ])
  })

  it('renomear e trocar de nível NÃO mexem no id — ele é da linha', () => {
    const antes = atribuirIds([{ id: 'gdad', nome: 'GDAD' }])
    const depois = atribuirIds([{ id: 'gdad', nome: 'GDAD (novo nome)' }])
    expect(depois).toEqual(antes)
  })
})

describe('parseCatalogo — uma linha, um nó, em qualquer nível', () => {
  it('linha completa vira nó sem warnings, com o schema do modelo', () => {
    const { rows, warnings } = parseCatalogo(csv(completo({ nome: 'RAR 12M', nivel: 'final' })))
    expect(warnings).toEqual([])
    expect(rows).toHaveLength(1)
    expect(rows[0].node).toEqual({
      id: 'rar-12m',
      nome: 'RAR 12M',
      nivel: 'final',
      tipoComponente: 'Default',
      dominio: 'Risco',
      debito: 'nao',
      status: 'producao',
      owner: 'Fulano',
      centroDeCusto: 'CC-1',
      descricao: 'd',
      incompleto: false,
      produtoDeDados: false,
    })
  })

  it('TODO nível vira nó pelo mesmo caminho — inclusive raiz, domínio e origem', () => {
    const niveis = COM_MEDALHAO
    const texto = csv(
      ...niveis.map((n) => completo({ nome: `Nó ${n.slug}`, nivel: n.slug, debito: '', status: '' })),
    )
    const { rows, warnings } = parseCatalogo(texto, niveis)
    expect(warnings).toEqual([])
    expect(rows.map((r) => r.node.id)).toEqual(niveis.map((n) => `no-${n.slug}`))
    // Nada distingue um nível do outro no nó além do próprio campo `nivel`.
    for (const r of rows) expect(Object.keys(r.node).sort()).toEqual(Object.keys(rows[0].node).sort())
  })

  it('o mesmo nome em níveis diferentes gera dois nós distintos', () => {
    const { rows } = parseCatalogo(
      csv(
        completo({ nome: 'Resultado', nivel: 'final' }),
        completo({ nome: 'Resultado', nivel: 'silver', debito: '' }),
      ),
      COM_MEDALHAO,
    )
    // Ids próprios, gerados na ordem do arquivo: o nome não faz mais parte da
    // chave, então o segundo "Resultado" ganha sufixo.
    expect(rows.map((r) => r.node.id)).toEqual(['resultado', 'resultado-2'])
    expect(rows.every((r) => r.node.nome === 'Resultado')).toBe(true)
  })

  it('incompleto = owner OU centro de custo vazio, sem exceção por nível', () => {
    const { rows } = parseCatalogo(
      csv(
        completo({ nome: 'Sem owner', nivel: 'raiz', owner: '', debito: '' }),
        completo({ nome: 'Sem CC', nivel: 'origem', centro_de_custo: '', debito: '' }),
        completo({ nome: 'Sem nada', nivel: 'dominio', owner: '', centro_de_custo: '', debito: '' }),
        completo({ nome: 'Completo', nivel: 'fonte', debito: '' }),
      ),
    )
    expect(rows.map((r) => [r.node.nome, r.node.incompleto])).toEqual([
      ['Sem owner', true],
      ['Sem CC', true],
      ['Sem nada', true],
      ['Completo', false],
    ])
  })

  it('observacoes vira `corpo` só quando preenchida', () => {
    const { rows } = parseCatalogo(
      csv(
        completo({ nome: 'Com corpo', observacoes: 'Texto **markdown**' }),
        completo({ nome: 'Sem corpo' }),
      ),
    )
    expect(rows[0].node.corpo).toBe('Texto **markdown**')
    expect(rows[1].node).not.toHaveProperty('corpo')
  })

  it('linha sem nome, sem nível ou de nível inexistente vira warning e é ignorada', () => {
    const { rows, warnings } = parseCatalogo(
      csv(
        completo({ nome: '' }),
        completo({ nome: 'Sem nível', nivel: '' }),
        completo({ nome: 'Nível fantasma', nivel: 'platinum' }),
        completo({ nome: 'Ok' }),
      ),
    )
    expect(rows.map((r) => r.node.nome)).toEqual(['Ok'])
    expect(warnings).toEqual([
      'catalogo.csv linha 2: célula "nome" vazia — linha ignorada',
      'catalogo.csv linha 3 ("Sem nível"): célula "nivel" vazia — linha ignorada',
      'catalogo.csv linha 4 ("Nível fantasma"): nível "platinum" não existe na cadeia' +
        ' (use um destes: raiz, dominio, final, primario, fonte-secundaria, fonte, origem) — linha ignorada',
    ])
  })

  it('nível REMOVIDO da cadeia leva junto as linhas dele — inclusive a raiz', () => {
    const semRaiz = NIVEIS_PADRAO.filter((n) => n.slug !== 'raiz')
    const texto = csv(completo({ nome: 'Atacado — Dados', nivel: 'raiz', debito: '' }), completo({ nome: 'Ok' }))
    const { rows, warnings } = parseCatalogo(texto, semRaiz)
    expect(rows.map((r) => r.node.nome)).toEqual(['Ok'])
    expect(warnings[0]).toContain('nível "raiz" não existe na cadeia')
  })

  it('coluna obrigatória ausente e coluna desconhecida viram warning', () => {
    const { warnings } = parseCatalogo('nome;nivel;inventada\r\nA;primario;x\r\n')
    expect(warnings).toContain('catalogo.csv: coluna obrigatória "dominio" ausente do cabeçalho')
    expect(warnings).toContain('catalogo.csv: coluna desconhecida "inventada" ignorada')
    // tipo_componente e associacoes são opcionais: CSV legado não reclama.
    expect(warnings.some((w) => w.includes('"tipo_componente" ausente'))).toBe(false)
    expect(warnings.some((w) => w.includes('"associacoes" ausente'))).toBe(false)
  })

  it('arquivo vazio vira warning e catálogo vazio', () => {
    const { rows, warnings } = parseCatalogo('')
    expect(rows).toEqual([])
    expect(warnings).toEqual(['catalogo.csv: arquivo vazio — nenhum componente no catálogo'])
  })
})

describe('tipo_componente', () => {
  it('célula vazia (ou coluna ausente, em CSV legado) assume "Default", sem warning', () => {
    const { rows, warnings } = parseCatalogo(csv(completo({ nome: 'A' })))
    expect(rows[0].node.tipoComponente).toBe(TIPO_COMPONENTE_DEFAULT)
    expect(warnings).toEqual([])

    const legado =
      'nome;nivel;dominio;origem;fonte_sistema;fontes_secundarias;consome;descricao;debito;status;owner;centro_de_custo;observacoes;associacoes\r\n' +
      'A;primario;Risco;;;;;d;nao;producao;;;;\r\n'
    const antigo = parseCatalogo(legado)
    expect(antigo.rows[0].node.tipoComponente).toBe('Default')
    expect(antigo.warnings).toEqual([])
  })

  it('todo valor aceito chega ao nó como está', () => {
    const { rows, warnings } = parseCatalogo(
      csv(...TIPOS_COMPONENTE.map((t) => completo({ nome: t, tipo_componente: t }))),
    )
    expect(warnings).toEqual([])
    expect(rows.map((r) => r.node.tipoComponente)).toEqual([...TIPOS_COMPONENTE])
  })

  it('valor fora da lista vira warning e assume Default', () => {
    const { rows, warnings } = parseCatalogo(csv(completo({ nome: 'A', tipo_componente: 'Parquet' })))
    expect(rows[0].node.tipoComponente).toBe('Default')
    // A lista de válidos vem do vocabulário, não copiada: ela cresce, e um
    // teste que a repete quebraria a cada tipo novo sem nada estar errado.
    const validos = TIPOS_COMPONENTE.map((t) => `"${t}"`).join(', ')
    expect(warnings).toEqual([
      `catalogo.csv linha 2 ("A"): tipo_componente "Parquet" desconhecido` +
        ` (use ${validos}) — assumindo "Default"`,
    ])
  })

  it('vale em qualquer nível: não é atributo de um nível privilegiado', () => {
    const { rows, warnings } = parseCatalogo(
      csv(
        completo({ nome: 'A', nivel: 'raiz', tipo_componente: 'Excel', debito: '' }),
        completo({ nome: 'B', nivel: 'origem', tipo_componente: 'Tabela Delta', debito: '' }),
        completo({ nome: 'C', nivel: 'silver', tipo_componente: 'Tabela SQL', debito: '' }),
      ),
      COM_MEDALHAO,
    )
    expect(warnings).toEqual([])
    expect(rows.map((r) => r.node.tipoComponente)).toEqual(['Excel', 'Tabela Delta', 'Tabela SQL'])
  })
})

describe('produto_de_dados', () => {
  it('célula vazia vale "nao", sem warning', () => {
    const { rows, warnings } = parseCatalogo(csv(completo({ nome: 'A' })))
    expect(rows[0].node.produtoDeDados).toBe(false)
    expect(warnings).toEqual([])
  })

  it('CSV legado (sem a coluna) parseia sem reclamar de coluna ausente', () => {
    const legado =
      'id;nome;nivel;tipo_componente;dominio;consome;descricao;debito;status;owner;centro_de_custo;observacoes;associacoes\r\n' +
      'a;A;primario;Default;Risco;;d;nao;producao;Fulano;CC-1;;\r\n'
    const { rows, warnings } = parseCatalogo(legado)
    expect(rows[0].node.produtoDeDados).toBe(false)
    expect(warnings).toEqual([])
  })

  it('"sim" liga a bandeira e "nao" a desliga', () => {
    const { rows, warnings } = parseCatalogo(
      csv(
        completo({ nome: 'Produto', produto_de_dados: 'sim' }),
        completo({ nome: 'Comum', produto_de_dados: 'nao' }),
      ),
    )
    expect(warnings).toEqual([])
    expect(rows.map((r) => r.node.produtoDeDados)).toEqual([true, false])
  })

  it('valor fora do vocabulário vira warning e assume "nao"', () => {
    const { rows, warnings } = parseCatalogo(csv(completo({ nome: 'A', produto_de_dados: 'talvez' })))
    expect(rows[0].node.produtoDeDados).toBe(false)
    expect(warnings).toEqual([
      'catalogo.csv linha 2 ("A"): produto_de_dados "talvez" desconhecido' +
        ' (use sim, nao ou deixe vazio) — assumindo "nao"',
    ])
  })

  it('a bandeira é ortogonal ao nível: vale igual em qualquer camada', () => {
    const niveis = COM_MEDALHAO
    const { rows, warnings } = parseCatalogo(
      csv(
        ...niveis.map((n) =>
          completo({ nome: `Nó ${n.slug}`, nivel: n.slug, debito: '', produto_de_dados: 'sim' }),
        ),
      ),
      niveis,
    )
    expect(warnings).toEqual([])
    expect(rows.every((r) => r.node.produtoDeDados)).toBe(true)
  })

  it('nó fantasma nunca é produto de dados — ele nem tem linha', () => {
    const { graph } = buildGraph(
      csv(completo({ nome: 'Consumidor', consome: 'Planilha X', produto_de_dados: 'sim' })),
    )
    const fantasma = graph.nodes.find((n) => n.fantasma === true)
    expect(fantasma?.produtoDeDados).toBe(false)
  })
})

describe('buildGraph — nós', () => {
  it('não sintetiza nada: sem linhas, sem nós (nem raiz, nem domínios)', () => {
    const { graph, warnings } = buildGraph(csv())
    expect(graph.nodes).toEqual([])
    expect(graph.links).toEqual([])
    expect(warnings).toEqual([])
  })

  it('o campo `dominio` NÃO cria nó: domínio só existe se tiver linha própria', () => {
    const semLinha = buildGraph(csv(completo({ nome: 'A', dominio: 'Risco' })))
    expect(semLinha.graph.nodes.map((n) => n.id)).toEqual(['a'])
    const comLinha = buildGraph(
      csv(completo({ nome: 'A', dominio: 'Risco' }), completo({ nome: 'Risco', nivel: 'dominio', debito: '' })),
    )
    expect(comLinha.graph.nodes.map((n) => n.id)).toEqual(['a', 'risco'])
    // ...e ter a linha não inventa aresta nenhuma: ligação é sempre declarada.
    expect(comLinha.graph.links).toEqual([])
  })

  it('as colunas legadas de rota não criam nó nem aresta', () => {
    const { graph, warnings } = buildGraph(
      csv(
        completo({
          nome: 'A',
          }),
      ),
    )
    expect(graph.nodes.map((n) => n.id)).toEqual(['a'])
    expect(graph.links).toEqual([])
    expect(warnings).toEqual([])
  })

  it('mesmo nome no mesmo nível: dois nós (ids próprios) e warning do rótulo repetido', () => {
    const { graph, warnings } = buildGraph(
      csv(completo({ nome: 'Alfa', descricao: 'primeira' }), completo({ nome: 'ALFA', descricao: 'segunda' })),
    )
    expect(graph.nodes.map((n) => [n.id, n.descricao])).toEqual([
      ['alfa', 'primeira'],
      ['alfa-2', 'segunda'],
    ])
    expect(warnings).toEqual([
      'nome duplicado "Alfa" no nível "primario" (ids "alfa", "alfa-2")' +
        ' — são componentes distintos, mas com o mesmo rótulo no mapa',
    ])
  })

  it('id repetido é o que derruba uma linha: duas linhas, um componente só', () => {
    const { graph, warnings } = buildGraph(
      csv(
        completo({ id: 'alfa', nome: 'Alfa', descricao: 'primeira' }),
        completo({ id: 'alfa', nome: 'Outra', descricao: 'segunda' }),
      ),
    )
    expect(graph.nodes.map((n) => n.id)).toEqual(['alfa'])
    expect(graph.nodes[0].descricao).toBe('primeira')
    expect(warnings).toEqual([
      'id duplicado "alfa": a linha "Outra" (nível "primario") foi ignorada' +
        ' — o id é a chave da linha e não pode se repetir',
    ])
  })

  it('mesmo nome em níveis diferentes convive sem warning', () => {
    const { graph, warnings } = buildGraph(
      csv(
        completo({ nome: 'Resultado', nivel: 'final' }),
        completo({ nome: 'Resultado', nivel: 'silver', debito: '' }),
        completo({ nome: 'Resultado', nivel: 'dominio', debito: '' }),
      ),
      COM_MEDALHAO,
    )
    expect(warnings).toEqual([])
    expect(graph.nodes.map((n) => [n.id, n.nivel])).toEqual([
      ['resultado', 'final'],
      ['resultado-2', 'silver'],
      ['resultado-3', 'dominio'],
    ])
  })
})

describe('buildGraph — arestas', () => {
  it('`consome` vira aresta "consome" e `associacoes` vira "vem de"', () => {
    const { graph, warnings } = buildGraph(
      csv(
        completo({ nome: 'Alfa', consome: 'beta', associacoes: 'gama' }),
        completo({ nome: 'Beta' }),
        completo({ nome: 'Gama', nivel: 'fonte', debito: '' }),
      ),
    )
    expect(warnings).toEqual([])
    expect(graph.links).toEqual([
      { source: 'alfa', target: 'beta', label: 'consome' },
      { source: 'alfa', target: 'gama', label: 'vem de' },
    ])
  })

  it('referências cruzam níveis livremente, nos dois sentidos da cadeia', () => {
    const { graph, warnings } = buildGraph(
      csv(
        completo({ nome: 'Origem A', nivel: 'origem', debito: '', consome: 'raiz-z' }),
        completo({ nome: 'Raiz Z', nivel: 'raiz', debito: '', consome: 'origem-a', associacoes: 'gold-g' }),
        completo({ nome: 'Gold G', nivel: 'gold', debito: '' }),
      ),
      COM_MEDALHAO,
    )
    expect(warnings).toEqual([])
    expect(graph.links).toEqual([
      { source: 'origem-a', target: 'raiz-z', label: 'consome' },
      { source: 'raiz-z', target: 'gold-g', label: 'vem de' },
      { source: 'raiz-z', target: 'origem-a', label: 'consome' },
    ])
  })

  it('resolve pelo ID, que é o formato canônico da célula', () => {
    const { graph, warnings } = buildGraph(
      csv(
        completo({ nome: 'Alfa', consome: 'capital-regulatorio | beta' }),
        completo({ nome: 'Capital Regulatório' }),
        completo({ nome: 'Beta', nivel: 'silver', debito: '' }),
      ),
      COM_MEDALHAO,
    )
    expect(warnings).toEqual([])
    expect(graph.links.map((l) => l.target)).toEqual(['beta', 'capital-regulatorio'])
  })

  it('resolve por NOME (caixa/acentos à parte) e avisa que a célula será normalizada', () => {
    const { graph, warnings } = buildGraph(
      csv(
        completo({ nome: 'Alfa', consome: 'capital regulatorio', associacoes: 'BETA' }),
        completo({ nome: 'Capital Regulatório' }),
        completo({ nome: 'Beta', nivel: 'silver', debito: '' }),
      ),
      COM_MEDALHAO,
    )
    expect(graph.links.map((l) => l.target)).toEqual(['beta', 'capital-regulatorio'])
    expect(warnings).toEqual([
      '"Alfa": consome "capital regulatorio" resolvido por NOME (id "capital-regulatorio") —' +
        ' a ligação por nome quebra ao renomear; a próxima gravação normaliza a célula para o id',
      '"Alfa": associação "BETA" resolvido por NOME (id "beta") —' +
        ' a ligação por nome quebra ao renomear; a próxima gravação normaliza a célula para o id',
    ])
  })

  it('gravar normaliza a referência por nome para id — e o build para de avisar', () => {
    const texto = csv(
      completo({ nome: 'Alfa', consome: 'capital regulatorio' }),
      completo({ nome: 'Capital Regulatório' }),
    )
    const normalizado = serializarCatalogo(canonizarCatalogo(parseCatalogoRows(texto)))
    expect(parseCatalogoRows(normalizado)[0].consome).toEqual(['capital-regulatorio'])
    expect(buildGraph(normalizado).warnings).toEqual([])
  })

  it('nome homônimo em vários níveis: warning e vence o nível de menor ordem', () => {
    const { graph, warnings } = buildGraph(
      csv(
        completo({ nome: 'Alfa', consome: 'Resultado' }),
        completo({ nome: 'Resultado', nivel: 'silver', debito: '' }),
        completo({ nome: 'Resultado', nivel: 'final' }),
      ),
      COM_MEDALHAO,
    )
    // final (ordem 20) vem antes de silver (44).
    expect(graph.links).toEqual([{ source: 'alfa', target: 'resultado-2', label: 'consome' }])
    expect(warnings[0]).toBe(
      '"Alfa": consome "Resultado", nome de 2 linhas do catálogo — usando "Resultado" (final)',
    )
    expect(warnings[1]).toContain('resolvido por NOME (id "resultado-2")')
  })

  it('associação ambígua também avisa e desempata pelo nível de menor ordem', () => {
    const { warnings } = buildGraph(
      csv(
        completo({ nome: 'Alfa', associacoes: 'Resultado' }),
        completo({ nome: 'Resultado', nivel: 'silver', debito: '' }),
        completo({ nome: 'Resultado', nivel: 'final' }),
      ),
      COM_MEDALHAO,
    )
    expect(warnings[0]).toBe(
      '"Alfa": associação "Resultado" é ambígua (2 componentes) — usando "Resultado" (final)',
    )
    expect(warnings[1]).toContain('resolvido por NOME (id "resultado-2")')
  })

  it('associação a si mesmo é ignorada (nunca vira self-loop)', () => {
    const { graph, warnings } = buildGraph(csv(completo({ nome: 'Alfa', associacoes: 'Alfa' })))
    expect(graph.links).toEqual([])
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('associação "Alfa" não corresponde a nenhum componente')
  })

  it('arestas repetidas são deduplicadas — o mesmo alvo por id e por nome', () => {
    const { graph } = buildGraph(
      csv(completo({ nome: 'Alfa', consome: 'beta | Beta | BETA' }), completo({ nome: 'Beta' })),
    )
    expect(graph.links).toEqual([{ source: 'alfa', target: 'beta', label: 'consome' }])
  })
})

describe('buildGraph — nó fantasma', () => {
  it('`consome` sem alvo cria o fantasma e mantém a aresta', () => {
    const { graph, warnings } = buildGraph(csv(completo({ nome: 'Alfa', consome: 'Não Cadastrado' })))
    const fantasma = graph.nodes.find((n) => n.fantasma === true)
    expect(fantasma).toMatchObject({
      nome: 'Não Cadastrado',
      // Nasce no fim da cadeia: é de onde vem o que ainda não foi catalogado.
      nivel: 'origem',
      // Sem linha, não tem id de verdade: o prefixo o mantém fora do espaço
      // dos ids do catálogo.
      id: 'fantasma-nao-cadastrado',
      tipoComponente: 'Default',
      incompleto: true,
    })
    expect(graph.links).toEqual([
      { source: 'alfa', target: 'fantasma-nao-cadastrado', label: 'consome' },
    ])
    expect(warnings).toEqual([
      'consome quebrado: "Não Cadastrado" em "Alfa" não corresponde a nenhuma linha do catálogo' +
        ' — criado nó fantasma "fantasma-nao-cadastrado"',
    ])
  })

  it('o mesmo nome citado por vários consumidores vira UM fantasma só', () => {
    const { graph, warnings } = buildGraph(
      csv(
        completo({ nome: 'Alfa', consome: 'Sumido' }),
        completo({ nome: 'Beta', consome: 'sumido' }),
      ),
    )
    expect(graph.nodes.filter((n) => n.fantasma === true)).toHaveLength(1)
    expect(graph.links.filter((l) => l.target === 'fantasma-sumido')).toHaveLength(2)
    expect(warnings).toHaveLength(1)
  })

  it('`associacoes` sem alvo NÃO cria nó — só avisa', () => {
    const { graph, warnings } = buildGraph(csv(completo({ nome: 'Alfa', associacoes: 'Não Cadastrado' })))
    expect(graph.nodes.map((n) => n.id)).toEqual(['alfa'])
    expect(graph.links).toEqual([])
    expect(warnings).toEqual([
      '"Alfa": associação "Não Cadastrado" não corresponde a nenhum componente do mapa' +
        ' — ignorada (nenhum nó criado)',
    ])
  })

  it('cadastrar a linha faz o fantasma virar nó normal', () => {
    const antes = buildGraph(csv(completo({ nome: 'Alfa', consome: 'sumido' })))
    expect(antes.graph.nodes.some((n) => n.fantasma === true)).toBe(true)
    const depois = buildGraph(
      csv(completo({ nome: 'Alfa', consome: 'sumido' }), completo({ nome: 'Sumido', nivel: 'fonte', debito: '' })),
    )
    expect(depois.warnings).toEqual([])
    expect(depois.graph.nodes.some((n) => n.fantasma === true)).toBe(false)
    expect(depois.graph.links).toEqual([{ source: 'alfa', target: 'sumido', label: 'consome' }])
  })

  it('id de fantasma nunca rouba o de uma linha: dois nomes que slugificam igual', () => {
    // "Mercado Alvo - UCS" e "Mercado Alvo  UCS" são nomes diferentes (a
    // pontuação conta na comparação por nome), mas dão o mesmo slug.
    const { graph } = buildGraph(
      csv(
        completo({ nome: 'Alfa', consome: 'Mercado Alvo - UCS | Mercado Alvo  UCS' }),
        completo({ id: 'fantasma-mercado-alvo-ucs', nome: 'Linha com id colidente' }),
      ),
    )
    const ids = graph.nodes.map((n) => n.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('fantasma-mercado-alvo-ucs')
    expect(graph.nodes.filter((n) => n.fantasma === true).map((n) => n.id)).toEqual([
      'fantasma-mercado-alvo-ucs-2',
      'fantasma-mercado-alvo-ucs-3',
    ])
  })
})

// É por isto que a coluna `id` existe: com a referência por nome, qualquer um
// dos dois gestos abaixo deixava a menção órfã (nó fantasma no mapa).
describe('a chave estável: editar um componente não mexe em quem aponta para ele', () => {
  /** Duas linhas ligadas por ID: "Alfa" consome "Beta" e se associa a ele. */
  const ligadas = (beta: { nome: string; nivel: string }): string =>
    csv(
      completo({ id: 'alfa', nome: 'Alfa', consome: 'beta', associacoes: 'beta' }),
      completo({ id: 'beta', nome: beta.nome, nivel: beta.nivel, debito: '' }),
    )

  const arestas = (texto: string) => buildGraph(texto, COM_MEDALHAO)

  it('RENOMEAR o alvo não quebra a ligação', () => {
    const antes = arestas(ligadas({ nome: 'Beta', nivel: 'silver' }))
    const depois = arestas(ligadas({ nome: 'Beta — nome novo', nivel: 'silver' }))

    expect(antes.warnings).toEqual([])
    expect(depois.warnings).toEqual([])
    expect(depois.graph.links).toEqual(antes.graph.links)
    expect(depois.graph.nodes.some((n) => n.fantasma === true)).toBe(false)
    // Só o rótulo mudou.
    expect(depois.graph.nodes.map((n) => n.nome)).toEqual(['Alfa', 'Beta — nome novo'])
  })

  it('TROCAR DE NÍVEL o alvo não quebra a ligação', () => {
    const antes = arestas(ligadas({ nome: 'Beta', nivel: 'silver' }))
    const depois = arestas(ligadas({ nome: 'Beta', nivel: 'origem' }))

    expect(depois.warnings).toEqual([])
    expect(depois.graph.links).toEqual(antes.graph.links)
    expect(depois.graph.nodes.find((n) => n.id === 'beta')?.nivel).toBe('origem')
  })

  it('renomear E mudar de nível na mesma edição também não quebra', () => {
    const depois = arestas(ligadas({ nome: 'Outro nome, outro lugar', nivel: 'origem' }))
    expect(depois.warnings).toEqual([])
    expect(depois.graph.links).toEqual([
      { source: 'alfa', target: 'beta', label: 'consome' },
      { source: 'alfa', target: 'beta', label: 'vem de' },
    ])
  })
})

describe('buildGraph — determinismo', () => {
  const linhas = [
    completo({ nome: 'Zulu', consome: 'alfa | Não Existe' }),
    completo({ nome: 'Alfa', nivel: 'final', associacoes: 'mike' }),
    completo({ nome: 'Mike', nivel: 'silver', debito: '', consome: 'zulu' }),
  ]

  it('a saída não depende da ordem das linhas no arquivo', () => {
    const direto = buildGraph(csv(...linhas), COM_MEDALHAO)
    const invertido = buildGraph(csv(...[...linhas].reverse()), COM_MEDALHAO)
    expect(invertido.graph).toEqual(direto.graph)
    expect([...invertido.warnings].sort()).toEqual([...direto.warnings].sort())
  })

  it('nós saem ordenados por id e arestas por source/target/label', () => {
    const { graph } = buildGraph(csv(...linhas), COM_MEDALHAO)
    expect(graph.nodes.map((n) => n.id)).toEqual([...graph.nodes.map((n) => n.id)].sort())
    // Comparação campo a campo: é o invariante de verdade, sem depender do
    // separador que o build usa para montar a chave de ordenação.
    const cmp = (a: GraphLink, b: GraphLink): number =>
      a.source < b.source ? -1
      : a.source > b.source ? 1
      : a.target < b.target ? -1
      : a.target > b.target ? 1
      : a.label < b.label ? -1
      : a.label > b.label ? 1
      : 0
    expect(graph.links).toEqual([...graph.links].sort(cmp))
  })

  it('rodar duas vezes dá exatamente o mesmo JSON', () => {
    const uma = JSON.stringify(buildGraph(csv(...linhas), COM_MEDALHAO).graph)
    const outra = JSON.stringify(buildGraph(csv(...linhas), COM_MEDALHAO).graph)
    expect(outra).toBe(uma)
  })

  it('o bloco `niveis` sai por ordem asc, como recebido', () => {
    const { graph } = buildGraph(csv(), COM_MEDALHAO)
    expect(graph.niveis.map((n) => n.slug)).toEqual([
      'raiz',
      'dominio',
      'final',
      'primario',
      'fonte-secundaria',
      'gold',
      'silver',
      'fonte',
      'origem',
    ])
  })
})

describe('criarIndiceAlvos', () => {
  it('resolve por id, por nome e devolve todos os homônimos ordenados por nível', () => {
    const indice = criarIndiceAlvos(COM_MEDALHAO, [
      { id: 'resultado-2', nome: 'Resultado', nivel: 'silver' },
      { id: 'resultado', nome: 'Resultado', nivel: 'final' },
    ])
    const porId = indice.resolver('resultado-2')
    expect(porId.alvo?.id).toBe('resultado-2')
    // Casou pelo id: nada a normalizar, nada a avisar.
    expect(porId.porNome).toBe(false)
    const porNome = indice.resolver('RESULTADO')
    expect(porNome.alvo?.id).toBe('resultado')
    expect(porNome.porNome).toBe(true)
    expect(porNome.candidatos.map((c) => c.id)).toEqual(['resultado', 'resultado-2'])
  })

  it('excluirId tira o próprio nó da resolução', () => {
    const indice = criarIndiceAlvos(COM_MEDALHAO, [
      { id: 'resultado', nome: 'Resultado', nivel: 'final' },
      { id: 'resultado-2', nome: 'Resultado', nivel: 'silver' },
    ])
    expect(indice.resolver('Resultado', 'resultado').alvo?.id).toBe('resultado-2')
  })

  it('nome desconhecido resolve para null', () => {
    expect(criarIndiceAlvos().resolver('nada').alvo).toBeNull()
  })
})

describe('catalogo.csv real — invariantes (o usuário edita o catálogo a qualquer hora)', () => {
  const raizProjeto = resolve(import.meta.dirname, '..')
  const textoCatalogo = readFileSync(resolve(raizProjeto, 'catalogo.csv'), 'utf8')
  const { niveis } = carregarNiveis(readFileSync(resolve(raizProjeto, 'niveis.csv'), 'utf8'))
  const { graph, warnings } = buildGraph(textoCatalogo, niveis)
  const registros = parseCsv(textoCatalogo)

  it('builda sem warnings e sem nós fantasma', () => {
    expect(warnings).toEqual([])
    expect(graph.nodes.filter((n) => n.fantasma === true)).toEqual([])
  })

  it('cabeçalho canônico e UMA linha do arquivo por nó do grafo', () => {
    expect(registros[0]).toEqual([...COLUNAS])
    // Contagens exatas ficariam desatualizadas a cada cadastro pelo app: o que
    // vale é a correspondência 1-para-1 entre linhas e nós.
    expect(graph.nodes).toHaveLength(registros.length - 1)
  })

  it('todo nó tem o schema do modelo, sem sobra de campo do modelo antigo', () => {
    const opcionais = new Set(['corpo', 'fantasma'])
    const obrigatorios = [
      'id',
      'nome',
      'nivel',
      'tipoComponente',
      'dominio',
      'debito',
      'status',
      'owner',
      'centroDeCusto',
      'descricao',
      'incompleto',
      'produtoDeDados',
    ]
    for (const n of graph.nodes) {
      const chaves = Object.keys(n)
      for (const campo of obrigatorios) expect(chaves).toContain(campo)
      for (const chave of chaves) {
        expect(obrigatorios.includes(chave) || opcionais.has(chave)).toBe(true)
      }
    }
  })

  it('todo nó vive num nível declarado no niveis.csv', () => {
    const slugs = new Set(graph.niveis.map((n) => n.slug))
    for (const n of graph.nodes) expect(slugs.has(n.nivel)).toBe(true)
  })

  it('todo nó carrega o id da linha do CSV, e todo id é único', () => {
    const idsDoArquivo = parseCatalogoRows(textoCatalogo).map((r) => r.id)
    expect(idsDoArquivo.every((id) => id !== '')).toBe(true)
    expect([...idsDoArquivo].sort()).toEqual(graph.nodes.map((n) => n.id).sort())
    expect(new Set(idsDoArquivo).size).toBe(idsDoArquivo.length)
  })

  it('toda referência do arquivo aponta para um ID existente (nada por nome)', () => {
    const ids = new Set(parseCatalogoRows(textoCatalogo).map((r) => r.id))
    for (const row of parseCatalogoRows(textoCatalogo)) {
      for (const ref of [...row.consome, ...row.associacoes]) expect(ids.has(ref)).toBe(true)
    }
  })

  it('todo tipoComponente está na lista fechada', () => {
    for (const n of graph.nodes) expect(TIPOS_COMPONENTE).toContain(n.tipoComponente)
  })

  it('grafo íntegro: toda aresta liga nós existentes, sem self-loop, com label conhecido', () => {
    const existe = new Set(graph.nodes.map((n) => n.id))
    for (const l of graph.links) {
      expect(existe.has(l.source)).toBe(true)
      expect(existe.has(l.target)).toBe(true)
      expect(l.source).not.toBe(l.target)
      expect(['consome', 'vem de']).toContain(l.label)
    }
  })

  it('incompleto é exatamente a regra de owner/centro de custo, em todos os níveis', () => {
    for (const n of graph.nodes) {
      expect(n.incompleto).toBe(n.owner === null || n.centroDeCusto === null)
    }
  })

  it('o catálogo real é determinístico byte a byte entre execuções', () => {
    const outra = buildGraph(textoCatalogo, niveis)
    expect(JSON.stringify(outra.graph)).toBe(JSON.stringify(graph))
  })
})
