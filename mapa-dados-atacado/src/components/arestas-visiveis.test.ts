// A regra de visibilidade das arestas: o chip por verbo, o destaque de
// primeiro nível e o "Mostrar ligações" — e a ordem entre os três.
import { describe, expect, it } from 'vitest'
import { arestaVisivel, comVerboAlternado } from './arestas-visiveis'

const NADA_OCULTO: ReadonlySet<string> = new Set()

describe('visibilidade da aresta', () => {
  it('em repouso e com "Mostrar ligações" ligado, toda aresta aparece', () => {
    const estado = { ligacoesOn: true, verbosOcultos: NADA_OCULTO, temDestaque: false }
    expect(arestaVisivel(estado, 'consome', false)).toBe(true)
    expect(arestaVisivel(estado, 'envia', false)).toBe(true)
  })

  it('em repouso e com ele desligado, o mapa fica só com os nós', () => {
    const estado = { ligacoesOn: false, verbosOcultos: NADA_OCULTO, temDestaque: false }
    expect(arestaVisivel(estado, 'consome', false)).toBe(false)
    // Nem a aresta que encostaria numa âncora: em repouso não há âncora.
    expect(arestaVisivel(estado, 'consome', true)).toBe(false)
  })

  // A regra do primeiro nível: com destaque, só o que ENCOSTA numa âncora.
  it('com destaque, só as arestas que encostam numa âncora', () => {
    const estado = { ligacoesOn: false, verbosOcultos: NADA_OCULTO, temDestaque: true }
    expect(arestaVisivel(estado, 'consome', true)).toBe(true)
    expect(arestaVisivel(estado, 'consome', false)).toBe(false)
  })

  // O ponto da mudança: o destaque estreita o mapa mesmo com "Mostrar ligações"
  // LIGADO. Antes o toggle ligado devolvia a teia inteira e o gesto não
  // recortava nada; agora o gesto em curso é mais específico que a preferência
  // deixada de pé, e decide enquanto durar.
  it('e isso vale com "Mostrar ligações" ligado também', () => {
    const estado = { ligacoesOn: true, verbosOcultos: NADA_OCULTO, temDestaque: true }
    expect(arestaVisivel(estado, 'consome', true)).toBe(true)
    expect(arestaVisivel(estado, 'consome', false)).toBe(false)
  })

  // ...e sem contradizer o toggle: acabado o gesto, ele volta a valer sozinho.
  it('acabado o destaque, o toggle volta a decidir', () => {
    const aceso = { ligacoesOn: true, verbosOcultos: NADA_OCULTO, temDestaque: false }
    const apagado = { ligacoesOn: false, verbosOcultos: NADA_OCULTO, temDestaque: false }
    expect(arestaVisivel(aceso, 'consome', false)).toBe(true)
    expect(arestaVisivel(apagado, 'consome', false)).toBe(false)
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

  // A ordem dos controles: o chip é um recorte do ASSUNTO e vence os dois
  // outros. Se o hover devolvesse a aresta escondida pelo chip, o mapa
  // ressuscitaria justamente o que o usuário acabou de tirar da tela.
  it('e vence o destaque, mesmo na aresta que encosta na âncora', () => {
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
  it('apaga um verbo aceso e reacende no clique seguinte', () => {
    const so1 = comVerboAlternado(new Set(), 'envia')
    expect([...so1]).toEqual(['envia'])
    expect([...comVerboAlternado(so1, 'envia')]).toEqual([])
  })

  it('não muda o conjunto que recebeu', () => {
    const antes: ReadonlySet<string> = new Set(['envia'])
    comVerboAlternado(antes, 'consome')
    expect([...antes]).toEqual(['envia'])
  })

  // O vocabulário é editável: verbo que ninguém apagou nasce visível, sem
  // precisar entrar em lista nenhuma.
  it('verbo que nunca foi tocado continua visível', () => {
    const estado = {
      ligacoesOn: true,
      verbosOcultos: comVerboAlternado(new Set(), 'envia'),
      temDestaque: false,
    }
    expect(arestaVisivel(estado, 'transporta', true)).toBe(true)
  })
})
