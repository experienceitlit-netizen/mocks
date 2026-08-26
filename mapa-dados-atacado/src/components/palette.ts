// Paleta central do mapa. Graph, NodeBalloon, TableView e Legend importam
// daqui para não divergirem.
//
// COR = semântica de débito, igual para TODO componente (não existe paleta por
// nível nem por categoria de nó). A FORMA é que varia, e vem do
// `tipoComponente` (ver shapeOf em Graph.tsx / Legend.tsx).
import type { Debito, GraphNodeData } from './graph-types'
import { debitoDe } from './graph-types'

export const BACKGROUND = '#1E1E1E'

export const COLOR_DEBITO = '#CC092F'
export const COLOR_AVALIAR = '#8A8A8A'
export const COLOR_LEGADO = '#B8860B'
export const COLOR_CURADO = '#3A7D44'
export const COLOR_FANTASMA = '#5A5A5A'

/** Sinal textual de rota legada/manual no que o componente declara de si. Era
 *  lido do campo `sistema`, que saiu do nó no modelo unificado; sobrou o texto
 *  que o próprio componente carrega (nome e descrição). */
const LEGADO_RE = /legado|on-premise|planilha/i

/** Cor do componente por precedência: fantasma > débito sim > débito a avaliar
 *  (inclui o não declarado) > legado/manual > curado. */
export function nodeColor(node: GraphNodeData): string {
  if (node.fantasma === true) return COLOR_FANTASMA
  const debito = debitoDe(node)
  if (debito === 'sim') return COLOR_DEBITO
  if (debito === 'avaliar') return COLOR_AVALIAR
  return LEGADO_RE.test(`${node.nome} ${node.descricao ?? ''}`) ? COLOR_LEGADO : COLOR_CURADO
}

/** Cores dos chips de domínio (distintas da semântica de cor dos nós). */
export const DOMAIN_COLORS: Record<string, string> = {
  Cadastro: '#4A90D9',
  Mercado: '#9B59B6',
  Risco: '#E67E22',
  Resultado: '#2E8B57',
  Regulatorio: '#B03A48',
  'A definir': '#8A8A8A',
}

function normalizeDomainKey(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

// Lookup insensível a acentos: a UI exibe "Regulatório", mas a chave da paleta
// (e do catálogo) é "Regulatorio".
const DOMAIN_COLORS_NORM = new Map(
  Object.entries(DOMAIN_COLORS).map(([k, v]) => [normalizeDomainKey(k), v]),
)

export function domainColor(dominio: string | undefined): string {
  return DOMAIN_COLORS_NORM.get(normalizeDomainKey(dominio ?? '')) ?? '#8A8A8A'
}

export const DEBITO_LABEL: Record<Debito, string> = {
  sim: 'Sim',
  nao: 'Não',
  avaliar: 'A avaliar',
}
