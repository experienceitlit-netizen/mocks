// MOVER AS FAIXAS DE NÍVEL, testado onde o gesto decide as coisas.
//
// Os testes que mais importam aqui são os do eixo HORIZONTAL, porque é o único
// que tem uma promessa forte a cumprir: a faixa arrastada NUNCA fica sobreposta
// e NUNCA deixa buraco. Essa promessa não é verificada depois do fato — ela vem
// de a reordenação produzir sempre uma PERMUTAÇÃO da sequência, que
// geometriaDasFaixas então posiciona lado a lado como sempre fez. É isso que os
// testes travam: que toda troca preserve o conjunto de colunas, que trocar não
// oscile, e que soltar onde se pegou não mexa em nada.
//
// O eixo VERTICAL tem promessa menor (é offset puro), mas tem uma armadilha: o
// y é escrito ABSOLUTO a partir de uma base capturada uma vez. Aplicar duas
// vezes seguidas tem de dar o mesmo resultado, senão o deslocamento se acumula
// a cada quadro do arraste — e é o que o teste de idempotência cobre.
import { describe, expect, it } from 'vitest'
import type { SimNode } from './graph-types'
import type { LineageColumn } from './lineage'
import { NIVEIS_COL_X } from './lineage'
import {
  aplicarLarguras,
  BAND_W,
  bordaDireita,
  bordaEsquerda,
  CORREDOR,
  FAIXA_MAX,
  geometriaDasFaixas,
  topoDaFaixa,
} from './band-resize'
import {
  ALTURA_CABECALHO,
  aplicarDeslocamentos,
  basesVerticais,
  cabecalhoSob,
  clampDeslocamento,
  comArraste,
  comDeslocamento,
  DESLOC_MAX,
  deslocamentoDe,
  mesmaOrdem,
  niveisReordenados,
  ordemAoArrastar,
  ordemAtualizada,
  ordemMesclada,
  ordemRestaurada,
  ordenarPorSessao,
  reordenarColunas,
} from './band-move'

const SLUGS = ['dominio', 'gold', 'silver', 'broze', 'origem']

const semAjuste = new Map<string, number>()

/** Coluna como buildLineage a entrega (x já no lugar padrão). */
function coluna(slug: string, i: number, altura = 2): LineageColumn {
  const meia = (altura * 70) / 2
  return { slug, label: slug, x: i * NIVEIS_COL_X, yMin: -meia, yMax: meia }
}

function no(id: string, nivel: string, x: number, y: number): SimNode {
  return { id, nome: id, nivel, x, y, fx: x, fy: y }
}

/** Centro da faixa `slug` no fluxo, dada uma ordem e as larguras. */
function centroNoFluxo(
  ordem: readonly string[],
  larguras: ReadonlyMap<string, number>,
  slug: string,
): number {
  const g = geometriaDasFaixas(ordem, larguras).find((geom) => geom.slug === slug)
  if (g === undefined) throw new Error(`sem faixa ${slug}`)
  return g.x
}

describe('ordenarPorSessao', () => {
  it('sem ordem de sessão, é a ordem base — o MESMO array', () => {
    expect(ordenarPorSessao(SLUGS, null)).toBe(SLUGS)
  })

  it('projeta a sequência dos níveis nas colunas que estão na tela', () => {
    // A sessão conhece cinco níveis; o foco atual mostra três colunas.
    const sessao = ['origem', 'dominio', 'gold', 'silver', 'broze']
    expect(ordenarPorSessao(['dominio', 'gold', 'origem'], sessao)).toEqual([
      'origem',
      'dominio',
      'gold',
    ])
  })

  it('slug que a sessão não conhece entra no fim', () => {
    // Nível criado (ou que ganhou o primeiro componente) depois do arraste.
    expect(ordenarPorSessao(['gold', 'novo', 'dominio'], ['dominio', 'gold'])).toEqual([
      'dominio',
      'gold',
      'novo',
    ])
  })

  it('quando a sessão já descreve exatamente esta base, devolve o MESMO array', () => {
    const sessao = ['gold', 'dominio']
    expect(ordenarPorSessao(['dominio', 'gold'], sessao)).toBe(sessao)
  })
})

describe('ordemAtualizada', () => {
  it('some quando a ordem de sessão virou a ordem salva — é o "aplicar" se normalizando', () => {
    // Depois de gravar o niveis.csv, a ordem salva passa a ser esta; a de
    // sessão não tem mais nada a dizer e desaparece sozinha.
    expect(ordemAtualizada(['gold', 'dominio'], ['gold', 'dominio'])).toBeNull()
  })

  it('sobrevive enquanto for diferente da salva', () => {
    expect(ordemAtualizada(SLUGS, ['gold', ...SLUGS.filter((s) => s !== 'gold')])).toEqual([
      'gold',
      'dominio',
      'silver',
      'broze',
      'origem',
    ])
  })

  it('nível excluído no modal sai da sequência', () => {
    expect(ordemAtualizada(['dominio', 'gold'], ['gold', 'extinto', 'dominio'])).toEqual([
      'gold',
      'dominio',
    ])
  })

  it('excluir o nível pode fazer a ordem de sessão coincidir com a salva — e ela some', () => {
    expect(ordemAtualizada(['dominio', 'gold'], ['dominio', 'extinto', 'gold'])).toBeNull()
  })

  it('sem ordem de sessão não há o que atualizar', () => {
    expect(ordemAtualizada(SLUGS, null)).toBeNull()
  })
})

describe('ordemMesclada', () => {
  it('a reordenação das colunas visíveis entra nas posições delas', () => {
    // 'silver' não é coluna agora (fora do foco): fica onde está, e só as
    // outras três rodam entre as posições que ocupavam.
    expect(
      ordemMesclada(['dominio', 'gold', 'silver', 'origem'], ['origem', 'dominio', 'gold']),
    ).toEqual(['origem', 'dominio', 'silver', 'gold'])
  })

  it('slug que não está na sequência completa é ignorado', () => {
    expect(ordemMesclada(['a', 'b'], ['b', 'z', 'a'])).toEqual(['b', 'a'])
  })

  it('mesma ordem entra, mesma ordem sai', () => {
    expect(ordemMesclada(SLUGS, SLUGS)).toEqual([...SLUGS])
  })
})

describe('ordemAoArrastar', () => {
  it('soltar onde pegou não mexe em nada — o MESMO array', () => {
    const ordem = [...SLUGS]
    const centro = centroNoFluxo(ordem, semAjuste, 'silver')
    expect(ordemAoArrastar(ordem, semAjuste, 'silver', centro)).toBe(ordem)
  })

  it('não troca antes de cruzar o centro da vizinha', () => {
    const ordem = [...SLUGS]
    const meu = centroNoFluxo(ordem, semAjuste, 'gold')
    const vizinha = centroNoFluxo(ordem, semAjuste, 'silver')
    // Andou para a direita, mas parou um fio antes do centro da vizinha.
    expect(ordemAoArrastar(ordem, semAjuste, 'gold', vizinha - 1)).toBe(ordem)
    expect(vizinha - 1).toBeGreaterThan(meu)
  })

  it('troca com a vizinha da direita quando cruza o centro dela', () => {
    const ordem = [...SLUGS]
    const vizinha = centroNoFluxo(ordem, semAjuste, 'silver')
    expect(ordemAoArrastar(ordem, semAjuste, 'gold', vizinha + 1)).toEqual([
      'dominio',
      'silver',
      'gold',
      'broze',
      'origem',
    ])
  })

  it('troca com a vizinha da esquerda pela mesma regra', () => {
    const ordem = [...SLUGS]
    const vizinha = centroNoFluxo(ordem, semAjuste, 'gold')
    expect(ordemAoArrastar(ordem, semAjuste, 'silver', vizinha - 1)).toEqual([
      'dominio',
      'silver',
      'gold',
      'broze',
      'origem',
    ])
  })

  it('um puxão longo atravessa várias colunas de uma vez', () => {
    const ordem = [...SLUGS]
    const fim = centroNoFluxo(ordem, semAjuste, 'origem')
    expect(ordemAoArrastar(ordem, semAjuste, 'dominio', fim + 50)).toEqual([
      'gold',
      'silver',
      'broze',
      'origem',
      'dominio',
    ])
  })

  it('arrastar além da última coluna para na última — e além da primeira, na primeira', () => {
    const ordem = [...SLUGS]
    expect(ordemAoArrastar(ordem, semAjuste, 'origem', 99999)).toBe(ordem)
    expect(ordemAoArrastar(ordem, semAjuste, 'dominio', -99999)).toBe(ordem)
    // E quem foi até o fim fica no fim, sem sumir nem duplicar.
    const ate = ordemAoArrastar(ordem, semAjuste, 'gold', 99999)
    expect(ate).toEqual(['dominio', 'silver', 'broze', 'origem', 'gold'])
  })

  it('troca com uma faixa de largura diferente da sua, nos dois sentidos', () => {
    const larguras = new Map([['silver', FAIXA_MAX]])
    const ordem = [...SLUGS]
    const largaCentro = centroNoFluxo(ordem, larguras, 'silver')
    const trocado = ordemAoArrastar(ordem, larguras, 'gold', largaCentro + 1)
    expect(trocado).toEqual(['dominio', 'silver', 'gold', 'broze', 'origem'])
    // E de volta: agora 'gold' está depois da larga, e cruzar o centro dela
    // (na geometria NOVA) desfaz a troca.
    const goldDepois = centroNoFluxo(trocado, larguras, 'silver')
    expect(ordemAoArrastar(trocado, larguras, 'gold', goldDepois - 1)).toEqual([...SLUGS])
  })

  it('não oscila: a troca não se desfaz sozinha no passo seguinte', () => {
    // O bug clássico deste gesto — trocar, a geometria mudar, e a condição de
    // voltar passar a valer com o cursor parado. Com larguras bem diferentes,
    // que é onde ele apareceria.
    const larguras = new Map([
      ['silver', FAIXA_MAX],
      ['gold', 0.6],
    ])
    const ordem = [...SLUGS]
    for (const alvo of ['gold', 'silver']) {
      for (const sentido of [1, -1]) {
        const vizinha = alvo === 'gold' ? 'silver' : 'gold'
        const centro = centroNoFluxo(ordem, larguras, vizinha) + sentido
        const uma = ordemAoArrastar(ordem, larguras, alvo, centro)
        // Reaplicar com o MESMO centro (cursor parado) tem de ser estável.
        expect(ordemAoArrastar(uma, larguras, alvo, centro)).toBe(uma)
      }
    }
  })

  it('toda troca preserva o conjunto de colunas — é sempre uma permutação', () => {
    const larguras = new Map([
      ['dominio', 2],
      ['broze', 0.6],
    ])
    for (const slug of SLUGS) {
      for (const centro of [-9999, -200, 0, 150, 400, 900, 9999]) {
        const proxima = ordemAoArrastar(SLUGS, larguras, slug, centro)
        expect([...proxima].sort()).toEqual([...SLUGS].sort())
      }
    }
  })

  it('e por ser permutação, a geometria continua sem sobreposição e sem buraco', () => {
    const larguras = new Map([['silver', FAIXA_MAX]])
    const proxima = ordemAoArrastar(SLUGS, larguras, 'dominio', 9999)
    const geoms = geometriaDasFaixas(proxima, larguras)
    for (let i = 1; i < geoms.length; i++) {
      expect(geoms[i].esquerda - geoms[i - 1].direita).toBeCloseTo(CORREDOR)
    }
  })
})

describe('ordemRestaurada', () => {
  it('devolve a faixa ao lugar dela na ordem salva', () => {
    expect(ordemRestaurada(SLUGS, ['gold', 'dominio', 'silver', 'broze', 'origem'], 'gold')).toEqual(
      [...SLUGS],
    )
  })

  it('com as outras embaralhadas, ela volta para antes da primeira que a sucede no catálogo', () => {
    // Não existe resposta perfeita aqui — o resto está fora de ordem, e
    // qualquer índice contraria alguma vizinha. A promessa possível é esta, e é
    // a única que o gesto também faz: ninguém devolve uma faixa a um índice,
    // devolve para o lado de outra. 'gold' precede 'origem' no catálogo, então
    // é para antes dela que ela vai.
    expect(
      ordemRestaurada(SLUGS, ['origem', 'gold', 'silver', 'broze', 'dominio'], 'gold'),
    ).toEqual(['gold', 'origem', 'silver', 'broze', 'dominio'])
  })

  it('a última da ordem salva volta para o fim', () => {
    expect(ordemRestaurada(SLUGS, ['origem', ...SLUGS.filter((s) => s !== 'origem')], 'origem'))
      .toEqual([...SLUGS])
  })

  it('slug que não existe mais na ordem salva simplesmente sai', () => {
    expect(ordemRestaurada(['a', 'b'], ['z', 'a', 'b'], 'z')).toEqual(['a', 'b'])
  })
})

describe('deslocamento vertical', () => {
  it('nunca sai do limite, e valor inválido volta a zero', () => {
    expect(clampDeslocamento(9999)).toBe(DESLOC_MAX)
    expect(clampDeslocamento(-9999)).toBe(-DESLOC_MAX)
    expect(clampDeslocamento(Number.NaN)).toBe(0)
    expect(clampDeslocamento(120)).toBe(120)
  })

  it('faixa ausente do mapa está no lugar', () => {
    expect(deslocamentoDe(new Map(), 'gold')).toBe(0)
    expect(deslocamentoDe(new Map([['gold', 9999]]), 'gold')).toBe(DESLOC_MAX)
  })

  it('devolve o MESMO mapa quando o deslocamento não muda de fato', () => {
    const mapa = new Map([['gold', 100]])
    expect(comDeslocamento(mapa, 'gold', 100)).toBe(mapa)
    expect(comDeslocamento(mapa, 'gold', 100.1)).toBe(mapa)
    expect(comDeslocamento(mapa, 'silver', 0)).toBe(mapa)
    expect(comDeslocamento(mapa, 'gold', 130)).not.toBe(mapa)
  })

  it('voltar ao lugar apaga a entrada: mapa vazio = nenhuma faixa deslocada', () => {
    expect(comDeslocamento(new Map([['gold', 100]]), 'gold', 0).size).toBe(0)
  })
})

describe('comArraste', () => {
  it('o empurrão só vira estado novo quando muda o bastante para se ver', () => {
    const atual = { slug: 'gold', dx: 40 }
    expect(comArraste(atual, { slug: 'gold', dx: 40.1 })).toBe(atual)
    expect(comArraste(atual, { slug: 'gold', dx: 44 })).toEqual({ slug: 'gold', dx: 44 })
    expect(comArraste(atual, { slug: 'silver', dx: 40 })).toEqual({ slug: 'silver', dx: 40 })
  })

  it('soltar (null) sempre passa, e null para null não cria render', () => {
    expect(comArraste({ slug: 'gold', dx: 40 }, null)).toBeNull()
    expect(comArraste(null, null)).toBeNull()
    expect(comArraste(null, { slug: 'gold', dx: 0 })).toEqual({ slug: 'gold', dx: 0 })
  })
})

describe('reordenarColunas', () => {
  it('sem ordem de sessão, o MESMO array de colunas', () => {
    const cols = SLUGS.map((slug, i) => coluna(slug, i))
    expect(reordenarColunas(cols, null)).toBe(cols)
  })

  it('as colunas saem na ordem da sessão, com o conteúdo intacto', () => {
    const cols = SLUGS.map((slug, i) => coluna(slug, i))
    const fora = reordenarColunas(cols, ['origem', 'dominio', 'gold', 'silver', 'broze'])
    expect(fora.map((c) => c.slug)).toEqual(['origem', 'dominio', 'gold', 'silver', 'broze'])
    // Os objetos são os mesmos: reordenar não recria coluna nenhuma.
    expect(fora[0]).toBe(cols[4])
  })
})

describe('aplicarDeslocamentos', () => {
  const cenario = () => {
    const cols = SLUGS.map((slug, i) => coluna(slug, i))
    const nodes = [
      no('a', 'dominio', 0, -35),
      no('b', 'gold', 193, 0),
      no('c', 'silver', 386, -35),
      no('d', 'silver', 386, 35),
      no('e', 'origem', 772, 0),
    ]
    const yBase = basesVerticais(nodes)
    return { cols, nodes, yBase }
  }

  it('sem nada deslocado, não mexe em faixa nenhuma', () => {
    const { cols, nodes, yBase } = cenario()
    const ajustadas = aplicarLarguras(cols, nodes, semAjuste)
    const fora = aplicarDeslocamentos(ajustadas, nodes, yBase, new Map(), null)
    expect(fora).toBe(ajustadas)
    expect(nodes.map((n) => n.y)).toEqual([-35, 0, -35, 35, 0])
  })

  it('leva os NÓS da faixa junto, e só os dela', () => {
    const { cols, nodes, yBase } = cenario()
    const ajustadas = aplicarLarguras(cols, nodes, semAjuste)
    const fora = aplicarDeslocamentos(ajustadas, nodes, yBase, new Map([['silver', 120]]), null)
    expect(nodes.map((n) => n.y)).toEqual([-35, 0, 85, 155, 0])
    // fy acompanha y: na vista em níveis é ele que prende o nó no lugar.
    for (const n of nodes) expect(n.fy).toBe(n.y)
    const silver = fora.find((c) => c.slug === 'silver')
    expect(silver?.yMin).toBe(-70 + 120)
    expect(silver?.yMax).toBe(70 + 120)
    // A faixa desenhada acompanha, inteira.
    expect(topoDaFaixa(silver as LineageColumn)).toBe(topoDaFaixa(cols[2]) + 120)
    expect(fora.find((c) => c.slug === 'gold')).toBe(ajustadas[1])
  })

  it('aplicar duas vezes dá o mesmo resultado — o deslocamento não acumula', () => {
    const { cols, nodes, yBase } = cenario()
    const deslocs = new Map([['silver', 120]])
    aplicarDeslocamentos(aplicarLarguras(cols, nodes, semAjuste), nodes, yBase, deslocs, null)
    const uma = nodes.map((n) => n.y)
    aplicarDeslocamentos(aplicarLarguras(cols, nodes, semAjuste), nodes, yBase, deslocs, null)
    expect(nodes.map((n) => n.y)).toEqual(uma)
  })

  it('a faixa que volta a zero devolve os nós ao lugar', () => {
    const { cols, nodes, yBase } = cenario()
    aplicarDeslocamentos(
      aplicarLarguras(cols, nodes, semAjuste),
      nodes,
      yBase,
      new Map([['silver', 120]]),
      null,
    )
    aplicarDeslocamentos(aplicarLarguras(cols, nodes, semAjuste), nodes, yBase, new Map(), null)
    expect(nodes.map((n) => n.y)).toEqual([-35, 0, -35, 35, 0])
  })

  it('o empurrão do arraste só vale para a faixa sob a mão', () => {
    const { cols, nodes, yBase } = cenario()
    const ajustadas = aplicarLarguras(cols, nodes, semAjuste)
    const fora = aplicarDeslocamentos(ajustadas, nodes, yBase, new Map(), {
      slug: 'silver',
      dx: 80,
    })
    expect(fora.find((c) => c.slug === 'silver')?.x).toBe(386 + 80)
    expect(fora.find((c) => c.slug === 'origem')?.x).toBe(772)
    expect(nodes[2].x).toBe(386 + 80)
    expect(nodes[2].fx).toBe(nodes[2].x)
    expect(nodes[4].x).toBe(772)
  })

  it('soltar devolve a faixa ao lugar do fluxo (o empurrão morre com o gesto)', () => {
    const { cols, nodes, yBase } = cenario()
    aplicarDeslocamentos(aplicarLarguras(cols, nodes, semAjuste), nodes, yBase, new Map(), {
      slug: 'silver',
      dx: 80,
    })
    const fora = aplicarDeslocamentos(
      aplicarLarguras(cols, nodes, semAjuste),
      nodes,
      yBase,
      new Map(),
      null,
    )
    expect(fora.find((c) => c.slug === 'silver')?.x).toBe(386)
    expect(nodes[2].x).toBe(386)
  })
})

describe('o layout de sessão inteiro: ordem, largura e deslocamento juntos', () => {
  it('redimensionar uma coluna ANTERIOR preserva o deslocamento de quem foi movido', () => {
    // O caso que o gesto tem de aguentar: mover uma faixa e, depois, alargar
    // outra antes dela. O empurrão horizontal do redimensionamento chega, o
    // deslocamento vertical continua exatamente onde estava — porque ele é
    // aplicado por ÚLTIMO, sobre o que o fluxo decidiu.
    const cols = SLUGS.map((slug, i) => coluna(slug, i))
    const nodes = [no('a', 'dominio', 0, 0), no('c', 'silver', 386, 0)]
    const yBase = basesVerticais(nodes)
    const deslocs = new Map([['silver', 150]])

    const antes = aplicarDeslocamentos(
      aplicarLarguras(cols, nodes, semAjuste),
      nodes,
      yBase,
      deslocs,
      null,
    )
    const xAntes = antes.find((c) => c.slug === 'silver')?.x ?? 0

    const larguras = new Map([['dominio', 2]])
    const depois = aplicarDeslocamentos(
      aplicarLarguras(cols, nodes, larguras),
      nodes,
      yBase,
      deslocs,
      null,
    )
    const silver = depois.find((c) => c.slug === 'silver')
    expect(silver?.x).toBeCloseTo(xAntes + BAND_W)
    expect(silver?.yMin).toBe(-70 + 150)
    expect(nodes[1].y).toBe(150)
  })

  it('a ordem de sessão vale para as larguras também: cada faixa leva a sua', () => {
    const cols = SLUGS.map((slug, i) => coluna(slug, i))
    const nodes = SLUGS.map((slug, i) => no(slug, slug, i * NIVEIS_COL_X, 0))
    const yBase = basesVerticais(nodes)
    const larguras = new Map([['origem', 2]])
    const ordenadas = reordenarColunas(cols, ['origem', 'dominio', 'gold', 'silver', 'broze'])
    const fora = aplicarDeslocamentos(
      aplicarLarguras(ordenadas, nodes, larguras),
      nodes,
      yBase,
      new Map(),
      null,
    )
    expect(fora[0].slug).toBe('origem')
    expect(fora[0].largura).toBe(2 * BAND_W)
    // Primeira posição = âncora do layout: a borda esquerda não se move nunca.
    expect(bordaEsquerda(fora[0])).toBe(-BAND_W / 2)
    // E o resto continua encaixado, sem buraco nem sobreposição.
    for (let i = 1; i < fora.length; i++) {
      expect(bordaEsquerda(fora[i]) - bordaDireita(fora[i - 1])).toBeCloseTo(CORREDOR)
    }
  })
})

describe('niveisReordenados', () => {
  const niveis = [
    { slug: 'dominio', titulo: 'Domínio', ordem: 10 },
    { slug: 'gold', titulo: 'Gold', ordem: 43 },
    { slug: 'silver', titulo: 'Silver', ordem: 44 },
  ]

  it('a numeração das POSIÇÕES é preservada — aplicar uma ordem é permutar', () => {
    const fora = niveisReordenados(niveis, ['silver', 'gold', 'dominio'])
    expect(fora.map((n) => [n.slug, n.ordem])).toEqual([
      ['silver', 10],
      ['gold', 43],
      ['dominio', 44],
    ])
  })

  it('o resto da linha do nível vai junto', () => {
    const fora = niveisReordenados(niveis, ['gold', 'dominio', 'silver'])
    expect(fora[0].titulo).toBe('Gold')
    expect(fora[1].titulo).toBe('Domínio')
  })

  it('nível fora da ordem (sem componente, logo sem coluna) fica onde estava', () => {
    const fora = niveisReordenados(niveis, ['silver', 'dominio'])
    expect(fora.map((n) => [n.slug, n.ordem])).toEqual([
      ['silver', 10],
      ['gold', 43],
      ['dominio', 44],
    ])
  })

  it('slug desconhecido na ordem é ignorado', () => {
    const fora = niveisReordenados(niveis, ['extinto', 'silver', 'gold', 'dominio'])
    expect(fora.map((n) => n.slug)).toEqual(['silver', 'gold', 'dominio'])
  })

  it('a mesma ordem não muda nada', () => {
    const fora = niveisReordenados(niveis, ['dominio', 'gold', 'silver'])
    expect(fora.map((n) => [n.slug, n.ordem])).toEqual([
      ['dominio', 10],
      ['gold', 43],
      ['silver', 44],
    ])
  })

  it('a lista de saída está ordenada por `ordem` — é o que o CSV grava', () => {
    const fora = niveisReordenados(niveis, ['silver', 'dominio', 'gold'])
    const ordens = fora.map((n) => n.ordem)
    expect([...ordens].sort((a, b) => a - b)).toEqual(ordens)
  })
})

describe('cabecalhoSob', () => {
  const areas = SLUGS.map((slug, i) => ({
    slug,
    esquerda: i * NIVEIS_COL_X - BAND_W / 2,
    direita: i * NIVEIS_COL_X + BAND_W / 2,
    topo: -100,
  }))

  it('pega dentro da tira e ignora o resto da faixa', () => {
    expect(cabecalhoSob(areas, { x: 0, y: -100 })).toBe(0)
    expect(cabecalhoSob(areas, { x: 0, y: -100 + ALTURA_CABECALHO })).toBe(0)
    // Um fio abaixo da tira já é corpo da faixa — e corpo é o pan do mapa.
    expect(cabecalhoSob(areas, { x: 0, y: -100 + ALTURA_CABECALHO + 0.1 })).toBe(-1)
    expect(cabecalhoSob(areas, { x: 0, y: -101 })).toBe(-1)
  })

  it('respeita a largura da faixa, e o corredor entre elas não pega', () => {
    expect(cabecalhoSob(areas, { x: NIVEIS_COL_X, y: -90 })).toBe(1)
    expect(cabecalhoSob(areas, { x: BAND_W / 2 + CORREDOR / 2, y: -90 })).toBe(-1)
  })

  it('em sobreposição ganha a de cima — a que está desenhada por último', () => {
    const empilhadas = [
      { slug: 'a', esquerda: 0, direita: 100, topo: 0 },
      { slug: 'b', esquerda: 50, direita: 150, topo: 0 },
    ]
    expect(cabecalhoSob(empilhadas, { x: 70, y: 5 })).toBe(1)
    expect(cabecalhoSob(empilhadas, { x: 20, y: 5 })).toBe(0)
  })

  it('a tira termina antes de a silhueta do primeiro nó começar', () => {
    // topoDaFaixa devolve yMin - 46 (o nó comum); a alça tem de acabar acima do
    // yMin - 16 que a extensão do nó ocupa, senão os dois alvos se disputam.
    const col = coluna('gold', 1)
    const fimDaAlca = topoDaFaixa(col) + ALTURA_CABECALHO
    expect(fimDaAlca).toBeLessThan(col.yMin - 16)
  })

  it('sem faixa nenhuma não há alça', () => {
    expect(cabecalhoSob([], { x: 0, y: 0 })).toBe(-1)
  })
})

describe('mesmaOrdem', () => {
  it('compara sequência, não conjunto', () => {
    expect(mesmaOrdem(['a', 'b'], ['a', 'b'])).toBe(true)
    expect(mesmaOrdem(['a', 'b'], ['b', 'a'])).toBe(false)
    expect(mesmaOrdem(['a'], ['a', 'b'])).toBe(false)
    expect(mesmaOrdem([], [])).toBe(true)
  })
})
