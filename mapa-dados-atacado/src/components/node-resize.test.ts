// O GESTO DE REDIMENSIONAR PELA BORDA, testado onde ele decide as coisas.
//
// A parte que mexe com o DOM (parar a propagação na captura para o d3-drag não
// ver o press, trocar o cursor do canvas) vive em Graph.tsx e é verificada na
// fumaça headless. O que está aqui é tudo que tem regra própria: quando o
// cursor "está na borda", quanto o arraste muda o tamanho, onde ele para, e o
// contrato do mapa de escalas — inclusive a parte chata dele, que é NÃO gerar
// estado novo a cada pixel de mouse.
//
// A ligação entre o gesto e o DESENHO também é travada aqui: a faixa de borda é
// medida por raioNaDirecao (shapes.ts), e o teste confere que essa medida é a
// silhueta que traceShape realmente desenha — se um dia a forma do nó mudar sem
// a medida mudar junto, a borda pegaria no lugar errado e este teste cai.
import { describe, expect, it } from 'vitest'
import {
  BORDA_TOL_PX,
  clampFator,
  comFator,
  cursorDaBorda,
  FATOR_MAX,
  FATOR_MIN,
  FATOR_PADRAO,
  fatorArrastando,
  fatorDe,
  naBorda,
  noLimite,
  podadas,
} from './node-resize'
import { extentOf, LOSANGO_S, raioNaDirecao, traceShape } from './shapes'
import { fakeCtx } from './canvas-recorder'

const GRAU = Math.PI / 180

describe('limites do ajuste', () => {
  it('nunca deixa o fator sair de [0.5, 3]', () => {
    expect(clampFator(0.1)).toBe(FATOR_MIN)
    expect(clampFator(0)).toBe(FATOR_MIN)
    expect(clampFator(-4)).toBe(FATOR_MIN)
    expect(clampFator(12)).toBe(FATOR_MAX)
    expect(clampFator(Number.POSITIVE_INFINITY)).toBe(FATOR_PADRAO)
  })

  it('deixa passar intacto o que já está dentro', () => {
    for (const f of [FATOR_MIN, 0.73, 1, 1.25, 2.4, FATOR_MAX]) expect(clampFator(f)).toBe(f)
  })

  it('valor inválido volta ao padrão em vez de sumir com o nó', () => {
    // Uma divisão por zero em qualquer conta de tela chegaria aqui como NaN; o
    // nó tem que continuar do tamanho que era, não virar um ponto invisível.
    expect(clampFator(Number.NaN)).toBe(FATOR_PADRAO)
  })

  it('noLimite avisa só nos extremos', () => {
    expect(noLimite(FATOR_MIN)).toBe(true)
    expect(noLimite(FATOR_MAX)).toBe(true)
    expect(noLimite(FATOR_PADRAO)).toBe(false)
    expect(noLimite(2.9)).toBe(false)
  })
})

describe('fatorDe', () => {
  it('nó que ninguém mexeu vale 1 — o tamanho que os dados calculam', () => {
    expect(fatorDe(new Map(), 'qualquer')).toBe(FATOR_PADRAO)
  })

  it('lê o fator do mapa, já dentro dos limites', () => {
    const escalas = new Map([
      ['a', 2],
      ['b', 99],
    ])
    expect(fatorDe(escalas, 'a')).toBe(2)
    expect(fatorDe(escalas, 'b')).toBe(FATOR_MAX)
  })
})

describe('naBorda', () => {
  const RAIO = 20

  it('pega a faixa dos dois lados do contorno, por dentro e por fora', () => {
    expect(naBorda(RAIO, RAIO)).toBe(true)
    expect(naBorda(RAIO - BORDA_TOL_PX, RAIO)).toBe(true)
    expect(naBorda(RAIO + BORDA_TOL_PX, RAIO)).toBe(true)
  })

  it('o MIOLO do nó não é borda — é lá que o clique e o arraste de sempre moram', () => {
    expect(naBorda(0, RAIO)).toBe(false)
    expect(naBorda(RAIO - BORDA_TOL_PX - 0.01, RAIO)).toBe(false)
  })

  it('longe do nó também não é borda', () => {
    expect(naBorda(RAIO + BORDA_TOL_PX + 0.01, RAIO)).toBe(false)
    expect(naBorda(200, RAIO)).toBe(false)
  })

  it('a faixa não engole o nó pequeno: sobra miolo até no menor raio do mapa', () => {
    // O menor nó do mapa tem raio ~5 px de grafo e, no zoom de trabalho, mais
    // que isso na tela. Com a faixa de 6 px, o centro dele continua fora dela —
    // ou seja, ainda dá para clicar no nó sem cair no gesto de redimensionar.
    expect(naBorda(0, 8)).toBe(false)
  })

  it('a tolerância é parametrizável (mesmo contrato, outra medida)', () => {
    expect(naBorda(RAIO + 10, RAIO, 12)).toBe(true)
    expect(naBorda(RAIO + 10, RAIO, 2)).toBe(false)
  })
})

describe('fatorArrastando', () => {
  it('afastar do centro aumenta, aproximar diminui', () => {
    expect(fatorArrastando(1, 20, 40)).toBeCloseTo(2)
    expect(fatorArrastando(1, 20, 10)).toBeCloseTo(0.5)
    expect(fatorArrastando(1, 20, 20)).toBeCloseTo(1)
  })

  it('parte do fator em que o nó JÁ estava — dois arrastes seguidos compõem', () => {
    // Quem já tinha esticado o nó para 1.5 e puxa mais 20% chega em 1.8, não
    // volta para 1.2: o gesto continua de onde o anterior parou.
    expect(fatorArrastando(1.5, 30, 36)).toBeCloseTo(1.8)
  })

  it('pegando EXATAMENTE na borda desenhada, a borda gruda no cursor', () => {
    // A propriedade que faz o gesto parecer natural: se distInicial é o raio da
    // borda, o raio novo é a própria distância do cursor ao centro. O nó estica
    // junto com a mão em vez de seguir uma sensibilidade arbitrária.
    const raioBase = 14
    const fatorInicial = 1.2
    const raioBorda = raioBase * fatorInicial
    for (const distAtual of [10, 18, 25, 33]) {
      const novo = fatorArrastando(fatorInicial, raioBorda, distAtual)
      expect(raioBase * novo).toBeCloseTo(distAtual)
    }
  })

  it('é invariante ao tamanho do nó e ao zoom — a razão, não o delta em px', () => {
    // O mesmo "dobrei a distância" vale o mesmo num nó pequeno e num grande, e
    // no mapa inteiro na tela ou no close. Um delta em px daria passos
    // diferentes em cada situação.
    expect(fatorArrastando(1, 8, 16)).toBeCloseTo(fatorArrastando(1, 80, 160))
  })

  it('não passa dos limites por mais que a mão vá longe', () => {
    expect(fatorArrastando(1, 20, 2000)).toBe(FATOR_MAX)
    expect(fatorArrastando(1, 20, 0)).toBe(FATOR_MIN)
    expect(fatorArrastando(FATOR_MAX, 20, 400)).toBe(FATOR_MAX)
    expect(fatorArrastando(FATOR_MIN, 20, 1)).toBe(FATOR_MIN)
  })

  it('gesto que começou colado no centro não mexe no tamanho', () => {
    // Divisão por ~zero: em vez de explodir o nó, o gesto simplesmente não faz
    // nada e o fator anterior fica de pé.
    expect(fatorArrastando(1.4, 0, 300)).toBeCloseTo(1.4)
    expect(fatorArrastando(1.4, 0.5, 300)).toBeCloseTo(1.4)
  })
})

describe('comFator (o mapa de escalas)', () => {
  it('grava o fator do nó sem tocar nos outros', () => {
    const antes = new Map([['a', 2]])
    const depois = comFator(antes, 'b', 1.5)
    expect(depois.get('a')).toBe(2)
    expect(depois.get('b')).toBe(1.5)
    expect(antes.has('b')).toBe(false) // o mapa recebido não é mutado
  })

  it('devolve o MESMO mapa quando o tamanho não muda de fato', () => {
    // É isto que impede o arraste de disparar um render por pixel de mouse: o
    // React sai fora quando o estado volta idêntico.
    const escalas = new Map([['a', 2]])
    expect(comFator(escalas, 'a', 2)).toBe(escalas)
    expect(comFator(escalas, 'a', 2.001)).toBe(escalas)
    expect(comFator(escalas, 'b', FATOR_PADRAO)).toBe(escalas)
    expect(comFator(escalas, 'a', 2.05)).not.toBe(escalas)
  })

  it('voltar ao padrão APAGA a entrada: mapa vazio = nada redimensionado', () => {
    // A legenda conta os nós mexidos pelo tamanho do mapa; um nó "mexido para
    // 1" faria o botão de restaurar aparecer sem ter o que restaurar.
    const escalas = comFator(new Map([['a', 2]]), 'a', FATOR_PADRAO)
    expect(escalas.size).toBe(0)
  })

  it('guarda sempre um fator já dentro dos limites', () => {
    expect(comFator(new Map(), 'a', 50).get('a')).toBe(FATOR_MAX)
    expect(comFator(new Map(), 'a', -1).get('a')).toBe(FATOR_MIN)
  })
})

describe('podadas', () => {
  it('some com o ajuste do nó que saiu do grafo', () => {
    const escalas = new Map([
      ['vivo', 2],
      ['excluido', 1.5],
    ])
    const depois = podadas(escalas, (id) => id === 'vivo')
    expect([...depois.keys()]).toEqual(['vivo'])
  })

  it('sem sobra, devolve o mesmo mapa', () => {
    const escalas = new Map([['vivo', 2]])
    expect(podadas(escalas, () => true)).toBe(escalas)
    expect(podadas(new Map(), () => false)).toBeInstanceOf(Map)
  })
})

describe('cursorDaBorda', () => {
  it('é o cursor de alça que aponta na direção em que a mão vai puxar', () => {
    // Convenção do canvas: 0 = leste e o y cresce para BAIXO.
    expect(cursorDaBorda(0)).toBe('ew-resize') // leste
    expect(cursorDaBorda(Math.PI)).toBe('ew-resize') // oeste
    expect(cursorDaBorda(Math.PI / 2)).toBe('ns-resize') // sul
    expect(cursorDaBorda(-Math.PI / 2)).toBe('ns-resize') // norte
    expect(cursorDaBorda(Math.PI / 4)).toBe('nwse-resize') // sudeste
    expect(cursorDaBorda(-(3 * Math.PI) / 4)).toBe('nwse-resize') // noroeste
    expect(cursorDaBorda(-Math.PI / 4)).toBe('nesw-resize') // nordeste
    expect(cursorDaBorda((3 * Math.PI) / 4)).toBe('nesw-resize') // sudoeste
  })

  it('nunca fica sem cursor, em qualquer ângulo (inclusive fora de ±π)', () => {
    for (let g = -720; g <= 720; g += 7) {
      expect(cursorDaBorda(g * GRAU)).toMatch(/-resize$/)
    }
  })

  it('direções opostas usam o mesmo cursor — a alça é o eixo, não o sentido', () => {
    for (let g = 0; g < 360; g += 11) {
      expect(cursorDaBorda(g * GRAU)).toBe(cursorDaBorda((g + 180) * GRAU))
    }
  })
})

// ---------------------------------------------------------------------------
// A MEDIDA DA BORDA É A SILHUETA DESENHADA
// ---------------------------------------------------------------------------

/** Vértices que traceShape realmente mandou o canvas desenhar, em torno da
 *  origem. */
function silhuetaDesenhada(produto: boolean, r: number): Array<[number, number]> {
  const ctx = fakeCtx()
  traceShape(ctx, produto, 0, 0, r)
  return ctx.calls
    .map((c) => /^(?:moveTo|lineTo)\(([-\d.e]+),([-\d.e]+)\)$/.exec(c))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => [Number(m[1]), Number(m[2])])
}

/** Onde o raio saindo da origem no ângulo `theta` corta o polígono. */
function corteDoRaio(pontos: Array<[number, number]>, theta: number): number {
  const dx = Math.cos(theta)
  const dy = Math.sin(theta)
  for (let i = 0; i < pontos.length; i++) {
    const [ax, ay] = pontos[i]
    const [bx, by] = pontos[(i + 1) % pontos.length]
    const ex = bx - ax
    const ey = by - ay
    const den = dx * ey - dy * ex
    if (Math.abs(den) < 1e-12) continue
    const t = (ax * ey - ay * ex) / den // distância ao longo do raio
    const u = (ax * dy - ay * dx) / den // posição na aresta, 0..1
    if (t > 0 && u >= -1e-9 && u <= 1 + 1e-9) return t
  }
  throw new Error(`raio em ${theta} não cortou a silhueta`)
}

describe('raioNaDirecao', () => {
  it('no círculo é o próprio raio, em qualquer direção', () => {
    for (let g = 0; g < 360; g += 13) expect(raioNaDirecao(false, 17, g * GRAU)).toBeCloseTo(17)
  })

  it('no losango, bate com a silhueta que traceShape desenha', () => {
    // O elo entre INTERAÇÃO e DESENHO: a faixa de borda é medida por esta
    // função, então ela tem que ser o contorno de verdade — inclusive nas
    // diagonais, onde a ponta ficaria 41% para fora do desenho.
    const r = 13
    const pontos = silhuetaDesenhada(true, r)
    expect(pontos).toHaveLength(4)
    for (let g = 0; g < 360; g += 3) {
      const theta = g * GRAU
      expect(raioNaDirecao(true, r, theta)).toBeCloseTo(corteDoRaio(pontos, theta), 6)
    }
  })

  it('varia entre o apótema (meio da aresta) e a ponta — e nunca passa do extent', () => {
    const r = 10
    const ponta = r * LOSANGO_S
    const apotema = ponta / Math.SQRT2
    // Pontas em k·90° (nos eixos); meios das arestas nas diagonais, 45° + k·90°.
    expect(raioNaDirecao(true, r, 0)).toBeCloseTo(ponta)
    expect(raioNaDirecao(true, r, 90 * GRAU)).toBeCloseTo(ponta)
    expect(raioNaDirecao(true, r, 45 * GRAU)).toBeCloseTo(apotema)
    expect(raioNaDirecao(true, r, 135 * GRAU)).toBeCloseTo(apotema)
    for (let g = 0; g < 360; g += 5) {
      const d = raioNaDirecao(true, r, g * GRAU)
      expect(d).toBeGreaterThanOrEqual(apotema - 1e-9)
      expect(d).toBeLessThanOrEqual(extentOf(true, r) + 1e-9)
    }
  })

  it('escala com o raio: o fator do arraste vale igual para as duas formas', () => {
    for (const produto of [false, true]) {
      for (let g = 0; g < 360; g += 17) {
        const theta = g * GRAU
        expect(raioNaDirecao(produto, 24, theta)).toBeCloseTo(
          2 * raioNaDirecao(produto, 12, theta),
        )
      }
    }
  })
})

describe('o gesto inteiro, ponta a ponta', () => {
  /** Um arraste: pega na borda do nó na direção theta e leva o cursor para
   *  `distFinal` do centro. Devolve o fator resultante. */
  function arrastar(
    produto: boolean,
    raioBase: number,
    zoom: number,
    fatorAntes: number,
    theta: number,
    distFinal: number,
  ): number {
    const raioBorda = raioNaDirecao(produto, raioBase * fatorAntes, theta) * zoom
    expect(naBorda(raioBorda, raioBorda)).toBe(true) // pegou na borda
    return fatorArrastando(fatorAntes, raioBorda, distFinal)
  }

  it('puxar para FORA aumenta e puxar para DENTRO diminui, nas duas formas', () => {
    for (const produto of [false, true]) {
      const raioBorda = raioNaDirecao(produto, 12, 0) * 1.5
      expect(arrastar(produto, 12, 1.5, 1, 0, raioBorda * 1.6)).toBeGreaterThan(1)
      expect(arrastar(produto, 12, 1.5, 1, 0, raioBorda * 0.7)).toBeLessThan(1)
    }
  })

  it('o clamp segura os dois extremos e o gesto seguinte sai de lá', () => {
    const noTeto = arrastar(true, 12, 1.5, 1, Math.PI / 4, 9999)
    expect(noTeto).toBe(FATOR_MAX)
    // Do teto dá para voltar: puxar para dentro encolhe de novo até o piso.
    const voltando = arrastar(true, 12, 1.5, noTeto, Math.PI / 4, 1)
    expect(voltando).toBe(FATOR_MIN)
  })

  it('o zoom não muda o resultado: a mesma mão dá o mesmo tamanho', () => {
    // Puxar até "o dobro da distância" vale o dobro com o mapa inteiro na tela
    // e no close — o gesto não fica mais sensível quando se dá zoom.
    const perto = arrastar(false, 12, 4, 1, 0, raioNaDirecao(false, 12, 0) * 4 * 2)
    const longe = arrastar(false, 12, 0.4, 1, 0, raioNaDirecao(false, 12, 0) * 0.4 * 2)
    expect(perto).toBeCloseTo(longe)
  })
})
