// Ponte do build de dados para o bundle do front-end.
//
// scripts/graph-lib.ts é a ÚNICA implementação do build (parser CSV, níveis,
// montagem do grafo, validação) e não tem import nenhum — é código puro, roda
// igual no Node do dev server e no navegador. Este arquivo só re-exporta o que
// o modo "arquivo local" precisa para montar o grafo no cliente: nada é
// copiado, então CSV gravado pelo navegador e CSV gravado pelo dev server
// passam exatamente pelas mesmas funções.
export {
  buildGraph,
  canonizarCatalogo,
  carregarNiveis,
  normalizarCor,
  parseCatalogoRows,
  resolverNiveis,
  serializarCatalogo,
  serializarNiveis,
  validarCatalogo,
  validarNiveis,
  validarNiveisContraCatalogo,
} from '../../scripts/graph-lib.ts'

export type {
  /** Linha bruta do catalogo.csv como o build a enxerga (`tipo_componente`
   *  ainda é string livre; a UI usa a versão normalizada de catalog-api). */
  CatalogoRow as CatalogoRowBruta,
  Graph,
  GraphNode,
  NivelInfo,
  NivelRow,
} from '../../scripts/graph-lib.ts'
