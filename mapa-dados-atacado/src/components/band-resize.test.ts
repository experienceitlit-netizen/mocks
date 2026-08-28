// REDIMENSIONAR AS FAIXAS DE NÍVEL, testado onde o gesto decide as coisas.
//
// O teste mais importante deste arquivo é o primeiro: com todos os fatores no
// padrão, a geometria tem de reproduzir EXATAMENTE o layout de sempre (centros
// em 0, 193, 386…). Alargar uma coluna é a única coisa que este módulo faz, e
// ele não pode mexer no mapa de quem nunca arrastou nada.
//
// Depois vem o que o requisito chama de "as colunas à direita deslocam": aqui
// isso não é uma verificação depois do fato, é uma consequência de como a
// geometria é construída — cada faixa começa onde a anterior terminou, mais o
// corredor. Os testes travam as duas metades disso: o que desloca e o que NÃO
// desloca (nada à esquerda da coluna mexida).
import { describe, expect, it } from 'vitest'
import type { SimNode } from './graph-types'
import type { LineageColumn } from './lineage'
import { NIVEIS_COL_X } from './lineage'
import { BORDA_TOL_PX } from './node-resize'
import {
  aplicarLarguras,
  BAND_PAD_BOTTOM,
  BAND_PAD_TOP,
  BAND_W,
  baseDaFaixa,
  bordaDireita,
  bordaDireitaSob,
  bordaEsquerda,
  clampFaixa,
  comFatorDaFaixa,
  CORREDOR,
  FAIXA_MAX,
  FAIXA_MIN,
  FAIXA_PADRAO,
  fatorArrastandoFaixa,
  fatorDaFaixa,
  geometriaDasFaixas,
  noLimiteDaFaixa,
  podadasPorSlug,
  topoDaFaixa,
} from './band-resize'

const SLUGS = ['dominio', 'gold', 'silver', 'broze', 'origem']

const semAjuste = new Map<string, number>()

/** Coluna como buildLineage a entrega (x já no lugar padrão). */
function coluna(slug: string, i: number, altura = 2): LineageColumn {
  const meia = (altura * NIVEIS_ROW_Y_FAKE) / 2
  return { slug, label: slug, x: i * NIVEIS_COL_X, yMin: -meia, yMax: meia }
}
const NIVEIS_ROW_Y_FAKE = 70

function no(id: string, nivel: string, x: number): SimNode {
  return { id, nome: id, nivel, x, y: 0, fx: x, fy: 0 }
}

describe('geometria padrão', () => {
  it('sem nenhum ajuste, é o layout de sempre — centros no passo padrão', () => {
    const geoms = geometriaDasFaixas(SLUGS, semAjuste)
    expect(geoms.map((g) => g.x)).toEqual([0, 193, 386, 579, 772])
    expect(geoms.map((g) => g.largura)).toEqual([BAND_W, BAND_W, BAND_W, BAND_W, BAND_W])
  })

  it('o corredor é o que sobra do passo entre colunas', () => {
    expect(CORREDOR).toBe(NIVEIS_COL_X - BAND_W)
    expect(CORREDOR).toBeGreaterThan(0)
  })

  it('a primeira faixa é a âncora: a borda esquerda dela nunca se mexe', () => {
    const parada = -BAND_W / 2
    for (const fatores of [semAjuste, new Map([['dominio', FAIXA_MAX]]), new Map([['gold', FAIXA_MIN]])]) {
      expect(geometriaDasFaixas(SLUGS, fatores)[0].esquerda).toBe(parada)
    }
  })
})

describe('as colunas seguintes deslocam, as anteriores não', () => {
  it('alargar uma coluna empurra só o que vem DEPOIS dela', () => {
    const antes = geometriaDasFaixas(SLUGS, semAjuste)
    const depois = geometriaDasFaixas(SLUGS, new Map([['silver', 2]]))
    // Antes da mexida: nada se move.
    expect(depois[0]).toEqual(antes[0])
    expect(depois[1]).toEqual(antes[1])
    // A mexida: dobrou de largura, e cresceu para a DIREITA (esquerda parada).
    expect(depois[2].esquerda).toBe(antes[2].esquerda)
    expect(depois[2].largura).toBe(2 * BAND_W)
    // Depois dela: deslocaram exatamente o que a coluna cresceu.
    const delta = depois[2].largura - antes[2].largura
    expect(depois[3].x - antes[3].x).toBeCloseTo(delta)
    expect(depois[4].x - antes[4].x).toBeCloseTo(delta)
  })

  it('estreitar puxa as seguintes de volta, pela mesma conta', () => {
    const antes = geometriaDasFaixas(SLUGS, semAjuste)
    const depois = geometriaDasFaixas(SLUGS, new Map([['gold', FAIXA_MIN]]))
    const delta = depois[1].largura - antes[1].largura
    expect(delta).toBeLessThan(0)
    for (const i of [2, 3, 4]) expect(depois[i].x - antes[i].x).toBeCloseTo(delta)
  })

  it('vários ajustes ao mesmo tempo somam, na ordem das colunas', () => {
    const geoms = geometriaDasFaixas(
      SLUGS,
      new Map([
        ['dominio', 2],
        ['silver', 0.6],
      ]),
    )
    let esperado = -BAND_W / 2
    for (const g of geoms) {
      expect(g.esquerda).toBeCloseTo(esperado)
      esperado += g.largura + CORREDOR
    }
  })
})

describe('faixas nunca se sobrepõem', () => {
  it('em qualquer combinação de fatores, o corredor entre vizinhas é intacto', () => {
    const combinacoes: Array<Map<string, number>> = [
      new Map(),
      new Map(SLUGS.map((s) => [s, FAIXA_MAX])),
      new Map(SLUGS.map((s) => [s, FAIXA_MIN])),
      new Map(SLUGS.map((s, i) => [s, i % 2 === 0 ? FAIXA_MAX : FAIXA_MIN])),
      new Map([
        ['gold', 1.7],
        ['origem', 2.4],
      ]),
    ]
    for (const fatores of combinacoes) {
      const geoms = geometriaDasFaixas(SLUGS, fatores)
      for (let i = 1; i < geoms.length; i++) {
        expect(geoms[i].esquerda).toBeGreaterThan(geoms[i - 1].direita)
        expect(geoms[i].esquerda - geoms[i - 1].direita).toBeCloseTo(CORREDOR)
      }
    }
  })

  it('nem com fatores absurdos, que o clamp segura antes da geometria', () => {
    const geoms = geometriaDasFaixas(SLUGS, new Map([['gold', 1e6], ['silver', -50]]))
    for (let i = 1; i < geoms.length; i++) {
      expect(geoms[i].esquerda).toBeGreaterThan(geoms[i - 1].direita)
    }
    expect(geoms[1].largura).toBe(BAND_W * FAIXA_MAX)
    expect(geoms[2].largura).toBe(BAND_W * FAIXA_MIN)
  })
})

describe('limites da largura', () => {
  it('nunca sai de [0.6, 2.5]', () => {
    expect(clampFaixa(0.1)).toBe(FAIXA_MIN)
    expect(clampFaixa(99)).toBe(FAIXA_MAX)
    expect(clampFaixa(-3)).toBe(FAIXA_MIN)
    expect(clampFaixa(Number.NaN)).toBe(FAIXA_PADRAO)
    expect(clampFaixa(Number.POSITIVE_INFINITY)).toBe(FAIXA_PADRAO)
    for (const f of [FAIXA_MIN, 0.9, 1, 1.8, FAIXA_MAX]) expect(clampFaixa(f)).toBe(f)
  })

  it('o alcance do gesto passa de 4× — puxar a borda tem o que fazer', () => {
    expect(FAIXA_MAX / FAIXA_MIN).toBeGreaterThan(4)
  })

  it('o piso ainda é bem mais largo que o corredor — a faixa não some', () => {
    expect(BAND_W * FAIXA_MIN).toBeGreaterThan(CORREDOR)
  })

  it('nem no teto uma coluna sozinha ocupa o lugar de todas as outras', () => {
    // Destacar uma etapa da cadeia só funciona com as vizinhas ainda visíveis
    // ao lado: no teto, a coluna cabe em menos de um terço das seis colunas do
    // catálogo somadas.
    const seisColunas = 6 * (BAND_W + CORREDOR)
    expect(BAND_W * FAIXA_MAX).toBeLessThan(seisColunas / 3)
  })

  it('noLimiteDaFaixa avisa só nos extremos', () => {
    expect(noLimiteDaFaixa(FAIXA_MIN)).toBe(true)
    expect(noLimiteDaFaixa(FAIXA_MAX)).toBe(true)
    expect(noLimiteDaFaixa(FAIXA_PADRAO)).toBe(false)
  })
})

describe('fatorArrastandoFaixa', () => {
  it('a borda direita ACOMPANHA o cursor', () => {
    // Largura = distância do cursor até a borda esquerda, que está presa.
    expect(fatorArrastandoFaixa(-95, -95 + BAND_W)).toBeCloseTo(1)
    expect(fatorArrastandoFaixa(-95, -95 + 2 * BAND_W)).toBeCloseTo(2)
    expect(fatorArrastandoFaixa(0, BAND_W * 1.5)).toBeCloseTo(1.5)
  })

  it('pegar na borda atual não dá salto nenhum', () => {
    // O fator sai igual ao que já estava: a coluna não pula quando a mão encosta.
    for (const fator of [FAIXA_MIN, 1, 1.8, FAIXA_MAX]) {
      const esquerda = -95
      const direita = esquerda + BAND_W * fator
      expect(fatorArrastandoFaixa(esquerda, direita)).toBeCloseTo(fator)
    }
  })

  it('não passa dos limites por mais que a mão vá longe', () => {
    expect(fatorArrastandoFaixa(0, 99999)).toBe(FAIXA_MAX)
    expect(fatorArrastandoFaixa(0, -99999)).toBe(FAIXA_MIN)
    expect(fatorArrastandoFaixa(0, 0)).toBe(FAIXA_MIN)
  })
})

describe('comFatorDaFaixa e podadasPorSlug', () => {
  it('devolve o MESMO mapa quando a largura não muda de fato', () => {
    const larguras = new Map([['gold', 2]])
    expect(comFatorDaFaixa(larguras, 'gold', 2)).toBe(larguras)
    expect(comFatorDaFaixa(larguras, 'gold', 2.001)).toBe(larguras)
    expect(comFatorDaFaixa(larguras, 'silver', FAIXA_PADRAO)).toBe(larguras)
    expect(comFatorDaFaixa(larguras, 'gold', 2.2)).not.toBe(larguras)
  })

  it('voltar ao padrão apaga a entrada: mapa vazio = nenhuma coluna ajustada', () => {
    expect(comFatorDaFaixa(new Map([['gold', 2]]), 'gold', FAIXA_PADRAO).size).toBe(0)
  })

  it('some com a largura do nível que saiu do catálogo', () => {
    const larguras = new Map([
      ['gold', 2],
      ['extinto', 1.5],
    ])
    expect([...podadasPorSlug(larguras, (s) => s === 'gold').keys()]).toEqual(['gold'])
    expect(podadasPorSlug(larguras, () => true)).toBe(larguras)
  })

  it('fatorDaFaixa lê já dentro dos limites', () => {
    expect(fatorDaFaixa(new Map(), 'nada')).toBe(FAIXA_PADRAO)
    expect(fatorDaFaixa(new Map([['g', 90]]), 'g')).toBe(FAIXA_MAX)
  })
})

describe('aplicarLarguras', () => {
  const colunas = () => SLUGS.map((slug, i) => coluna(slug, i))
  const nos = () => [
    no('a', 'dominio', 0),
    no('b', 'gold', 193),
    no('c', 'silver', 500),
    no('d', 'silver', 500),
    no('e', 'origem', 1000),
  ]

  it('sem ajuste nenhum, não mexe em nada', () => {
    const cols = colunas()
    const nodes = nos()
    const ajustadas = aplicarLarguras(cols, nodes, semAjuste)
    expect(ajustadas.map((c) => c.x)).toEqual(cols.map((c) => c.x))
    expect(ajustadas.map((c) => c.largura)).toEqual(cols.map(() => BAND_W))
    expect(nodes.map((n) => n.x)).toEqual([0, 193, 386, 386, 772])
  })

  it('leva os NÓS junto com a coluna deles', () => {
    const nodes = nos()
    const ajustadas = aplicarLarguras(colunas(), nodes, new Map([['gold', 2]]))
    const xPorSlug = new Map(ajustadas.map((c) => [c.slug, c.x]))
    // Cada nó no centro da coluna nova — inclusive os dois que dividem a mesma.
    expect(nodes[0].x).toBe(xPorSlug.get('dominio'))
    expect(nodes[1].x).toBe(xPorSlug.get('gold'))
    expect(nodes[2].x).toBe(xPorSlug.get('silver'))
    expect(nodes[3].x).toBe(nodes[2].x)
    expect(nodes[4].x).toBe(xPorSlug.get('origem'))
    // fx acompanha x: na vista em níveis é ele que prende o nó no lugar.
    for (const n of nodes) expect(n.fx).toBe(n.x)
  })

  it('o nó de uma coluna ANTERIOR à mexida fica onde estava', () => {
    const nodes = nos()
    aplicarLarguras(colunas(), nodes, new Map([['silver', FAIXA_MAX]]))
    expect(nodes[0].x).toBe(0) // dominio
    expect(nodes[1].x).toBe(193) // gold
    // 772 é onde 'origem' fica sem ajuste nenhum (4 passos padrão): alargar
    // uma coluna antes dela tem de empurrá-la para além disso.
    expect(nodes[4].x).toBeGreaterThan(772) // origem deslocou
  })

  it('preserva o resto da coluna (rótulo, cores do nível, extensão vertical)', () => {
    const cols = SLUGS.map((slug, i) => ({
      ...coluna(slug, i),
      corFundo: '#123456',
      corBorda: '#654321',
    }))
    const ajustadas = aplicarLarguras(cols, nos(), new Map([['gold', 2]]))
    for (let i = 0; i < cols.length; i++) {
      expect(ajustadas[i].label).toBe(cols[i].label)
      expect(ajustadas[i].slug).toBe(cols[i].slug)
      expect(ajustadas[i].corFundo).toBe('#123456')
      expect(ajustadas[i].corBorda).toBe('#654321')
      expect(ajustadas[i].yMin).toBe(cols[i].yMin)
      expect(ajustadas[i].yMax).toBe(cols[i].yMax)
    }
  })

  it('as bordas da coluna ajustada cercam o centro dela', () => {
    const ajustadas = aplicarLarguras(colunas(), nos(), new Map([['gold', 2]]))
    for (const col of ajustadas) {
      expect(bordaDireita(col) - bordaEsquerda(col)).toBeCloseTo(col.largura)
      expect((bordaDireita(col) + bordaEsquerda(col)) / 2).toBeCloseTo(col.x)
    }
  })
})

describe('detecção da borda', () => {
  it('usa a MESMA tolerância do gesto do nó — a mão aprende uma distância só', () => {
    expect(BORDA_TOL_PX).toBeGreaterThan(0)
  })

  it('pega a borda dentro da tolerância e ignora o resto', () => {
    const bordas = [100, 400, 700]
    expect(bordaDireitaSob(bordas, 100, BORDA_TOL_PX)).toBe(0)
    expect(bordaDireitaSob(bordas, 100 + BORDA_TOL_PX, BORDA_TOL_PX)).toBe(0)
    expect(bordaDireitaSob(bordas, 100 - BORDA_TOL_PX, BORDA_TOL_PX)).toBe(0)
    expect(bordaDireitaSob(bordas, 100 + BORDA_TOL_PX + 0.01, BORDA_TOL_PX)).toBe(-1)
    expect(bordaDireitaSob(bordas, 401, BORDA_TOL_PX)).toBe(1)
    expect(bordaDireitaSob(bordas, 250, BORDA_TOL_PX)).toBe(-1)
  })

  it('em empate ganha a borda mais próxima', () => {
    expect(bordaDireitaSob([100, 104], 103, 6)).toBe(1)
    expect(bordaDireitaSob([100, 104], 101, 6)).toBe(0)
  })

  it('sem faixa nenhuma não há borda', () => {
    expect(bordaDireitaSob([], 100, BORDA_TOL_PX)).toBe(-1)
  })
})

describe('extensão vertical da faixa', () => {
  it('sobra folga para o cabeçalho em cima e para o rótulo do nó embaixo', () => {
    const col = coluna('gold', 1)
    expect(topoDaFaixa(col)).toBe(col.yMin - BAND_PAD_TOP)
    expect(baseDaFaixa(col)).toBe(col.yMax + BAND_PAD_BOTTOM)
    expect(baseDaFaixa(col) - topoDaFaixa(col)).toBeGreaterThan(col.yMax - col.yMin)
  })

  it('a coluna de um nó só continua tendo altura para desenhar', () => {
    const sozinho: LineageColumn = { slug: 'x', label: 'X', x: 0, yMin: 0, yMax: 0 }
    expect(baseDaFaixa(sozinho) - topoDaFaixa(sozinho)).toBe(BAND_PAD_TOP + BAND_PAD_BOTTOM)
  })
})
