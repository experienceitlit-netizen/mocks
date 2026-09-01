// Camada de persistência do catálogo: UMA interface, duas implementações.
//
//   1. HTTP (catalog-store-http): o dev server responde /api/catalogo,
//      /api/niveis e /api/verbos, grava os CSVs e regenera o graph.json. É o
//      modo de sempre — nada aqui muda o contrato da API nem o comportamento
//      do dev server.
//   2. LOCAL (catalog-store-local): sem API, o próprio navegador lê e grava os
//      CSVs — na pasta escolhida pelo usuário (File System Access) ou numa
//      cópia em memória que ele baixa no fim (fallback do Firefox). O grafo é
//      montado no cliente pelas mesmas funções do build.
//
// Sem nenhuma das duas o app fica somente leitura, como sempre foi: `store`
// null no App = nenhum controle de edição na tela.
//
// POR QUE HÁ UM PAR ler/salvar POR ARQUIVO, e não um ler(arquivo) genérico:
// os três payloads são tipos DIFERENTES (CatalogoRow[], NivelApiRow[],
// VerboApiRow[]). Um `ler(arquivo)/salvar(arquivo, rows)` genérico devolveria
// uma união discriminada e obrigaria narrowing em todo call site — mais
// código, não menos, para três casos. Com o TERCEIRO arquivo isto ainda paga;
// um QUARTO torna o refactor obrigatório: aí a repetição passa a custar mais
// que a união, e o lugar de fazê-lo é aqui, no contrato, antes das duas
// implementações.
import type { CatalogoRow, NivelApiRow, SaveResult, VerboApiRow } from './catalog-api'
import {
  fetchCatalogo,
  fetchNiveis,
  fetchVerbos,
  saveCatalogo,
  saveNiveis,
  saveVerbos,
} from './catalog-api'
import type { GraphJson } from './graph-types'

export type ModoPersistencia = 'http' | 'arquivo' | 'memoria'

/** Texto dos três CSVs que formam o catálogo (niveis.csv e verbos.csv podem
 *  ser "": é a mesma tolerância do build, que assume só os níveis e os verbos
 *  padrão). */
export interface ArquivosCatalogo {
  catalogo: string
  niveis: string
  verbos: string
}

/**
 * Contrato que a UI de edição usa, seja qual for o destino dos dados. As seis
 * primeiras operações espelham a API do dev server (é dela que o formato vem);
 * `grafo()` e `arquivos()` só têm conteúdo nos modos locais.
 */
export interface CatalogStore {
  readonly modo: ModoPersistencia
  /** De onde os dados vêm, para o chip de modo na barra superior. */
  readonly rotulo: string
  /** Linhas atuais do catálogo; null = fonte indisponível (nunca em modo local). */
  lerCatalogo(): Promise<CatalogoRow[] | null>
  /** Grava o conjunto COMPLETO de linhas, validando antes (mesma disciplina do
   *  POST /api/catalogo: erro de validação não grava nada). */
  salvarCatalogo(rows: CatalogoRow[]): Promise<SaveResult>
  lerNiveis(): Promise<NivelApiRow[] | null>
  /** Grava a lista COMPLETA de níveis (remoção = lista sem a linha; nível em
   *  uso pelo catálogo é recusado). */
  salvarNiveis(rows: NivelApiRow[]): Promise<SaveResult>
  /** Vocabulário completo das relações (embutidos + cadastrados). Sem
   *  verbos.csv devolve os embutidos, nunca null nos modos locais. */
  lerVerbos(): Promise<VerboApiRow[] | null>
  /** Grava a lista COMPLETA de verbos (remoção = lista sem a linha; verbo em
   *  uso por alguma referência é recusado, e o `consome` nunca sai). */
  salvarVerbos(rows: VerboApiRow[]): Promise<SaveResult>
  /**
   * Grafo montado no cliente a partir dos CSVs em memória, já atualizado pelo
   * último save. null no modo HTTP: lá quem regenera o src/data/graph.json é o
   * dev server, e ele chega ao app por HMR — o App só troca o grafo quando este
   * método devolve algo.
   */
  grafo(): GraphJson | null
  /** Texto atual dos três CSVs (para o botão "Baixar CSV"); null no modo HTTP,
   *  onde os arquivos já estão no disco do projeto. */
  arquivos(): ArquivosCatalogo | null
}

/**
 * O que o ambiente oferece para editar, na ordem de preferência do app:
 * - `http`: a API do dev server respondeu — usa ela e pronto;
 * - `arquivo`: sem API, mas o navegador tem File System Access — o usuário
 *   escolhe a pasta do catálogo e o app grava direto nos CSVs;
 * - `importar`: sem API e sem File System Access (Firefox) — resta importar os
 *   CSVs e baixar o resultado editado.
 *
 * `arquivo` e `importar` são só a OFERTA: enquanto o usuário não abre uma pasta
 * nem importa um arquivo, o app segue somente leitura.
 */
export type Capacidade = 'http' | 'arquivo' | 'importar'

export function decidirCapacidade(ambiente: { apiHttp: boolean; fsAccess: boolean }): Capacidade {
  if (ambiente.apiHttp) return 'http'
  return ambiente.fsAccess ? 'arquivo' : 'importar'
}

/** Store do dev server: repassa para catalog-api sem interferir em nada — é
 *  literalmente o caminho que já existia. */
export const storeHttp: CatalogStore = {
  modo: 'http',
  rotulo: 'catalogo.csv do projeto (dev server)',
  lerCatalogo: fetchCatalogo,
  salvarCatalogo: saveCatalogo,
  lerNiveis: fetchNiveis,
  salvarNiveis: saveNiveis,
  lerVerbos: fetchVerbos,
  salvarVerbos: saveVerbos,
  grafo: () => null,
  arquivos: () => null,
}
