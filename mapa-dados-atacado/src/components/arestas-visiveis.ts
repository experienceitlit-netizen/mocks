// QUAIS ARESTAS O MAPA DESENHA — a regra do "Mostrar ligações" e a dos chips
// por verbo, num lugar só, sem React e sem canvas.
//
// Os dois controles são a mesma natureza (visibilidade de ARESTA, nunca de nó:
// esconder uma ligação não tira ninguém do mapa), mas respondem a perguntas
// diferentes, e a ordem entre eles importa:
//
//   o CHIP diz de que TIPO de ligação se quer falar. É um recorte do assunto —
//     "me mostre só o que este Job envia" —, e vale sempre;
//   o TOGGLE diz se as ligações aparecem TODAS ou só as do componente em
//     destaque. É um recorte de ruído, e é ele que cede: com um verbo desligado
//     no chip, nem a aresta do nó sob o cursor volta.
//
// Se fosse ao contrário, o hover ressuscitaria justamente a aresta que o
// usuário acabou de tirar da tela, e o chip pareceria não funcionar.

/** O que a tela decidiu sobre as arestas, no momento do desenho. */
export interface EstadoDasArestas {
  /** "Mostrar ligações": desligado, só as do componente em destaque ficam. */
  ligacoesOn: boolean
  /** Slugs de verbo com o chip APAGADO. Guardar os OCULTOS (e não os visíveis)
   *  é o que faz um verbo recém-cadastrado na tela "⇢ Verbos" já nascer
   *  visível: o vocabulário é dado editável, e uma lista de visíveis
   *  congelaria a tela no vocabulário do momento em que ela montou. */
  verbosOcultos: ReadonlySet<string>
  /** Há componente em destaque (hover, clique fixado ou balão aberto). */
  temDestaque: boolean
}

/** Esta aresta aparece?
 *
 *  `pontasAcesas` é "nenhuma das duas pontas está esmaecida" — a MESMA leitura
 *  que o esmaecimento usa, para a aresta acender junto com os nós que ela liga
 *  em vez de ter um critério só dela. */
export function arestaVisivel(
  estado: EstadoDasArestas,
  label: string,
  pontasAcesas: boolean,
): boolean {
  if (estado.verbosOcultos.has(label)) return false
  if (estado.ligacoesOn) return true
  return estado.temDestaque && pontasAcesas
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
