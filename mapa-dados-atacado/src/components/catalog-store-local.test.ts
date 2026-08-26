// Testes do adaptador de persistência local (o que faz o pacote HTML editar
// CSVs sem servidor): escolha do modo, round-trip serializar→parsear feito no
// cliente, validação antes de gravar e grafo remontado a cada save.
//
// Nada aqui toca no DOM: o DestinoLocal é injetado, então o que os testes
// exercitam é exatamente a lógica que roda no navegador, menos a chamada de
// File System Access (que exige gesto do usuário e não é automatizável).
import { describe, expect, it } from 'vitest'
import type { CatalogoRow } from './catalog-api'
import { TIPOS_COMPONENTE } from './graph-types'
import { decidirCapacidade } from './catalog-store'
import type { ArquivoCatalogo, DestinoLocal } from './catalog-store-local'
import { criarStoreLocal, destinoMemoria } from './catalog-store-local'
import { parseCatalogoRows, serializarCatalogo } from './graph-build'
// Os CSVs de verdade do projeto como texto (o mesmo que o navegador leria da
// pasta escolhida). ?raw é resolvido pelo Vite, então o teste roda no mesmo
// pipeline do app — sem APIs de Node, que não existem no bundle do front.
import CSV_CATALOGO from '../../catalogo.csv?raw'
// Fixture própria: o niveis.csv do projeto é dado vivo (o usuário pinta e
// renomeia níveis pelo app), então usá-lo aqui quebraria o teste a cada edição.
const CSV_NIVEIS =
  '\uFEFFtitulo;ordem;slug;cor_fundo;cor_borda\r\n' +
  'Gold;43;gold;;\r\n' +
  'Silver;44;silver;;\r\n' +
  'Broze;45;broze;;\r\n'

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
  associacoes: [],
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
    const store = criarStoreLocal(destinoEspiao(), { catalogo: CSV_CATALOGO, niveis: CSV_NIVEIS })
    const rows = await store.lerCatalogo()
    expect(rows).not.toBeNull()
    expect(rows?.length).toBe(parseCatalogoRows(CSV_CATALOGO).length)
    // Célula vazia vira "Default": a UI nunca vê valor fora do vocabulário.
    expect(rows?.every((r) => TIPOS_COMPONENTE.includes(r.tipo_componente))).toBe(true)
  })

  it('lê os níveis do niveis.csv, com slug e a flag builtin', async () => {
    const store = criarStoreLocal(destinoEspiao(), { catalogo: CSV_CATALOGO, niveis: CSV_NIVEIS })
    const niveis = await store.lerNiveis()
    expect(niveis?.map((n) => n.slug)).toContain('gold')
    expect(niveis?.find((n) => n.slug === 'dominio')?.builtin).toBe(true)
  })

  it('niveis.csv ausente ("") cai nos níveis padrão, como no build', async () => {
    const store = criarStoreLocal(destinoEspiao(), { catalogo: CSV_CATALOGO, niveis: '' })
    const niveis = await store.lerNiveis()
    expect(niveis?.map((n) => n.slug)).toEqual([
      'raiz', 'dominio', 'final', 'primario', 'fonte-secundaria', 'fonte', 'origem',
    ])
  })

  it('monta o grafo no cliente já na abertura, com o bloco de níveis', () => {
    const store = criarStoreLocal(destinoEspiao(), { catalogo: CSV_CATALOGO, niveis: CSV_NIVEIS })
    const grafo = store.grafo()
    expect(grafo).not.toBeNull()
    expect(grafo?.nodes.length).toBeGreaterThan(0)
    expect(grafo?.niveis?.map((n) => n.slug)).toContain('gold')
  })
})

describe('store local — gravação do catálogo', () => {
  it('round-trip no cliente: o que foi gravado parseia de volta igual', async () => {
    const destino = destinoEspiao()
    const store = criarStoreLocal(destino, { catalogo: CSV_CATALOGO, niveis: CSV_NIVEIS })
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
    const store = criarStoreLocal(destino, { catalogo: CSV_CATALOGO, niveis: CSV_NIVEIS })
    const rows = (await store.lerCatalogo()) ?? []
    const antes = store.grafo()?.nodes.length ?? 0

    const res = await store.salvarCatalogo([...rows, row({ nome: 'Painel de Teste' })])

    expect(res.ok).toBe(true)
    const grafo = store.grafo()
    expect(grafo?.nodes.length).toBe(antes + 1)
    expect(grafo?.nodes.find((n) => n.id === 'primario-painel-de-teste')?.nome).toBe(
      'Painel de Teste',
    )
    // Sem owner nem centro de custo: o gap de governança vem do build.
    expect(grafo?.nodes.find((n) => n.id === 'primario-painel-de-teste')?.incompleto).toBe(true)
  })

  it('valida ANTES de gravar: linha inválida não toca no arquivo', async () => {
    const destino = destinoEspiao()
    const store = criarStoreLocal(destino, { catalogo: CSV_CATALOGO, niveis: CSV_NIVEIS })
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
    const store = criarStoreLocal(destino, { catalogo: CSV_CATALOGO, niveis: CSV_NIVEIS })
    const rows = (await store.lerCatalogo()) ?? []
    const primeira = rows[0]

    const res = await store.salvarCatalogo([...rows, row({ nome: primeira.nome, nivel: primeira.nivel })])

    expect(res.ok).toBe(false)
    expect(res.ok === false && res.errors.join(' ')).toContain('nome duplicado')
    expect(destino.gravados).toEqual([])
  })

  it('consome que não resolve grava, mas devolve o aviso do nó fantasma', async () => {
    const store = criarStoreLocal(destinoEspiao(), { catalogo: CSV_CATALOGO, niveis: CSV_NIVEIS })
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
    const store = criarStoreLocal(destino, { catalogo: CSV_CATALOGO, niveis: CSV_NIVEIS })
    const rows = (await store.lerCatalogo()) ?? []

    await expect(store.salvarCatalogo(rows)).rejects.toThrow('Permissão de gravação perdida')
  })
})

describe('store local — gravação dos níveis', () => {
  it('acrescenta um nível: grava só o niveis.csv e o grafo ganha a coluna', async () => {
    const destino = destinoEspiao()
    const store = criarStoreLocal(destino, { catalogo: CSV_CATALOGO, niveis: CSV_NIVEIS })
    const niveis = (await store.lerNiveis()) ?? []

    const res = await store.salvarNiveis([...niveis, { titulo: 'Sandbox', ordem: 55 }])

    expect(res.ok).toBe(true)
    expect(destino.gravados.map(([arquivo]) => arquivo)).toEqual(['niveis'])
    expect(store.grafo()?.niveis?.map((n) => n.slug)).toContain('sandbox')
    // O catálogo não foi tocado.
    expect(store.arquivos()?.catalogo).toBe(CSV_CATALOGO)
  })

  it('renomear pelo slug não mexe em nenhuma linha do catálogo', async () => {
    const store = criarStoreLocal(destinoEspiao(), { catalogo: CSV_CATALOGO, niveis: CSV_NIVEIS })
    const niveis = (await store.lerNiveis()) ?? []
    const renomeados = niveis.map((n) => (n.slug === 'gold' ? { ...n, titulo: 'Ouro' } : n))

    const res = await store.salvarNiveis(renomeados)

    expect(res.ok).toBe(true)
    expect(store.arquivos()?.catalogo).toBe(CSV_CATALOGO)
    const grafo = store.grafo()
    expect(grafo?.niveis?.find((n) => n.slug === 'gold')?.titulo).toBe('Ouro')
    expect(grafo?.nodes.some((n) => n.nivel === 'gold')).toBe(true)
  })

  it('remover nível em uso é recusado e não grava', async () => {
    const destino = destinoEspiao()
    const store = criarStoreLocal(destino, { catalogo: CSV_CATALOGO, niveis: CSV_NIVEIS })
    const niveis = (await store.lerNiveis()) ?? []
    const emUso = niveis.find((n) => n.slug === 'gold')
    expect(emUso).toBeDefined()

    const res = await store.salvarNiveis(niveis.filter((n) => n.slug !== 'gold'))

    expect(res.ok).toBe(false)
    expect(res.ok === false && res.errors.join(' ')).toContain('está em uso')
    expect(destino.gravados).toEqual([])
  })

  it('cor do nível faz a volta completa: grava no CSV e volta na leitura e no grafo', async () => {
    const destino = destinoEspiao()
    const store = criarStoreLocal(destino, { catalogo: CSV_CATALOGO, niveis: CSV_NIVEIS })
    const niveis = (await store.lerNiveis()) ?? []
    const pintados = niveis.map((n) =>
      // "#C0C0C0" maiúsculo de propósito: a normalização é do backend, não da UI.
      n.slug === 'gold' ? { ...n, corFundo: '#C0C0C0', corBorda: '#8fa3b8' } : n,
    )

    const res = await store.salvarNiveis(pintados)

    expect(res.ok).toBe(true)
    expect(destino.gravados[0][1]).toContain(';#c0c0c0;#8fa3b8')
    expect(store.grafo()?.niveis?.find((n) => n.slug === 'gold')).toMatchObject({
      corFundo: '#c0c0c0',
      corBorda: '#8fa3b8',
    })
    const relidos = (await store.lerNiveis()) ?? []
    expect(relidos.find((n) => n.slug === 'gold')?.corFundo).toBe('#c0c0c0')
    // Só aquele nível mudou de cor.
    expect(relidos.filter((n) => n.corFundo !== undefined).map((n) => n.slug)).toEqual(['gold'])
  })

  it('limpar a cor (campo ausente) devolve o nível ao padrão', async () => {
    const store = criarStoreLocal(destinoEspiao(), { catalogo: CSV_CATALOGO, niveis: CSV_NIVEIS })
    const niveis = (await store.lerNiveis()) ?? []
    await store.salvarNiveis(niveis.map((n) => (n.slug === 'gold' ? { ...n, corFundo: '#c0c0c0' } : n)))

    const semCor = ((await store.lerNiveis()) ?? []).map(({ corFundo: _, ...n }) => n)
    const res = await store.salvarNiveis(semCor)

    expect(res.ok).toBe(true)
    expect(store.grafo()?.niveis?.find((n) => n.slug === 'gold')?.corFundo).toBeUndefined()
  })

  it('cor fora do hexadecimal é erro de validação e não grava', async () => {
    const destino = destinoEspiao()
    const store = criarStoreLocal(destino, { catalogo: CSV_CATALOGO, niveis: CSV_NIVEIS })
    const niveis = (await store.lerNiveis()) ?? []

    const res = await store.salvarNiveis(
      niveis.map((n) => (n.slug === 'gold' ? { ...n, corBorda: 'prateado' } : n)),
    )

    expect(res.ok).toBe(false)
    expect(res.ok === false && res.errors.join(' ')).toContain('cor_borda "prateado"')
    expect(destino.gravados).toEqual([])
  })

  it('ordem repetida é erro de validação e não grava', async () => {
    const destino = destinoEspiao()
    const store = criarStoreLocal(destino, { catalogo: CSV_CATALOGO, niveis: CSV_NIVEIS })
    const niveis = (await store.lerNiveis()) ?? []

    const res = await store.salvarNiveis([...niveis, { titulo: 'Colidente', ordem: niveis[0].ordem }])

    expect(res.ok).toBe(false)
    expect(destino.gravados).toEqual([])
  })
})

describe('store em memória (fallback sem File System Access)', () => {
  it('edita sem gravar em disco e entrega os dois CSVs para baixar', async () => {
    const store = criarStoreLocal(destinoMemoria('catalogo.csv'), {
      catalogo: CSV_CATALOGO,
      niveis: CSV_NIVEIS,
    })
    expect(store.modo).toBe('memoria')

    const rows = (await store.lerCatalogo()) ?? []
    const res = await store.salvarCatalogo([...rows, row({ nome: 'Só na memória' })])

    expect(res.ok).toBe(true)
    const arquivos = store.arquivos()
    expect(arquivos?.catalogo).toContain('Só na memória')
    expect(arquivos?.niveis).toBe(CSV_NIVEIS)
    expect(store.grafo()?.nodes.some((n) => n.nome === 'Só na memória')).toBe(true)
  })
})
