// Ponte do build de dados para o bundle do front-end.
//
// scripts/graph-lib.ts é a ÚNICA implementação do build (parser CSV, níveis,
// montagem do grafo, validação) e não tem import nenhum — é código puro, roda
// igual no Node do dev server e no navegador. Este arquivo só re-exporta o que
// o modo "arquivo local" precisa para montar o grafo no cliente: nada é
// copiado, então CSV gravado pelo navegador e CSV gravado pelo dev server
// passam exatamente pelas mesmas funções.
//
// Função nova do build só existe para o front se passar por aqui: é o único
// ponto em que `../../scripts/` é importado do lado do bundle.
export {
  alvoDaReferencia,
  buildGraph,
  canonizarCatalogo,
  carregarNiveis,
  carregarVerbos,
  criarIndiceVerbos,
  formatarReferencia,
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
  // Valores do vocabulário: a lista de verbos e o slug do padrão. É por isto
  // que graph-types.ts não precisa duplicá-los (e não precisa do teste de
  // espelho que TIPOS_COMPONENTE exige).
  SENTIDOS,
  VERBO_PADRAO,
  VERBOS_PADRAO,
} from '../../scripts/graph-lib.ts'

export type {
  /** Linha bruta do catalogo.csv como o build a enxerga (`tipo_componente`
   *  ainda é string livre; a UI usa a versão normalizada de catalog-api). */
  CatalogoRow as CatalogoRowBruta,
  Graph,
  GraphNode,
  NivelInfo,
  NivelRow,
  /** Leitura de UMA célula do `consome` (verbo + alvo). */
  RefConsome,
  Sentido,
  /** Verbo resolvido; {@link VerboInfo} é ele mais a flag de embutido. */
  VerboDef,
  VerboInfo,
  /** Linha bruta do verbos.csv (tudo texto, como veio do arquivo). */
  VerboRow,
} from '../../scripts/graph-lib.ts'
