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
import { normalizeTipoComponente } from './catalog-api'
import type { CatalogoRow, NivelApiRow, SaveResult } from './catalog-api'
import type { ArquivosCatalogo, CatalogStore, ModoPersistencia } from './catalog-store'
import {
  buildGraph,
  carregarNiveis,
  parseCatalogoRows,
  resolverNiveis,
  serializarCatalogo,
  serializarNiveis,
  validarCatalogo,
  validarNiveis,
  validarNiveisContraCatalogo,
} from './graph-build'
import type { Graph, GraphNode, NivelRow } from './graph-build'
import type { Debito, GraphJson, GraphNodeData } from './graph-types'

/** Qual dos dois arquivos do catálogo está sendo gravado. */
export type ArquivoCatalogo = 'catalogo' | 'niveis'

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

/** `tipo_componente` da linha bruta é string livre; a UI só trabalha com o
 *  vocabulário válido, como no GET /api/catalogo. */
function normalizarRows(rows: ReturnType<typeof parseCatalogoRows>): CatalogoRow[] {
  return rows.map((r) => ({ ...r, tipo_componente: normalizeTipoComponente(r.tipo_componente) }))
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
  }
  if (n.corpo !== undefined) node.corpo = n.corpo
  if (n.fantasma === true) node.fantasma = true
  return node
}

/** Grafo do build → o mesmo objeto que o app importa de src/data/graph.json. */
export function comoGraphJson(graph: Graph): GraphJson {
  return {
    niveis: graph.niveis.map((nv) => ({ ...nv })),
    nodes: graph.nodes.map(nodeJson),
    links: graph.links.map((l) => ({ ...l })),
  }
}

/** NivelApiRow (formato da UI e do POST /api/niveis) → linha bruta do
 *  niveis.csv, com a mesma leitura de `slug` do plugin: vazio não vira campo,
 *  porque é o que marca "nível novo, derive o slug do título". */
function comoNivelRow(r: NivelApiRow): NivelRow {
  const slug = (r.slug ?? '').trim()
  const row: NivelRow = { titulo: r.titulo.trim(), ordem: r.ordem }
  if (slug !== '') row.slug = slug
  return row
}

function dedup(...listas: string[][]): string[] {
  return [...new Set(listas.flat())]
}

function counts(graph: Graph): Record<string, number> {
  return { nos: graph.nodes.length, arestas: graph.links.length, niveis: graph.niveis.length }
}

/**
 * Store sobre os textos dos dois CSVs, já carregados na memória da aba.
 * Cada save regrava o arquivo inteiro (nunca um patch) e recalcula o grafo,
 * exatamente como o POST da API faz.
 */
export function criarStoreLocal(destino: DestinoLocal, arquivos: ArquivosCatalogo): CatalogStore {
  let csvCatalogo = arquivos.catalogo
  let csvNiveis = arquivos.niveis
  let grafoAtual = montar()

  function montar(): GraphJson {
    const { niveis } = carregarNiveis(csvNiveis)
    return comoGraphJson(buildGraph(csvCatalogo, niveis).graph)
  }

  return {
    modo: destino.modo,
    rotulo: destino.rotulo,

    lerCatalogo: () => Promise.resolve(normalizarRows(parseCatalogoRows(csvCatalogo))),

    lerNiveis: () => Promise.resolve(carregarNiveis(csvNiveis).niveis.map((nv) => ({ ...nv }))),

    async salvarCatalogo(rows: CatalogoRow[]): Promise<SaveResult> {
      const { niveis, warnings: warningsNiveis } = carregarNiveis(csvNiveis)
      const { errors, warnings } = validarCatalogo(rows, niveis)
      if (errors.length > 0) return { ok: false, errors }

      const csv = serializarCatalogo(rows)
      const { graph, warnings: warningsBuild } = buildGraph(csv, niveis)
      await destino.gravar('catalogo', csv)
      csvCatalogo = csv
      grafoAtual = comoGraphJson(graph)
      return {
        ok: true,
        warnings: dedup(warningsNiveis, warnings, warningsBuild),
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
      const { graph, warnings: warningsBuild } = buildGraph(csvCatalogo, resolverNiveis(brutas))
      await destino.gravar('niveis', csv)
      csvNiveis = csv
      grafoAtual = comoGraphJson(graph)
      return { ok: true, warnings: dedup(warnings, warningsBuild), counts: counts(graph) }
    },

    grafo: () => grafoAtual,
    arquivos: () => ({ catalogo: csvCatalogo, niveis: csvNiveis }),
  }
}
