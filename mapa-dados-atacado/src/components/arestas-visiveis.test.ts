// A regra de visibilidade das arestas: o toggle "Mostrar ligações" e os chips
// por verbo, e a ordem entre os dois.
import { describe, expect, it } from 'vitest'
import { arestaVisivel, comVerboAlternado } from './arestas-visiveis'

const NADA_OCULTO: ReadonlySet<string> = new Set()

describe('visibilidade da aresta', () => {
  it('com tudo ligado, toda aresta aparece', () => {
    const estado = { ligacoesOn: true, verbosOcultos: NADA_OCULTO, temDestaque: false }
    expect(arestaVisivel(estado, 'consome', false)).toBe(true)
    expect(arestaVisivel(estado, 'envia', false)).toBe(true)
  })

  it('"Mostrar ligações" desligado deixa só as do componente em destaque', () => {
    const estado = { ligacoesOn: false, verbosOcultos: NADA_OCULTO, temDestaque: true }
    expect(arestaVisivel(estado, 'consome', true)).toBe(true)
    // Ponta esmaecida = fora do destaque.
    expect(arestaVisivel(estado, 'consome', false)).toBe(false)
  })

  it('sem destaque nenhum e sem "Mostrar ligações", o mapa fica só com os nós', () => {
    const estado = { ligacoesOn: false, verbosOcultos: NADA_OCULTO, temDestaque: false }
    expect(arestaVisivel(estado, 'consome', true)).toBe(false)
  })

  it('o chip apagado esconde só o SEU verbo', () => {
    const estado = {
      ligacoesOn: true,
      verbosOcultos: new Set(['envia']),
      temDestaque: false,
    }
    expect(arestaVisivel(estado, 'envia', true)).toBe(false)
    expect(arestaVisivel(estado, 'consome', true)).toBe(true)
  })

  // A ordem dos dois controles: o chip é um recorte do ASSUNTO e vence. Se o
  // destaque ressuscitasse a aresta, o chip pareceria não funcionar justamente
  // no nó que o usuário está olhando.
  it('o chip vence o destaque: nem a aresta do nó sob o cursor volta', () => {
    const estado = {
      ligacoesOn: false,
      verbosOcultos: new Set(['envia']),
      temDestaque: true,
    }
    expect(arestaVisivel(estado, 'envia', true)).toBe(false)
  })

  it('e vence o "Mostrar ligações" ligado', () => {
    const estado = {
      ligacoesOn: true,
      verbosOcultos: new Set(['envia']),
      temDestaque: true,
    }
    expect(arestaVisivel(estado, 'envia', true)).toBe(false)
  })
})

describe('clique do chip', () => {
  it('apaga, acende e não mexe no conjunto recebido', () => {
    const inicio: ReadonlySet<string> = new Set()
    const apagado = comVerboAlternado(inicio, 'envia')
    expect([...apagado]).toEqual(['envia'])
    expect(inicio.size).toBe(0)
    expect([...comVerboAlternado(apagado, 'envia')]).toEqual([])
  })

  it('cada verbo é independente', () => {
    const dois = comVerboAlternado(comVerboAlternado(new Set(), 'envia'), 'acessa')
    expect([...dois].sort()).toEqual(['acessa', 'envia'])
    expect([...comVerboAlternado(dois, 'envia')]).toEqual(['acessa'])
  })

  // Verbo cadastrado depois nasce ACESO: o conjunto guarda os ocultos, então
  // um slug que ninguém apagou nunca esteve nele.
  it('verbo desconhecido do conjunto está visível', () => {
    const estado = {
      ligacoesOn: true,
      verbosOcultos: comVerboAlternado(new Set(), 'envia'),
      temDestaque: false,
    }
    expect(arestaVisivel(estado, 'transporta', true)).toBe(true)
  })
})
