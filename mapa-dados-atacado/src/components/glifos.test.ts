// ÍCONE = TIPO DE COMPONENTE: o glifo desenhado DENTRO do nó.
//
// O tipo perdeu a forma do nó (que passou a dizer "produto de dados") e ganhou
// este ícone. Os testes travam o que faz dele um eixo legível no mapa, e não um
// enfeite: cabe dentro da menor silhueta (não vaza para cima da borda tracejada
// de incompleto), cada tipo tem uma FAMÍLIA de traço diferente das outras (é o
// que sobrevive ao tamanho pequeno), os vãos internos não somem no menor
// tamanho em que o glifo aparece, e o Default fica de propósito sem nada.
import { describe, expect, it } from 'vitest'
import type { TipoComponente } from './graph-types'
import { TIPOS_COMPONENTE } from './graph-types'
import { fakeCtx } from './canvas-recorder'
import type { GlifoDef, GlifoParte, Ponto } from './shapes'
import { drawGlifo, GLIFO_DE, GLIFO_MIN_PX, GLIFOS_LEGENDA, glifoVisivel } from './shapes'

/** Todos os pontos de um glifo, já contando as pontas dos traços. */
function pontosDe(def: GlifoDef): Ponto[] {
  return def.partes.flatMap((parte) =>
    parte.forma === 'poligono' ? [...parte.pontos] : [parte.de, parte.a],
  )
}

/** Distância do centro ao ponto mais longe do glifo, somada a meia espessura do
 *  traço (a ponta arredondada avança meio traço além do vértice). */
function raioOcupado(def: GlifoDef): number {
  const meioTraco = def.partes.some((p) => p.forma === 'traco') ? def.traco / 2 : 0
  return Math.max(...pontosDe(def).map(([x, y]) => Math.hypot(x, y))) + meioTraco
}

function comGlifo(): Array<[TipoComponente, GlifoDef]> {
  return TIPOS_COMPONENTE.flatMap((tipo) => {
    const def = GLIFO_DE[tipo]
    return def === null ? [] : [[tipo, def] as [TipoComponente, GlifoDef]]
  })
}

/** Assinatura grosseira da "família" do traço: quantas partes, se são cheias ou
 *  riscadas e se têm aresta inclinada. É o que o olho separa nos ~8 px em que o
 *  glifo ainda existe. */
function familia(def: GlifoDef): string {
  const inclinado = def.partes.some((parte) => {
    const pts = parte.forma === 'poligono' ? [...parte.pontos] : [parte.de, parte.a]
    return pts.some(([x, y], i) => {
      const [px, py] = pts[(i + 1) % pts.length]
      return Math.abs(x - px) > 1e-9 && Math.abs(y - py) > 1e-9
    })
  })
  const preenchido = def.partes.every((p) => p.forma === 'poligono')
  return `${def.partes.length}/${preenchido ? 'cheio' : 'risco'}/${inclinado ? 'obliquo' : 'reto'}`
}

describe('vocabulário de ícones', () => {
  it('tem uma entrada por tipo de componente, e a legenda mostra todas', () => {
    expect(Object.keys(GLIFO_DE).sort()).toEqual([...TIPOS_COMPONENTE].sort())
    expect(GLIFOS_LEGENDA.map((g) => g.tipo)).toEqual(TIPOS_COMPONENTE)
    expect(GLIFOS_LEGENDA.map((g) => g.def)).toEqual(TIPOS_COMPONENTE.map((t) => GLIFO_DE[t]))
  })

  it('Default não tem ícone: nó liso = tipo não declarado', () => {
    expect(GLIFO_DE.Default).toBeNull()
    // E é o ÚNICO sem: um segundo tipo mudo deixaria o nó liso ambíguo.
    expect(comGlifo()).toHaveLength(TIPOS_COMPONENTE.length - 1)
  })

  it('as Tabelas Delta continuam com os tijolos do Databricks', () => {
    const delta = GLIFO_DE['Tabela Delta']
    expect(delta?.partes).toHaveLength(3)
    // Tijolo = paralelogramo com o topo deslocado à direita: a aresta de cima
    // começa mais à direita que a de baixo.
    for (const parte of delta?.partes ?? []) {
      if (parte.forma !== 'poligono') throw new Error('tijolo deveria ser polígono')
      const [topoEsq, , , baseEsq] = parte.pontos
      expect(topoEsq[0]).toBeGreaterThan(baseEsq[0])
    }
  })

  it('cada tipo desenha uma família de traço diferente das outras', () => {
    // Duas famílias iguais viram a mesma mancha no tamanho pequeno — é por isso
    // que a Tabela SQL não é "três linhas horizontais": ficaria igual aos
    // tijolos, justamente na distinção que mais importa (as duas tabelas).
    const familias = comGlifo().map(([, def]) => familia(def))
    expect(new Set(familias).size).toBe(familias.length)
  })

  it('cabe dentro do CÍRCULO, que é a silhueta menor das duas', () => {
    // O losango é maior em toda direção, então o que couber no círculo cabe
    // nos dois. A folga sobrando mantém o glifo longe da borda tracejada de
    // "incompleto", que corre em cima da silhueta.
    for (const [, def] of comGlifo()) {
      expect(raioOcupado(def)).toBeLessThan(0.7)
    }
  })

  it('todos os glifos têm o mesmo peso: nenhum tipo parece mais importante', () => {
    const raios = comGlifo().map(([, def]) => raioOcupado(def))
    expect(Math.max(...raios) - Math.min(...raios)).toBeLessThan(0.2)
  })
})

describe('legibilidade no menor tamanho', () => {
  it('o glifo só aparece a partir do raio mínimo de tela', () => {
    expect(glifoVisivel(GLIFO_MIN_PX, 1)).toBe(true)
    expect(glifoVisivel(GLIFO_MIN_PX - 0.01, 1)).toBe(false)
    // O que manda é o raio NA TELA: o mesmo nó aparece com zoom e some sem ele.
    expect(glifoVisivel(4, 2)).toBe(true)
    expect(glifoVisivel(4, 0.5)).toBe(false)
  })

  it('nenhum vão interno cai abaixo de um pixel no raio mínimo', () => {
    // No limiar (raio = GLIFO_MIN_PX na tela) cada separação do desenho precisa
    // valer pelo menos um pixel; abaixo disso o glifo vira mancha.
    for (const [, def] of comGlifo()) {
      for (const vao of vaosDe(def)) {
        expect(vao * GLIFO_MIN_PX).toBeGreaterThanOrEqual(1)
      }
    }
  })
})

/** Separações do desenho, em frações do raio: os vãos entre partes vizinhas e,
 *  onde há traço, a própria espessura dele (um risco fino demais some igual). */
function vaosDe(def: GlifoDef): number[] {
  const vaos = def.partes.some((p) => p.forma === 'traco') ? [def.traco] : []
  const caixas = def.partes.map(caixaDe)
  for (let i = 0; i < caixas.length; i++) {
    for (let j = i + 1; j < caixas.length; j++) {
      const dx = Math.max(caixas[i].x0 - caixas[j].x1, caixas[j].x0 - caixas[i].x1)
      const dy = Math.max(caixas[i].y0 - caixas[j].y1, caixas[j].y0 - caixas[i].y1)
      // Vizinhas em uma direção só: o vão é o afastamento nessa direção.
      const vao = Math.max(dx, dy)
      if (vao > 0) vaos.push(vao)
    }
  }
  return vaos
}

function caixaDe(parte: GlifoParte): { x0: number; y0: number; x1: number; y1: number } {
  const pts = parte.forma === 'poligono' ? [...parte.pontos] : [parte.de, parte.a]
  const xs = pts.map(([x]) => x)
  const ys = pts.map(([, y]) => y)
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
}

describe('drawGlifo', () => {
  it('desenha uma figura por parte e devolve o contexto como pegou', () => {
    const ctx = fakeCtx()
    drawGlifo(ctx, 'Tabela SQL', 0, 0, 10)
    expect(ctx.calls.filter((c) => c === 'fill')).toHaveLength(4)
    // save/restore em volta: o glifo mexe em fillStyle, lineWidth e lineCap, e
    // quem desenha o resto do nó não pode herdar nada disso.
    expect(ctx.calls[0]).toBe('save')
    expect(ctx.calls.at(-1)).toBe('restore')
  })

  it('o "X" do Excel é traçado, não preenchido', () => {
    const ctx = fakeCtx()
    drawGlifo(ctx, 'Excel', 0, 0, 10)
    expect(ctx.calls.filter((c) => c === 'stroke')).toHaveLength(2)
    expect(ctx.calls.filter((c) => c === 'fill')).toHaveLength(0)
  })

  it('Default não desenha nada', () => {
    const ctx = fakeCtx()
    drawGlifo(ctx, 'Default', 0, 0, 10)
    expect(ctx.calls).toEqual([])
  })

  it('escala com o raio do nó: o glifo é sempre a mesma fração da silhueta', () => {
    const coordenadas = (r: number): number[] => {
      const ctx = fakeCtx()
      drawGlifo(ctx, 'Excel', 0, 0, r)
      return ctx.calls.flatMap((c) => {
        const m = /^(?:moveTo|lineTo)\((-?[\d.]+),(-?[\d.]+)\)$/.exec(c)
        return m === null ? [] : [Number(m[1]), Number(m[2])]
      })
    }
    const pequeno = coordenadas(10)
    const grande = coordenadas(20)
    expect(grande).toHaveLength(pequeno.length)
    expect(pequeno.length).toBeGreaterThan(0)
    grande.forEach((v, i) => expect(v).toBeCloseTo(pequeno[i] * 2))
  })
})
