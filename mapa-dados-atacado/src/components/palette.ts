// Paleta central (seção 2 do plano). Graph, DetailPanel e a futura legenda
// (Fase 5) devem importar daqui para não divergirem.
import type { Debito, GraphNodeData } from './graph-types'

export const BACKGROUND = '#1E1E1E'
export const COLOR_DEBITO = '#CC092F'
export const COLOR_AVALIAR = '#8A8A8A'
export const COLOR_LEGADO = '#B8860B'
export const COLOR_CURADO = '#3A7D44'
export const COLOR_FANTASMA = '#5A5A5A'

/** Cor do nó por precedência: débito sim > avaliar > sistema legado > curado. */
export function nodeColor(node: GraphNodeData): string {
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
