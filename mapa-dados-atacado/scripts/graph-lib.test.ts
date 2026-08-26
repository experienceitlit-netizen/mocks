// Testes do build do grafo no modelo "tudo é componente": todo nó vem de uma
// LINHA do catálogo, e o que separa um nó de outro é só o NÍVEL dele. Nada é
// derivado de campo, e nenhum nível tem tratamento especial — os testes abaixo
// existem em boa parte para garantir justamente isso.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildGraph,
  carregarNiveis,
  COLUNAS,
  criarIndiceAlvos,
  idDaLinha,
  montarNiveis,
  NIVEIS_PADRAO,
  parseCatalogo,
  parseCsv,
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

describe('slugify e idDaLinha', () => {
  it('slugify gera kebab-case sem acentos', () => {
    expect(slugify('Capital Regulatório')).toBe('capital-regulatorio')
    expect(slugify('Custo de Capital (KE)')).toBe('custo-de-capital-ke')
  })

  it('id é <slug do nível>-<slug do nome>, com a MESMA regra em todo nível', () => {
    expect(idDaLinha('silver', 'Resultado')).toBe('silver-resultado')
    expect(idDaLinha('final', 'Resultado')).toBe('final-resultado')
    // Nem a raiz é exceção: o nó de entrada do mapa segue a regra geral.
    expect(idDaLinha('raiz', 'Atacado — Dados')).toBe('raiz-atacado-dados')
    expect(idDaLinha('fonte-secundaria', 'Mercado Alvo - UCS')).toBe(
      'fonte-secundaria-mercado-alvo-ucs',
    )
  })
})

describe('parseCatalogo — uma linha, um nó, em qualquer nível', () => {
  it('linha completa vira nó sem warnings, com o schema do modelo', () => {
    const { rows, warnings } = parseCatalogo(csv(completo({ nome: 'RAR 12M', nivel: 'final' })))
    expect(warnings).toEqual([])
    expect(rows).toHaveLength(1)
    expect(rows[0].node).toEqual({
      id: 'final-rar-12m',
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
    })
  })

  it('TODO nível vira nó pelo mesmo caminho — inclusive raiz, domínio e origem', () => {
    const niveis = COM_MEDALHAO
    const texto = csv(
      ...niveis.map((n) => completo({ nome: `Nó ${n.slug}`, nivel: n.slug, debito: '', status: '' })),
    )
    const { rows, warnings } = parseCatalogo(texto, niveis)
    expect(warnings).toEqual([])
    expect(rows.map((r) => r.node.id)).toEqual(niveis.map((n) => `${n.slug}-no-${n.slug}`))
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
    expect(rows.map((r) => r.node.id)).toEqual(['final-resultado', 'silver-resultado'])
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

  it('os quatro valores aceitos chegam ao nó como estão', () => {
    const { rows, warnings } = parseCatalogo(
      csv(...TIPOS_COMPONENTE.map((t) => completo({ nome: t, tipo_componente: t }))),
    )
    expect(warnings).toEqual([])
    expect(rows.map((r) => r.node.tipoComponente)).toEqual([...TIPOS_COMPONENTE])
  })

  it('valor fora da lista vira warning e assume Default', () => {
    const { rows, warnings } = parseCatalogo(csv(completo({ nome: 'A', tipo_componente: 'Parquet' })))
    expect(rows[0].node.tipoComponente).toBe('Default')
    expect(warnings).toEqual([
      'catalogo.csv linha 2 ("A"): tipo_componente "Parquet" desconhecido' +
        ' (use "Tabela SQL", "Tabela Delta", "Excel", "Default") — assumindo "Default"',
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

describe('buildGraph — nós', () => {
  it('não sintetiza nada: sem linhas, sem nós (nem raiz, nem domínios)', () => {
    const { graph, warnings } = buildGraph(csv())
    expect(graph.nodes).toEqual([])
    expect(graph.links).toEqual([])
    expect(warnings).toEqual([])
  })

  it('o campo `dominio` NÃO cria nó: domínio só existe se tiver linha própria', () => {
    const semLinha = buildGraph(csv(completo({ nome: 'A', dominio: 'Risco' })))
    expect(semLinha.graph.nodes.map((n) => n.id)).toEqual(['primario-a'])
    const comLinha = buildGraph(
      csv(completo({ nome: 'A', dominio: 'Risco' }), completo({ nome: 'Risco', nivel: 'dominio', debito: '' })),
    )
    expect(comLinha.graph.nodes.map((n) => n.id)).toEqual(['dominio-risco', 'primario-a'])
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
    expect(graph.nodes.map((n) => n.id)).toEqual(['primario-a'])
    expect(graph.links).toEqual([])
    expect(warnings).toEqual([])
  })

  it('mesmo nome no mesmo nível: warning e a linha repetida é ignorada', () => {
    const { graph, warnings } = buildGraph(
      csv(completo({ nome: 'Alfa', descricao: 'primeira' }), completo({ nome: 'ALFA', descricao: 'segunda' })),
    )
    expect(graph.nodes).toHaveLength(1)
    expect(graph.nodes[0].descricao).toBe('primeira')
    expect(warnings).toEqual([
      'nome duplicado "ALFA" no nível "primario" (id "primario-alfa") — a linha repetida foi ignorada',
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
    expect(graph.nodes.map((n) => n.id)).toEqual([
      'dominio-resultado',
      'final-resultado',
      'silver-resultado',
    ])
  })
})

describe('buildGraph — arestas', () => {
  it('`consome` vira aresta "consome" e `associacoes` vira "vem de"', () => {
    const { graph, warnings } = buildGraph(
      csv(
        completo({ nome: 'Alfa', consome: 'Beta', associacoes: 'Gama' }),
        completo({ nome: 'Beta' }),
        completo({ nome: 'Gama', nivel: 'fonte', debito: '' }),
      ),
    )
    expect(warnings).toEqual([])
    expect(graph.links).toEqual([
      { source: 'primario-alfa', target: 'fonte-gama', label: 'vem de' },
      { source: 'primario-alfa', target: 'primario-beta', label: 'consome' },
    ])
  })

  it('referências cruzam níveis livremente, nos dois sentidos da cadeia', () => {
    const { graph, warnings } = buildGraph(
      csv(
        completo({ nome: 'Origem A', nivel: 'origem', debito: '', consome: 'Raiz Z' }),
        completo({ nome: 'Raiz Z', nivel: 'raiz', debito: '', consome: 'Origem A', associacoes: 'Gold G' }),
        completo({ nome: 'Gold G', nivel: 'gold', debito: '' }),
      ),
      COM_MEDALHAO,
    )
    expect(warnings).toEqual([])
    expect(graph.links).toEqual([
      { source: 'origem-origem-a', target: 'raiz-raiz-z', label: 'consome' },
      { source: 'raiz-raiz-z', target: 'gold-gold-g', label: 'vem de' },
      { source: 'raiz-raiz-z', target: 'origem-origem-a', label: 'consome' },
    ])
  })

  it('resolve por nome sem distinguir caixa nem acentos, e também por id', () => {
    const { graph, warnings } = buildGraph(
      csv(
        completo({ nome: 'Alfa', consome: 'capital regulatorio | silver-beta' }),
        completo({ nome: 'Capital Regulatório' }),
        completo({ nome: 'Beta', nivel: 'silver', debito: '' }),
      ),
      COM_MEDALHAO,
    )
    expect(warnings).toEqual([])
    expect(graph.links.map((l) => l.target)).toEqual(['primario-capital-regulatorio', 'silver-beta'])
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
    expect(graph.links).toEqual([
      { source: 'primario-alfa', target: 'final-resultado', label: 'consome' },
    ])
    expect(warnings).toEqual([
      '"Alfa": consome "Resultado", nome de 2 linhas do catálogo — usando "Resultado" (final)',
    ])
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
    expect(warnings).toEqual([
      '"Alfa": associação "Resultado" é ambígua (2 componentes) — usando "Resultado" (final)',
    ])
  })

  it('associação a si mesmo é ignorada (nunca vira self-loop)', () => {
    const { graph, warnings } = buildGraph(csv(completo({ nome: 'Alfa', associacoes: 'Alfa' })))
    expect(graph.links).toEqual([])
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('associação "Alfa" não corresponde a nenhum componente')
  })

  it('arestas repetidas são deduplicadas', () => {
    const { graph } = buildGraph(
      csv(completo({ nome: 'Alfa', consome: 'Beta | beta | primario-beta' }), completo({ nome: 'Beta' })),
    )
    expect(graph.links).toEqual([
      { source: 'primario-alfa', target: 'primario-beta', label: 'consome' },
    ])
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
      id: 'origem-nao-cadastrado',
      tipoComponente: 'Default',
      incompleto: true,
    })
    expect(graph.links).toEqual([
      { source: 'primario-alfa', target: 'origem-nao-cadastrado', label: 'consome' },
    ])
    expect(warnings).toEqual([
      'consome quebrado: "Não Cadastrado" em "Alfa" não corresponde a nenhuma linha do catálogo' +
        ' — criado nó fantasma "origem-nao-cadastrado"',
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
    expect(graph.links.filter((l) => l.target === 'origem-sumido')).toHaveLength(2)
    expect(warnings).toHaveLength(1)
  })

  it('`associacoes` sem alvo NÃO cria nó — só avisa', () => {
    const { graph, warnings } = buildGraph(csv(completo({ nome: 'Alfa', associacoes: 'Não Cadastrado' })))
    expect(graph.nodes.map((n) => n.id)).toEqual(['primario-alfa'])
    expect(graph.links).toEqual([])
    expect(warnings).toEqual([
      '"Alfa": associação "Não Cadastrado" não corresponde a nenhum componente do mapa' +
        ' — ignorada (nenhum nó criado)',
    ])
  })

  it('cadastrar a linha faz o fantasma virar nó normal', () => {
    const antes = buildGraph(csv(completo({ nome: 'Alfa', consome: 'Sumido' })))
    expect(antes.graph.nodes.some((n) => n.fantasma === true)).toBe(true)
    const depois = buildGraph(
      csv(completo({ nome: 'Alfa', consome: 'Sumido' }), completo({ nome: 'Sumido', nivel: 'fonte', debito: '' })),
    )
    expect(depois.warnings).toEqual([])
    expect(depois.graph.nodes.some((n) => n.fantasma === true)).toBe(false)
    expect(depois.graph.links).toEqual([
      { source: 'primario-alfa', target: 'fonte-sumido', label: 'consome' },
    ])
  })
})

describe('buildGraph — determinismo', () => {
  const linhas = [
    completo({ nome: 'Zulu', consome: 'Alfa | Não Existe' }),
    completo({ nome: 'Alfa', nivel: 'final', associacoes: 'Mike' }),
    completo({ nome: 'Mike', nivel: 'silver', debito: '', consome: 'Zulu' }),
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
      { id: 'silver-resultado', nome: 'Resultado', nivel: 'silver' },
      { id: 'final-resultado', nome: 'Resultado', nivel: 'final' },
    ])
    expect(indice.resolver('silver-resultado').alvo?.id).toBe('silver-resultado')
    const porNome = indice.resolver('RESULTADO')
    expect(porNome.alvo?.id).toBe('final-resultado')
    expect(porNome.candidatos.map((c) => c.id)).toEqual(['final-resultado', 'silver-resultado'])
  })

  it('excluirId tira o próprio nó da resolução', () => {
    const indice = criarIndiceAlvos(COM_MEDALHAO, [
      { id: 'final-resultado', nome: 'Resultado', nivel: 'final' },
      { id: 'silver-resultado', nome: 'Resultado', nivel: 'silver' },
    ])
    expect(indice.resolver('Resultado', 'final-resultado').alvo?.id).toBe('silver-resultado')
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

  it('todo id segue <slug do nível>-<slug do nome> e é único', () => {
    for (const n of graph.nodes) expect(n.id).toBe(idDaLinha(n.nivel, n.nome))
    const todos = graph.nodes.map((n) => n.id)
    expect(new Set(todos).size).toBe(todos.length)
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
