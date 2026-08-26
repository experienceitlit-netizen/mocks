// A cor que o usuário escolhe para o nível NÃO é a cor que vai para o canvas:
// a faixa é fundo, os nós é que são a informação. Estes testes travam essa
// tradução (alpha no fundo e na borda, título clareado) e a regra de que nível
// sem cor desenha exatamente como sempre desenhou.
import { describe, expect, it } from 'vitest'
import {
  ALPHA_BORDA,
  ALPHA_FUNDO,
  clarear,
  comAlpha,
  coresDaFaixa,
  FAIXA_PADRAO,
} from './band-colors'

describe('comAlpha e clarear', () => {
  it('hex vira rgba com o alpha pedido', () => {
    expect(comAlpha('#00aaff', 0.12)).toBe('rgba(0,170,255,0.12)')
    expect(comAlpha('#000000', 1)).toBe('rgba(0,0,0,1)')
  })

  it('aceita a forma curta e maiúsculas (mesma regra do niveis.csv)', () => {
    expect(comAlpha('#0AF', 0.5)).toBe('rgba(0,170,255,0.5)')
  })

  it('o que não é cor devolve null — graph.json editado à mão não quebra o canvas', () => {
    expect(comAlpha('prateado', 0.5)).toBeNull()
    expect(clarear('#12345', 0.5)).toBeNull()
  })

  it('clarear puxa para o branco mantendo o matiz', () => {
    expect(clarear('#000000', 0)).toBe('rgb(0,0,0)')
    expect(clarear('#000000', 1)).toBe('rgb(255,255,255)')
    expect(clarear('#004080', 0.5)).toBe('rgb(128,160,192)')
  })
})

describe('coresDaFaixa', () => {
  it('sem cor nenhuma: o desenho neutro de sempre', () => {
    expect(coresDaFaixa({})).toEqual(FAIXA_PADRAO)
  })

  it('com as duas cores: fundo e borda com alpha, título na borda clareada', () => {
    expect(coresDaFaixa({ corFundo: '#c0c0c0', corBorda: '#8fa3b8' })).toEqual({
      fill: `rgba(192,192,192,${ALPHA_FUNDO})`,
      stroke: `rgba(143,163,184,${ALPHA_BORDA})`,
      titulo: 'rgb(205,214,223)',
    })
  })

  it('a cor entra translúcida, nunca crua: fundo bem mais discreto que a borda', () => {
    expect(ALPHA_FUNDO).toBeLessThan(ALPHA_BORDA)
    expect(ALPHA_BORDA).toBeLessThan(1)
    const { fill, stroke } = coresDaFaixa({ corFundo: '#ff0000', corBorda: '#ff0000' })
    expect(fill).not.toBe(stroke)
    expect(fill).not.toContain('#')
  })

  it('cada cor cai no padrão sozinha: definir só o fundo mantém a borda neutra', () => {
    const so = coresDaFaixa({ corFundo: '#c0c0c0' })
    expect(so.fill).toBe(`rgba(192,192,192,${ALPHA_FUNDO})`)
    expect(so.stroke).toBe(FAIXA_PADRAO.stroke)
    // …mas o título acompanha a única cor que existe, para a faixa ficar coerente
    expect(so.titulo).not.toBe(FAIXA_PADRAO.titulo)
  })

  it('o título segue a BORDA quando as duas existem', () => {
    expect(coresDaFaixa({ corFundo: '#c0c0c0', corBorda: '#004080' }).titulo).toBe(
      coresDaFaixa({ corBorda: '#004080' }).titulo,
    )
  })

  it('borda escura vira título legível (clareado), não um texto apagado', () => {
    const titulo = coresDaFaixa({ corBorda: '#0a1a2a' }).titulo
    const canais = titulo.match(/\d+/g)?.map(Number) ?? []
    // média bem acima do cinza #8A8A8A (138) do padrão
    expect(canais.reduce((a, b) => a + b, 0) / 3).toBeGreaterThan(138)
  })

  it('cor ilegível no JSON cai no padrão em vez de virar "undefined" no canvas', () => {
    expect(coresDaFaixa({ corFundo: 'prateado', corBorda: 'aço' })).toEqual(FAIXA_PADRAO)
  })
})
