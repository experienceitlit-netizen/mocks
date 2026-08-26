// Cores das FAIXAS da vista em níveis. Cada nível pode trazer uma cor de fundo
// e uma de borda (colunas cor_fundo/cor_borda do niveis.csv); o que elas
// significam não é assunto do código — "Prata" ficar prateado é escolha de quem
// cadastrou o nível, não uma regra por nome.
//
// POR QUE A COR NÃO VAI CRUA PARA O CANVAS: a faixa é o pano de fundo dos nós,
// e a cor do nó (semântica de débito) é a informação. Uma cor cheia atrás deles
// mataria o contraste do tema escuro e disputaria a leitura. Então a cor do
// nível entra como uma LÂMINA translúcida, na mesma proporção do cinza de
// sempre — o padrão de hoje é branco a 3% no preenchimento e 10% na borda:
//
//   - fundo:  12% — o suficiente para "Prata" ler como prateado e não como
//             cinza; abaixo disso a cor some no #1E1E1E do fundo.
//   - borda:  55% — a borda é fina (1px), e é ela que carrega a identidade da
//             faixa; a 100% viraria um traço neon.
//   - título: a cor da BORDA clareada 55% em direção ao branco. Cor de borda
//             escura (um azul-marinho) é ilegível como texto sobre #1E1E1E, e
//             clarear preserva o matiz. Sem cor de borda, o título herda a cor
//             de fundo — assim definir uma só das duas já colore a faixa
//             inteira de forma coerente.
//
// Nível sem cor nenhuma desenha exatamente como sempre desenhou (FAIXA_PADRAO).
import { normalizarCor } from './graph-build'

/** O que o nível declara de cor (subconjunto de NivelDef e de LineageColumn). */
export interface CoresNivel {
  corFundo?: string
  corBorda?: string
}

/** O que o desenho da faixa consome: três cores prontas para o canvas. */
export interface CoresFaixa {
  fill: string
  stroke: string
  titulo: string
}

/** Faixa de nível sem cor escolhida: o desenho neutro de sempre. */
export const FAIXA_PADRAO: CoresFaixa = {
  fill: 'rgba(255,255,255,0.03)',
  stroke: 'rgba(255,255,255,0.10)',
  titulo: '#8A8A8A',
}

export const ALPHA_FUNDO = 0.12
export const ALPHA_BORDA = 0.55
export const CLARO_TITULO = 0.55

/** Canais de um hex aceito pelo niveis.csv ("#RRGGBB" ou "#RGB"); null no que
 *  não for cor — graph.json editado à mão não pode quebrar o canvas. */
function canais(hex: string): [number, number, number] | null {
  const canonico = normalizarCor(hex)
  if (canonico === null) return null
  return [
    Number.parseInt(canonico.slice(1, 3), 16),
    Number.parseInt(canonico.slice(3, 5), 16),
    Number.parseInt(canonico.slice(5, 7), 16),
  ]
}

/** "#00aaff" + 0.12 → "rgba(0,170,255,0.12)"; null se não for cor. */
export function comAlpha(hex: string, alpha: number): string | null {
  const rgb = canais(hex)
  return rgb === null ? null : `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`
}

/** Cor puxada para o branco por `fator` (0 = igual, 1 = branco), mantendo o
 *  matiz. É o que torna uma borda escura legível como texto. */
export function clarear(hex: string, fator: number): string | null {
  const rgb = canais(hex)
  if (rgb === null) return null
  const claro = rgb.map((c) => Math.round(c + (255 - c) * fator))
  return `rgb(${claro[0]},${claro[1]},${claro[2]})`
}

/** As três cores da faixa de um nível. Cor ausente (ou ilegível) cai no padrão,
 *  campo a campo: definir só o fundo mantém a borda neutra. */
export function coresDaFaixa(nivel: CoresNivel): CoresFaixa {
  const fill = nivel.corFundo === undefined ? null : comAlpha(nivel.corFundo, ALPHA_FUNDO)
  const stroke = nivel.corBorda === undefined ? null : comAlpha(nivel.corBorda, ALPHA_BORDA)
  // O título segue a borda; sem borda, o fundo — o que houver de cor no nível.
  const base = nivel.corBorda ?? nivel.corFundo
  const titulo = base === undefined ? null : clarear(base, CLARO_TITULO)
  return {
    fill: fill ?? FAIXA_PADRAO.fill,
    stroke: stroke ?? FAIXA_PADRAO.stroke,
    titulo: titulo ?? FAIXA_PADRAO.titulo,
  }
}
