// REDIMENSIONAR UMA FAIXA DE NÍVEL PELA BORDA — a geometria das colunas da
// vista em níveis e a lógica pura do gesto, sem React e sem canvas.
//
// É o irmão de node-resize.ts, com a mesma filosofia e as mesmas manhas: a
// faixa de borda vale em px de TELA, o limite é um clamp sobre a medida padrão,
// o duplo clique restaura, e nada disso sai da sessão. O que muda é o eixo: o
// nó cresce em todas as direções em torno do próprio centro, a faixa cresce
// numa direção só — para a DIREITA — e empurra as colunas seguintes.
//
// POR QUE SÓ PARA A DIREITA. O layout da vista em níveis é ancorado à esquerda:
// a primeira coluna começa num x fixo e cada coluna seguinte começa onde a
// anterior terminou, mais o corredor. Logo, a borda ESQUERDA de uma faixa não é
// dela — é consequência da largura de todas as anteriores — e a única que tem
// liberdade de se mexer é a DIREITA. É também a convenção que todo mundo já
// conhece de redimensionar coluna de planilha: puxa-se a divisa à direita do
// cabeçalho e o que está adiante desloca.

import type { LineageColumn } from './lineage'
import { NIVEIS_COL_X } from './lineage'
import type { SimNode } from './graph-types'
import { nivelDe } from './graph-types'

/** Largura PADRÃO da faixa de um nível, em unidades de grafo.
 *
 *  133 = 70% dos 190 originais. O valor veio do uso: com as faixas largas o
 *  mapa exigia pan lateral cedo demais, e 0.70x foi o fator que o usuário
 *  encontrou arrastando. O passo entre colunas (NIVEIS_COL_X) acompanha, para
 *  o corredor entre faixas continuar em 60 — ver CORREDOR. */
export const BAND_W = 133

/** Vão entre faixas vizinhas. É o que sobra do passo entre colunas depois da
 *  largura padrão — e é onde as arestas cruzam e o chevron de fluxo aparece.
 *
 *  CONSTANTE de propósito: o gesto muda a largura das FAIXAS, não o corredor.
 *  Se o vão encolhesse junto, alargar uma coluna comeria o espaço em que as
 *  arestas se leem, que é justamente o que a vista em níveis tem de melhor. */
export const CORREDOR = NIVEIS_COL_X - BAND_W

/** Folga acima do primeiro nó: extensão do nó (~16) + respiro + cabeçalho. */
export const BAND_PAD_TOP = 46
/** Folga abaixo do último nó: extensão + rótulo do nó (fonte 10 + margem). */
export const BAND_PAD_BOTTOM = 36

/** Faixa que ninguém ajustou: a largura padrão. */
export const FAIXA_PADRAO = 1

/** Limites da largura, multiplicando a largura padrão.
 *
 *  0.6 (114 unidades) ainda é mais largo que o maior nó no fator máximo, então
 *  a faixa nunca fica mais estreita que o que ela contém — encolher uma coluna
 *  é para tirar do caminho o que não interessa agora, não para escondê-la.
 *
 *  2.5 (475) é o teto porque a partir daí uma coluna sozinha domina a tela no
 *  zoom de trabalho: o gesto serve para dar destaque a uma etapa da cadeia, e
 *  destaque exige que as outras continuem visíveis ao lado. Os dois juntos dão
 *  um alcance de mais de 4×, que é o que faz o arraste valer a pena. */
export const FAIXA_MIN = 0.6
export const FAIXA_MAX = 2.5

/** Diferença de fator abaixo da qual duas larguras são a mesma largura — evita
 *  gravar estado novo (e reposicionar tudo) a cada pixel de mouse. */
const EPSILON = 0.005

/** Largura dentro dos limites; valor inválido volta ao padrão. */
export function clampFaixa(fator: number): number {
  if (!Number.isFinite(fator)) return FAIXA_PADRAO
  return Math.min(FAIXA_MAX, Math.max(FAIXA_MIN, fator))
}

/** A largura já está encostada num dos limites? */
export function noLimiteDaFaixa(fator: number): boolean {
  return fator <= FAIXA_MIN + EPSILON || fator >= FAIXA_MAX - EPSILON
}

/** Fator em vigor para um nível; ausente do mapa = largura padrão. */
export function fatorDaFaixa(larguras: ReadonlyMap<string, number>, slug: string): number {
  return clampFaixa(larguras.get(slug) ?? FAIXA_PADRAO)
}

/** Mapa de larguras com `slug` no fator dado. Mesmo contrato de comFator (em
 *  node-resize.ts): devolve o MESMO mapa quando nada muda, e apaga a entrada
 *  quando a coluna volta ao padrão, para `size === 0` significar sempre
 *  "nenhuma faixa ajustada". */
export function comFatorDaFaixa(
  larguras: ReadonlyMap<string, number>,
  slug: string,
  fator: number,
): ReadonlyMap<string, number> {
  const alvo = clampFaixa(fator)
  if (Math.abs(fatorDaFaixa(larguras, slug) - alvo) < EPSILON) return larguras
  const proximo = new Map(larguras)
  if (Math.abs(alvo - FAIXA_PADRAO) < EPSILON) proximo.delete(slug)
  else proximo.set(slug, alvo)
  return proximo
}

/** Larguras sem os níveis que saíram do grafo (nível excluído no modal). */
export function podadasPorSlug(
  larguras: ReadonlyMap<string, number>,
  existe: (slug: string) => boolean,
): ReadonlyMap<string, number> {
  const sobrando = [...larguras.keys()].filter((slug) => !existe(slug))
  if (sobrando.length === 0) return larguras
  const proximo = new Map(larguras)
  for (const slug of sobrando) proximo.delete(slug)
  return proximo
}

/** Onde uma faixa começa, onde termina e onde fica o centro dela (que é onde
 *  os nós daquele nível se empilham). Tudo em unidades de grafo. */
export interface FaixaGeom {
  slug: string
  /** Centro: o x dos nós da coluna. */
  x: number
  largura: number
  esquerda: number
  direita: number
}

/** Coluna da vista em níveis com a largura da faixa já resolvida — o que o
 *  canvas desenha e o que o gesto de borda mede. */
export interface FaixaAjustada extends LineageColumn {
  largura: number
}

/**
 * Geometria das faixas, da esquerda para a direita: cada uma com a sua largura,
 * a seguinte começando depois do corredor. É AQUI que o requisito de não haver
 * sobreposição se cumpre — por construção, e não por uma verificação depois.
 *
 * Com todos os fatores em 1 o resultado é EXATAMENTE o layout de sempre
 * (centros em 0, 250, 500…), que é o que o teste trava: alargar uma coluna é a
 * única coisa que este módulo faz, e ele não pode mexer no mapa de quem não
 * mexeu em nada.
 */
export function geometriaDasFaixas(
  slugs: readonly string[],
  larguras: ReadonlyMap<string, number>,
): FaixaGeom[] {
  const geoms: FaixaGeom[] = []
  // A borda esquerda da PRIMEIRA faixa é a âncora do layout inteiro: ela não se
  // mexe nunca, e é por isso que alargar uma coluna desloca só o que vem depois.
  let esquerda = -BAND_W / 2
  for (const slug of slugs) {
    const largura = BAND_W * fatorDaFaixa(larguras, slug)
    geoms.push({ slug, largura, esquerda, direita: esquerda + largura, x: esquerda + largura / 2 })
    esquerda += largura + CORREDOR
  }
  return geoms
}

/**
 * Recoloca colunas e nós segundo os fatores de largura.
 *
 * Os nós são reposicionados NO LUGAR (x/fx), que é o mesmo que buildLineage já
 * faz com eles: os objetos são clones criados por ele e ninguém mais os
 * observa. É de propósito que a linhagem não seja refeita — refazê-la a cada
 * quadro do arraste criaria nós novos, e o grafo se re-enquadraria sozinho no
 * meio do gesto.
 */
export function aplicarLarguras(
  columns: readonly LineageColumn[],
  nodes: readonly SimNode[],
  larguras: ReadonlyMap<string, number>,
): FaixaAjustada[] {
  const geoms = geometriaDasFaixas(
    columns.map((c) => c.slug),
    larguras,
  )
  const xPorSlug = new Map(geoms.map((g) => [g.slug, g.x]))
  for (const n of nodes) {
    const x = xPorSlug.get(nivelDe(n))
    if (x === undefined) continue
    n.x = x
    n.fx = x
  }
  return columns.map((c, i) => ({ ...c, x: geoms[i].x, largura: geoms[i].largura }))
}

/** Topo e base da faixa desenhada (os nós só marcam o miolo dela). */
export function topoDaFaixa(col: Pick<LineageColumn, 'yMin'>): number {
  return col.yMin - BAND_PAD_TOP
}
export function baseDaFaixa(col: Pick<LineageColumn, 'yMax'>): number {
  return col.yMax + BAND_PAD_BOTTOM
}

/** Borda direita de uma faixa, em unidades de grafo. */
export function bordaDireita(col: Pick<FaixaAjustada, 'x' | 'largura'>): number {
  return col.x + col.largura / 2
}
/** Borda esquerda de uma faixa (presa pelo que vem antes dela). */
export function bordaEsquerda(col: Pick<FaixaAjustada, 'x' | 'largura'>): number {
  return col.x - col.largura / 2
}

/**
 * Fator de largura durante o arraste: a borda direita ACOMPANHA o cursor.
 *
 * A largura é a distância do cursor até a borda ESQUERDA, que está presa no
 * lugar que as faixas anteriores determinaram — por isso a conta é direta e
 * estável, sem a razão de distâncias que o gesto do nó usa (lá o que está preso
 * é o centro, aqui é um dos lados).
 *
 * `esquerda` e `xCursor` em unidades de GRAFO: assim o gesto é o mesmo em
 * qualquer zoom, e a borda para exatamente onde a mão parou.
 */
export function fatorArrastandoFaixa(esquerda: number, xCursor: number): number {
  return clampFaixa((xCursor - esquerda) / BAND_W)
}

/**
 * Índice da faixa cuja BORDA DIREITA está sob `x` (px de tela), ou -1.
 *
 * Em empate — duas bordas dentro da tolerância, o que só acontece com a coluna
 * espremida no mínimo e o mapa muito distante — ganha a mais próxima, para o
 * gesto nunca pegar a faixa vizinha da que está sob o dedo.
 */
export function bordaDireitaSob(bordasEmTela: readonly number[], x: number, tol: number): number {
  let melhor = -1
  let menorErro = Number.POSITIVE_INFINITY
  bordasEmTela.forEach((borda, i) => {
    const erro = Math.abs(x - borda)
    if (erro <= tol && erro < menorErro) {
      menorErro = erro
      melhor = i
    }
  })
  return melhor
}
