// MOVER UMA FAIXA DE NÍVEL PELO CABEÇALHO — a lógica pura do gesto, sem React e
// sem canvas.
//
// Terceiro irmão de node-resize.ts e band-resize.ts, com a mesma filosofia: o
// que decide alguma coisa mora aqui e é testado aqui, o duplo clique na alça
// restaura, e nada disso sai da sessão — o F5 desfaz, como no redimensionar.
//
// O QUE MUDA EM RELAÇÃO AO REDIMENSIONAR. O gesto anda nos DOIS eixos, e cada
// eixo quer dizer uma coisa diferente, porque só um deles tem FLUXO:
//
//   HORIZONTAL = REORDENA, dentro do fluxo. As colunas são uma sequência — a
//     ordem das faixas É a ordem dos níveis, da esquerda para a direita —,
//     então arrastar na horizontal não pode "largar a faixa num x qualquer":
//     ou ela está numa posição da sequência, ou está em outra. Quando o centro
//     da faixa arrastada cruza o centro de uma vizinha, as duas trocam de lugar
//     e as demais se acomodam; ao soltar, ela encaixa. É o gesto de arrastar
//     aba de navegador. Que nunca sobre buraco nem sobreposição não é uma
//     verificação depois do fato: quem posiciona continua sendo
//     geometriaDasFaixas, que só sabe empilhar faixas lado a lado.
//
//   VERTICAL = DESLOCAMENTO LIVRE. Não existe fluxo vertical: cada coluna se
//     centra na altura do próprio conteúdo e nada depende de duas colunas
//     estarem alinhadas. Aqui o arraste é offset puro, para escalonar as faixas
//     ou destacar uma delas.
//
// A ALÇA É O CABEÇALHO, não o corpo da faixa. O corpo é onde se arrasta o MAPA
// (o pan), que é o gesto mais usado da tela — roubá-lo custaria muito mais do
// que este gesto rende. O cabeçalho é uma faixa estreita, com o título do nível
// dentro, que hoje não serve para nada: é a barra de título de uma janela, e a
// mão já sabe o que fazer com ela.
//
// A ORDEM DE SESSÃO é uma sequência de slugs de NÍVEL, não de colunas. A
// diferença importa: as colunas presentes mudam com o foco (focar num
// componente mostra só a sub-árvore dele) e com o catálogo, e se a ordem
// guardasse só o que está na tela, entrar e sair do foco apagaria metade do
// arranjo. Guardando a sequência inteira dos níveis, o que está na tela é
// sempre uma projeção dela — ver ordenarPorSessao.
import { geometriaDasFaixas } from './band-resize'
import type { FaixaAjustada } from './band-resize'
import type { SimNode } from './graph-types'
import { nivelDe } from './graph-types'

/** Altura da ALÇA, em unidades de grafo, medida do topo da faixa para baixo.
 *
 *  28 é o que cabe entre o topo da faixa e o desenho do primeiro nó: o título é
 *  escrito em `topo + 10` com 11 unidades de altura, e o padding do topo
 *  (BAND_PAD_TOP = 46) menos estes 28 deixa 18 até o CENTRO do primeiro nó —
 *  mais que a extensão do nó comum (EXTENT_COBERTO = 16), então a alça termina
 *  antes de a silhueta começar. Nó maior que isso empurra o topo da faixa para
 *  cima na mesma medida (ver topoDaFaixa), e a folga se mantém. */
export const ALTURA_CABECALHO = 28

/** Limite do deslocamento vertical, em unidades de grafo (para cima e para
 *  baixo).
 *
 *  O gesto é para ESCALONAR faixas — desencostar uma coluna das vizinhas para a
 *  leitura respirar —, não para mandar uma faixa para longe: 500 é mais de
 *  sete passos verticais entre nós (NIVEIS_ROW_Y = 70), o suficiente para
 *  qualquer escalonamento que ainda se leia como um mapa só, e pouco o bastante
 *  para um puxão forte não jogar a coluna para fora do enquadramento. */
export const DESLOC_MAX = 500

/** Deslocamento de quem ninguém moveu. Uma faixa nesse valor NÃO fica no mapa —
 *  "nenhuma faixa deslocada" é sempre um mapa vazio (ver comDeslocamento). */
export const SEM_DESLOCAMENTO = 0

/** Diferença abaixo da qual dois deslocamentos são o mesmo — evita gravar
 *  estado novo (e reposicionar tudo) a cada pixel de mouse. O mesmo papel do
 *  EPSILON de node-resize.ts, na escala de unidades de grafo. */
const EPSILON = 0.25

/** Deslocamento dentro do limite; valor inválido volta a zero. */
export function clampDeslocamento(dy: number): number {
  if (!Number.isFinite(dy)) return SEM_DESLOCAMENTO
  return Math.min(DESLOC_MAX, Math.max(-DESLOC_MAX, dy))
}

/** Deslocamento em vigor para um nível; ausente do mapa = no lugar. */
export function deslocamentoDe(
  deslocamentos: ReadonlyMap<string, number>,
  slug: string,
): number {
  return clampDeslocamento(deslocamentos.get(slug) ?? SEM_DESLOCAMENTO)
}

/** Mapa de deslocamentos com `slug` no valor dado. Mesmo contrato de
 *  comFatorDaFaixa: devolve o MESMO mapa quando nada muda de fato e apaga a
 *  entrada quando a faixa volta ao lugar, para `size === 0` significar sempre
 *  "nenhuma faixa deslocada". */
export function comDeslocamento(
  deslocamentos: ReadonlyMap<string, number>,
  slug: string,
  dy: number,
): ReadonlyMap<string, number> {
  const alvo = clampDeslocamento(dy)
  if (Math.abs(deslocamentoDe(deslocamentos, slug) - alvo) < EPSILON) return deslocamentos
  const proximo = new Map(deslocamentos)
  if (Math.abs(alvo) < EPSILON) proximo.delete(slug)
  else proximo.set(slug, alvo)
  return proximo
}

/**
 * Empurrão horizontal TEMPORÁRIO da faixa que está sob a mão: a distância entre
 * onde ela é desenhada e a posição que ela já ocupa na sequência.
 *
 * Existe só enquanto o gesto corre, e é o que faz a faixa arrastada seguir o
 * cursor DEPOIS de as outras já terem se acomodado — sem ele, a faixa saltaria
 * de posição em posição e a mão perderia o que está segurando. Morre no soltar,
 * e é por isso que ele não entra no mapa de deslocamentos: aquilo é layout,
 * isto é o gesto.
 */
export interface ArrasteDeFaixa {
  slug: string
  /** Em unidades de grafo. */
  dx: number
}

/** Arraste novo, ou o MESMO objeto quando o empurrão não mudou o bastante para
 *  valer um render (mesmo contrato dos mapas acima). */
export function comArraste(
  atual: ArrasteDeFaixa | null,
  proximo: ArrasteDeFaixa | null,
): ArrasteDeFaixa | null {
  if (atual === null || proximo === null) return atual === proximo ? atual : proximo
  if (atual.slug !== proximo.slug) return proximo
  return Math.abs(atual.dx - proximo.dx) < EPSILON ? atual : proximo
}

/** Duas sequências com os mesmos slugs, na mesma ordem? */
export function mesmaOrdem(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((slug, i) => slug === b[i])
}

/** `ordem` com as posições de `i` e `j` trocadas. */
function trocadas(ordem: readonly string[], i: number, j: number): string[] {
  const proxima = [...ordem]
  proxima[i] = ordem[j]
  proxima[j] = ordem[i]
  return proxima
}

/**
 * A ordem em que as faixas de `base` aparecem, dada a ordem de sessão.
 *
 * `sessao` é a sequência COMPLETA dos níveis e `base` é o que está na tela
 * agora (as colunas presentes) — o resultado é a projeção de uma na outra. É o
 * que faz o arranjo sobreviver a entrar e sair do foco: as colunas somem e
 * voltam, a sequência guardada continua inteira.
 *
 * Slug de `base` que a sessão não conhece (nível criado depois do arraste, ou
 * ordem de sessão montada quando ele ainda não existia) entra no FIM: ele não
 * tinha lugar numa sequência anterior a ele, e o fim é onde fica visível para o
 * usuário arrastá-lo — ou desistir da ordem de sessão inteira.
 */
export function ordenarPorSessao(
  base: readonly string[],
  sessao: readonly string[] | null,
): readonly string[] {
  if (sessao === null) return base
  const naBase = new Set(base)
  const naSessao = new Set(sessao)
  const conhecidos = sessao.filter((slug) => naBase.has(slug))
  const novos = base.filter((slug) => !naSessao.has(slug))
  // Identidade preservada quando a sessão já descreve exatamente esta base: os
  // memos do App dependem disso para não refazer o layout à toa.
  if (novos.length === 0 && conhecidos.length === sessao.length) return sessao
  return [...conhecidos, ...novos]
}

/**
 * A ordem de sessão saneada contra a ordem SALVA (a do catálogo), ou null
 * quando ela deixou de ter o que dizer.
 *
 * Faz três coisas de uma vez, e as três são a mesma coisa vista de ângulos
 * diferentes — "a ordem de sessão é o que difere da salva":
 *
 *   • nível excluído no modal sai da sequência (o irmão de podadasPorSlug);
 *   • nível criado depois entra no fim (ver ordenarPorSessao);
 *   • e quando o que sobra é a própria ordem salva, a ordem de sessão SOME —
 *     seja porque o usuário arrastou a faixa de volta, seja porque ele mandou
 *     APLICAR a ordem e ela virou a ordem de verdade. É daqui que sai o "depois
 *     de salvar tudo se normaliza sozinho": ninguém precisa limpar nada à mão.
 */
export function ordemAtualizada(
  salva: readonly string[],
  sessao: readonly string[] | null,
): readonly string[] | null {
  if (sessao === null) return null
  const efetiva = ordenarPorSessao(salva, sessao)
  return mesmaOrdem(efetiva, salva) ? null : efetiva
}

/**
 * `cheia` com as posições ocupadas pelos slugs de `parcial` preenchidas na
 * ordem de `parcial`; o resto fica onde estava.
 *
 * É como uma reordenação de PARTE das colunas se escreve na sequência inteira
 * dos níveis: o arraste só conhece as colunas que estão na tela, e os níveis
 * que não viraram coluna (nenhum componente neles, ou fora do foco atual) não
 * podem ser embaralhados por um gesto que não os enxergou.
 */
export function ordemMesclada(
  cheia: readonly string[],
  parcial: readonly string[],
): string[] {
  const naCheia = new Set(cheia)
  const fila = parcial.filter((slug) => naCheia.has(slug))
  const naFila = new Set(fila)
  let k = 0
  return cheia.map((slug) => (naFila.has(slug) ? fila[k++] : slug))
}

/**
 * A ordem depois de arrastar `slug` até que o centro dele fique em `centro`.
 *
 * A regra é a do requisito, ao pé da letra: enquanto o centro da faixa
 * arrastada estiver além do centro da vizinha na direção em que a mão anda, as
 * duas trocam de lugar. É um laço, e não uma troca só, porque um puxão rápido
 * cruza várias colunas entre dois eventos de mouse.
 *
 * A geometria é refeita a cada troca porque as faixas têm larguras diferentes:
 * trocar com uma vizinha larga muda o centro de todo mundo dali para a direita,
 * inclusive o da vizinha SEGUINTE, que é quem decide a troca seguinte.
 *
 * NÃO OSCILA, e isso é uma propriedade da geometria, não um cuidado extra:
 * depois de trocar com a vizinha, ela passa a ocupar o lugar que era da faixa
 * arrastada, que começa mais atrás na direção de onde viemos — logo o centro
 * dela recua, e a condição de voltar nunca é satisfeita pelo próprio movimento
 * que acabou de acontecer. O teto do laço é a defesa contra o impossível.
 *
 * Devolve o MESMO array quando nada troca (soltar onde pegou é o caso comum).
 */
export function ordemAoArrastar(
  ordem: readonly string[],
  larguras: ReadonlyMap<string, number>,
  slug: string,
  centro: number,
): readonly string[] {
  let atual = ordem
  for (let passo = 0; passo < ordem.length; passo++) {
    const geoms = geometriaDasFaixas(atual, larguras)
    const i = geoms.findIndex((g) => g.slug === slug)
    if (i < 0) return atual
    const direcao = centro > geoms[i].x ? 1 : centro < geoms[i].x ? -1 : 0
    if (direcao === 0) return atual
    const alvo = i + direcao
    if (alvo < 0 || alvo >= geoms.length) return atual
    const cruzou = direcao > 0 ? centro > geoms[alvo].x : centro < geoms[alvo].x
    if (!cruzou) return atual
    atual = trocadas(atual, i, alvo)
  }
  return atual
}

/**
 * `ordem` com `slug` de volta ao lugar que ele tem na ordem SALVA — o que o
 * duplo clique no cabeçalho desfaz, junto com o deslocamento vertical.
 *
 * "O lugar dele" é relativo, não um índice: as outras faixas podem estar
 * embaralhadas, e aí nenhum índice agrada a todas as vizinhas. A promessa
 * possível — e a que este código cumpre — é que ela volte a ficar ANTES de
 * todas as que a sucedem no catálogo; ficar depois das que a precedem é
 * consequência quando elas próprias estão no lugar, e não quando não estão. É o
 * mesmo critério do gesto: ninguém arrasta uma faixa para um índice, arrasta
 * para o lado de outra.
 */
export function ordemRestaurada(
  salva: readonly string[],
  ordem: readonly string[],
  slug: string,
): string[] {
  const sem = ordem.filter((s) => s !== slug)
  const iSalvo = salva.indexOf(slug)
  if (iSalvo < 0) return sem
  const pos = sem.findIndex((s) => {
    const i = salva.indexOf(s)
    return i >= 0 && i > iSalvo
  })
  if (pos < 0) return [...sem, slug]
  return [...sem.slice(0, pos), slug, ...sem.slice(pos)]
}

/** Colunas na ordem de sessão. Sem ordem de sessão, o array recebido — mesma
 *  identidade, para o layout não se refazer à toa. */
export function reordenarColunas<T extends { slug: string }>(
  columns: readonly T[],
  sessao: readonly string[] | null,
): readonly T[] {
  if (sessao === null) return columns
  const ordem = ordenarPorSessao(
    columns.map((c) => c.slug),
    sessao,
  )
  const porSlug = new Map(columns.map((c) => [c.slug, c]))
  const reordenadas: T[] = []
  for (const slug of ordem) {
    const col = porSlug.get(slug)
    if (col !== undefined) reordenadas.push(col)
  }
  return reordenadas
}

/**
 * O y de origem de cada nó, tirado UMA vez por linhagem.
 *
 * aplicarDeslocamentos escreve o y ABSOLUTO (base + deslocamento), como
 * aplicarLarguras faz com o x — e por isso precisa da base intacta. Somar o
 * deslocamento ao y que estiver no nó seria acumular a cada quadro do arraste,
 * porque os nós são objetos mutados no lugar e sobrevivem entre renders. Quem
 * chama tem de capturar isto ANTES do primeiro deslocamento, junto com a
 * linhagem.
 */
export function basesVerticais(nodes: readonly SimNode[]): Map<string, number> {
  return new Map(nodes.map((n) => [n.id, n.y ?? 0]))
}

/**
 * Recoloca faixas e nós segundo os deslocamentos da sessão e o arraste em curso.
 *
 * É o ÚLTIMO passo do layout, depois de reordenar e de aplicar as larguras — e
 * é nessa ordem de propósito: o deslocamento é um offset sobre onde o fluxo
 * colocou a faixa, então redimensionar uma coluna qualquer (que empurra as
 * seguintes) não pode comer o deslocamento de quem já foi movido. Aplicando por
 * último, ele sobrevive a qualquer coisa que aconteça antes.
 *
 * O y é escrito absoluto (base + deslocamento) para o gesto ser idempotente; o
 * x só recebe o empurrão do arraste, porque aplicarLarguras acabou de escrever
 * o x absoluto de cada coluna e é dele que partimos.
 */
export function aplicarDeslocamentos(
  columns: FaixaAjustada[],
  nodes: readonly SimNode[],
  yBase: ReadonlyMap<string, number>,
  deslocamentos: ReadonlyMap<string, number>,
  arraste: ArrasteDeFaixa | null,
): FaixaAjustada[] {
  // O laço dos nós roda SEMPRE, mesmo sem nada deslocado: é ele que devolve ao
  // lugar os nós da faixa que acabou de voltar a zero (duplo clique, ou o botão
  // de restaurar). Sair cedo aqui deixaria a coluna no lugar antigo.
  for (const n of nodes) {
    const base = yBase.get(n.id)
    if (base === undefined) continue
    const dy = deslocamentoDe(deslocamentos, nivelDe(n))
    n.y = base + dy
    n.fy = n.y
    if (arraste !== null && nivelDe(n) === arraste.slug) {
      n.x = (n.x ?? 0) + arraste.dx
      n.fx = n.x
    }
  }
  if (deslocamentos.size === 0 && arraste === null) return columns
  return columns.map((col) => {
    const dy = deslocamentoDe(deslocamentos, col.slug)
    const dx = arraste !== null && arraste.slug === col.slug ? arraste.dx : 0
    if (dy === 0 && dx === 0) return col
    return { ...col, x: col.x + dx, yMin: col.yMin + dy, yMax: col.yMax + dy }
  })
}

/**
 * Os níveis com a coluna `ordem` reescrita para valer a sequência dada — o que
 * o botão "aplicar esta ordem" grava no niveis.csv.
 *
 * Cada POSIÇÃO da lista guarda o número de ordem que já tinha, e os níveis é
 * que rodam entre as posições. É o que preserva a numeração de quem escreve
 * ordem 10/20/30 na planilha (ou o 43/44/45 que o catálogo tem hoje): aplicar
 * uma ordem nova é uma permutação, não uma renumeração.
 *
 * Nível fora de `ordem` — o que não virou coluna, porque nenhum componente está
 * nele — fica exatamente onde estava, entre os mesmos vizinhos: um gesto que
 * não o enxergou não tem por que mexer nele.
 */
export function niveisReordenados<T extends { slug: string; ordem: number }>(
  niveis: readonly T[],
  ordem: readonly string[],
): T[] {
  const ordenados = [...niveis].sort((a, b) => a.ordem - b.ordem)
  const porSlug = new Map(ordenados.map((nv) => [nv.slug, nv]))
  const fila = ordem.filter((slug) => porSlug.has(slug))
  const naFila = new Set(fila)
  let k = 0
  return ordenados.map((atual) => {
    if (!naFila.has(atual.slug)) return atual
    const novo = porSlug.get(fila[k++])
    return novo === undefined ? atual : { ...novo, ordem: atual.ordem }
  })
}

/** Área da ALÇA de uma faixa, em unidades de grafo. */
export interface AreaDeCabecalho {
  slug: string
  esquerda: number
  direita: number
  topo: number
}

/**
 * Índice da faixa cujo CABEÇALHO está sob o ponto (unidades de grafo), ou -1.
 *
 * Da última para a primeira porque, durante o arraste, a faixa sob a mão passa
 * por cima das vizinhas — e quem está desenhado por cima é quem pega, que é a
 * regra que o olho já aplicou antes de a mão chegar.
 */
export function cabecalhoSob(
  areas: readonly AreaDeCabecalho[],
  ponto: { x: number; y: number },
): number {
  for (let i = areas.length - 1; i >= 0; i--) {
    const a = areas[i]
    if (
      ponto.x >= a.esquerda &&
      ponto.x <= a.direita &&
      ponto.y >= a.topo &&
      ponto.y <= a.topo + ALTURA_CABECALHO
    ) {
      return i
    }
  }
  return -1
}
