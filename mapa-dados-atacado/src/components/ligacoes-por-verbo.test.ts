// O BUG QUE ESTE MÓDULO EXISTE PARA MATAR está no primeiro describe: um Job que
// consome uma API e ENVIA para uma tabela raw tinha as duas arestas listadas
// debaixo do mesmo título "Consome →" — o balão afirmava que o Job consumia a
// tabela que ele acabara de escrever. O teste monta esse caso e exige que os
// dois alvos caiam em seções DIFERENTES, cada uma titulada pelo seu verbo.
//
// Nenhuma asserção usa o catálogo vivo: verbos e componentes daqui são fixture,
// e o usuário pode renomear ou criar quantos verbos quiser sem derrubar nada.
import { describe, expect, it } from 'vitest'
import type { GraphNodeData, VerboDef } from './graph-types'
import {
  agruparLigacoesPorVerbo,
  papelDoVerbo,
  tituloDaSecao,
  type Ligacao,
} from './ligacoes-por-verbo'

/** Vocabulário de teste, na ordem em que a tela de verbos o apresentaria. */
const VERBOS: VerboDef[] = [
  { slug: 'consome', titulo: 'Consome', sentido: 'montante', seta: true },
  { slug: 'acessa', titulo: 'Acessa', sentido: 'montante', seta: true },
  { slug: 'envia', titulo: 'Envia', sentido: 'jusante', seta: true },
  { slug: 'associado', titulo: 'Associado', sentido: 'ambos', seta: false },
]

const no = (id: string, nome: string, extra: Partial<GraphNodeData> = {}): GraphNodeData => ({
  id,
  nome,
  ...extra,
})

const API = no('api-bureau', 'API do bureau')
const RAW = no('raw-neoway', 'raw_neoway')
const DIM = no('dim-cliente', 'dim_cliente')
const JOB = no('job-001', 'Job 001')

const titulos = (ligacoes: Ligacao[]) =>
  agruparLigacoesPorVerbo(ligacoes, VERBOS).map((s) => s.titulo)

const nomes = (ligacoes: Ligacao[], titulo: string) =>
  agruparLigacoesPorVerbo(ligacoes, VERBOS)
    .find((s) => s.titulo === titulo)
    ?.itens.map((i) => i.node.nome)

describe('o Job que consome uma API e envia para uma tabela', () => {
  const doJob: Ligacao[] = [
    { node: API, label: 'consome', invertida: false },
    { node: RAW, label: 'envia', invertida: false },
  ]

  it('dá uma seção para cada verbo, não uma só', () => {
    expect(titulos(doJob)).toEqual(['Consome →', 'Envia →'])
  })

  it('o que ele ENVIA não aparece no que ele consome', () => {
    expect(nomes(doJob, 'Consome →')).toEqual(['API do bureau'])
    expect(nomes(doJob, 'Envia →')).toEqual(['raw_neoway'])
  })

  it('a tabela do outro lado lê a MESMA aresta invertida', () => {
    const daTabela: Ligacao[] = [{ node: JOB, label: 'envia', invertida: true }]

    expect(titulos(daTabela)).toEqual(['↩ Envia'])
    expect(nomes(daTabela, '↩ Envia')).toEqual(['Job 001'])
  })
})

describe('os dois sentidos de leitura', () => {
  it('o mesmo verbo lido dos dois lados vira duas seções, com chaves distintas', () => {
    const secoes = agruparLigacoesPorVerbo(
      [
        { node: API, label: 'consome', invertida: false },
        { node: DIM, label: 'consome', invertida: true },
      ],
      VERBOS,
    )

    expect(secoes.map((s) => s.titulo)).toEqual(['Consome →', '↩ Consome'])
    expect(new Set(secoes.map((s) => s.chave)).size).toBe(2)
    expect(secoes.map((s) => s.invertida)).toEqual([false, true])
  })

  it('tudo o que ESTE componente declara vem antes do que declararam sobre ele', () => {
    // "envia" está DEPOIS de "consome" no vocabulário: se o bloco não viesse
    // antes do verbo, o "↩ Consome" se meteria entre as duas seções diretas.
    const misturado: Ligacao[] = [
      { node: DIM, label: 'consome', invertida: true },
      { node: RAW, label: 'envia', invertida: false },
      { node: API, label: 'consome', invertida: false },
    ]

    expect(titulos(misturado)).toEqual(['Consome →', 'Envia →', '↩ Consome'])
  })

  it('verbo sem seta no desenho também tem os dois lados', () => {
    const secoes = agruparLigacoesPorVerbo(
      [
        { node: API, label: 'associado', invertida: false },
        { node: DIM, label: 'associado', invertida: true },
      ],
      VERBOS,
    )

    expect(secoes.map((s) => s.titulo)).toEqual(['Associado →', '↩ Associado'])
  })
})

describe('ordem das seções', () => {
  it('segue o vocabulário, não a ordem em que as arestas apareceram', () => {
    const naOrdemContraria: Ligacao[] = [
      { node: RAW, label: 'envia', invertida: false },
      { node: DIM, label: 'associado', invertida: false },
      { node: API, label: 'acessa', invertida: false },
      { node: JOB, label: 'consome', invertida: false },
    ]

    expect(titulos(naOrdemContraria)).toEqual([
      'Consome →',
      'Acessa →',
      'Envia →',
      'Associado →',
    ])
  })

  it('renomear um verbo muda o título e nada mais', () => {
    const renomeados: VerboDef[] = VERBOS.map((v) =>
      v.slug === 'envia' ? { ...v, titulo: 'Manda' } : v,
    )
    const secoes = agruparLigacoesPorVerbo(
      [{ node: RAW, label: 'envia', invertida: false }],
      renomeados,
    )

    expect(secoes.map((s) => s.titulo)).toEqual(['Manda →'])
    expect(secoes[0].itens.map((i) => i.node.nome)).toEqual(['raw_neoway'])
  })

  it('um verbo criado depois ganha sua seção sem nenhuma mudança de código', () => {
    const comNovo: VerboDef[] = [
      ...VERBOS,
      { slug: 'publica', titulo: 'Publica', sentido: 'jusante', seta: true },
    ]
    const secoes = agruparLigacoesPorVerbo(
      [
        { node: RAW, label: 'publica', invertida: false },
        { node: API, label: 'consome', invertida: false },
      ],
      comNovo,
    )

    expect(secoes.map((s) => s.titulo)).toEqual(['Consome →', 'Publica →'])
  })

  it('a ordem dentro de uma seção é a das arestas', () => {
    const secoes = agruparLigacoesPorVerbo(
      [
        { node: RAW, label: 'consome', invertida: false },
        { node: API, label: 'consome', invertida: false },
        { node: DIM, label: 'consome', invertida: false },
      ],
      VERBOS,
    )

    expect(secoes[0].itens.map((i) => i.node.id)).toEqual(['raw-neoway', 'api-bureau', 'dim-cliente'])
  })
})

describe('bordas', () => {
  it('componente sem ligação nenhuma não gera seção', () => {
    expect(agruparLigacoesPorVerbo([], VERBOS)).toEqual([])
  })

  it('verbo do vocabulário sem aresta não vira seção vazia', () => {
    expect(titulos([{ node: API, label: 'consome', invertida: false }])).toEqual(['Consome →'])
  })

  it('rótulo fora do vocabulário aparece com o próprio slug, atrás dos conhecidos', () => {
    const comDesconhecido: Ligacao[] = [
      { node: DIM, label: 'verbo-que-sumiu', invertida: false },
      { node: API, label: 'consome', invertida: false },
    ]

    expect(titulos(comDesconhecido)).toEqual(['Consome →', 'verbo-que-sumiu →'])
    expect(nomes(comDesconhecido, 'verbo-que-sumiu →')).toEqual(['dim_cliente'])
  })

  it('sem vocabulário nenhum, cada rótulo ainda vira sua seção', () => {
    const secoes = agruparLigacoesPorVerbo(
      [
        { node: API, label: 'consome', invertida: false },
        { node: RAW, label: 'envia', invertida: false },
      ],
      [],
    )

    expect(secoes.map((s) => s.titulo)).toEqual(['consome →', 'envia →'])
  })

  it('duas arestas de verbos diferentes para o MESMO componente são duas linhas', () => {
    const secoes = agruparLigacoesPorVerbo(
      [
        { node: RAW, label: 'consome', invertida: false },
        { node: RAW, label: 'envia', invertida: false },
      ],
      VERBOS,
    )

    expect(secoes.map((s) => s.titulo)).toEqual(['Consome →', 'Envia →'])
    expect(secoes.every((s) => s.itens.length === 1)).toBe(true)
  })

  it('o alvo fantasma continua sendo repassado como veio', () => {
    const fantasma = no('so-citado', 'Só citado', { fantasma: true })
    const secoes = agruparLigacoesPorVerbo(
      [{ node: fantasma, label: 'consome', invertida: false }],
      VERBOS,
    )

    expect(secoes[0].itens[0].node.fantasma).toBe(true)
  })
})

describe('as marcas dos dois sentidos', () => {
  it('o item invertido leva o ↩ à frente (o mesmo da linhagem)', () => {
    expect(papelDoVerbo('Envia', true)).toBe('↩ Envia')
    expect(papelDoVerbo('Envia', false)).toBe('Envia')
  })

  it('o título direto aponta para o alvo; o invertido, de volta', () => {
    expect(tituloDaSecao('Envia', false)).toBe('Envia →')
    expect(tituloDaSecao('Envia', true)).toBe('↩ Envia')
  })

  it('os dois títulos de um mesmo verbo nunca colidem', () => {
    for (const v of VERBOS) {
      expect(tituloDaSecao(v.titulo, false)).not.toBe(tituloDaSecao(v.titulo, true))
    }
  })
})
