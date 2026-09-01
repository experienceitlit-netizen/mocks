// Store local: o navegador é quem lê, valida e grava os CSVs, sem servidor.
//
// Toda a lógica de dados é a MESMA do dev server — as funções vêm de
// scripts/graph-lib.ts por graph-build.ts, nada é reimplementado aqui. A ordem
// das operações também é a do plugin (scripts/vite-plugin-catalogo.ts):
//
//   validar → serializar → montar o grafo → só então gravar o arquivo
//
// Erro de validação devolve {ok:false, errors} e NÃO toca no disco; a gravação
// é o último passo, e o grafo novo fica disponível em grafo() para o App
// re-renderizar (o equivalente ao HMR do graph.json no dev server).
//
// Onde o texto vai parar é o único ponto variável: um DestinoLocal grava na
// pasta escolhida (File System Access) ou só guarda em memória, para o usuário
// baixar depois (fallback do Firefox).
import { normalizeProdutoDeDados, normalizeTipoComponente } from './catalog-api'
import type { CatalogoRow, NivelApiRow, SaveResult, VerboApiRow } from './catalog-api'
import type { ArquivosCatalogo, CatalogStore, ModoPersistencia } from './catalog-store'
import {
  buildGraph,
  canonizarCatalogo,
  carregarNiveis,
  carregarVerbos,
  normalizarCor,
  parseCatalogoRows,
  resolverNiveis,
  resolverVerbos,
  serializarCatalogo,
  serializarNiveis,
  serializarVerbos,
  validarCatalogo,
  validarNiveis,
  validarNiveisContraCatalogo,
  validarVerbos,
  validarVerbosContraCatalogo,
} from './graph-build'
import type { Graph, GraphNode, NivelRow, VerboRow } from './graph-build'
import type { Debito, GraphJson, GraphNodeData } from './graph-types'

/** Qual dos três arquivos do catálogo está sendo gravado. */
export type ArquivoCatalogo = 'catalogo' | 'niveis' | 'verbos'

/** Para onde o CSV serializado vai. Só isso separa "gravar na pasta do
 *  usuário" de "guardar para baixar depois". */
export interface DestinoLocal {
  readonly modo: Exclude<ModoPersistencia, 'http'>
  /** Texto do chip de modo na barra superior. */
  readonly rotulo: string
  /** Persiste o texto do arquivo. Lançar aqui vira mensagem de erro no
   *  formulário (é assim que a perda de permissão chega ao usuário). */
  gravar(arquivo: ArquivoCatalogo, texto: string): Promise<void>
}

/** Destino que não grava em lugar nenhum: a edição vive na memória da aba e o
 *  usuário leva os arquivos pelo botão "Baixar CSV". */
export function destinoMemoria(origem: string): DestinoLocal {
  return {
    modo: 'memoria',
    rotulo: `${origem} (cópia em memória — baixe o CSV para salvar)`,
    gravar: () => Promise.resolve(),
  }
}

/** `tipo_componente` e `produto_de_dados` da linha bruta são string livre; a UI
 *  só trabalha com o vocabulário válido, como no GET /api/catalogo. */
function normalizarRows(rows: ReturnType<typeof parseCatalogoRows>): CatalogoRow[] {
  return rows.map((r) => ({
    ...r,
    tipo_componente: normalizeTipoComponente(r.tipo_componente),
    produto_de_dados: normalizeProdutoDeDados(r.produto_de_dados),
  }))
}

/** Nó do build → nó do schema do graph.json. `debito` fica como o build o
 *  emite, "" incluído ("não declarado"), que é o mesmo valor que chega hoje
 *  pelo import do graph.json — a UI lê sempre por debitoDe(). */
function nodeJson(n: GraphNode): GraphNodeData {
  const node: GraphNodeData = {
    id: n.id,
    nome: n.nome,
    nivel: n.nivel,
    tipoComponente: n.tipoComponente,
    dominio: n.dominio,
    debito: n.debito as Debito,
    status: n.status,
    owner: n.owner,
    centroDeCusto: n.centroDeCusto,
    descricao: n.descricao,
    incompleto: n.incompleto,
    produtoDeDados: n.produtoDeDados,
  }
  if (n.corpo !== undefined) node.corpo = n.corpo
  if (n.fantasma === true) node.fantasma = true
  return node
}

/** Grafo do build → o mesmo objeto que o app importa de src/data/graph.json.
 *  A cópia é campo a campo: bloco novo do build só chega ao front quando
 *  aparece aqui também (foi o que faltou ao `verbos` na fase anterior). */
export function comoGraphJson(graph: Graph): GraphJson {
  return {
    niveis: graph.niveis.map((nv) => ({ ...nv })),
    verbos: graph.verbos.map((v) => ({ ...v })),
    nodes: graph.nodes.map(nodeJson),
    links: graph.links.map((l) => ({ ...l })),
  }
}

/** NivelApiRow (formato da UI e do POST /api/niveis) → linha bruta do
 *  niveis.csv, com a mesma leitura de `slug` do plugin: vazio não vira campo,
 *  porque é o que marca "nível novo, derive o slug do título". As cores seguem
 *  a regra irmã — vazia é "volte ao padrão" — e o que não for hex entra cru,
 *  para validarNiveis recusar citando o valor. */
function comoNivelRow(r: NivelApiRow): NivelRow {
  const slug = (r.slug ?? '').trim()
  const row: NivelRow = { titulo: r.titulo.trim(), ordem: r.ordem }
  if (slug !== '') row.slug = slug
  for (const campo of ['corFundo', 'corBorda'] as const) {
    const cor = (r[campo] ?? '').trim()
    if (cor !== '') row[campo] = normalizarCor(cor) ?? cor
  }
  return row
}

/** VerboApiRow (formato da UI e do POST /api/verbos) → linha bruta do
 *  verbos.csv, com a mesma leitura de `slug` do plugin: vazio não vira campo,
 *  porque é o que marca "verbo novo, derive o slug do título". `seta` é
 *  booleano na API e "sim"/"nao" no arquivo — a conversão é aqui; `sentido`
 *  vazio não vira campo (vale o padrão) e o que vier fora do vocabulário entra
 *  cru, para validarVerbos recusar citando o valor. */
function comoVerboRow(r: VerboApiRow): VerboRow {
  const slug = (r.slug ?? '').trim()
  const sentido = (r.sentido ?? '').trim()
  const row: VerboRow = { titulo: r.titulo.trim() }
  if (slug !== '') row.slug = slug
  if (sentido !== '') row.sentido = sentido
  if (r.seta !== undefined) row.seta = r.seta ? 'sim' : 'nao'
  return row
}

function dedup(...listas: string[][]): string[] {
  return [...new Set(listas.flat())]
}

function counts(graph: Graph): Record<string, number> {
  return { nos: graph.nodes.length, arestas: graph.links.length, niveis: graph.niveis.length }
}

/**
 * Store sobre os textos dos três CSVs, já carregados na memória da aba.
 * Cada save regrava o arquivo inteiro (nunca um patch) e recalcula o grafo,
 * exatamente como o POST da API faz.
 */
export function criarStoreLocal(destino: DestinoLocal, arquivos: ArquivosCatalogo): CatalogStore {
  let csvCatalogo = arquivos.catalogo
  let csvNiveis = arquivos.niveis
  let csvVerbos = arquivos.verbos
  let grafoAtual = montar()

  function montar(): GraphJson {
    const { niveis } = carregarNiveis(csvNiveis)
    const { verbos } = carregarVerbos(csvVerbos)
    return comoGraphJson(buildGraph(csvCatalogo, niveis, verbos).graph)
  }

  return {
    modo: destino.modo,
    rotulo: destino.rotulo,

    lerCatalogo: () => Promise.resolve(normalizarRows(parseCatalogoRows(csvCatalogo))),

    lerNiveis: () => Promise.resolve(carregarNiveis(csvNiveis).niveis.map((nv) => ({ ...nv }))),

    // verbos.csv ausente ("") devolve os embutidos, com builtin: true — é o
    // estado normal, o arquivo só nasce na primeira gravação daqui.
    lerVerbos: () => Promise.resolve(carregarVerbos(csvVerbos).verbos.map((v) => ({ ...v }))),

    async salvarCatalogo(rows: CatalogoRow[]): Promise<SaveResult> {
      const { niveis, warnings: warningsNiveis } = carregarNiveis(csvNiveis)
      const { verbos, warnings: warningsVerbos } = carregarVerbos(csvVerbos)
      const { errors, warnings } = validarCatalogo(rows, niveis, verbos)
      if (errors.length > 0) return { ok: false, errors }

      // Mesma ordem do plugin: canonizar (ids preenchidos, referências em id) e
      // só então serializar — o CSV que sai daqui e o que sai do dev server são
      // o mesmo arquivo.
      const csv = serializarCatalogo(canonizarCatalogo(rows, niveis, verbos))
      const { graph, warnings: warningsBuild } = buildGraph(csv, niveis, verbos)
      await destino.gravar('catalogo', csv)
      csvCatalogo = csv
      grafoAtual = comoGraphJson(graph)
      return {
        ok: true,
        warnings: dedup(warningsNiveis, warningsVerbos, warnings, warningsBuild),
        counts: counts(graph),
      }
    },

    async salvarNiveis(rows: NivelApiRow[]): Promise<SaveResult> {
      const brutas = rows.map(comoNivelRow)
      const { errors, warnings } = validarNiveis(brutas)
      if (errors.length > 0) return { ok: false, errors }
      // Remover nível que ainda tem linhas no catálogo é erro, como na API.
      const errosUso = validarNiveisContraCatalogo(brutas, parseCatalogoRows(csvCatalogo))
      if (errosUso.length > 0) return { ok: false, errors: errosUso }

      const csv = serializarNiveis(brutas)
      const { verbos } = carregarVerbos(csvVerbos)
      const { graph, warnings: warningsBuild } = buildGraph(
        csvCatalogo,
        resolverNiveis(brutas),
        verbos,
      )
      await destino.gravar('niveis', csv)
      csvNiveis = csv
      grafoAtual = comoGraphJson(graph)
      return { ok: true, warnings: dedup(warnings, warningsBuild), counts: counts(graph) }
    },

    async salvarVerbos(rows: VerboApiRow[]): Promise<SaveResult> {
      const brutas = rows.map(comoVerboRow)
      const { errors, warnings } = validarVerbos(brutas)
      if (errors.length > 0) return { ok: false, errors }
      // Remover verbo ainda usado por alguma referência é erro, como na API. O
      // vocabulário VIGENTE é o que diz o que é prefixo: sem ele, "envia:x"
      // com `envia` fora da lista atual pareceria referência quebrada.
      const { verbos: vigentes } = carregarVerbos(csvVerbos)
      const errosUso = validarVerbosContraCatalogo(
        brutas,
        parseCatalogoRows(csvCatalogo),
        vigentes,
      )
      if (errosUso.length > 0) return { ok: false, errors: errosUso }

      const csv = serializarVerbos(brutas)
      const { niveis } = carregarNiveis(csvNiveis)
      const { graph, warnings: warningsBuild } = buildGraph(
        csvCatalogo,
        niveis,
        resolverVerbos(brutas),
      )
      await destino.gravar('verbos', csv)
      csvVerbos = csv
      grafoAtual = comoGraphJson(graph)
      return { ok: true, warnings: dedup(warnings, warningsBuild), counts: counts(graph) }
    },

    grafo: () => grafoAtual,
    arquivos: () => ({ catalogo: csvCatalogo, niveis: csvNiveis, verbos: csvVerbos }),
  }
}
