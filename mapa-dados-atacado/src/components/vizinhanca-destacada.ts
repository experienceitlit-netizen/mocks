// O QUE O DESTAQUE FAZ COM O MAPA — a regra do "só até o primeiro nível".
//
// Com um componente em destaque (o cursor em cima, o clique fixado no rastro ou
// o balão aberto), o mapa acende ELE e os VIZINHOS DIRETOS dele; o resto da
// vista ESMAECE. Ninguém sai da tela: o componente a dois passos continua
// desenhado, no lugar dele, pronto para receber o próximo gesto — foi
// justamente o que derrubou a versão que OCULTAVA o segundo nível. Ali o mapa
// piscava ao cruzar o vazio (o cursor saía do nó, tudo voltava, entrava no
// seguinte e tudo sumia de novo), um nó de grau baixo deixava a tela quase
// vazia, e não dava nem para mirar no vizinho seguinte porque ele não estava
// mais lá.
//
// A regra do primeiro nível não morreu com a ocultação — ela MUDOU DE ALVO:
//
//   nos NÓS ela esmaece (o que passa do primeiro nível continua na tela, só
//     recuado), e é a mesma tinta que o filtro usa;
//   nas ARESTAS ela apaga de verdade (arestas-visiveis.ts): com destaque ativo,
//     só se desenha o que ENCOSTA numa âncora. Aresta esmaecida vira um risco
//     cinza que ninguém lê, e o emaranhado de linhas era o ruído que o pedido
//     original queria tirar da frente. Nó apagado é perda de contexto; aresta
//     apagada é ganho de silêncio.
//
// ESMAECER POR FILTRO E ESMAECER POR DESTAQUE continuam sendo contas separadas,
// e é por isso que este módulo existe fora do cálculo dos filtros:
//
//   o FILTRO responde "isto me interessa?" — é uma escolha que fica de pé;
//   o DESTAQUE responde "estou olhando aqui" — é o gesto do instante.
//
// Fundir os dois num conjunto só (como era antes) obrigava o destaque a ANULAR
// o filtro enquanto valesse, porque o mesmo conjunto não sabe dizer se um id
// está lá por não interessar ou por estar longe. Separados, os dois convivem:
// com "Somente sem owner" ligado, um vizinho que TEM owner aparece esmaecido
// dentro da vizinhança acesa, e o mapa continua respondendo às duas perguntas
// ao mesmo tempo.
//
// O RASTRO: o clique esquerdo ACUMULA. Cada nó fixado ACRESCENTA a vizinhança
// dele ao que já está aceso, em vez de substituir — é o que deixa perseguir uma
// trilha inteira, um componente por vez, sem perder o caminho andado. Um
// segundo clique no mesmo nó tira aquela vizinhança de volta (o mesmo toggle
// que o clique sempre teve), e o rastro inteiro se solta de uma vez no clique
// no fundo, no Esc ou no ✕ da barra.
//
// O que NÃO é decidido aqui: quem ENTRA na vista. Isso é do foco e do alcance
// (lineage.ts), e chega pronto em `idsNaVista`. Esta regra é sobre o que fica
// em evidência DENTRO dela.

/**
 * As ÂNCORAS do destaque: todo componente que, agora, o mapa trata como "estou
 * olhando aqui".
 *
 * São três origens, e elas se SOMAM em vez de disputarem precedência — o que é
 * a mudança que o rastro trouxe. O hover não substitui mais o fixado: ele
 * acrescenta a vizinhança dele por cima, enquanto o cursor estiver lá, e some
 * sozinho ao sair sem tocar no rastro. Assim o gesto momentâneo espia o passo
 * seguinte sem comprometer o caminho já montado.
 *
 * Id que não está na vista não ancora nada: o balão pode ficar aberto num
 * componente que o foco atual não mostra, e ancorar o mapa num nó que não está
 * na tela esmaeceria tudo em nome de um ausente.
 */
export function ancorasDoDestaque(
  hoverId: string | null,
  fixadosIds: Iterable<string>,
  selectedId: string | null,
  idsNaVista: ReadonlySet<string>,
): Set<string> {
  const ancoras = new Set<string>()
  for (const id of fixadosIds) if (idsNaVista.has(id)) ancoras.add(id)
  for (const id of [hoverId, selectedId]) {
    if (id !== null && idsNaVista.has(id)) ancoras.add(id)
  }
  return ancoras
}

/**
 * O conjunto ACESO: as âncoras mais os vizinhos de primeiro nível delas que
 * estão na vista.
 *
 * "Vizinho" é qualquer ponta do outro lado de uma aresta declarada, em qualquer
 * sentido e com qualquer verbo — inclusive os que não conduzem dado. A aresta
 * está desenhada na tela; recuar a ponta dela seria desenhar uma ligação que
 * chega a um componente apagado.
 *
 * O primeiro nível é de CADA âncora, não do conjunto: duas âncoras vizinhas uma
 * da outra não somam alcance. É o que impede o rastro de virar, depois de
 * alguns cliques, um fecho transitivo que acende o grafo inteiro.
 */
export function vizinhancaDoDestaque(
  ancoras: ReadonlySet<string>,
  vizinhosById: ReadonlyMap<string, ReadonlySet<string>>,
  idsNaVista: ReadonlySet<string>,
): Set<string> {
  const acesos = new Set<string>()
  for (const ancora of ancoras) {
    if (!idsNaVista.has(ancora)) continue
    acesos.add(ancora)
    for (const viz of vizinhosById.get(ancora) ?? []) {
      if (idsNaVista.has(viz)) acesos.add(viz)
    }
  }
  return acesos
}

/**
 * O que o destaque RECUA: tudo que está na vista e fora da vizinhança acesa.
 *
 * Sem âncora nenhuma, conjunto vazio — o mapa inteiro continua em tinta cheia.
 * É a regra que faz o mapa voltar sozinho quando o cursor sai do nó e o rastro
 * está vazio, sem nenhum estado a desfazer.
 */
export function foraDoDestaque(
  ancoras: ReadonlySet<string>,
  vizinhosById: ReadonlyMap<string, ReadonlySet<string>>,
  idsNaVista: ReadonlySet<string>,
): Set<string> {
  const acesos = vizinhancaDoDestaque(ancoras, vizinhosById, idsNaVista)
  if (acesos.size === 0) return new Set()
  return new Set([...idsNaVista].filter((id) => !acesos.has(id)))
}

/**
 * O clique esquerdo num nó: acrescenta o componente ao rastro, ou o retira se
 * ele já estava lá.
 *
 * É o mesmo gesto de sempre — o clique já alternava, só que sobre um id só.
 * Alternar (em vez de só somar) é o que torna o rastro CORRIGÍVEL: quem
 * acrescentou o vizinho errado tira ele de volta com o mesmo clique, sem perder
 * os outros seis passos da trilha.
 *
 * Gêmeo de `comVerboAlternado` (arestas-visiveis.ts), de propósito: são os dois
 * conjuntos que o mapa acumula por clique, e alternar é o que os dois fazem.
 */
export function comNoAlternado(rastro: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const proximo = new Set(rastro)
  if (proximo.has(id)) proximo.delete(id)
  else proximo.add(id)
  return proximo
}

/**
 * O único componente do rastro, quando há exatamente um — senão, null.
 *
 * Serve ao atalho de exclusão (delete-shortcut.ts), que precisa de UM alvo. Com
 * o rastro acumulado não existe "o componente em evidência": há seis, e nenhum
 * é mais o alvo que o outro. Devolver o último fixado apagaria uma linha do
 * catálogo por causa da ordem em que a trilha foi montada, que é a coisa mais
 * arbitrária possível para uma tecla destrutiva. Sem um só, o atalho não age —
 * quem quer excluir abre o balão do componente (o clique direito), e aí o alvo
 * é explícito.
 */
export function umSoFixado(rastro: ReadonlySet<string>): string | null {
  if (rastro.size !== 1) return null
  for (const id of rastro) return id
  return null
}
