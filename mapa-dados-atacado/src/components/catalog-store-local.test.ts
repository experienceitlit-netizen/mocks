// Testes do adaptador de persistência local (o que faz o pacote HTML editar
// CSVs sem servidor): escolha do modo, round-trip serializar→parsear feito no
// cliente, validação antes de gravar e grafo remontado a cada save.
//
// Nada aqui toca no DOM: o DestinoLocal é injetado, então o que os testes
// exercitam é exatamente a lógica que roda no navegador, menos a chamada de
// File System Access (que exige gesto do usuário e não é automatizável).
import { describe, expect, it } from 'vitest'
import type { CatalogoRow } from './catalog-api'
import type { Sentido } from './graph-types'
import { TIPOS_COMPONENTE } from './graph-types'
import { decidirCapacidade } from './catalog-store'
import type { ArquivoCatalogo, DestinoLocal } from './catalog-store-local'
import { criarStoreLocal, destinoMemoria } from './catalog-store-local'
import {
  parseCatalogoRows,
  serializarCatalogo,
  serializarNiveis,
  serializarVerbos,
} from './graph-build'
import type { NivelRow, VerboRow } from './graph-build'
// NIVEIS_BUILTIN e VERBOS_BUILTIN vêm direto do build (como em glifos.test.ts):
// são níveis e verbos que o CÓDIGO define, não dado do usuário — só mudam
// quando graph-lib.ts muda.
import { NIVEIS_BUILTIN, VERBOS_BUILTIN } from '../../scripts/graph-lib'
// Os CSVs de verdade do projeto como texto (o mesmo que o navegador leria da
// pasta escolhida). ?raw é resolvido pelo Vite, então o teste roda no mesmo
// pipeline do app — sem APIs de Node, que não existem no bundle do front.
import CSV_CATALOGO from '../../catalogo.csv?raw'

// ---------------------------------------------------------------------------
// O niveis.csv destes testes é DERIVADO do catálogo real, e as duas metades da
// decisão têm motivo próprio:
//
// - **Não é o niveis.csv do projeto** porque ele é dado vivo de outra natureza:
//   o usuário pinta, renomeia e reordena as faixas pelo app, e um teste casado
//   com o arquivo quebraria a cada edição de COR — coisa que não diz nada sobre
//   o store.
// - **Não é uma lista de slugs à mão** porque a lista congela quais níveis o
//   catálogo pode usar, e o usuário cria camada nova pelo app enquanto se
//   trabalha: toda camada nova derrubava a suíte. Acrescentar mais um slug à
//   mão só adia o mesmo estouro (já foi feito uma vez, com "processo", e a
//   camada seguinte nasceu com outro nome).
//
// Então o arquivo nasce dos slugs que a coluna `nivel` do catálogo REALMENTE
// usa, mais os built-in (que são código). Camada nova do usuário passa a
// existir aqui sozinha; título, ordem e cor ficam sintéticos e determinísticos,
// imunes ao que ele edita. O arquivo sai em modo EXPLÍCITO (é lista completa,
// built-in incluído), que é o modo do niveis.csv de verdade.
// ---------------------------------------------------------------------------
const ROWS_CATALOGO = parseCatalogoRows(CSV_CATALOGO)

/** Todo slug de nível que o catálogo real usa, sem repetir e em ordem estável. */
const NIVEIS_USADOS = [...new Set(ROWS_CATALOGO.map((r) => r.nivel).filter((s) => s !== ''))].sort()

/** Linhas da fixture: os built-in com a ordem canônica da cadeia e os do
 *  catálogo a partir de 100 — longe da faixa 0–60, para nenhuma ordem colidir
 *  (ordem repetida é erro de validação, e um caso daqui cadastra a ordem 55). */
const NIVEIS_FIXTURE: (NivelRow & { slug: string })[] = [
  ...NIVEIS_BUILTIN.map((n) => ({ titulo: n.titulo, ordem: n.ordem, slug: n.slug })),
  ...NIVEIS_USADOS.filter((slug) => !NIVEIS_BUILTIN.some((n) => n.slug === slug)).map(
    (slug, i) => ({ titulo: slug, ordem: 100 + i * 10, slug }),
  ),
]

const SLUGS_FIXTURE = NIVEIS_FIXTURE.map((n) => n.slug)

const CSV_NIVEIS = serializarNiveis(NIVEIS_FIXTURE)

/** Um nível que o catálogo real de fato POVOA: é o que os casos de renomear,
 *  remover e pintar precisam. Sai da primeira linha do arquivo em vez de um
 *  slug cravado — "gold" pode ser renomeado ou esvaziado pelo usuário a
 *  qualquer momento. */
const NIVEL_EM_USO = ROWS_CATALOGO[0].nivel

// O verbos.csv da fixture segue a MESMA regra do niveis.csv acima, e pelo mesmo
// motivo: as células do catálogo podem trazer prefixo ("envia:dim-cliente"), e
// um prefixo fora do vocabulário não vira aresta — vira nó fantasma. Cravar os
// embutidos aqui deixaria a suíte quebrar no dia em que o usuário cadastrar um
// verbo pela tela, que é exatamente o acidente que a lista de níveis à mão
// causou. (O arquivo de verdade nem sempre existe: ele só nasce na primeira
// gravação da tela de verbos, então não há como importá-lo com `?raw`.)
const IDS_CATALOGO = new Set(ROWS_CATALOGO.map((r) => r.id))

/** Prefixos de verbo que o catálogo real usa, fora os embutidos. Só conta como
 *  prefixo aquele cujo resto é um id do próprio arquivo — é o que impede um
 *  componente chamado "abc:xyz" de virar vocabulário. */
const VERBOS_DO_CATALOGO = [
  ...new Set(
    ROWS_CATALOGO.flatMap((r) => r.consome).flatMap((celula) => {
      const casou = /^([a-z0-9][a-z0-9-]*):(.+)$/.exec(celula.trim())
      return casou !== null && IDS_CATALOGO.has(casou[2].trim()) ? [casou[1]] : []
    }),
  ),
]
  .filter((slug) => !VERBOS_BUILTIN.some((v) => v.slug === slug))
  .sort()

const CSV_VERBOS = serializarVerbos([
  ...VERBOS_BUILTIN.map(
    (v): VerboRow => ({
      titulo: v.titulo,
      slug: v.slug,
      sentido: v.sentido,
      seta: v.seta ? 'sim' : 'nao',
    }),
  ),
  ...VERBOS_DO_CATALOGO.map((slug): VerboRow => ({ titulo: slug, slug })),
])

/** Nível para onde MOVER um componente: outro qualquer da fixture, escolhido
 *  onde o nome dele ainda não exista (nome duplicado no mesmo nível é erro). */
function nivelDestino(alvo: { nome: string; nivel: string }): string {
  const mesmoNome = (a: string, b: string): boolean =>
    a.trim().toLowerCase() === b.trim().toLowerCase()
  const destino = SLUGS_FIXTURE.find(
    (slug) =>
      slug !== alvo.nivel &&
      !ROWS_CATALOGO.some((r) => r.nivel === slug && mesmoNome(r.nome, alvo.nome)),
  )
  if (destino === undefined) throw new Error('nenhum nível da fixture serve de destino')
  return destino
}

/** Destino de teste: guarda o que seria gravado em disco. */
function destinoEspiao(): DestinoLocal & { gravados: Array<[ArquivoCatalogo, string]> } {
  const gravados: Array<[ArquivoCatalogo, string]> = []
  return {
    modo: 'arquivo',
    rotulo: 'catalogo-de-teste/catalogo.csv',
    gravados,
    gravar(arquivo, texto) {
      gravados.push([arquivo, texto])
      return Promise.resolve()
    },
  }
}

const row = (extra: Partial<CatalogoRow>): CatalogoRow => ({
  // Como o formulário monta uma linha nova: sem id, para a gravação gerar.
  id: '',
  nome: 'Novo componente',
  nivel: 'primario',
  tipo_componente: 'Default',
  dominio: 'Risco',
  consome: [],
  descricao: 'd',
  debito: 'nao',
  status: 'producao',
  owner: null,
  centro_de_custo: null,
  observacoes: '',
  produto_de_dados: '',
  ...extra,
})

describe('decidirCapacidade — ordem dos modos', () => {
  it('a API do dev server tem prioridade sobre tudo', () => {
    expect(decidirCapacidade({ apiHttp: true, fsAccess: true })).toBe('http')
    expect(decidirCapacidade({ apiHttp: true, fsAccess: false })).toBe('http')
  })

  it('sem API, File System Access vira o modo arquivo', () => {
    expect(decidirCapacidade({ apiHttp: false, fsAccess: true })).toBe('arquivo')
  })

  it('sem API e sem File System Access, sobra importar/baixar', () => {
    expect(decidirCapacidade({ apiHttp: false, fsAccess: false })).toBe('importar')
  })
})

describe('store local — leitura', () => {
  it('lê o catálogo do CSV com tipo_componente normalizado', async () => {
    const store = criarStoreLocal(destinoEspiao(), { catalogo: CSV_CATALOGO, niveis: CSV_NIVEIS, verbos: CSV_VERBOS })
    const rows = await store.lerCatalogo()
    expect(rows).not.toBeNull()
    expect(rows?.length).toBe(parseCatalogoRows(CSV_CATALOGO).length)
    // Célula vazia vira "Default": a UI nunca vê valor fora do vocabulário.
    expect(rows?.every((r) => TIPOS_COMPONENTE.includes(r.tipo_componente))).toBe(true)
  })

  it('lê os níveis do niveis.csv, com slug e a flag builtin', async () => {
    const store = criarStoreLocal(destinoEspiao(), { catalogo: CSV_CATALOGO, niveis: CSV_NIVEIS, verbos: CSV_VERBOS })
    const niveis = await store.lerNiveis()
    // Todo nível que o catálogo usa está na lista lida: é o invariante que a
    // fixture derivada garante, e é o que a lista à mão quebrava a cada camada
    // nova cadastrada pelo app.
    const lidos = new Set(niveis?.map((n) => n.slug))
    for (const usado of NIVEIS_USADOS) expect(lidos.has(usado)).toBe(true)
    // "dominio" é slug de CÓDIGO (NIVEIS_BUILTIN), não do catálogo: continua
    // cravado de propósito, e é o built-in que prova a flag.
    expect(niveis?.find((n) => n.slug === 'dominio')?.builtin).toBe(true)
  })

  it('niveis.csv ausente ("") cai nos níveis padrão, como no build', async () => {
    const store = criarStoreLocal(destinoEspiao(), { catalogo: CSV_CATALOGO, niveis: '', verbos: '' })
    const niveis = await store.lerNiveis()
    expect(niveis?.map((n) => n.slug)).toEqual([
      'raiz', 'dominio', 'final', 'primario', 'fonte-secundaria', 'fonte', 'origem',
    ])
  })

  it('monta o grafo no cliente já na abertura, com o bloco de níveis', () => {
    const store = criarStoreLocal(destinoEspiao(), { catalogo: CSV_CATALOGO, niveis: CSV_NIVEIS, verbos: CSV_VERBOS })
    const grafo = store.grafo()
    expect(grafo).not.toBeNull()
    expect(grafo?.nodes.length).toBeGreaterThan(0)
    expect(grafo?.niveis?.map((n) => n.slug)).toContain(NIVEL_EM_USO)
  })
})

describe('store local — gravação do catálogo', () => {
  it('round-trip no cliente: o que foi gravado parseia de volta igual', async () => {
    const destino = destinoEspiao()
    const store = criarStoreLocal(destino, { catalogo: CSV_CATALOGO, niveis: CSV_NIVEIS, verbos: CSV_VERBOS })
    const rows = (await store.lerCatalogo()) ?? []
    const res = await store.salvarCatalogo(rows)

    expect(res.ok).toBe(true)
    expect(destino.gravados.map(([arquivo]) => arquivo)).toEqual(['catalogo'])
    const [, texto] = destino.gravados[0]
    expect(parseCatalogoRows(texto)).toEqual(parseCatalogoRows(CSV_CATALOGO))
    // Arquivo canônico: serializar o que foi gravado devolve o mesmo byte a byte.
    expect(serializarCatalogo(parseCatalogoRows(texto))).toBe(texto)
    // E o store passa a ler o texto novo.
    expect(store.arquivos()?.catalogo).toBe(texto)
  })

  it('acrescenta uma linha e o grafo remontado ganha o nó', async () => {
    const destino = destinoEspiao()
    const store = criarStoreLocal(destino, { catalogo: CSV_CATALOGO, niveis: CSV_NIVEIS, verbos: CSV_VERBOS })
    const rows = (await store.lerCatalogo()) ?? []
    const antes = store.grafo()?.nodes.length ?? 0

    const res = await store.salvarCatalogo([...rows, row({ nome: 'Painel de Teste' })])

    expect(res.ok).toBe(true)
    const grafo = store.grafo()
    expect(grafo?.nodes.length).toBe(antes + 1)
    // Id gerado do nome na gravação, e é ele que identifica o nó no grafo.
    expect(grafo?.nodes.find((n) => n.id === 'painel-de-teste')?.nome).toBe('Painel de Teste')
    // Sem owner nem centro de custo: o gap de governança vem do build.
    expect(grafo?.nodes.find((n) => n.id === 'painel-de-teste')?.incompleto).toBe(true)
    // E o CSV gravado já traz o id na primeira coluna.
    expect(
      parseCatalogoRows(destino.gravados[0][1]).find((r) => r.nome === 'Painel de Teste')?.id,
    ).toBe('painel-de-teste')
  })

  it('a bandeira de produto de dados atravessa o caminho inteiro: linha → CSV → nó', async () => {
    const destino = destinoEspiao()
    const store = criarStoreLocal(destino, { catalogo: CSV_CATALOGO, niveis: CSV_NIVEIS, verbos: CSV_VERBOS })
    const rows = (await store.lerCatalogo()) ?? []

    const res = await store.salvarCatalogo([
      ...rows,
      row({ nome: 'Produto de Teste', produto_de_dados: 'sim' }),
      row({ nome: 'Comum de Teste', produto_de_dados: 'nao' }),
    ])

    expect(res.ok).toBe(true)
    const gravadas = parseCatalogoRows(destino.gravados[0][1])
    expect(gravadas.find((r) => r.id === 'produto-de-teste')?.produto_de_dados).toBe('sim')
    const nos = store.grafo()?.nodes ?? []
    expect(nos.find((n) => n.id === 'produto-de-teste')?.produtoDeDados).toBe(true)
    expect(nos.find((n) => n.id === 'comum-de-teste')?.produtoDeDados).toBe(false)
  })

  it('renomear pelo id não quebra a ligação de quem apontava para o componente', () => {
    // O gesto que motivou a coluna `id`: com referência por nome, isto deixava
    // um nó fantasma no mapa.
    return (async () => {
      const destino = destinoEspiao()
      const store = criarStoreLocal(destino, { catalogo: CSV_CATALOGO, niveis: CSV_NIVEIS, verbos: CSV_VERBOS })
      const rows = (await store.lerCatalogo()) ?? []
      const alvo = rows[0]

      // Alguém passa a consumir o alvo, pelo id.
      await store.salvarCatalogo([
        ...rows,
        row({ nome: 'Consumidor', consome: [alvo.id], nivel: alvo.nivel }),
      ])
      const arestasAntes = store.grafo()?.links.length ?? 0

      // Agora o alvo é renomeado (e muda de nível, de quebra).
      const atuais = (await store.lerCatalogo()) ?? []
      const res = await store.salvarCatalogo(
        atuais.map((r) => (r.id === alvo.id ? { ...r, nome: `${r.nome} — renomeado` } : r)),
      )

      expect(res.ok).toBe(true)
      const grafo = store.grafo()
      expect(grafo?.links.length).toBe(arestasAntes)
      expect(grafo?.links.some((l) => l.target === alvo.id)).toBe(true)
      expect(grafo?.nodes.some((n) => n.fantasma === true)).toBe(false)
      expect(grafo?.nodes.find((n) => n.id === alvo.id)?.nome).toBe(`${alvo.nome} — renomeado`)
    })()
  })

  it('trocar o componente de nível também não quebra a ligação', async () => {
    const store = criarStoreLocal(destinoEspiao(), { catalogo: CSV_CATALOGO, niveis: CSV_NIVEIS, verbos: CSV_VERBOS })
    const rows = (await store.lerCatalogo()) ?? []
    const alvo = rows[0]
    const destino = nivelDestino(alvo)
    await store.salvarCatalogo([...rows, row({ nome: 'Consumidor', consome: [alvo.id] })])

    const atuais = (await store.lerCatalogo()) ?? []
    const res = await store.salvarCatalogo(
      atuais.map((r) => (r.id === alvo.id ? { ...r, nivel: destino } : r)),
    )

    expect(res.ok).toBe(true)
    const grafo = store.grafo()
    expect(grafo?.links.some((l) => l.target === alvo.id)).toBe(true)
    expect(grafo?.nodes.find((n) => n.id === alvo.id)?.nivel).toBe(destino)
    expect(grafo?.nodes.some((n) => n.fantasma === true)).toBe(false)
  })

  it('referência escolhida por nome é gravada como id', async () => {
    const destino = destinoEspiao()
    const store = criarStoreLocal(destino, { catalogo: CSV_CATALOGO, niveis: CSV_NIVEIS, verbos: CSV_VERBOS })
    const rows = (await store.lerCatalogo()) ?? []
    const alvo = rows[0]

    await store.salvarCatalogo([...rows, row({ nome: 'Consumidor', consome: [alvo.nome] })])

    const gravadas = parseCatalogoRows(destino.gravados[0][1])
    expect(gravadas.find((r) => r.nome === 'Consumidor')?.consome).toEqual([alvo.id])
  })

  it('valida ANTES de gravar: linha inválida não toca no arquivo', async () => {
    const destino = destinoEspiao()
    const store = criarStoreLocal(destino, { catalogo: CSV_CATALOGO, niveis: CSV_NIVEIS, verbos: CSV_VERBOS })
    const rows = (await store.lerCatalogo()) ?? []
    const grafoAntes = store.grafo()

    const res = await store.salvarCatalogo([...rows, row({ nivel: 'inexistente' })])

    expect(res.ok).toBe(false)
    expect(res.ok === false && res.errors.join(' ')).toContain('nivel "inexistente" inválido')
    expect(destino.gravados).toEqual([])
    expect(store.arquivos()?.catalogo).toBe(CSV_CATALOGO)
    expect(store.grafo()).toBe(grafoAntes)
  })

  it('nome duplicado no mesmo nível é erro e não grava', async () => {
    const destino = destinoEspiao()
    const store = criarStoreLocal(destino, { catalogo: CSV_CATALOGO, niveis: CSV_NIVEIS, verbos: CSV_VERBOS })
    const rows = (await store.lerCatalogo()) ?? []
    const primeira = rows[0]

    const res = await store.salvarCatalogo([
      ...rows,
      row({ nome: primeira.nome, nivel: primeira.nivel }),
    ])

    expect(res.ok).toBe(false)
    expect(res.ok === false && res.errors.join(' ')).toContain('nome duplicado')
    expect(destino.gravados).toEqual([])
  })

  it('consome que não resolve grava, mas devolve o aviso do nó fantasma', async () => {
    const store = criarStoreLocal(destinoEspiao(), { catalogo: CSV_CATALOGO, niveis: CSV_NIVEIS, verbos: CSV_VERBOS })
    const rows = (await store.lerCatalogo()) ?? []

    const res = await store.salvarCatalogo([...rows, row({ consome: ['Coisa Que Não Existe'] })])

    expect(res.ok).toBe(true)
    expect(res.ok === true && res.warnings.join(' ')).toContain('Coisa Que Não Existe')
    expect(store.grafo()?.nodes.some((n) => n.fantasma === true)).toBe(true)
  })

  it('erro de gravação (permissão perdida) sobe para quem chamou', async () => {
    const destino: DestinoLocal = {
      modo: 'arquivo',
      rotulo: 'x/catalogo.csv',
      gravar: () => Promise.reject(new Error('Permissão de gravação perdida')),
    }
    const store = criarStoreLocal(destino, { catalogo: CSV_CATALOGO, niveis: CSV_NIVEIS, verbos: CSV_VERBOS })
    const rows = (await store.lerCatalogo()) ?? []

    await expect(store.salvarCatalogo(rows)).rejects.toThrow('Permissão de gravação perdida')
  })
})

describe('store local — gravação dos níveis', () => {
  it('acrescenta um nível: grava só o niveis.csv e o grafo ganha a coluna', async () => {
    const destino = destinoEspiao()
    const store = criarStoreLocal(destino, { catalogo: CSV_CATALOGO, niveis: CSV_NIVEIS, verbos: CSV_VERBOS })
    const niveis = (await store.lerNiveis()) ?? []

    const res = await store.salvarNiveis([...niveis, { titulo: 'Sandbox', ordem: 55 }])

    expect(res.ok).toBe(true)
    expect(destino.gravados.map(([arquivo]) => arquivo)).toEqual(['niveis'])
    expect(store.grafo()?.niveis?.map((n) => n.slug)).toContain('sandbox')
    // O catálogo não foi tocado.
    expect(store.arquivos()?.catalogo).toBe(CSV_CATALOGO)
  })

  it('renomear pelo slug não mexe em nenhuma linha do catálogo', async () => {
    const store = criarStoreLocal(destinoEspiao(), { catalogo: CSV_CATALOGO, niveis: CSV_NIVEIS, verbos: CSV_VERBOS })
    const niveis = (await store.lerNiveis()) ?? []
    const renomeados = niveis.map((n) => (n.slug === NIVEL_EM_USO ? { ...n, titulo: 'Ouro' } : n))

    const res = await store.salvarNiveis(renomeados)

    expect(res.ok).toBe(true)
    expect(store.arquivos()?.catalogo).toBe(CSV_CATALOGO)
    const grafo = store.grafo()
    expect(grafo?.niveis?.find((n) => n.slug === NIVEL_EM_USO)?.titulo).toBe('Ouro')
    expect(grafo?.nodes.some((n) => n.nivel === NIVEL_EM_USO)).toBe(true)
  })

  it('remover nível em uso é recusado e não grava', async () => {
    const destino = destinoEspiao()
    const store = criarStoreLocal(destino, { catalogo: CSV_CATALOGO, niveis: CSV_NIVEIS, verbos: CSV_VERBOS })
    const niveis = (await store.lerNiveis()) ?? []
    const emUso = niveis.find((n) => n.slug === NIVEL_EM_USO)
    expect(emUso).toBeDefined()

    const res = await store.salvarNiveis(niveis.filter((n) => n.slug !== NIVEL_EM_USO))

    expect(res.ok).toBe(false)
    expect(res.ok === false && res.errors.join(' ')).toContain('está em uso')
    expect(destino.gravados).toEqual([])
  })

  it('cor do nível faz a volta completa: grava no CSV e volta na leitura e no grafo', async () => {
    const destino = destinoEspiao()
    const store = criarStoreLocal(destino, { catalogo: CSV_CATALOGO, niveis: CSV_NIVEIS, verbos: CSV_VERBOS })
    const niveis = (await store.lerNiveis()) ?? []
    const pintados = niveis.map((n) =>
      // "#C0C0C0" maiúsculo de propósito: a normalização é do backend, não da UI.
      n.slug === NIVEL_EM_USO ? { ...n, corFundo: '#C0C0C0', corBorda: '#8fa3b8' } : n,
    )

    const res = await store.salvarNiveis(pintados)

    expect(res.ok).toBe(true)
    expect(destino.gravados[0][1]).toContain(';#c0c0c0;#8fa3b8')
    expect(store.grafo()?.niveis?.find((n) => n.slug === NIVEL_EM_USO)).toMatchObject({
      corFundo: '#c0c0c0',
      corBorda: '#8fa3b8',
    })
    const relidos = (await store.lerNiveis()) ?? []
    expect(relidos.find((n) => n.slug === NIVEL_EM_USO)?.corFundo).toBe('#c0c0c0')
    // Só aquele nível mudou de cor.
    expect(relidos.filter((n) => n.corFundo !== undefined).map((n) => n.slug)).toEqual([
      NIVEL_EM_USO,
    ])
  })

  it('limpar a cor (campo ausente) devolve o nível ao padrão', async () => {
    const store = criarStoreLocal(destinoEspiao(), { catalogo: CSV_CATALOGO, niveis: CSV_NIVEIS, verbos: CSV_VERBOS })
    const niveis = (await store.lerNiveis()) ?? []
    await store.salvarNiveis(niveis.map((n) => (n.slug === NIVEL_EM_USO ? { ...n, corFundo: '#c0c0c0' } : n)))

    const semCor = ((await store.lerNiveis()) ?? []).map(({ corFundo: _, ...n }) => n)
    const res = await store.salvarNiveis(semCor)

    expect(res.ok).toBe(true)
    expect(store.grafo()?.niveis?.find((n) => n.slug === NIVEL_EM_USO)?.corFundo).toBeUndefined()
  })

  it('cor fora do hexadecimal é erro de validação e não grava', async () => {
    const destino = destinoEspiao()
    const store = criarStoreLocal(destino, { catalogo: CSV_CATALOGO, niveis: CSV_NIVEIS, verbos: CSV_VERBOS })
    const niveis = (await store.lerNiveis()) ?? []

    const res = await store.salvarNiveis(
      niveis.map((n) => (n.slug === NIVEL_EM_USO ? { ...n, corBorda: 'prateado' } : n)),
    )

    expect(res.ok).toBe(false)
    expect(res.ok === false && res.errors.join(' ')).toContain('cor_borda "prateado"')
    expect(destino.gravados).toEqual([])
  })

  it('ordem repetida é erro de validação e não grava', async () => {
    const destino = destinoEspiao()
    const store = criarStoreLocal(destino, { catalogo: CSV_CATALOGO, niveis: CSV_NIVEIS, verbos: CSV_VERBOS })
    const niveis = (await store.lerNiveis()) ?? []

    const res = await store.salvarNiveis([...niveis, { titulo: 'Colidente', ordem: niveis[0].ordem }])

    expect(res.ok).toBe(false)
    expect(destino.gravados).toEqual([])
  })
})

// Este bloco entra com `verbos: ''` de propósito, e não com o CSV_VERBOS
// derivado: ele é sobre o CICLO DE VIDA do arquivo que ainda não existe —
// ausente vale os embutidos, e o verbos.csv só nasce numa gravação. Começar do
// zero é também o que o isola do vocabulário que o usuário venha a cadastrar.
describe('store local — gravação dos verbos', () => {
  it('sem verbos.csv, lerVerbos devolve os cinco embutidos e o arquivo não nasce', async () => {
    const destino = destinoEspiao()
    const store = criarStoreLocal(destino, { catalogo: CSV_CATALOGO, niveis: CSV_NIVEIS, verbos: '' })

    const verbos = (await store.lerVerbos()) ?? []

    expect(verbos.map((v) => v.slug)).toEqual([
      'consome', 'acessa', 'envia', 'associado', 'relaciona',
    ])
    expect(verbos.every((v) => v.builtin === true)).toBe(true)
    // Ler não cria arquivo nenhum: o verbos.csv só nasce numa GRAVAÇÃO.
    expect(store.arquivos()?.verbos).toBe('')
    expect(destino.gravados).toEqual([])
  })

  it('acrescenta um verbo: grava só o verbos.csv, pelo serializador', async () => {
    const destino = destinoEspiao()
    const store = criarStoreLocal(destino, { catalogo: CSV_CATALOGO, niveis: CSV_NIVEIS, verbos: '' })
    const verbos = (await store.lerVerbos()) ?? []

    const res = await store.salvarVerbos([
      ...verbos,
      { titulo: 'Transporta', sentido: 'jusante', seta: false },
    ])

    expect(res.ok).toBe(true)
    expect(destino.gravados.map(([arquivo]) => arquivo)).toEqual(['verbos'])
    // Arquivo canônico: BOM, as quatro colunas, ";" e CRLF — e a `seta`
    // booleana da API virou o "sim"/"nao" da coluna.
    const [, texto] = destino.gravados[0]
    expect(texto.startsWith('\uFEFFtitulo;slug;sentido;seta\r\nConsome;consome;montante;sim\r\n')).toBe(true)
    expect(texto).toContain('Transporta;;jusante;nao')
    expect(store.arquivos()?.verbos).toBe(texto)
    // Os outros dois arquivos ficaram intocados.
    expect(store.arquivos()?.catalogo).toBe(CSV_CATALOGO)
    expect(store.arquivos()?.niveis).toBe(CSV_NIVEIS)
  })

  it('verbo novo faz a volta completa: CSV → leitura → prefixo do consome → aresta', async () => {
    const destino = destinoEspiao()
    const store = criarStoreLocal(destino, { catalogo: CSV_CATALOGO, niveis: CSV_NIVEIS, verbos: '' })
    const verbos = (await store.lerVerbos()) ?? []
    await store.salvarVerbos([...verbos, { titulo: 'Transporta', sentido: 'jusante', seta: false }])

    // 1. o verbo volta na leitura, com o slug derivado do título e já não builtin
    const relidos = (await store.lerVerbos()) ?? []
    expect(relidos.find((v) => v.slug === 'transporta')).toMatchObject({
      titulo: 'Transporta',
      sentido: 'jusante',
      seta: false,
      builtin: false,
    })
    // 2. e no bloco `verbos` do grafo, que é o que a UI lê
    expect(store.grafo()?.verbos?.map((v) => v.slug)).toContain('transporta')

    // 3. agora uma linha do catálogo usa o prefixo: vira aresta com esse label
    const rows = (await store.lerCatalogo()) ?? []
    const alvo = rows[0]
    const res = await store.salvarCatalogo([
      ...rows,
      row({ nome: 'Job de Teste', consome: [`transporta:${alvo.id}`] }),
    ])

    expect(res.ok).toBe(true)
    const links = store.grafo()?.links ?? []
    expect(links).toContainEqual({ source: 'job-de-teste', target: alvo.id, label: 'transporta' })
    // e a célula foi gravada com o prefixo, não achatada em "consome"
    const gravadas = parseCatalogoRows(destino.gravados.at(-1)?.[1] ?? '')
    expect(gravadas.find((r) => r.id === 'job-de-teste')?.consome).toEqual([`transporta:${alvo.id}`])
  })

  it('remover verbo em uso é recusado e não grava', async () => {
    const destino = destinoEspiao()
    const store = criarStoreLocal(destino, { catalogo: CSV_CATALOGO, niveis: CSV_NIVEIS, verbos: '' })
    // O verbo em uso é CADASTRADO aqui, e não um dos embutidos: o catálogo
    // vivo já usa `acessa`, `envia` e `associado`, e escolher um deles fazia a
    // mensagem citar as linhas do usuário em vez da criada por este caso (a
    // lista de nomes citados para em 5). Um slug inventado só tem o uso que o
    // teste cria — o mesmo raciocínio dos nomes "de Teste" dos outros casos.
    const verbos = (await store.lerVerbos()) ?? []
    await store.salvarVerbos([...verbos, { titulo: 'Verbo De Teste', sentido: 'montante', seta: true }])
    const verbosGravados = store.arquivos()?.verbos

    const rows = (await store.lerCatalogo()) ?? []
    const alvo = rows[0]
    // Uma referência passa a declarar "verbo-de-teste"; agora o verbo está em uso.
    await store.salvarCatalogo([
      ...rows,
      row({ nome: 'Job de Teste', consome: [`verbo-de-teste:${alvo.id}`] }),
    ])

    const atuais = (await store.lerVerbos()) ?? []
    const res = await store.salvarVerbos(atuais.filter((v) => v.slug !== 'verbo-de-teste'))

    expect(res.ok).toBe(false)
    expect(res.ok === false && res.errors.join(' ')).toContain('está em uso')
    expect(res.ok === false && res.errors.join(' ')).toContain('Job de Teste')
    // A recusa não tocou no disco: só os dois saves anteriores gravaram, e o
    // verbos.csv continua exatamente como estava.
    expect(destino.gravados.map(([arquivo]) => arquivo)).toEqual(['verbos', 'catalogo'])
    expect(store.arquivos()?.verbos).toBe(verbosGravados)
  })

  it('remover o "consome" é recusado — é o significado da célula sem prefixo', async () => {
    const destino = destinoEspiao()
    const store = criarStoreLocal(destino, { catalogo: CSV_CATALOGO, niveis: CSV_NIVEIS, verbos: '' })
    const verbos = (await store.lerVerbos()) ?? []

    const res = await store.salvarVerbos(verbos.filter((v) => v.slug !== 'consome'))

    expect(res.ok).toBe(false)
    expect(res.ok === false && res.errors.join(' ')).toContain('não pode ser removido')
    expect(destino.gravados).toEqual([])
  })

  it('sentido fora do vocabulário é erro de validação e não grava', async () => {
    const destino = destinoEspiao()
    const store = criarStoreLocal(destino, { catalogo: CSV_CATALOGO, niveis: CSV_NIVEIS, verbos: '' })
    const verbos = (await store.lerVerbos()) ?? []

    // O cast é o caso real de um valor fora do vocabulário chegando de fora do
    // <select> (arquivo editado à mão, versão antiga da tela): o tipo da API
    // impede isso na UI, a validação impede no disco.
    const res = await store.salvarVerbos(
      verbos.map((v) => (v.slug === 'envia' ? { ...v, sentido: 'lateral' as Sentido } : v)),
    )

    expect(res.ok).toBe(false)
    expect(res.ok === false && res.errors.join(' ')).toContain('sentido "lateral" inválido')
    expect(destino.gravados).toEqual([])
  })

  it('renomear pelo slug não mexe em nenhuma linha do catálogo', async () => {
    const store = criarStoreLocal(destinoEspiao(), { catalogo: CSV_CATALOGO, niveis: CSV_NIVEIS, verbos: '' })
    const verbos = (await store.lerVerbos()) ?? []

    const res = await store.salvarVerbos(
      verbos.map((v) => (v.slug === 'envia' ? { ...v, titulo: 'Manda' } : v)),
    )

    expect(res.ok).toBe(true)
    expect(store.arquivos()?.catalogo).toBe(CSV_CATALOGO)
    const doGrafo = store.grafo()?.verbos?.find((v) => v.slug === 'envia')
    expect(doGrafo).toMatchObject({ titulo: 'Manda', sentido: 'jusante' })
    // O slug sobreviveu à renomeação: é ele que aparece nas células.
    expect(((await store.lerVerbos()) ?? []).map((v) => v.slug)).toEqual([
      'consome', 'acessa', 'envia', 'associado', 'relaciona',
    ])
  })
})

describe('store em memória (fallback sem File System Access)', () => {
  it('edita sem gravar em disco e entrega os dois CSVs para baixar', async () => {
    const store = criarStoreLocal(destinoMemoria('catalogo.csv'), {
      catalogo: CSV_CATALOGO,
      niveis: CSV_NIVEIS,
      verbos: CSV_VERBOS,
    })
    expect(store.modo).toBe('memoria')

    const rows = (await store.lerCatalogo()) ?? []
    const res = await store.salvarCatalogo([...rows, row({ nome: 'Só na memória' })])

    expect(res.ok).toBe(true)
    const arquivos = store.arquivos()
    expect(arquivos?.catalogo).toContain('Só na memória')
    expect(arquivos?.niveis).toBe(CSV_NIVEIS)
    // Só o catálogo mudou: os outros dois arquivos saem como entraram.
    expect(arquivos?.verbos).toBe(CSV_VERBOS)
    expect(store.grafo()?.nodes.some((n) => n.nome === 'Só na memória')).toBe(true)
  })
})
