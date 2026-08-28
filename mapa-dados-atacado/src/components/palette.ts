// Paleta central do mapa. Graph, NodeBalloon, TableView e Legend importam
// daqui para não divergirem.
//
// COR = semântica de débito, igual para TODO componente (não existe paleta por
// nível nem por categoria de nó). Os outros eixos moram em shapes.ts: a FORMA
// diz se o componente é produto de dados e o ÍCONE interno diz o tipo.
import type { Debito, GraphNodeData } from './graph-types'
import { debitoDe } from './graph-types'

export const BACKGROUND = '#1E1E1E'

export const COLOR_DEBITO = '#CC092F'
export const COLOR_AVALIAR = '#8A8A8A'
export const COLOR_CURADO = '#3A7D44'
export const COLOR_FANTASMA = '#5A5A5A'

/** Cor do componente por precedência: fantasma > débito sim > débito a avaliar
 *  (inclui o não declarado) > curado.
 *
 *  Havia um quarto caso: um âmbar de "legado/manual", ligado por um regex sobre
 *  o NOME e a DESCRIÇÃO do componente (`/legado|on-premise|planilha/i`). Saiu.
 *  O débito técnico é declarado na coluna `debito` do catálogo, e adivinhá-lo
 *  pelo texto do nome criava uma segunda fonte de verdade: uma linha marcada
 *  `debito=nao` pelo dono aparecia em âmbar porque alguém escreveu "planilha" na
 *  descrição, e não havia como corrigir isso a não ser reescrevendo a prosa. Nós
 *  que ficavam âmbar por essa regra passam a seguir só o que declararam. */
export function nodeColor(node: GraphNodeData): string {
  if (node.fantasma === true) return COLOR_FANTASMA
  const debito = debitoDe(node)
  if (debito === 'sim') return COLOR_DEBITO
  if (debito === 'avaliar') return COLOR_AVALIAR
  return COLOR_CURADO
}

/** Fundo do nó que carrega LOGO DE MARCA.
 *
 *  Nesses nós a cor cheia não pode ser o débito: a logo é colorida (o ciano da
 *  Salesforce, o verde do Mongo, o vermelho do SQL Server) e duas cores fortes
 *  no mesmo espaço se anulam. Então o miolo vira este neutro — um passo acima do
 *  fundo da tela (#1E1E1E), o bastante para o nó ter corpo — e o débito vai para
 *  a BORDA, grossa, na mesma paleta de sempre. Ver DEBITO_BORDA em shapes.ts. */
export const FUNDO_MARCA = '#26292E'

/** Mistura uma cor "#rrggbb" com branco (0 = a cor, 1 = branco). */
function clarear(hex: string, fator: number): string {
  const n = Number.parseInt(hex.slice(1), 16)
  const canal = (deslocamento: number): number => {
    const v = (n >> deslocamento) & 0xff
    return Math.round(v + (255 - v) * fator)
  }
  return `rgb(${canal(16)}, ${canal(8)}, ${canal(0)})`
}

/** Quanto a cor do nó é clareada para virar a cor do chip (0 = a cor, 1 =
 *  branco). */
const CHIP_CLAREAMENTO = 0.45

/**
 * Cor do chip "Produto de dados" do balão de detalhe.
 *
 * É a cor do próprio nó CLAREADA, e não uma cor nova: a bandeira não é uma
 * quinta semântica de cor — quem a diz no mapa é a FORMA (octógono), e o chip
 * só repete a marca em palavras. Herdar a cor do nó amarra o chip ao nó que
 * está aberto; clarear é o que a mantém legível no fundo escuro do balão,
 * inclusive no vermelho de débito. Não chega a branco, que é a cor do halo de
 * seleção.
 */
export function produtoChipColor(node: GraphNodeData): string {
  return clarear(nodeColor(node), CHIP_CLAREAMENTO)
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
