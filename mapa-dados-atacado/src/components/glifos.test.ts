// ÍCONE = TIPO DE COMPONENTE: o glifo desenhado DENTRO do nó.
//
// O tipo perdeu a forma do nó (que passou a dizer "produto de dados") e ganhou
// este ícone; depois o vocabulário cresceu de quatro para catorze, com dez
// SISTEMAS entrando ao lado dos genéricos. Os testes travam o que faz disso um
// eixo legível no mapa, e não uma coleção de enfeites:
//
//   • todo tipo tem uma entrada, e o Default é o único mudo;
//   • cada ícone cabe na menor silhueta, e todos ocupam a MESMA caixa (nenhum
//     tipo parece mais importante que outro);
//   • nenhuma separação do desenho desce abaixo de GLIFO_DETALHE_MIN — é o
//     número que decide quantos dentes tem a engrenagem;
//   • dois ícones quaisquer, RASTERIZADOS no tamanho em que vivem, dão manchas
//     diferentes (é o teste que substituiu a antiga "família de traço": com
//     catorze ícones, uma assinatura grosseira colidiria sem que nada estivesse
//     errado);
//   • cada tipo emite uma sequência de comandos de canvas própria;
//   • o tipo DESENHA o nó (cor, logo ampliada, débito no anel) mas não o
//     DIMENSIONA — nenhum tipo aumenta o raio.
import { describe, expect, it } from 'vitest'
import type { GraphNodeData, TipoComponente } from './graph-types'
import { TIPOS_COMPONENTE, TIPOS_COMPONENTE_GRUPOS } from './graph-types'
import { TIPOS_COMPONENTE as TIPOS_DO_BUILD } from '../../scripts/graph-lib'
import { fakeCtx } from './canvas-recorder'
import type { GlifoDef, GlifoParte, Ponto } from './shapes'
import {
  DEBITO_BORDA,
  drawGlifo,
  ehMarca,
  escalaDoGlifo,
  GLIFO_DE,
  GLIFO_MARCA_ESCALA,
  GLIFO_DETALHE_MIN,
  GLIFO_MIN_PX,
  GLIFO_NITIDO_PX,
  glifoVisivel,
  temIcone,
} from './shapes'
import { raioDoDado } from './node-size'

function comGlifo(): Array<[TipoComponente, GlifoDef]> {
  return TIPOS_COMPONENTE.flatMap((tipo) => {
    const def = GLIFO_DE[tipo]
    return def === null ? [] : [[tipo, def] as [TipoComponente, GlifoDef]]
  })
}

/** Meia espessura do traço de UMA peça: a ponta arredondada avança meio traço
 *  além do vértice, e só quem é 'contorno' tem traço. Medido por peça, e não
 *  pelo glifo inteiro: num ladrilho de marca o traço é do símbolo vazado no
 *  meio, e somá-lo à borda do ladrilho inflaria a caixa por nada. */
function meioTraco(def: GlifoDef, parte: GlifoParte): number {
  return parte.forma === 'contorno' ? def.traco / 2 : 0
}

/** Quanto cada peça avança do centro, por uma medida qualquer do ponto. */
function alcance(def: GlifoDef, medida: (p: Ponto) => number): number {
  return Math.max(
    ...def.partes.map((parte) => Math.max(...parte.pontos.map(medida)) + meioTraco(def, parte)),
  )
}

/** Distância do centro ao ponto mais longe do glifo: o que precisa caber dentro
 *  da silhueta do nó. */
function raioOcupado(def: GlifoDef): number {
  return alcance(def, ([x, y]) => Math.hypot(x, y))
}

/** Meia-caixa do glifo: o quanto ele avança em x ou em y. É a medida do PESO
 *  visual — melhor que a distância do canto, que premiaria um desenho quadrado
 *  sobre um redondo do mesmo tamanho aparente. */
function caixaDoGlifo(def: GlifoDef): number {
  return alcance(def, ([x, y]) => Math.max(Math.abs(x), Math.abs(y)))
}

function caixaDe(parte: GlifoParte): { x0: number; y0: number; x1: number; y1: number } {
  const xs = parte.pontos.map(([x]) => x)
  const ys = parte.pontos.map(([, y]) => y)
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
}

/** Separações do desenho, em frações do raio: os vãos entre partes que NÃO se
 *  tocam e, onde há contorno, a própria espessura dele (um risco fino demais
 *  some igual a um vão fino demais). Partes sobrepostas não entram — elas se
 *  fundem numa silhueta só de propósito (os lóbulos da nuvem, a alça do balde). */
function separacoesDe(def: GlifoDef): number[] {
  const seps = def.partes.some((p) => p.forma === 'contorno') ? [def.traco] : []
  const caixas = def.partes.map(caixaDe)
  for (let i = 0; i < caixas.length; i++) {
    for (let j = i + 1; j < caixas.length; j++) {
      const dx = Math.max(caixas[i].x0 - caixas[j].x1, caixas[j].x0 - caixas[i].x1)
      const dy = Math.max(caixas[i].y0 - caixas[j].y1, caixas[j].y0 - caixas[i].y1)
      // Vizinhas em uma direção só: o vão é o afastamento nessa direção.
      const vao = Math.max(dx, dy)
      if (vao > 1e-9) seps.push(vao)
    }
  }
  return seps
}

// --- rasterizador -----------------------------------------------------------
//
// Desenha o glifo numa grade grosseira e devolve quais células ficaram com
// tinta. É o que permite perguntar a coisa que interessa de verdade — "estes
// dois ícones viram a mesma mancha?" — sem navegador e sem olho humano.

const GRADE = 16

function dentroDoPoligono(pontos: readonly Ponto[], x: number, y: number): boolean {
  let dentro = false
  for (let i = 0, j = pontos.length - 1; i < pontos.length; j = i++) {
    const [xi, yi] = pontos[i]
    const [xj, yj] = pontos[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro
  }
  return dentro
}

function distanciaAoSegmento(x: number, y: number, a: Ponto, b: Ponto): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const l2 = dx * dx + dy * dy
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2))
  return Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy))
}

function parteCobre(parte: GlifoParte, x: number, y: number, mt: number): boolean {
  if (parte.forma === 'poligono') return dentroDoPoligono(parte.pontos, x, y)
  const pts = parte.fechado ? [...parte.pontos, parte.pontos[0]] : parte.pontos
  for (let i = 1; i < pts.length; i++) {
    if (distanciaAoSegmento(x, y, pts[i - 1], pts[i]) <= mt) return true
  }
  return false
}

/** Mancha do glifo: GRADE × GRADE células sobre a caixa [-0.5, 0.5]² (frações
 *  do raio do nó), com a COR de cada célula (null = sem tinta).
 *
 *  A cor entra na conta porque ela é metade do reconhecimento: nas logos de
 *  marca, o que identifica não é só a silhueta — o ladrilho do ServiceNow e o do
 *  Pega têm exatamente a mesma forma, e o que separa os dois é o verde e o azul.
 *  Uma mancha só de presença/ausência daria distância ZERO entre eles.
 *
 *  Vence a ÚLTIMA peça que cobre a célula, que é a mesma regra do canvas: as
 *  peças são pintadas na ordem em que estão declaradas, e é assim que o símbolo
 *  vazado cobre o ladrilho.
 *
 *  A amostragem cai no CENTRO de cada célula, e nenhum centro cai em y = 0 — o
 *  que degeneraria o raio horizontal na costura do furo da engrenagem. */
function mancha(def: GlifoDef): (string | null)[] {
  const mt = def.traco / 2
  const celulas: (string | null)[] = []
  for (let gy = 0; gy < GRADE; gy++) {
    for (let gx = 0; gx < GRADE; gx++) {
      const x = -0.5 + (gx + 0.5) / GRADE
      const y = -0.5 + (gy + 0.5) / GRADE
      let cor: string | null = null
      for (const parte of def.partes) {
        if (parteCobre(parte, x, y, mt)) cor = parte.cor ?? BRANCO
      }
      celulas.push(cor)
    }
  }
  return celulas
}

/** Marcador da tinta sem cor própria (o glifo de categoria). */
const BRANCO = '#fff'

/** Comandos que drawGlifo emite para um tipo, na ordem. */
function comandos(tipo: TipoComponente, r = 10): string[] {
  const ctx = fakeCtx()
  drawGlifo(ctx, tipo, 0, 0, r)
  return ctx.calls
}

describe('vocabulário de ícones', () => {
  it('tem uma entrada por tipo de componente', () => {
    expect(Object.keys(GLIFO_DE).sort()).toEqual([...TIPOS_COMPONENTE].sort())
  })

  it('os grupos são o vocabulário inteiro, sem repetir nem faltar ninguém', () => {
    // A legenda e o select do cadastro percorrem os GRUPOS; qualquer tipo fora
    // deles existiria no CSV e não apareceria em tela nenhuma.
    const dosGrupos = TIPOS_COMPONENTE_GRUPOS.flatMap((g) => g.tipos)
    expect(dosGrupos).toEqual([...TIPOS_COMPONENTE])
    expect(new Set(dosGrupos).size).toBe(dosGrupos.length)
  })

  it('o build aceita exatamente os mesmos valores que a UI oferece', () => {
    // A lista é ESPELHADA em scripts/graph-lib.ts (o build não importa nada do
    // front-end). Divergir significa oferecer no formulário um valor que o
    // build recusa, ou aceitar no CSV um valor que não tem ícone.
    expect([...TIPOS_DO_BUILD]).toEqual([...TIPOS_COMPONENTE])
  })

  it('Default não tem ícone: nó liso = tipo não declarado', () => {
    expect(GLIFO_DE.Default).toBeNull()
    // E é o ÚNICO sem: um segundo tipo mudo deixaria o nó liso ambíguo.
    expect(comGlifo()).toHaveLength(TIPOS_COMPONENTE.length - 1)
    expect(TIPOS_COMPONENTE.filter((t) => !temIcone(t))).toEqual(['Default'])
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

  it('todo ícone tem nota na legenda: a lista não deixa ninguém sem explicação', () => {
    for (const [tipo, def] of comGlifo()) {
      expect(def.nota, tipo).toBeTruthy()
    }
  })
})

describe('cada ícone é uma mancha diferente das outras', () => {
  // Substituiu a antiga "família de traço" (contou partes, cheio/risco,
  // reto/oblíquo): com catorze ícones aquela assinatura colidiria por ser
  // grosseira, não por dois desenhos se parecerem. Aqui a pergunta é a de
  // verdade — rasterize os dois e conte em quantas células eles diferem.
  const bitmaps = comGlifo().map(([tipo, def]) => [tipo, mancha(def)] as const)

  it('nenhum par de ícones difere em menos de 30 das 256 células', () => {
    for (let i = 0; i < bitmaps.length; i++) {
      for (let j = i + 1; j < bitmaps.length; j++) {
        const [tipoA, a] = bitmaps[i]
        const [tipoB, b] = bitmaps[j]
        const diferentes = a.reduce((n, v, k) => n + (v === b[k] ? 0 : 1), 0)
        expect(diferentes, `${tipoA} × ${tipoB}`).toBeGreaterThanOrEqual(30)
      }
    }
  })

  it('todo ícone pinta alguma coisa, e nenhum entope a caixa inteira', () => {
    for (const [tipo, celulas] of bitmaps) {
      const tinta = celulas.filter((c) => c !== null).length
      expect(tinta, tipo).toBeGreaterThan(GRADE * 2)
      // O teto é 0.80 e não 0.70 por causa dos ladrilhos de marca (ServiceNow,
      // Pega), que são campos de cor sólidos de propósito — é a cor deles que
      // identifica. O que o teto ainda pega é um glifo que vazasse da caixa.
      expect(tinta, tipo).toBeLessThan(GRADE * GRADE * 0.8)
    }
  })

  it('a engrenagem tem FURO: o meio do glifo fica limpo', () => {
    // O furo é feito com uma costura (contorno externo + círculo interno ao
    // contrário no MESMO polígono). Se a costura quebrar, a engrenagem vira um
    // sol preenchido — e é exatamente isso que este teste pega.
    const engrenagem = GLIFO_DE.Processos
    if (engrenagem === null) throw new Error('Processos deveria ter ícone')
    const celulas = mancha(engrenagem)
    const centro = (gx: number, gy: number) => celulas[gy * GRADE + gx]
    const meio = GRADE / 2
    expect(centro(meio, meio)).toBeNull()
    // E o anel em volta do furo continua cheio, senão o "furo" seria o glifo
    // inteiro faltando.
    expect(centro(meio, meio - 3)).not.toBeNull()
    expect(centro(meio, meio + 3)).not.toBeNull()
  })

  it('cada tipo emite uma sequência de comandos de canvas própria', () => {
    const sequencias = TIPOS_COMPONENTE.map((tipo) => comandos(tipo).join('|'))
    expect(new Set(sequencias).size).toBe(sequencias.length)
  })
})

describe('geometria comum a todos os ícones', () => {
  it('cabe dentro do CÍRCULO, que é a silhueta menor das duas', () => {
    // O losango é maior em toda direção, então o que couber no círculo cabe
    // nos dois. A folga sobrando mantém o glifo longe da borda tracejada de
    // "incompleto", que corre em cima da silhueta.
    for (const [tipo, def] of comGlifo()) {
      expect(raioOcupado(def), tipo).toBeLessThan(0.7)
    }
  })

  it('todos ocupam a mesma caixa: nenhum tipo parece mais importante', () => {
    const caixas = comGlifo().map(([, def]) => caixaDoGlifo(def))
    expect(Math.max(...caixas) - Math.min(...caixas)).toBeLessThan(0.06)
  })
})

describe('legibilidade no tamanho do nó', () => {
  it('nenhum ícone usa separação mais fina que GLIFO_DETALHE_MIN', () => {
    // É o limite que desenha o vocabulário: é ele que decide que a engrenagem
    // tem oito dentes (não doze), que o cilindro tem duas faixas (não quatro) e
    // que os pontos do Data Cloud ficam a 0.25 um do outro.
    for (const [tipo, def] of comGlifo()) {
      for (const sep of separacoesDe(def)) {
        expect(sep, tipo).toBeGreaterThanOrEqual(GLIFO_DETALHE_MIN)
      }
    }
  })

  it('GLIFO_NITIDO_PX é o raio em que toda separação vale ao menos um pixel', () => {
    expect(GLIFO_DETALHE_MIN * GLIFO_NITIDO_PX).toBeGreaterThanOrEqual(1)
  })

  it('o corte por tamanho é proteção de zoom afastado, não a regra de exibição', () => {
    // O ícone não espera mais o usuário aproximar: aparece bem antes do ponto em
    // que fica nítido, e só some quando o nó inteiro tem meia dúzia de pixels.
    expect(GLIFO_MIN_PX).toBeLessThan(GLIFO_NITIDO_PX)
    expect(glifoVisivel(GLIFO_MIN_PX, 1)).toBe(true)
    expect(glifoVisivel(GLIFO_MIN_PX - 0.01, 1)).toBe(false)
    // O que manda é o raio NA TELA: o mesmo nó aparece com zoom e some sem ele.
    expect(glifoVisivel(4, 2)).toBe(true)
    expect(glifoVisivel(4, 0.5)).toBe(false)
  })
})

describe('os dois grupos: categoria e marca', () => {
  it('o grupo que a UI mostra é o mesmo que o desenho aplica', () => {
    // TIPOS_COMPONENTE_GRUPOS é o que a legenda e o select listam;
    // `marca` em GLIFO_DE é o que decide cor, tamanho e borda. Divergir
    // significaria a legenda prometer um tratamento que o mapa não dá.
    const porGrupo = new Map(TIPOS_COMPONENTE_GRUPOS.map((g) => [g.titulo, g.tipos]))
    for (const tipo of porGrupo.get('Marca') ?? []) expect(ehMarca(tipo), tipo).toBe(true)
    for (const tipo of porGrupo.get('Categoria') ?? []) expect(ehMarca(tipo), tipo).toBe(false)
    expect(TIPOS_COMPONENTE.filter(ehMarca)).toHaveLength(
      (porGrupo.get('Marca') ?? []).length,
    )
  })

  it('toda peça de uma logo declara cor; nenhum glifo de categoria declara', () => {
    // É a regra inteira do canal de cor: a marca traz a dela, a categoria herda
    // o branco. Uma peça de categoria com cor pintaria por cima da cor de
    // débito do nó, que é justamente o que a categoria não deve fazer.
    for (const [tipo, def] of comGlifo()) {
      for (const parte of def.partes) {
        if (def.marca) expect(parte.cor, tipo).toBeTruthy()
        else expect(parte.cor, tipo).toBeUndefined()
      }
    }
  })

  it('as logos não são monocromáticas: é a cor que identifica a marca', () => {
    // Uma nuvem branca é uma nuvem; a nuvem ciano é a Salesforce. Se uma logo
    // acabasse com uma cor só e ela fosse branca, o grupo teria perdido o
    // sentido — pelo menos uma cor de marca por logo.
    for (const [tipo, def] of comGlifo()) {
      if (!def.marca) continue
      const cores = new Set(def.partes.map((p) => p.cor))
      expect(cores.has(BRANCO), tipo).toBe(false)
      expect(cores.size, tipo).toBeGreaterThanOrEqual(1)
    }
  })
})

describe('o tipo desenha o nó, mas não o dimensiona', () => {
  it('NENHUM tipo aumenta o raio do nó — nem os de marca', () => {
    // Houve um degrau que multiplicava por 1.5 o raio do nó com logo, para a
    // logo caber legível; saiu no uso, e ficou o redimensionamento manual, que
    // resolve caso a caso. Este teste é o que impede o degrau de voltar por
    // acidente: o tamanho do nó é do GRAU e da mão do usuário, de mais ninguém.
    const graus = new Map([['n', 5]])
    const raios = TIPOS_COMPONENTE.map((tipoComponente) => {
      const node: GraphNodeData = { id: 'n', nome: 'N', tipoComponente }
      return raioDoDado(node, graus)
    })
    expect(new Set(raios).size).toBe(1)
    // E o mesmo raio de um nó que não declarou tipo nenhum.
    expect(raioDoDado({ id: 'n' }, graus)).toBe(raios[0])
  })

  it('a marca continua sendo desenhada diferente — só não é maior', () => {
    // O que o grupo ainda decide: cor própria, logo ampliada DENTRO do nó e
    // débito no anel. Nada disso mexe no raio.
    expect(ehMarca('Salesforce')).toBe(true)
    expect(ehMarca('Processos')).toBe(false)
    expect(temIcone('Processos')).toBe(true)
    expect(escalaDoGlifo('Salesforce')).toBe(GLIFO_MARCA_ESCALA)
    expect(escalaDoGlifo('Processos')).toBe(1)
  })

  it('a borda de débito do nó de marca é grossa o bastante para a cor se ler', () => {
    // Ela é a ÚNICA marca de débito nesses nós (o miolo é neutro), então não
    // pode ser um fio: meia dúzia de por cento do raio some no zoom de trabalho.
    expect(DEBITO_BORDA).toBeGreaterThanOrEqual(0.12)
  })

  it('a logo ampliada ainda cabe dentro do anel de débito', () => {
    // A logo é desenhada maior que o glifo de categoria, e o anel é traçado
    // SOBRE a silhueta — metade dele avança para dentro. Se o desenho crescesse
    // além dessa beirada, a borda comeria a logo.
    const beiradaInterna = 1 - DEBITO_BORDA / 2
    expect(GLIFO_MARCA_ESCALA).toBeGreaterThan(1)
    for (const [tipo, def] of comGlifo()) {
      if (!def.marca) continue
      expect(raioOcupado(def) * GLIFO_MARCA_ESCALA, tipo).toBeLessThan(beiradaInterna)
    }
  })

  it('o glifo de CATEGORIA não foi ampliado: ele divide o nó com a cor', () => {
    // O nó de categoria é pintado na cor do débito, e o glifo tem de deixar
    // campo de cor à mostra — é a diferença que justifica o fator existir só
    // para a marca.
    for (const tipo of TIPOS_COMPONENTE) {
      if (!ehMarca(tipo)) expect(escalaDoGlifo(tipo), tipo).toBe(1)
      else expect(escalaDoGlifo(tipo), tipo).toBe(GLIFO_MARCA_ESCALA)
    }
  })
})

describe('drawGlifo', () => {
  it('desenha uma figura por parte e devolve o contexto como pegou', () => {
    const calls = comandos('Tabela SQL')
    expect(calls.filter((c) => c === 'fill')).toHaveLength(4)
    // save/restore em volta: o glifo mexe em fillStyle, lineWidth, lineCap e
    // lineJoin, e quem desenha o resto do nó não pode herdar nada disso.
    expect(calls[0]).toBe('save')
    expect(calls.at(-1)).toBe('restore')
  })

  it('preenche o que é silhueta e traça o que é linha', () => {
    // A tabela por tipo é o que trava o desenho de cada ícone: mudar o número de
    // lóbulos da nuvem, de faixas do cilindro ou de baias do rack aparece aqui.
    const esperado: Record<string, [number, number]> = {
      'Tabela SQL': [4, 0],
      'Tabela Delta': [3, 0],
      'Servidor de arquivos': [3, 1],
      Processos: [1, 0],
      // O ladrilho é preenchido e o "X" é traçado por cima dele.
      Excel: [1, 2],
      'SQL Server': [2, 1],
      MongoDB: [2, 0],
      'S3 Bucket': [2, 1],
      'Blob Storage': [3, 0],
      Salesforce: [4, 0],
      'Data Cloud': [7, 0],
      ServiceNow: [3, 1],
      Pega: [1, 1],
    }
    for (const [tipo, [fills, strokes]] of Object.entries(esperado)) {
      const calls = comandos(tipo as TipoComponente)
      expect(calls.filter((c) => c === 'fill'), tipo).toHaveLength(fills)
      expect(calls.filter((c) => c === 'stroke'), tipo).toHaveLength(strokes)
    }
    // A tabela cobre todos os tipos com ícone — nenhum entra sem trava.
    expect(Object.keys(esperado).sort()).toEqual(comGlifo().map(([t]) => t).sort())
  })

  it('Default não desenha nada', () => {
    expect(comandos('Default')).toEqual([])
  })

  it('escala com o raio do nó: o glifo é sempre a mesma fração da silhueta', () => {
    const coordenadas = (r: number): number[] =>
      comandos('Excel', r).flatMap((c) => {
        const m = /^(?:moveTo|lineTo)\((-?[\d.e-]+),(-?[\d.e-]+)\)$/.exec(c)
        return m === null ? [] : [Number(m[1]), Number(m[2])]
      })
    const pequeno = coordenadas(10)
    const grande = coordenadas(20)
    expect(grande).toHaveLength(pequeno.length)
    expect(pequeno.length).toBeGreaterThan(0)
    grande.forEach((v, i) => expect(v).toBeCloseTo(pequeno[i] * 2))
  })
})
