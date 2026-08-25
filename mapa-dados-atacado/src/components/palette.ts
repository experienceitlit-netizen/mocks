// Paleta central (seção 2 do plano). Graph, DetailPanel e a futura legenda
// (Fase 5) devem importar daqui para não divergirem.
import type { Debito, GraphNodeData, Nivel } from './graph-types'
import { isRaiz, nodeKind } from './graph-types'

export const BACKGROUND = '#1E1E1E'
/** Nó-raiz do domínio: azul accent do app — fora da semântica de débito. */
export const COLOR_RAIZ = '#7FB4E8'
export const COLOR_DEBITO = '#CC092F'
export const COLOR_AVALIAR = '#8A8A8A'
export const COLOR_LEGADO = '#B8860B'
export const COLOR_CURADO = '#3A7D44'
export const COLOR_FANTASMA = '#5A5A5A'

/* Camada de linhagem (nós derivados pelo build). */
export const COLOR_SISTEMA = '#5C7A99'
export const COLOR_SISTEMA_LEGADO = COLOR_LEGADO
export const COLOR_ORIGEM = '#41566B'

/* Placeholders da vista de linhagem (fonte/origem desconhecida). */
export const PLACEHOLDER_FILL = 'rgba(90, 90, 90, 0.25)'
export const PLACEHOLDER_STROKE = '#8A8A8A'

const LEGADO_RE = /legado|on-premise|planilha|excel/i

/** Cor do nó por precedência: débito sim > avaliar > sistema legado > curado.
 *  Nós derivados (sistema/origem) têm paleta própria da camada de linhagem. */
export function nodeColor(node: GraphNodeData): string {
  if (isRaiz(node)) return COLOR_RAIZ
  const kind = nodeKind(node)
  if (kind === 'sistema') return LEGADO_RE.test(node.nome) ? COLOR_SISTEMA_LEGADO : COLOR_SISTEMA
  if (kind === 'origem') return COLOR_ORIGEM
  if (node.fantasma) return COLOR_FANTASMA
  if (node.debito === 'sim') return COLOR_DEBITO
  if (node.debito === 'avaliar') return COLOR_AVALIAR
  const sistema = (node.sistema ?? '').toLowerCase()
  if (sistema.includes('legado') || sistema.includes('on-premise')) return COLOR_LEGADO
  return COLOR_CURADO
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

export function domainColor(dominio: string | undefined): string {
  return DOMAIN_COLORS[dominio ?? ''] ?? '#8A8A8A'
}

export const DEBITO_LABEL: Record<Debito, string> = {
  sim: 'Sim',
  nao: 'Não',
  avaliar: 'A avaliar',
}

/** Rótulos executivos do nível (chips do DetailPanel e da tabela). */
export const NIVEL_LABEL: Record<Nivel, string> = {
  primario: 'Produto primário',
  secundario: 'Produto secundário',
  ambos: 'Primário e final',
  raiz: 'Raiz',
}
