// AS LIGAÇÕES DO BALÃO, AGRUPADAS POR VERBO — uma seção por verbo, com o título
// saindo do vocabulário, sem React.
//
// O balão tinha duas seções fixas, "Consome →" e "← Consumido por", herdadas da
// época em que `consome` era a única relação possível. Com o verbo por
// referência (`envia:alvo`), uma aresta `envia` continuava caindo debaixo do
// título "Consome" — o cabeçalho afirmava o CONTRÁRIO do que a própria linha
// dizia, e o verbo real sobrava como um rótulo miúdo ao lado do nome. Agora o
// verbo É o título: "o que este componente consome" e "para onde ele envia" são
// duas listas separadas, e o rótulo por item some, porque a seção inteira já o
// diz.
//
// OS DOIS SENTIDOS DE LEITURA CONTINUAM. Uma relação é declarada por UM dos
// lados (ver CONTINUAR.md, "A fusão das relações"): o balão do outro lado lê a
// MESMA aresta de trás para a frente. Não existe título inverso no vocabulário,
// e inventar um ("Enviado por") seria uma segunda fonte de verdade para cada
// verbo que o usuário cadastrar — então o sentido invertido reusa o ↩ que a
// linhagem e os rótulos de item já usam para dizer "esta aresta foi percorrida
// ao contrário".
//
// NADA DE TÍTULO CRAVADO NO CÓDIGO: o vocabulário é dado, editável na tela
// "⇢ Verbos", e um verbo criado amanhã ganha sua seção sozinho.
import type { GraphNodeData, VerboDef } from './graph-types'
import { tituloDoVerbo } from './graph-types'

/** Uma aresta vista do balão de um componente: para quem ela leva, com que
 *  verbo, e de que lado ela está sendo lida.
 *
 *  `label` é SEMPRE o verbo do lado em que a linha foi escrita — o mesmo
 *  contrato do `label` do grafo e do {@link LineageEdge}. Quem diz que a
 *  leitura anda ao contrário é `invertida`, nunca um segundo verbo. */
export interface Ligacao {
  node: GraphNodeData
  /** Slug do verbo declarado na aresta. Fora do vocabulário não quebra nada:
   *  {@link tituloDoVerbo} devolve o próprio slug. */
  label: string
  /** A aresta está sendo lida do lado de quem NÃO a declarou. */
  invertida: boolean
}

/** Uma seção do balão: um verbo, um sentido de leitura, seus alvos. */
export interface SecaoDeLigacoes {
  /** Chave estável para o React — o par (verbo, sentido de leitura). */
  chave: string
  /** O que vai no <h3>, já com a marca do sentido. */
  titulo: string
  /** Repassado para quem desenha decidir estilo; o título já traz a marca. */
  invertida: boolean
  itens: Ligacao[]
}

/** A marca de "esta relação está de trás para a frente". */
export const GLIFO_INVERTIDA = '↩'

/**
 * Como o verbo de uma relação é escrito quando ela está sendo lida do lado de
 * quem NÃO a declarou.
 *
 * O verbo é escrito uma vez só, na linha de quem declara: "Envia" vale de A
 * para B. Lido de B, o mesmo verbo diria o contrário do que aconteceu.
 *
 * É o rótulo de UM item (a linha da linhagem); o título da SEÇÃO é o
 * {@link tituloDaSecao}, que marca também o sentido direto.
 */
export function papelDoVerbo(titulo: string, invertida: boolean): string {
  return invertida ? `${GLIFO_INVERTIDA} ${titulo}` : titulo
}

/**
 * Título da seção de um verbo, num dos dois sentidos de leitura.
 *
 * A seta no sentido direto é a que "Consome →" sempre teve: o título nomeia o
 * verbo E para onde ele aponta ("Envia →" é o "envia para" que se lê em voz
 * alta). Ela fala do LADO da leitura — quem declarou aponta para quem foi
 * declarado —, e não da ponta que o mapa desenha: verbo sem seta (`seta:
 * false`, como "Associado") continua sem ponta no desenho e mesmo assim tem um
 * lado que escreveu a linha.
 *
 * A assimetria dos dois glifos (↩ na frente × → no fim) é de propósito: as duas
 * seções de um mesmo verbo nunca ficam com o mesmo título nem com a mesma
 * silhueta, mesmo lidas de relance.
 */
export function tituloDaSecao(titulo: string, invertida: boolean): string {
  return invertida ? papelDoVerbo(titulo, true) : `${titulo} →`
}

/** Chave do par (verbo, sentido de leitura): é o que identifica uma seção, e o
 *  mesmo verbo lido dos dois lados são duas seções. O prefixo tem tamanho fixo,
 *  então nenhum slug consegue produzir a chave de outra seção. */
function chaveDaSecao(label: string, invertida: boolean): string {
  return `${invertida ? 'inv' : 'dir'}:${label}`
}

/**
 * A ordem em que os verbos viram seção.
 *
 * É a ordem do VOCABULÁRIO — a mesma do `<select>` do formulário e da tela de
 * verbos —, nunca a ordem em que as arestas apareceram: essa muda com o
 * catálogo e faria as seções dançarem de lugar a cada navegação.
 *
 * Rótulo que não está no vocabulário (graph.json antigo, verbo removido depois
 * de gravado) não é descartado — ganha sua seção com o próprio slug de título,
 * atrás das conhecidas, na ordem em que apareceu. É o mesmo princípio do nó
 * fantasma: o que não resolve aparece, não some.
 */
function ordemDosVerbos(
  ligacoes: readonly Ligacao[],
  verbos: readonly VerboDef[],
): string[] {
  const doVocabulario = verbos.map((v) => v.slug)
  const conhecidos = new Set(doVocabulario)
  const extras: string[] = []
  for (const l of ligacoes) {
    if (!conhecidos.has(l.label) && !extras.includes(l.label)) extras.push(l.label)
  }
  return [...doVocabulario, ...extras]
}

/** Os dois blocos, na ordem em que o balão os lê: primeiro o que este
 *  componente declara, depois o que declararam sobre ele. */
const SENTIDOS_DE_LEITURA: readonly boolean[] = [false, true]

/**
 * As seções do balão para as ligações de um componente.
 *
 * Blocos antes de verbos: TODAS as seções do sentido direto (o que este
 * componente declara) vêm antes das invertidas (o que declararam sobre ele) —
 * é a leitura que as duas seções fixas já tinham, e mantém junto o que o
 * usuário controla editando ESTA linha do catálogo. Dentro de cada bloco, a
 * ordem é a do vocabulário; dentro de cada seção, a ordem em que as arestas
 * chegaram.
 *
 * Verbo sem nenhuma aresta não vira seção vazia: o balão de um componente sem
 * ligação nenhuma volta uma lista vazia, e quem desenha mostra a mensagem de
 * "sem conexões" que já existe.
 */
export function agruparLigacoesPorVerbo(
  ligacoes: readonly Ligacao[],
  verbos: readonly VerboDef[],
): SecaoDeLigacoes[] {
  const ordem = ordemDosVerbos(ligacoes, verbos)
  const secoes: SecaoDeLigacoes[] = []
  for (const invertida of SENTIDOS_DE_LEITURA) {
    for (const label of ordem) {
      const itens = ligacoes.filter((l) => l.label === label && l.invertida === invertida)
      if (itens.length === 0) continue
      secoes.push({
        chave: chaveDaSecao(label, invertida),
        titulo: tituloDaSecao(tituloDoVerbo(verbos, label), invertida),
        invertida,
        itens,
      })
    }
  }
  return secoes
}
