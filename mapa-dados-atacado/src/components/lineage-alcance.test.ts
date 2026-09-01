// O ALCANCE do foco: quanto do entorno entra na vista quando um componente é
// focado. Três posições, testadas na FUNÇÃO PURA (buildLineage) — a UI só
// escolhe qual delas passar.
//
// O caso que originou o controle é o do usuário, reproduzido aqui em fixture:
// um Job que ACESSA a API de um bureau (verbo montante) e ENVIA para uma tabela
// bruta (verbo jusante). Focar no Job trazia só a API — o `envia` é declarado
// pelo Job, e para um verbo jusante a linhagem sobe da PONTA para a ORIGEM, de
// modo que o alvo nunca aparecia. Não era defeito da travessia: era o alcance
// sendo uma constante.
import { describe, expect, it } from 'vitest'
import type { GraphLinkData, GraphNodeData, NivelDef, VerboDef } from './graph-types'
import { ALCANCE_INICIAL, ALCANCES, buildLineage, ehAlcance } from './lineage'

const NIVEIS: NivelDef[] = [
  { slug: 'consumo', titulo: 'Consumo', ordem: 0, builtin: true },
  { slug: 'prata', titulo: 'Prata', ordem: 20, builtin: false },
  { slug: 'bruto', titulo: 'Bruto', ordem: 40, builtin: false },
  { slug: 'processo', titulo: 'Processo', ordem: 60, builtin: false },
  { slug: 'fonte', titulo: 'Fonte', ordem: 80, builtin: true },
]

const VERBOS: VerboDef[] = [
  { slug: 'consome', titulo: 'Consome', sentido: 'montante', seta: true },
  { slug: 'acessa', titulo: 'Acessa', sentido: 'montante', seta: true },
  { slug: 'envia', titulo: 'Envia', sentido: 'jusante', seta: true },
  { slug: 'relaciona', titulo: 'Relaciona', sentido: 'nenhum', seta: false },
]

const NODES: GraphNodeData[] = [
  { id: 'painel', nome: 'Painel', nivel: 'consumo' },
  { id: 'prata', nome: 'Tabela prata', nivel: 'prata' },
  { id: 'raw', nome: 'raw_neoway', nivel: 'bruto' },
  { id: 'job', nome: 'Job de carga', nivel: 'processo' },
  { id: 'api', nome: 'API do bureau', nivel: 'fonte' },
  { id: 'catalogo', nome: 'Catálogo de apoio', nivel: 'fonte' },
  // Fora da cadeia do Job: entra só no inventário.
  { id: 'solto', nome: 'Planilha solta', nivel: 'bruto' },
]

const LINKS: GraphLinkData[] = [
  // montante do Job: ele acessa a API, que por sua vez consome um catálogo.
  { source: 'job', target: 'api', label: 'acessa' },
  { source: 'api', target: 'catalogo', label: 'consome' },
  // jusante do Job: ele envia para a tabela bruta, que a prata consome, que o
  // painel consome.
  { source: 'job', target: 'raw', label: 'envia' },
  { source: 'prata', target: 'raw', label: 'consome' },
  { source: 'painel', target: 'prata', label: 'consome' },
]

/** Ids da vista, ordenados — o que o alcance decide. */
function vista(alcance: Parameters<typeof buildLineage>[5], links = LINKS): string[] {
  const lineage = buildLineage('job', NODES, links, NIVEIS, VERBOS, alcance)
  if (!lineage) throw new Error('lineage null')
  return [...lineage.ids].sort()
}

describe('alcance do foco', () => {
  it('montante: só a cadeia de que o componente depende — o mapa de hoje', () => {
    expect(vista('montante')).toEqual(['api', 'catalogo', 'job'])
  })

  it('montante é o DEFAULT da função: chamada sem o parâmetro não muda de resultado', () => {
    const semParametro = buildLineage('job', NODES, LINKS, NIVEIS, VERBOS)
    expect([...(semParametro?.ids ?? [])].sort()).toEqual(vista('montante'))
  })

  it('+ vizinhos: o alvo do `envia` aparece, e a cadeia dele não', () => {
    // A queixa resolvida: raw_neoway entra. Mas só ele — quem consome o raw
    // (prata, painel) fica de fora, que é o que impede a tela de estourar.
    expect(vista('vizinhos')).toEqual(['api', 'catalogo', 'job', 'raw'])
  })

  it('dois sentidos: a cadeia jusante inteira, recursiva', () => {
    expect(vista('ambos')).toEqual(['api', 'catalogo', 'job', 'painel', 'prata', 'raw'])
  })

  it('nenhuma posição traz quem não está na cadeia', () => {
    for (const alcance of ALCANCES) expect(vista(alcance)).not.toContain('solto')
  })

  // O controle é uma ESCADA: mover para a direita só pode acrescentar. Um
  // "alcance" que escondesse algo ao ser aumentado não se explicaria.
  it('cada posição contém a anterior', () => {
    const [a, b, c] = ALCANCES.map((alcance) => new Set(vista(alcance)))
    for (const id of a) expect(b.has(id), id).toBe(true)
    for (const id of b) expect(c.has(id), id).toBe(true)
  })

  // O verbo sem sentido não conduz dado, então nem `montante` nem `ambos` o
  // percorrem. Mas ele É uma ligação declarada, e "+ vizinhos" existe para
  // mostrar TODAS as ligações do componente — logo ele entra ali. E, pela
  // escada, continua em `ambos`.
  it('vizinho ligado por verbo SEM sentido entra a partir de "+ vizinhos"', () => {
    const links = [...LINKS, { source: 'job', target: 'solto', label: 'relaciona' }]
    expect(vista('montante', links)).not.toContain('solto')
    expect(vista('vizinhos', links)).toContain('solto')
    expect(vista('ambos', links)).toContain('solto')
  })

  it('as arestas do entorno vêm junto: o `envia` é desenhado', () => {
    const lineage = buildLineage('job', NODES, LINKS, NIVEIS, VERBOS, 'vizinhos')
    if (!lineage) throw new Error('lineage null')
    expect(lineage.graph.links.map((l) => `${l.source} ${l.label} ${l.target}`).sort()).toEqual([
      'api consome catalogo',
      'job acessa api',
      'job envia raw',
    ])
  })

  // A árvore do balão é a cadeia MONTANTE e continua sendo, em qualquer
  // alcance: o alcance é do mapa.
  it('a árvore (lineage.root) não muda com o alcance', () => {
    const upstream = (alcance: Parameters<typeof buildLineage>[5]) =>
      buildLineage('job', NODES, LINKS, NIVEIS, VERBOS, alcance)?.root?.upstream.map(
        (u) => u.entry.data.id,
      )
    for (const alcance of ALCANCES) expect(upstream(alcance), alcance).toEqual(['api'])
  })

  // O hover acende pelo chainOf, o fecho sobre as arestas DA VISTA. Ele não
  // consulta o alcance — segue-o de graça, porque as arestas que ele lê são
  // exatamente as que o alcance deixou entrar: com "+ vizinhos", o `envia`
  // passa a existir na vista e o raw_neoway passa a acender junto com o Job.
  it('o chainOf acompanha o alcance sem regra própria', () => {
    const acesos = (alcance: Parameters<typeof buildLineage>[5]) => {
      const lineage = buildLineage('job', NODES, LINKS, NIVEIS, VERBOS, alcance)
      if (!lineage) throw new Error('lineage null')
      return [...lineage.chainOf('job')].sort()
    }
    expect(acesos('montante')).toEqual(['api', 'catalogo', 'job'])
    expect(acesos('vizinhos')).toEqual(['api', 'catalogo', 'job', 'raw'])
    // `prata` e `painel` estão na vista com "dois sentidos", mas não acendem
    // pelo Job: o chainOf anda pela direção DECLARADA da aresta (ida a partir
    // do nó e volta a partir dele, sem misturar as duas no meio do caminho), e
    // quem consome o raw_neoway não é alcançável por nenhum dos dois lados a
    // partir do Job. É comportamento antigo do hover, alheio ao alcance — o
    // teste está aqui para que a diferença fique registrada, não escondida.
    expect(acesos('ambos')).toEqual(['api', 'catalogo', 'job', 'raw'])
  })

  it('sem foco, o alcance não muda o inventário', () => {
    const ids = (alcance: Parameters<typeof buildLineage>[5]) =>
      [...(buildLineage(null, NODES, LINKS, NIVEIS, VERBOS, alcance)?.ids ?? [])].sort()
    expect(ids('ambos')).toEqual(ids('montante'))
    expect(ids('ambos')).toHaveLength(NODES.length)
  })

  it('componente inexistente continua devolvendo null, em qualquer alcance', () => {
    for (const alcance of ALCANCES) {
      expect(buildLineage('nao-existe', NODES, LINKS, NIVEIS, VERBOS, alcance)).toBeNull()
    }
  })
})

describe('leitura do alcance vindo de fora (URL)', () => {
  it('reconhece as três posições e recusa o resto', () => {
    for (const alcance of ALCANCES) expect(ehAlcance(alcance)).toBe(true)
    for (const lixo of [null, '', 'MONTANTE', 'jusante', 'todos']) {
      expect(ehAlcance(lixo), String(lixo)).toBe(false)
    }
  })

  it('o padrão da TELA é "+ vizinhos", e é uma das posições', () => {
    // A tela abre no que resolve a queixa; a função abre no comportamento
    // antigo. Os dois são de propósito diferentes — este teste trava a
    // diferença para que ela não seja "consertada" por engano.
    expect(ALCANCE_INICIAL).toBe('vizinhos')
    expect(ALCANCES).toContain(ALCANCE_INICIAL)
  })
})
