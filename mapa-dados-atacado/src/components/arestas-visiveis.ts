// QUAIS ARESTAS O MAPA DESENHA — o chip por verbo, o destaque de primeiro
// nível e o "Mostrar ligações", num lugar só, sem React e sem canvas.
//
// Nenhuma das três esconde NÓ: esconder uma ligação não tira ninguém do mapa.
// Mas as três respondem a perguntas diferentes, e a ordem entre elas importa.
//
//   1. O CHIP diz de que TIPO de ligação se quer falar. É um recorte do
//      ASSUNTO — "me mostre só o que este Job envia" — e vale sempre, inclusive
//      sobre o nó em destaque: se fosse ao contrário, o hover ressuscitaria
//      justamente a aresta que o usuário acabou de tirar da tela, e o chip
//      pareceria não funcionar.
//
//   2. O DESTAQUE diz onde o usuário está olhando AGORA. Com âncora ativa
//      (cursor sobre um nó, nó no rastro fixado ou balão aberto), só se desenha
//      o que ENCOSTA numa âncora; o resto some — some mesmo, não esmaece. Nos
//      NÓS a regra do primeiro nível esmaece (ver vizinhanca-destacada.ts);
//      aqui ela apaga, porque aresta esmaecida vira um risco cinza que ninguém
//      lê, e era o emaranhado de linhas o ruído que se queria tirar da frente.
//
//   3. O "MOSTRAR LIGAÇÕES" diz como o mapa fica EM REPOUSO, quando o usuário
//      não está apontando para nada: ligado, a teia inteira; desligado, só os
//      nós, e a aresta aparece quando (e onde) ele for procurá-la.
//
// POR QUE O DESTAQUE VEM ANTES DO TOGGLE, e por que isso não os torna
// redundantes: os dois nunca são consultados no mesmo instante. O toggle é uma
// PREFERÊNCIA de repouso, deixada de pé; o destaque é um GESTO em curso. Um
// gesto que o usuário está fazendo neste segundo é sempre mais específico que
// uma opção marcada dez minutos atrás, então ele decide enquanto durar — e
// quando acaba, o toggle volta a valer sozinho, sem nada a desfazer.
//
// Sobra ao toggle um trabalho que o destaque não faz e não pode fazer: escolher
// entre dois modos de leitura do mapa. Ligado, o mapa em repouso é a teia toda
// e o destaque NARRA um pedaço dela. Desligado, o mapa em repouso é um quadro
// de componentes limpo e o destaque REVELA as ligações, uma vizinhança por
// gesto — que, com o rastro acumulando por clique, é literalmente montar na
// tela o subgrafo que se quer olhar, aresta por aresta. São duas experiências
// diferentes, e é o toggle que escolhe qual delas se está tendo.

/** O que a tela decidiu sobre as arestas, no momento do desenho. */
export interface EstadoDasArestas {
  /** "Mostrar ligações": vale EM REPOUSO, quando não há destaque nenhum.
   *  Ligado, a teia inteira; desligado, o mapa fica só com os nós. */
  ligacoesOn: boolean
  /** Slugs de verbo com o chip APAGADO. Guardar os OCULTOS (e não os visíveis)
   *  é o que faz um verbo recém-cadastrado na tela "⇢ Verbos" já nascer
   *  visível: o vocabulário é dado editável, e uma lista de visíveis
   *  congelaria a tela no vocabulário do momento em que ela montou. */
  verbosOcultos: ReadonlySet<string>
  /** Há alguma âncora de destaque (hover, rastro fixado ou balão aberto). */
  temDestaque: boolean
}

/**
 * Esta aresta aparece?
 *
 * `encostaNoDestaque` é "uma das duas pontas é uma âncora" — o primeiro nível
 * de ligação, exatamente o mesmo conjunto que embranquece e engrossa no
 * desenho e que ganha o rótulo do verbo. Só é consultado quando há destaque; em
 * repouso ele não quer dizer nada.
 *
 * O ESMAECIMENTO POR FILTRO não entra aqui de propósito. Filtro esmaece, nunca
 * apaga — nem nó, nem aresta —, e a aresta que chega a um componente esmaecido
 * é desenhada em tinta fraca (`linkColor`), acompanhando quem ela liga. Se ela
 * sumisse, o nó recuado pelo filtro ficaria solto no mapa, sem nada explicando
 * de onde ele vem, e o filtro passaria a decidir topologia.
 */
export function arestaVisivel(
  estado: EstadoDasArestas,
  label: string,
  encostaNoDestaque: boolean,
): boolean {
  if (estado.verbosOcultos.has(label)) return false
  if (estado.temDestaque) return encostaNoDestaque
  return estado.ligacoesOn
}

/** Conjunto com o verbo alternado — o clique do chip. */
export function comVerboAlternado(
  ocultos: ReadonlySet<string>,
  slug: string,
): ReadonlySet<string> {
  const proximo = new Set(ocultos)
  if (proximo.has(slug)) proximo.delete(slug)
  else proximo.add(slug)
  return proximo
}
