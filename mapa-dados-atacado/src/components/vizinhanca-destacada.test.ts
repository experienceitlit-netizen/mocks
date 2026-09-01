// A regra do destaque: as âncoras (rastro + hover + balão), a vizinhança de
// primeiro nível que elas acendem e o que sobra esmaecido — sem ninguém sair
// da tela.
import { describe, expect, it } from 'vitest'
import {
  ancorasDoDestaque,
  comNoAlternado,
  foraDoDestaque,
  umSoFixado,
  vizinhancaDoDestaque,
} from './vizinhanca-destacada'

/** Cadeia a → b → c → d, mais um `solto` sem nenhuma ligação. */
const VIZINHOS = new Map<string, ReadonlySet<string>>([
  ['a', new Set(['b'])],
  ['b', new Set(['a', 'c'])],
  ['c', new Set(['b', 'd'])],
  ['d', new Set(['c'])],
])
const NA_VISTA: ReadonlySet<string> = new Set(['a', 'b', 'c', 'd', 'solto'])

const ordenado = (ids: Iterable<string>) => [...ids].sort()
const SEM_RASTRO: ReadonlySet<string> = new Set()

describe('as âncoras do destaque', () => {
  it('sem gesto nenhum, não há âncora', () => {
    expect(ancorasDoDestaque(null, SEM_RASTRO, null, NA_VISTA).size).toBe(0)
  })

  // A mudança que o rastro trouxe: as três origens SOMAM em vez de disputarem
  // precedência. O hover espia o passo seguinte por cima da trilha montada.
  it('o hover soma ao rastro em vez de substituí-lo', () => {
    const ancoras = ancorasDoDestaque('d', new Set(['a', 'b']), null, NA_VISTA)
    expect(ordenado(ancoras)).toEqual(['a', 'b', 'd'])
  })

  it('o nó do balão também ancora, junto com os outros', () => {
    expect(ordenado(ancorasDoDestaque(null, new Set(['a']), 'c', NA_VISTA))).toEqual(['a', 'c'])
  })

  it('hover no que já está no rastro não duplica', () => {
    expect(ordenado(ancorasDoDestaque('a', new Set(['a']), 'a', NA_VISTA))).toEqual(['a'])
  })

  // O balão pode ficar aberto num componente que o foco atual não mostra —
  // ancorar por ele esmaeceria o mapa em nome de um nó que não está na tela.
  it('id fora da vista não ancora, nem no rastro nem no balão', () => {
    expect(ordenado(ancorasDoDestaque(null, new Set(['a', 'fora']), 'outro', NA_VISTA))).toEqual([
      'a',
    ])
    expect(ancorasDoDestaque(null, new Set(['fora']), null, NA_VISTA).size).toBe(0)
  })
})

describe('a vizinhança acesa', () => {
  it('é a âncora mais os vizinhos de primeiro nível', () => {
    expect(ordenado(vizinhancaDoDestaque(new Set(['b']), VIZINHOS, NA_VISTA))).toEqual([
      'a',
      'b',
      'c',
    ])
  })

  it('não passa do primeiro nível: o vizinho do vizinho fica de fora', () => {
    expect(vizinhancaDoDestaque(new Set(['a']), VIZINHOS, NA_VISTA).has('c')).toBe(false)
  })

  it('componente sem nenhuma ligação acende sozinho', () => {
    expect([...vizinhancaDoDestaque(new Set(['solto']), VIZINHOS, NA_VISTA)]).toEqual(['solto'])
  })

  // O acúmulo: cada âncora traz a vizinhança DELA, e as vizinhanças se somam.
  it('duas âncoras acendem a união das duas vizinhanças', () => {
    expect(ordenado(vizinhancaDoDestaque(new Set(['a', 'd']), VIZINHOS, NA_VISTA))).toEqual([
      'a',
      'b',
      'c',
      'd',
    ])
  })

  // O primeiro nível é de CADA âncora, nunca do conjunto: senão o rastro
  // viraria fecho transitivo e, em poucos cliques, acenderia o grafo inteiro.
  it('o primeiro nível não se propaga de uma âncora para a outra', () => {
    // 'a' e 'b' são vizinhos; o alcance continua parando em 'c' e não chega a 'd'.
    const acesos = vizinhancaDoDestaque(new Set(['a', 'b']), VIZINHOS, NA_VISTA)
    expect(ordenado(acesos)).toEqual(['a', 'b', 'c'])
    expect(acesos.has('d')).toBe(false)
  })

  it('sem âncora, nada acende', () => {
    expect(vizinhancaDoDestaque(SEM_RASTRO, VIZINHOS, NA_VISTA).size).toBe(0)
  })

  // Quem o foco não trouxe para a vista não volta pelo destaque: a vizinhança
  // acende dentro do que está na tela, nunca acrescenta.
  it('vizinho fora da vista não entra', () => {
    const soAB: ReadonlySet<string> = new Set(['a', 'b'])
    expect(ordenado(vizinhancaDoDestaque(new Set(['b']), VIZINHOS, soAB))).toEqual(['a', 'b'])
  })
})

describe('o que o destaque esmaece', () => {
  it('tudo que está na vista e fora da vizinhança', () => {
    expect(ordenado(foraDoDestaque(new Set(['a']), VIZINHOS, NA_VISTA))).toEqual([
      'c',
      'd',
      'solto',
    ])
  })

  it('o rastro encolhe o esmaecido a cada nó acrescentado', () => {
    expect(ordenado(foraDoDestaque(new Set(['a']), VIZINHOS, NA_VISTA))).toEqual([
      'c',
      'd',
      'solto',
    ])
    expect(ordenado(foraDoDestaque(new Set(['a', 'c']), VIZINHOS, NA_VISTA))).toEqual(['solto'])
  })

  it('sem destaque, nada esmaece — o mapa inteiro em tinta cheia', () => {
    expect(foraDoDestaque(SEM_RASTRO, VIZINHOS, NA_VISTA).size).toBe(0)
  })

  it('âncora fora da vista também não esmaece nada', () => {
    expect(foraDoDestaque(new Set(['fora']), VIZINHOS, NA_VISTA).size).toBe(0)
  })

  // O esmaecido e o aceso são complementares dentro da vista: é o que garante
  // que nenhum id fique nos dois nem fora dos dois — e, sobretudo, que TODO id
  // da vista continue na tela, num estado ou no outro. Ninguém some.
  it('esmaecido e aceso repartem a vista sem sobra', () => {
    const ancoras = new Set(['c'])
    const fora = foraDoDestaque(ancoras, VIZINHOS, NA_VISTA)
    const acesos = vizinhancaDoDestaque(ancoras, VIZINHOS, NA_VISTA)
    for (const id of NA_VISTA) expect(fora.has(id)).toBe(!acesos.has(id))
  })
})

describe('o clique que monta o rastro', () => {
  it('acrescenta quem não estava', () => {
    expect(ordenado(comNoAlternado(new Set(['a']), 'c'))).toEqual(['a', 'c'])
  })

  it('e tira quem já estava, sem levar os outros junto', () => {
    expect(ordenado(comNoAlternado(new Set(['a', 'b', 'c']), 'b'))).toEqual(['a', 'c'])
  })

  it('não muda o conjunto que recebeu', () => {
    const antes: ReadonlySet<string> = new Set(['a'])
    comNoAlternado(antes, 'b')
    expect([...antes]).toEqual(['a'])
  })
})

describe('o alvo único do rastro', () => {
  it('com um só fixado, é ele', () => {
    expect(umSoFixado(new Set(['a']))).toBe('a')
  })

  // Com trilha acumulada não existe "o componente em evidência": há vários, e
  // nenhum é mais alvo que o outro. Tecla destrutiva não escolhe por ordem.
  it('com vários, não há alvo', () => {
    expect(umSoFixado(new Set(['a', 'b']))).toBe(null)
  })

  it('com o rastro vazio, também não', () => {
    expect(umSoFixado(SEM_RASTRO)).toBe(null)
  })
})
