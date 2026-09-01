// O rótulo da aresta se apoia numa coisa que dá para errar sem perceber: a
// aresta CURVA da vista em níveis, onde o meio da CORDA não é o meio da linha
// desenhada. É isto que os testes travam — mais o tamanho, que precisa
// sobreviver ao zoom nas duas pontas sem virar borrão nem cartaz.
import { describe, expect, it } from 'vitest'
import {
  FONTE_MAX,
  FONTE_MIN,
  fonteDoRotulo,
  pontoDoRotulo,
  pontoNaAresta,
  pontoNaCurva,
  T_ROTULO,
  TARJA_PAD_X,
  TARJA_PAD_Y,
  tarjaDoRotulo,
} from './rotulo-aresta'

describe('ponto sobre a aresta', () => {
  it('reta: o meio é a média das duas pontas', () => {
    expect(pontoNaAresta({ x: 0, y: 0 }, { x: 100, y: 40 }, null, T_ROTULO)).toEqual({
      x: 50,
      y: 20,
    })
  })

  it('reta: t=0 e t=1 são as próprias pontas', () => {
    const a = { x: -7, y: 3 }
    const b = { x: 11, y: -5 }
    expect(pontoNaAresta(a, b, null, 0)).toEqual(a)
    expect(pontoNaAresta(a, b, null, 1)).toEqual(b)
  })

  it('curva: as pontas continuam sendo as pontas', () => {
    const a = { x: 0, y: 0 }
    const b = { x: 100, y: 0 }
    const c = { x: 50, y: -60 }
    expect(pontoNaCurva(a, c, b, 0)).toEqual(a)
    expect(pontoNaCurva(a, c, b, 1)).toEqual(b)
  })

  it('curva: o meio NÃO é o meio da corda — é o que a lib desenha', () => {
    // Bézier quadrática em t=0.5: (A + 2C + B) / 4. Com o controle 60 acima da
    // corda, a linha passa 30 acima dela; um rótulo no meio da corda ficaria
    // esses 30 fora do traço — e quanto mais longa a aresta, mais longe.
    const a = { x: 0, y: 0 }
    const b = { x: 100, y: 0 }
    const p = pontoNaCurva(a, { x: 50, y: -60 }, b, T_ROTULO)
    expect(p).toEqual({ x: 50, y: -30 })
    expect(p.y).not.toBe(pontoNaAresta(a, b, null, T_ROTULO).y)
  })

  it('curva: o desvio do meio da corda cresce com a curvatura', () => {
    const a = { x: 0, y: 0 }
    const b = { x: 100, y: 0 }
    const corda = pontoNaAresta(a, b, null, T_ROTULO)
    const suave = pontoNaCurva(a, { x: 50, y: -20 }, b, T_ROTULO)
    const forte = pontoNaCurva(a, { x: 50, y: -80 }, b, T_ROTULO)
    expect(Math.abs(forte.y - corda.y)).toBeGreaterThan(Math.abs(suave.y - corda.y))
  })
})

describe('onde o rótulo é escrito', () => {
  it('aresta reta: no meio dela', () => {
    expect(pontoDoRotulo({ x: 0, y: 0 }, { x: 80, y: 20 }, null)).toEqual({ x: 40, y: 10 })
  })

  it('aresta curva: SOBRE a curva, não sobre a corda', () => {
    const p = pontoDoRotulo({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: -60 })
    expect(p).toEqual({ x: 50, y: -30 })
  })

  it('não depende do sentido em que a aresta foi escrita, na reta', () => {
    const a = { x: 10, y: -4 }
    const b = { x: 90, y: 36 }
    expect(pontoDoRotulo(a, b, null)).toEqual(pontoDoRotulo(b, a, null))
  })
})

describe('tamanho do rótulo', () => {
  it('nunca menor que o piso nem maior que o teto', () => {
    expect(fonteDoRotulo(0.1)).toBe(FONTE_MIN)
    expect(fonteDoRotulo(0.9)).toBe(FONTE_MIN)
    expect(fonteDoRotulo(50)).toBe(FONTE_MAX)
  })

  it('entre o piso e o teto, acompanha o zoom', () => {
    expect(fonteDoRotulo(1)).toBe(FONTE_MIN)
    expect(fonteDoRotulo(1.5)).toBeCloseTo(FONTE_MIN * 1.5, 9)
    expect(fonteDoRotulo(1.5)).toBeGreaterThan(fonteDoRotulo(1.2))
  })

  it('é sempre menor que o rótulo do NÓ (10 px de piso, 26 de teto)', () => {
    // O nome do componente vem primeiro; o verbo é segunda leitura.
    for (const scale of [0.2, 1, 2, 3, 6]) {
      const no = Math.min(26, Math.max(10, 10 * scale))
      expect(fonteDoRotulo(scale)).toBeLessThan(no)
    }
  })

  it('a tarja é o texto mais as folgas, totalmente arredondada', () => {
    const t = tarjaDoRotulo(40, 10)
    expect(t.largura).toBe(40 + TARJA_PAD_X * 2)
    expect(t.altura).toBe(10 + TARJA_PAD_Y * 2)
    expect(t.raio).toBe(t.altura / 2)
  })

  it('a tarja deitada é bem mais baixa que o texto seria de pé — é o que a faz\n     caber entre duas arestas vizinhas sem tapar o nome do componente', () => {
    const t = tarjaDoRotulo(52, 10)
    expect(t.altura).toBeLessThan(t.largura / 2)
  })
})
