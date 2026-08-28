// A flag "produto de dados" no mapa: como o nó a declara e como as DUAS marcas
// que a representam se comportam — o LOSANGO da silhueta e o NEGRITO do rótulo.
//
// A bandeira é o segundo eixo visual do nó, ao lado de coluna (nível) e cor
// (débito) — e é um eixo INTEIRO dedicado a ela: o tipo de componente, que antes
// morava na forma, passou para o ícone interno (ver glifos.test.ts). Os testes
// abaixo travam o que faz dela um eixo próprio:
//
//   • depende só da bandeira (nem do tipo, nem do nível, nem do débito);
//   • o losango é maior que o círculo em toda direção (a marca nunca lê como
//     "um círculo menor") e é reconhecivelmente NÃO redondo — foi o que derrubou
//     o octógono, que só se distinguia inflado a 1.5 do raio;
//   • mas o degrau de TAMANHO fica modesto: tamanho quer dizer grau de conexões
//     mais o ajuste manual da sessão, não a bandeira;
//   • o rótulo em negrito é o segundo canal, o que sobrevive ao zoom em que
//     nenhuma silhueta se lê;
//   • o halo de seleção continua fora da silhueta, onde a borda tracejada de
//     incompleto é traçada.
import { describe, expect, it } from 'vitest'
import type { GraphNodeData } from './graph-types'
import { ehProdutoDeDados, TIPOS_COMPONENTE } from './graph-types'
import { nodeColor, produtoChipColor } from './palette'
import {
  extentOf,
  formaDe,
  HALO_GAP,
  LOSANGO_PONTOS,
  LOSANGO_S,
  pesoDoRotulo,
  raioHalo,
  raioNaDirecao,
  ROTULO_PESO_COMUM,
  ROTULO_PESO_PRODUTO,
  traceShape,
} from './shapes'
import { fakeCtx } from './canvas-recorder'

const node = (extra: Partial<GraphNodeData> = {}): GraphNodeData => ({
  id: 'x',
  nome: 'X',
  nivel: 'gold',
  ...extra,
})

/** Raios plausíveis no mapa (o menor é o de um nó fantasma) e zooms de uso —
 *  do mapa inteiro na tela ao close num nó. */
const RAIOS = [5, 8.9, 20, 60]
const ZOOMS = [0.25, 1, 2.5, 8]

function canaisDe(cor: string): [number, number, number] {
  const m = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(cor)
  if (!m) throw new Error(`cor fora do formato rgb(): ${cor}`)
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

function canaisDoHex(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

describe('ehProdutoDeDados', () => {
  it('só true declara a bandeira: ausente (graph.json antigo) e false valem "não"', () => {
    expect(ehProdutoDeDados(node({ produtoDeDados: true }))).toBe(true)
    expect(ehProdutoDeDados(node({ produtoDeDados: false }))).toBe(false)
    expect(ehProdutoDeDados(node())).toBe(false)
  })

  it('é ortogonal ao nível e ao débito: nada além do próprio campo entra na conta', () => {
    for (const nivel of ['gold', 'primario', 'origem', 'dominio']) {
      for (const debito of ['sim', 'nao', 'avaliar'] as const) {
        expect(ehProdutoDeDados(node({ nivel, debito, produtoDeDados: true }))).toBe(true)
      }
    }
  })
})

describe('forma = produto de dados', () => {
  it('losango quando é produto, círculo quando não é', () => {
    expect(formaDe(true)).toBe('losango')
    expect(formaDe(false)).toBe('circulo')
  })

  it('não depende do tipo de componente — o tipo virou ícone', () => {
    // O eixo é inteiro da bandeira: dois componentes de tipos diferentes com a
    // mesma bandeira ocupam exatamente o mesmo espaço, e o que os separa passa
    // a ser o glifo desenhado dentro deles (ver glifos.test.ts).
    for (const produtoDeDados of [true, false]) {
      const extensoes = TIPOS_COMPONENTE.map((tipoComponente) =>
        extentOf(ehProdutoDeDados(node({ tipoComponente, produtoDeDados })), 20),
      )
      expect(new Set(extensoes).size).toBe(1)
    }
  })
})

/** Área do losango de raio S (quadrado de diagonal 2S), em unidades do raio do
 *  nó — a "tinta" da marca, que é o que pesa na tela quando o nó é pequeno. */
const AREA_LOSANGO = 2 * LOSANGO_S ** 2

describe('losango — geometria', () => {
  it('tem quatro vértices, todos no mesmo raio', () => {
    expect(LOSANGO_PONTOS).toHaveLength(4)
    for (const [x, y] of LOSANGO_PONTOS) {
      expect(Math.hypot(x, y)).toBeCloseTo(LOSANGO_S)
    }
  })

  it('é de PONTA nos quatro eixos — cima, baixo e os dois lados', () => {
    // É a diferença que o octógono não tinha. Lá cada extremo era uma aresta
    // CHATA compartilhada por dois vértices, e o contorno todo ficava a menos de
    // 8% do círculo: no zoom de trabalho lia como um círculo. Aqui cada extremo
    // é UM vértice só, e ele tem a outra coordenada exatamente zero — a ponta
    // aponta no eixo, que é o que se reconhece de relance mesmo com o nó
    // pequeno.
    for (const eixo of [0, 1] as const) {
      const coords = LOSANGO_PONTOS.map((p) => p[eixo])
      for (const extremo of [Math.min(...coords), Math.max(...coords)]) {
        const pontas = LOSANGO_PONTOS.filter((p) => Math.abs(p[eixo] - extremo) < 1e-9)
        expect(pontas).toHaveLength(1)
        expect(pontas[0][1 - eixo]).toBe(0)
      }
    }
  })

  it('é MAIOR que o círculo em toda direção — nunca lê como um círculo menor', () => {
    // O ponto mais próximo do centro é o meio de uma aresta (o apótema), nas
    // diagonais. Num losango ele vale só S/√2, então é ELE que fixa o piso de
    // LOSANGO_S: abaixo de √2 ≈ 1.414 a silhueta afundaria para dentro do
    // círculo justamente nas diagonais.
    const apotema = LOSANGO_S / Math.SQRT2
    expect(apotema).toBeGreaterThan(1)
    // E o contorno de verdade confirma, varrendo a volta inteira.
    for (let g = 0; g < 360; g += 3) {
      expect(raioNaDirecao(true, 1, g * (Math.PI / 180))).toBeGreaterThan(1)
    }
    // A área também é maior.
    expect(AREA_LOSANGO).toBeGreaterThan(Math.PI)
  })

  it('não é redondo por uma margem grande — a silhueta é o sinal, não o tamanho', () => {
    // O que separa "outra forma" de "círculo com um caroço" é a ANISOTROPIA: o
    // quanto o contorno varia da direção mais longe para a mais perto. No
    // octógono era 1.082 (8%), e 8% não se vê num nó de 10 px — por isso a marca
    // só aparecia inflada, e o que destacava de fato era o tamanho. No losango é
    // √2 (41%), que se vê no mesmo nó sem inflar nada.
    const ponta = raioNaDirecao(true, 1, 0)
    const apotema = raioNaDirecao(true, 1, Math.PI / 4)
    expect(ponta / apotema).toBeCloseTo(Math.SQRT2)
    expect(ponta / apotema).toBeGreaterThan(1.3)
  })

  it('o degrau de TAMANHO é modesto: quem destaca é a forma', () => {
    // O octógono precisou de 1.5 para se distinguir, o que dobrava a área do nó
    // (2√2·1.5²/π = 2.02) — a essa altura quem marcava produto de dados era o
    // tamanho, e o tamanho já tem dono: o grau de conexões, mais o fator manual
    // da sessão (node-resize.ts). Com o losango o degrau cai para ~1.34, dentro
    // do que o fator manual mexe num arraste curto — ou seja, a bandeira deixa
    // de ser legível pelo tamanho, e passa a ser legível pela silhueta.
    const areaRelativa = AREA_LOSANGO / Math.PI
    expect(areaRelativa).toBeGreaterThan(1)
    expect(areaRelativa).toBeLessThan(1.5)
    // Menos da metade do degrau que o octógono a 1.5 pedia.
    const areaDoOctogonoInflado = (2 * Math.SQRT2 * 1.5 ** 2) / Math.PI
    expect(areaRelativa).toBeLessThan(areaDoOctogonoInflado / 1.4)
  })

  it('traceShape desenha o losango do produto e o arco de quem não é', () => {
    const losango = fakeCtx()
    traceShape(losango, true, 100, 50, 10)
    expect(losango.calls.filter((c) => c.startsWith('arc'))).toHaveLength(0)
    // Um moveTo, três lineTo e o fechamento: os quatro vértices, escalados pelo
    // raio e transladados para o centro do nó.
    expect(losango.calls.filter((c) => c.startsWith('lineTo'))).toHaveLength(3)
    expect(losango.calls).toContain('closePath')
    const [x0, y0] = LOSANGO_PONTOS[0]
    expect(losango.calls[1]).toBe(`moveTo(${100 + x0 * 10},${50 + y0 * 10})`)
    // As pontas de cima e de baixo caem no eixo do nó (x = 100 cravado, sem
    // resíduo de ponto flutuante): é o que mantém a silhueta simétrica e o
    // `points` do SVG da legenda e do chip limpo.
    expect(losango.calls).toContain(`lineTo(100,${50 + LOSANGO_S * 10})`)
    expect(losango.calls).toContain(`lineTo(100,${50 - LOSANGO_S * 10})`)

    const circulo = fakeCtx()
    traceShape(circulo, false, 100, 50, 10)
    expect(circulo.calls).toContain('arc(100,50,10)')
    expect(circulo.calls.filter((c) => c.startsWith('lineTo'))).toHaveLength(0)
  })
})

describe('rótulo = produto de dados (o segundo canal)', () => {
  it('negrito para produto, peso normal para os demais', () => {
    expect(pesoDoRotulo(true)).toBe(ROTULO_PESO_PRODUTO)
    expect(pesoDoRotulo(false)).toBe(ROTULO_PESO_COMUM)
    expect(ROTULO_PESO_PRODUTO).toBeGreaterThan(ROTULO_PESO_COMUM)
  })

  it('é 700, o peso que toda fonte de sistema tem', () => {
    // `system-ui` cai numa família diferente em cada máquina, e o corte semibold
    // (600) falta em várias delas — onde falta, o navegador arredonda para o
    // regular e a marca SOME sem avisar. 700 é o único peso que se pode assumir.
    expect(ROTULO_PESO_PRODUTO).toBe(700)
  })

  it('depende só da bandeira, como a forma — os dois canais dizem a mesma coisa', () => {
    for (const produtoDeDados of [true, false]) {
      const pesos = TIPOS_COMPONENTE.map((tipoComponente) =>
        pesoDoRotulo(ehProdutoDeDados(node({ tipoComponente, produtoDeDados }))),
      )
      expect(new Set(pesos).size).toBe(1)
      expect(pesos[0]).toBe(pesoDoRotulo(produtoDeDados))
    }
  })
})

describe('halo de seleção', () => {
  it('fica sempre FORA da silhueta, nas duas formas e em todo zoom', () => {
    for (const produto of [true, false]) {
      for (const r of RAIOS) {
        for (const scale of ZOOMS) {
          const extent = extentOf(produto, r)
          // A borda tracejada de "incompleto" é traçada EM CIMA da silhueta,
          // então basta o halo estar fora dela para as duas marcas conviverem.
          expect(raioHalo(extent, scale)).toBeGreaterThan(extent)
          // E a folga é em px de TELA: a mesma espessura aparente em qualquer
          // zoom.
          expect((raioHalo(extent, scale) - extent) * scale).toBeCloseTo(HALO_GAP)
        }
      }
    }
  })

  it('o losango empurra o halo (e o rótulo) para fora do círculo equivalente', () => {
    for (const scale of ZOOMS) {
      expect(raioHalo(extentOf(true, 20), scale)).toBeGreaterThan(
        raioHalo(extentOf(false, 20), scale),
      )
    }
  })
})

describe('produtoChipColor', () => {
  it('é a cor do próprio nó clareada — nenhum canal escurece, e algum clareia', () => {
    for (const debito of ['sim', 'nao', 'avaliar'] as const) {
      const n = node({ debito, produtoDeDados: true })
      const doNo = canaisDoHex(nodeColor(n))
      const doChip = canaisDe(produtoChipColor(n))
      expect(doChip.every((v, i) => v >= doNo[i])).toBe(true)
      expect(doChip.some((v, i) => v > doNo[i])).toBe(true)
    }
  })

  it('não é branco: o halo de seleção é que é branco, e os dois não podem se confundir', () => {
    for (const debito of ['sim', 'nao', 'avaliar'] as const) {
      expect(canaisDe(produtoChipColor(node({ debito })))).not.toEqual([255, 255, 255])
    }
  })

  it('segue a semântica de débito: o chip muda de cor com ela, não inventa uma quinta', () => {
    const comDebito = produtoChipColor(node({ debito: 'sim' }))
    const curado = produtoChipColor(node({ debito: 'nao', descricao: 'dado curado' }))
    expect(comDebito).not.toBe(curado)
  })
})
