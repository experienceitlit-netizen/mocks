// QUAIS GALHOS DA LINHAGEM ESTÃO ABERTOS — a lógica do recolher/expandir da
// árvore do balão, sem React.
//
// A árvore de linhagem cresce rápido: uma cadeia de dez saltos com dois ou três
// consumos por salto vira uma parede de texto dentro de um balão que tem meia
// tela de altura. Recolhida, ela volta a ser navegável — abre-se um galho de
// cada vez até chegar na ponta que interessa.
//
// O ESTADO É INDEXADO PELO CAMINHO, NÃO PELO ID DO COMPONENTE. Isso não é
// preciosismo: buildLineageTree MEMOIZA as entradas (ver o mapa `entries` em
// lineage.ts), então um componente que várias cadeias consomem — uma tabela
// Bronze compartilhada, por exemplo — é literalmente o MESMO objeto
// LineageEntry em cada galho onde aparece. Indexando por id (ou pela identidade
// do objeto), abrir uma ocorrência abriria todas as outras de uma vez, que é
// justamente a parede de texto que se está tentando evitar. O caminho até o
// galho é o que distingue duas ocorrências do mesmo componente, e é ele que
// vira chave.
//
// Fechar um galho NÃO esquece o que havia dentro dele: os caminhos dos
// descendentes continuam no conjunto. É de propósito — quem fechou um ramo para
// olhar o vizinho e voltou encontra a leitura onde deixou.

/** Chave de um galho: a sequência de posições da raiz até ele. Opaca para quem
 *  usa — só se constrói com {@link caminhoFilho}, a partir de CAMINHO_RAIZ. */
export type CaminhoRamo = string

/** O galho do componente de que o balão fala. */
export const CAMINHO_RAIZ: CaminhoRamo = 'raiz'

/**
 * Caminho de um filho, dado o do pai.
 *
 * A POSIÇÃO entra na chave junto com o id porque duas arestas podem levar ao
 * mesmo componente a partir do mesmo pai (consumo declarado duas vezes na
 * planilha); só o índice separa as duas linhas que a árvore desenha. O id vai
 * junto por legibilidade — a chave é o que se lê ao depurar.
 */
export function caminhoFilho(pai: CaminhoRamo, i: number, id: string): CaminhoRamo {
  return `${pai}/${i}:${id}`
}

/**
 * Como a árvore nasce: só a raiz aberta, ou seja, o componente do balão e as
 * dependências DIRETAS dele à vista, e todo o resto recolhido.
 *
 * É o pedido ao pé da letra ("vou abrindo cada nível até chegar no último"), e
 * é o único estado inicial que tem tamanho previsível: qualquer coisa que abra
 * mais de um nível de saída depende da forma do catálogo, e volta a ser uma
 * parede de texto no dia em que uma cadeia crescer.
 */
export const RAMOS_INICIAIS: ReadonlySet<CaminhoRamo> = new Set([CAMINHO_RAIZ])

export function ramoAberto(abertos: ReadonlySet<CaminhoRamo>, caminho: CaminhoRamo): boolean {
  return abertos.has(caminho)
}

/** Conjunto com o galho invertido. Sempre um conjunto NOVO: é estado de React,
 *  e mutar o que está em uso não re-renderiza nada. */
export function comRamoAlternado(
  abertos: ReadonlySet<CaminhoRamo>,
  caminho: CaminhoRamo,
): ReadonlySet<CaminhoRamo> {
  const proximo = new Set(abertos)
  if (!proximo.delete(caminho)) proximo.add(caminho)
  return proximo
}

/**
 * O que a alça do galho promete a quem clica.
 *
 * A contagem existe porque um triângulo sozinho não diz que HÁ algo escondido
 * ali — e um galho fechado, na árvore recolhida, é indistinguível de uma ponta
 * de cadeia. O número é o de dependências DIRETAS: é exatamente quantas linhas
 * o clique revela, uma promessa que o clique cumpre. O total da sub-árvore
 * seria um número maior e mais impressionante, mas mentiria duas vezes — não é
 * o que o clique mostra, e a repetição entre galhos irmãos o infla.
 */
export function rotuloDoRamo(nome: string, quantidade: number, aberto: boolean): string {
  const verbo = aberto ? 'Esconder' : 'Mostrar'
  const dependencias = quantidade === 1 ? '1 dependência' : `${quantidade} dependências`
  return `${verbo} ${dependencias} de ${nome}`
}
