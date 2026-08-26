// Funções puras do build do grafo — separadas do CLI para serem testáveis.
// Fonte única: catalogo.csv (separador ";", uma linha por COMPONENTE).
//
// MODELO: todo nó do grafo é um COMPONENTE que pertence a um NÍVEL. Não existe
// produto, insumo, domínio ou raiz como categoria de código — o que separa um
// nó de outro é só o nível dele, e níveis são dados (niveis.csv), não tipos.
// Disso vem a regra central do build: NENHUM nó é derivado de campo. Todo nó
// vem de uma LINHA do catálogo, e toda aresta vem de uma referência declarada
// (`consome` ou `associacoes`). Nada é inferido.

/** Tipos de componente aceitos na coluna `tipo_componente`. Célula vazia =
 *  "Default"; valor fora da lista vira warning no build e erro no POST. */
export const TIPOS_COMPONENTE = ['Tabela SQL', 'Tabela Delta', 'Excel', 'Default'] as const

export type TipoComponente = (typeof TIPOS_COMPONENTE)[number]

/** Valor assumido quando a coluna está vazia (ou ausente, em CSV legado). */
export const TIPO_COMPONENTE_DEFAULT: TipoComponente = 'Default'

const TIPOS_COMPONENTE_SET = new Set<string>(TIPOS_COMPONENTE)

/** Mensagem de valores válidos de `tipo_componente`, para warnings e erros. */
const TIPOS_COMPONENTE_MSG = TIPOS_COMPONENTE.map((t) => `"${t}"`).join(', ')

/**
 * Nó do grafo: um componente do catálogo. Todos os nós têm a mesma forma, seja
 * qual for o nível — quem quiser tratar um nível de um jeito próprio (cor,
 * coluna, ícone) faz isso pelo campo `nivel`, na UI.
 */
export interface GraphNode {
  /** `<slug do nível>-<slug do nome>`: mesma regra em todos os níveis. */
  id: string
  nome: string
  /** slug de um nível ativo (built-in ou cadastrado no niveis.csv). */
  nivel: string
  tipoComponente: TipoComponente
  dominio: string
  debito: string
  status: string
  owner: string | null
  centroDeCusto: string | null
  descricao: string
  /** Coluna "observacoes" do CSV: texto livre em markdown; ausente se vazia.
   *  [[Wikilinks]] no texto viram links de navegação no balão, mas NÃO geram
   *  arestas — arestas vêm só de `consome` e `associacoes`. */
  corpo?: string
  /** Gap de governança: owner OU centro de custo vazio. Regra única para todos
   *  os níveis — nenhum nível é dispensado dela. */
  incompleto: boolean
  /** Nó citado em `consome` sem linha própria no catálogo. */
  fantasma?: true
}

export interface GraphLink {
  source: string
  target: string
  label: string
}

export interface Graph {
  /** TODOS os níveis da cadeia (built-ins + customizados), ordenados por
   *  `ordem` asc — a UI monta colunas/faixas/selects a partir daqui. */
  niveis: NivelInfo[]
  nodes: GraphNode[]
  links: GraphLink[]
}

/** Linha do catálogo já interpretada: o nó que ela materializa mais as
 *  referências que ela declara, ainda não resolvidas. */
export interface ParsedRow {
  node: GraphNode
  /** nomes (ou ids) da coluna "consome" */
  consome: string[]
  /** nomes (ou ids) da coluna "associacoes" */
  associacoes: string[]
}

export interface CatalogoParseResult {
  rows: ParsedRow[]
  warnings: string[]
}

export interface BuildResult {
  graph: Graph
  warnings: string[]
}

// ---------------------------------------------------------------------------
// Níveis da cadeia: os sete built-in (raiz → domínio → final → primário →
// fonte secundária → fonte → origem) são o modelo padrão, e o niveis.csv
// (colunas titulo;ordem;slug) pode renomear, reordenar e REMOVER qualquer um
// deles, além de acrescentar níveis próprios (ex.: Bronze/Prata/Ouro de uma
// arquitetura medallion).
//
// Os built-in não são especiais no build: são só a lista que vale quando o
// niveis.csv não diz outra coisa. Todo nível — built-in ou cadastrado — é
// tratado pelo mesmo caminho.
//
// A coluna `slug` é a chave semântica do nível: vazia, o slug é derivado do
// título (nível novo); preenchida, amarra a linha a um nível já existente e
// sobrevive a renomeações — trocar o título de "Produto final" não mexe em
// nenhuma linha do catalogo.csv, porque o slug segue sendo `final`.
//
// O arquivo tem dois modos, decididos pelo próprio conteúdo:
// - LEGADO (nenhuma linha traz slug de built-in): os sete built-in valem, e as
//   linhas do arquivo são níveis customizados que entram entre eles pela ordem
//   numérica. É o formato de duas colunas de sempre.
// - EXPLÍCITO (alguma linha traz slug de built-in): o arquivo passa a ser a
//   lista COMPLETA de níveis — built-in que não estiver listado está REMOVIDO.
// ---------------------------------------------------------------------------

/** Linha do niveis.csv na forma bruta (formato trocado com GET/POST
 *  /api/niveis): titulo livre, ordem numérica (float aceito). Ordem inválida
 *  no arquivo vira NaN — pega em validarNiveis/carregarNiveis. */
export interface NivelRow {
  titulo: string
  ordem: number
  /** Chave semântica: ausente/vazia = derivar do título (nível novo);
   *  preenchida = esta linha É aquele nível, com o título que ela disser. */
  slug?: string
}

/** Nível resolvido: slug(titulo) é o id (valor aceito na coluna `nivel` do
 *  catalogo.csv). */
export interface NivelDef {
  slug: string
  titulo: string
  ordem: number
}

/** Entrada do bloco `niveis` do graph.json (built-ins + customs, por ordem). */
export interface NivelInfo extends NivelDef {
  builtin: boolean
}

/** Níveis built-in da cadeia, com a ordem canônica das colunas da vista de
 *  linhagem (asc = esquerda → direita). Nível custom cai entre dois built-in
 *  pela ordem (ex.: 42/44/46 entre fonte-secundaria e fonte). */
export const NIVEIS_BUILTIN: readonly NivelDef[] = [
  { slug: 'raiz', titulo: 'Raiz', ordem: 0 },
  { slug: 'dominio', titulo: 'Domínio', ordem: 10 },
  { slug: 'final', titulo: 'Produto final', ordem: 20 },
  { slug: 'primario', titulo: 'Produto primário', ordem: 30 },
  { slug: 'fonte-secundaria', titulo: 'Fonte secundária', ordem: 40 },
  { slug: 'fonte', titulo: 'Fonte (sistema)', ordem: 50 },
  { slug: 'origem', titulo: 'Origem', ordem: 60 },
]

/** Colunas do niveis.csv, na ordem canônica do cabeçalho. A 3ª (slug) é
 *  opcional na LEITURA — arquivo legado de duas colunas parseia sem warning —
 *  mas o serializador sempre escreve as três. */
export const COLUNAS_NIVEIS = ['titulo', 'ordem', 'slug'] as const

/** Colunas do niveis.csv que podem faltar do cabeçalho sem warning. */
const COLUNAS_NIVEIS_OPCIONAIS = new Set<string>(['slug'])

const SLUGS_BUILTIN = new Set<string>(NIVEIS_BUILTIN.map((n) => n.slug))

/** Os sete built-in, sem nenhum nível customizado: é o que vale quando o
 *  niveis.csv não existe, está vazio ou está no formato legado sem customs. */
export const NIVEIS_PADRAO: readonly NivelInfo[] = NIVEIS_BUILTIN.map((n) => ({ ...n, builtin: true }))

/** Bloco `niveis` do graph.json a partir só dos CUSTOMS (modo legado):
 *  built-ins + customs, ordenado por ordem. */
export function montarNiveis(customs: NivelDef[]): NivelInfo[] {
  return [
    ...NIVEIS_BUILTIN.map((n) => ({ ...n, builtin: true })),
    ...customs.map((n) => ({ ...n, builtin: false })),
  ].sort((a, b) => a.ordem - b.ordem)
}

/** Slug efetivo de uma linha: o da coluna `slug` quando preenchida (chave
 *  semântica, imune a renomeação), senão derivado do título. */
export function slugDoNivel(row: NivelRow): string {
  const explicito = (row.slug ?? '').trim()
  return explicito !== '' ? explicito : slugify(row.titulo)
}

/** Arquivo em modo EXPLÍCITO: alguma linha amarra um built-in pelo slug, o que
 *  torna o arquivo a lista completa (built-in ausente = removido). */
export function modoExplicito(rows: readonly NivelRow[]): boolean {
  return rows.some((r) => SLUGS_BUILTIN.has((r.slug ?? '').trim()))
}

/** NivelRow (bruta) → NivelDef (com slug), sem validar. */
export function defsDeNiveis(rows: NivelRow[]): NivelDef[] {
  return rows.map((r) => ({ slug: slugDoNivel(r), titulo: r.titulo.trim(), ordem: r.ordem }))
}

/**
 * Lê o niveis.csv na forma bruta, preservando a ordem das linhas. Cabeçalho
 * por nome de coluna (ordem livre); ordem não-numérica ou vazia sai NaN (a
 * validação é papel de {@link validarNiveis}).
 */
export function parseNiveisRows(texto: string): NivelRow[] {
  const registros = parseCsv(texto)
  if (registros.length === 0) return []

  const cabecalho = registros[0].map((c) => c.trim())
  const indice = new Map<string, number>(cabecalho.map((c, i) => [c, i]))
  const celula = (registro: string[], col: (typeof COLUNAS_NIVEIS)[number]): string => {
    const i = indice.get(col)
    return i === undefined ? '' : (registro[i] ?? '').trim()
  }

  return registros.slice(1).map((registro) => {
    const ordemTexto = celula(registro, 'ordem')
    const slug = celula(registro, 'slug')
    const row: NivelRow = {
      titulo: celula(registro, 'titulo'),
      ordem: ordemTexto === '' ? Number.NaN : Number(ordemTexto),
    }
    // Coluna ausente ou vazia não vira campo: slug só existe quando declarado.
    if (slug !== '') row.slug = slug
    return row
  })
}

/**
 * Serializa o niveis.csv canônico: BOM UTF-8 + cabeçalho titulo;ordem;slug +
 * separador ";", registros em \r\n e aspas mínimas. Round-trip garantido para
 * títulos trimados e ordens em forma canônica de Number (42.5 → "42.5").
 */
export function serializarNiveis(rows: NivelRow[]): string {
  const linhas = rows.map(
    (r) => `${celulaCsv(r.titulo)};${celulaCsv(String(r.ordem))};${celulaCsv((r.slug ?? '').trim())}`,
  )
  return '\uFEFF' + [COLUNAS_NIVEIS.join(';'), ...linhas].join('\r\n') + '\r\n'
}

/** Nível que já ocupa um slug ou uma ordem: outra linha do arquivo ou um
 *  built-in IMPLÍCITO (modo legado, em que os sete valem sem estar listados). */
interface Ocupante {
  titulo: string
  linha: number
  implicito: boolean
}

/** Mapas de ocupação iniciais para validar/carregar um arquivo: em modo legado
 *  os sete built-in já ocupam seus slugs e ordens; em modo explícito o arquivo
 *  é a lista completa e nada está ocupado de antemão. */
function ocupacaoInicial(rows: readonly NivelRow[]): {
  porSlug: Map<string, Ocupante>
  porOrdem: Map<number, Ocupante>
  explicito: boolean
} {
  const explicito = modoExplicito(rows)
  const porSlug = new Map<string, Ocupante>()
  const porOrdem = new Map<number, Ocupante>()
  if (!explicito) {
    for (const n of NIVEIS_BUILTIN) {
      porSlug.set(n.slug, { titulo: n.titulo, linha: 0, implicito: true })
      porOrdem.set(n.ordem, { titulo: n.titulo, linha: 0, implicito: true })
    }
  }
  return { porSlug, porOrdem, explicito }
}

/** Erros de UMA linha do niveis.csv contra o que já está ocupado (mapas por
 *  slug e por ordem). Registra a linha nos mapas se ok. */
function checarNivel(
  row: NivelRow,
  linha: number,
  porSlug: Map<string, Ocupante>,
  porOrdem: Map<number, Ocupante>,
): string[] {
  const errors: string[] = []
  const titulo = row.titulo.trim()
  if (titulo === '') {
    errors.push(`linha ${linha}: "titulo" é obrigatório`)
    return errors
  }

  const explicito = (row.slug ?? '').trim()
  let slug = ''
  if (explicito !== '') {
    if (slugify(explicito) !== explicito) {
      errors.push(
        `linha ${linha} ("${titulo}"): slug "${explicito}" inválido — use minúsculas sem acentos, separadas por "-"`,
      )
    } else {
      slug = explicito
    }
  } else {
    const derivado = slugify(titulo)
    if (derivado === '') {
      errors.push(`linha ${linha} ("${titulo}"): titulo inválido — precisa conter letras ou números`)
    } else {
      slug = derivado
    }
  }

  if (slug !== '') {
    const anterior = porSlug.get(slug)
    if (anterior !== undefined) {
      errors.push(
        anterior.implicito
          ? `linha ${linha} ("${titulo}"): título colide com o nível built-in "${anterior.titulo}"`
          : `linha ${linha} ("${titulo}"): título duplicado — colide com "${anterior.titulo}" (linha ${anterior.linha})`,
      )
    }
  }

  if (!Number.isFinite(row.ordem)) {
    errors.push(`linha ${linha} ("${titulo}"): ordem inválida — use um número (decimais aceitos)`)
  } else {
    const anterior = porOrdem.get(row.ordem)
    if (anterior !== undefined) {
      errors.push(
        anterior.implicito
          ? `linha ${linha} ("${titulo}"): ordem ${row.ordem} colide com o nível built-in "${anterior.titulo}" — use um valor intermediário`
          : `linha ${linha} ("${titulo}"): ordem ${row.ordem} duplicada — colide com "${anterior.titulo}" (linha ${anterior.linha})`,
      )
    }
  }

  if (errors.length === 0) {
    porSlug.set(slug, { titulo, linha, implicito: false })
    porOrdem.set(row.ordem, { titulo, linha, implicito: false })
  }
  return errors
}

/**
 * Valida linhas brutas antes de gravar o niveis.csv (POST /api/niveis).
 * Erros (impedem a gravação): titulo vazio ou sem letras/números, slug fora do
 * kebab-case, título duplicado por slug, ordem não-numérica ou repetida. Em
 * modo legado os sete built-in contam como ocupados (não pode custom "Origem",
 * nem ordem 40); em modo explícito o arquivo é a lista completa e só disputa
 * consigo mesmo. "linha N" conta o cabeçalho do CSV como linha 1.
 */
export function validarNiveis(rows: NivelRow[]): ValidacaoCatalogo {
  const errors: string[] = []
  const { porSlug, porOrdem } = ocupacaoInicial(rows)
  rows.forEach((row, i) => errors.push(...checarNivel(row, i + 2, porSlug, porOrdem)))
  return { errors, warnings: [] }
}

/**
 * Linhas brutas → lista COMPLETA de níveis (built-ins e customs), aplicando o
 * modo do arquivo. Tolerante: linha inválida vira warning e é descartada (o
 * arquivo gravado pela API é sempre válido; isto protege contra edição manual
 * quebrada sem derrubar o build).
 */
function resolverLinhas(rows: NivelRow[]): { niveis: NivelInfo[]; warnings: string[] } {
  const warnings: string[] = []
  const { porSlug, porOrdem, explicito } = ocupacaoInicial(rows)
  const doArquivo: NivelInfo[] = []
  rows.forEach((row, i) => {
    const errosLinha = checarNivel(row, i + 2, porSlug, porOrdem)
    if (errosLinha.length > 0) {
      warnings.push(...errosLinha.map((e) => `niveis.csv ${e} — nível ignorado`))
      return
    }
    const slug = slugDoNivel(row)
    doArquivo.push({
      slug,
      titulo: row.titulo.trim(),
      ordem: row.ordem,
      builtin: SLUGS_BUILTIN.has(slug),
    })
  })
  // Modo legado: o arquivo só traz customs, que se encaixam entre os built-in.
  const niveis = explicito ? doArquivo.sort((a, b) => a.ordem - b.ordem) : montarNiveis(doArquivo)
  return { niveis, warnings }
}

/** Lista completa de níveis de linhas JÁ validadas (POST /api/niveis). */
export function resolverNiveis(rows: NivelRow[]): NivelInfo[] {
  return resolverLinhas(rows).niveis
}

/**
 * Carrega o niveis.csv para o build: devolve a lista COMPLETA de níveis
 * (built-ins + customs), já ordenada. Arquivo ausente, vazio ou em modo legado
 * sem customs = os sete built-in de sempre.
 */
export function carregarNiveis(texto: string): { niveis: NivelInfo[]; warnings: string[] } {
  const warnings: string[] = []
  const registros = parseCsv(texto)
  if (registros.length === 0) return { niveis: [...NIVEIS_PADRAO], warnings }

  const cabecalho = registros[0].map((c) => c.trim())
  for (const col of COLUNAS_NIVEIS) {
    if (!cabecalho.includes(col) && !COLUNAS_NIVEIS_OPCIONAIS.has(col)) {
      warnings.push(`niveis.csv: coluna obrigatória "${col}" ausente do cabeçalho`)
    }
  }

  const resolvido = resolverLinhas(parseNiveisRows(texto))
  return { niveis: resolvido.niveis, warnings: [...warnings, ...resolvido.warnings] }
}

/** Quantos nomes de linha a mensagem de "nível em uso" cita antes de resumir. */
const MAX_NOMES_EM_USO = 5

/**
 * Erros de remoção de nível em uso: toda linha do catálogo precisa de um nível
 * correspondente na lista nova — remover um nível que ainda tem linhas é erro
 * (e vale para built-in também, que aqui não é diferente de nenhum outro).
 * Renomear não entra: o slug é a chave, e quem mantém o slug mantém as linhas.
 */
export function validarNiveisContraCatalogo(rows: NivelRow[], catalogo: CatalogoRow[]): string[] {
  const slugs = new Set(resolverNiveis(rows).map((n) => n.slug))
  const usosPorNivel = new Map<string, string[]>()
  for (const row of catalogo) {
    const nivel = row.nivel.trim()
    if (slugs.has(nivel)) continue
    const usos = usosPorNivel.get(nivel) ?? []
    usos.push(row.nome)
    usosPorNivel.set(nivel, usos)
  }
  return [...usosPorNivel.entries()].map(([nivel, nomes]) => {
    const citados = nomes.slice(0, MAX_NOMES_EM_USO).map((n) => `"${n}"`).join(', ')
    const resto = nomes.length > MAX_NOMES_EM_USO ? ` e mais ${nomes.length - MAX_NOMES_EM_USO}` : ''
    return (
      `nível "${nivel}" está em uso por ${nomes.length} linha(s) do catálogo` +
      ` (${citados}${resto}) — mova essas linhas para outro nível antes de removê-lo`
    )
  })
}

export type Debito = 'sim' | 'nao' | 'avaliar'

/**
 * Linha do catalogo.csv na forma bruta: um campo por coluna, sem nada derivado
 * (id, incompleto etc. são calculados só no build). Células vazias de
 * owner/centro_de_custo/origem/fonte_sistema viram null; as listas ("A | B")
 * viram arrays. É o formato trocado com a API do dev server
 * (GET/POST /api/catalogo).
 *
 * As MESMAS colunas valem em qualquer nível: o que a linha significa é dado
 * pelo `nivel` dela, não por um formato de linha diferente.
 */
export interface CatalogoRow {
  nome: string
  /** slug de um nível ativo (built-in ou cadastrado no niveis.csv). */
  nivel: string
  /** "" = {@link TIPO_COMPONENTE_DEFAULT}; fora de {@link TIPOS_COMPONENTE} é
   *  erro no POST e warning no build. */
  tipo_componente: string
  dominio: string
  consome: string[]
  descricao: string
  /** Opcional em qualquer nível: "" ou um dos três valores. */
  debito: Debito | ''
  status: string
  owner: string | null
  centro_de_custo: string | null
  observacoes: string
  associacoes: string[]
}

/**
 * Colunas do catalogo.csv, na ordem canônica do cabeçalho.
 *
 * `tipo_componente` e `associacoes` são opcionais na LEITURA (CSV legado sem
 * elas parseia sem warning), mas o serializador sempre escreve as 12.
 *
 * As colunas `origem`, `fonte_sistema` e `fontes_secundarias` existiram
 * enquanto fonte e origem eram campos de um produto; viraram níveis próprios e
 * saíram do arquivo. Um CSV que ainda as traga é lido normalmente — elas são
 * ignoradas e não voltam na regravação.
 */
export const COLUNAS = [
  'nome',
  'nivel',
  'tipo_componente',
  'dominio',
  'consome',
  'descricao',
  'debito',
  'status',
  'owner',
  'centro_de_custo',
  'observacoes',
  'associacoes',
] as const

/** Colunas que podem faltar do cabeçalho sem warning (legado). */
const COLUNAS_OPCIONAIS = new Set<string>(['tipo_componente', 'associacoes'])

/** Colunas de versões anteriores do catálogo: um arquivo que ainda as traga é
 *  lido sem reclamação (elas são ignoradas e não voltam na regravação). */
const COLUNAS_OBSOLETAS = new Set<string>(['origem', 'fonte_sistema', 'fontes_secundarias'])

type Coluna = (typeof COLUNAS)[number]

const DEBITOS_VALIDOS = new Set(['sim', 'nao', 'avaliar'])

/** Slug kebab-case sem acentos, usado nos ids dos nós e dos níveis. */
export function slugify(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Id do nó que uma linha materializa: `<slug do nível>-<slug do nome>`, sem
 * exceção para nível nenhum. É o que permite o MESMO nome existir em níveis
 * diferentes ("Resultado" produto final e "Resultado" silver são dois
 * componentes, com ids `final-resultado` e `silver-resultado`).
 *
 * O slug do nível já vem em kebab-case (validado em {@link checarNivel}), e é
 * usado como está.
 */
export function idDaLinha(nivel: string, nome: string): string {
  return `${nivel.trim()}-${slugify(nome)}`
}

/** Chave de comparação de nomes: sem acentos, minúscula e trimada (a pontuação
 *  fica — "Mercado Alvo - UCS" não é "Mercado Alvo UCS"). */
export function chaveNome(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/** Texto da coluna `tipo_componente` → valor canônico. Vazio = Default; fora
 *  da lista = Default + motivo do warning (null = sem warning). */
export function normalizarTipoComponente(bruto: string): {
  tipo: TipoComponente
  invalido: string | null
} {
  const texto = bruto.trim()
  if (texto === '') return { tipo: TIPO_COMPONENTE_DEFAULT, invalido: null }
  if (TIPOS_COMPONENTE_SET.has(texto)) return { tipo: texto as TipoComponente, invalido: null }
  return { tipo: TIPO_COMPONENTE_DEFAULT, invalido: texto }
}

/**
 * Parser CSV mínimo (RFC 4180 com separador ";"): células entre aspas podem
 * conter ";", quebras de linha e aspas escapadas (""); aceita BOM UTF-8 e
 * fim de linha \r\n ou \n. Linhas totalmente vazias são descartadas.
 */
export function parseCsv(texto: string): string[][] {
  const t = texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto
  const registros: string[][] = []
  let registro: string[] = []
  let celula = ''
  let emAspas = false

  const fimCelula = (): void => {
    registro.push(celula)
    celula = ''
  }
  const fimRegistro = (): void => {
    fimCelula()
    registros.push(registro)
    registro = []
  }

  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (emAspas) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          celula += '"'
          i++
        } else {
          emAspas = false
        }
      } else {
        celula += c
      }
    } else if (c === '"' && celula === '') {
      emAspas = true
    } else if (c === ';') {
      fimCelula()
    } else if (c === '\n') {
      fimRegistro()
    } else if (c === '\r') {
      if (t[i + 1] === '\n') i++
      fimRegistro()
    } else {
      celula += c
    }
  }
  if (celula !== '' || registro.length > 0) fimRegistro()

  return registros.filter((r) => r.some((c) => c.trim() !== ''))
}

/** Divide uma célula-lista ("A | B") em nomes; vazio = lista vazia. */
function splitLista(celula: string): string[] {
  return celula
    .split('|')
    .map((s) => s.trim())
    .filter((s) => s !== '')
}

/** Mensagem com os níveis aceitos na coluna `nivel`, na ordem da cadeia. */
function nivelsMsg(niveis: readonly NivelInfo[]): string {
  return niveis.length === 0
    ? 'nenhum nível está cadastrado'
    : `use um destes: ${niveis.map((n) => n.slug).join(', ')}`
}

/**
 * Parseia o catalogo.csv: cabeçalho por nome de coluna (ordem livre) + uma
 * linha por COMPONENTE, seja qual for o nível. `niveis` é a lista COMPLETA de
 * níveis ativos: linha cujo nível não existe (ou foi removido) vira warning e
 * é ignorada — o nó não teria onde existir no mapa.
 *
 * Warnings legíveis para coluna faltando/desconhecida, linha sem nome, nível
 * ausente ou inexistente e tipo_componente fora da lista; "linha N" conta o
 * cabeçalho como linha 1.
 */
export function parseCatalogo(
  texto: string,
  niveis: readonly NivelInfo[] = NIVEIS_PADRAO,
): CatalogoParseResult {
  const warnings: string[] = []
  const registros = parseCsv(texto)
  if (registros.length === 0) {
    warnings.push('catalogo.csv: arquivo vazio — nenhum componente no catálogo')
    return { rows: [], warnings }
  }

  const cabecalho = registros[0].map((c) => c.trim())
  const indice = new Map<string, number>(cabecalho.map((c, i) => [c, i]))
  for (const col of COLUNAS) {
    if (!indice.has(col) && !COLUNAS_OPCIONAIS.has(col)) {
      warnings.push(`catalogo.csv: coluna obrigatória "${col}" ausente do cabeçalho`)
    }
  }
  for (const col of cabecalho) {
    if (!(COLUNAS as readonly string[]).includes(col) && !COLUNAS_OBSOLETAS.has(col)) {
      warnings.push(`catalogo.csv: coluna desconhecida "${col}" ignorada`)
    }
  }

  const ativos = new Set(niveis.map((n) => n.slug))
  const rows: ParsedRow[] = []
  for (let r = 1; r < registros.length; r++) {
    const registro = registros[r]
    const linha = r + 1

    const celula = (col: Coluna): string => {
      const i = indice.get(col)
      return i === undefined ? '' : (registro[i] ?? '').trim()
    }
    const textoOuNull = (col: Coluna): string | null => {
      const v = celula(col)
      return v === '' ? null : v
    }

    const nome = celula('nome')
    if (nome === '') {
      warnings.push(`catalogo.csv linha ${linha}: célula "nome" vazia — linha ignorada`)
      continue
    }

    // Nenhum nível é assumido: sem nível não dá para saber que componente é
    // esse nem onde ele vive.
    const nivel = celula('nivel')
    if (nivel === '') {
      warnings.push(`catalogo.csv linha ${linha} ("${nome}"): célula "nivel" vazia — linha ignorada`)
      continue
    }
    if (!ativos.has(nivel)) {
      warnings.push(
        `catalogo.csv linha ${linha} ("${nome}"): nível "${nivel}" não existe na cadeia` +
          ` (${nivelsMsg(niveis)}) — linha ignorada`,
      )
      continue
    }

    const { tipo, invalido } = normalizarTipoComponente(celula('tipo_componente'))
    if (invalido !== null) {
      warnings.push(
        `catalogo.csv linha ${linha} ("${nome}"): tipo_componente "${invalido}" desconhecido` +
          ` (use ${TIPOS_COMPONENTE_MSG}) — assumindo "${TIPO_COMPONENTE_DEFAULT}"`,
      )
    }

    const owner = textoOuNull('owner')
    const centroDeCusto = textoOuNull('centro_de_custo')

    const node: GraphNode = {
      id: idDaLinha(nivel, nome),
      nome,
      nivel,
      tipoComponente: tipo,
      dominio: celula('dominio'),
      debito: celula('debito'),
      status: celula('status'),
      owner,
      centroDeCusto,
      descricao: celula('descricao'),
      incompleto: owner === null || centroDeCusto === null,
    }

    const corpo = celula('observacoes')
    if (corpo !== '') node.corpo = corpo

    rows.push({
      node,
      consome: splitLista(celula('consome')),
      associacoes: splitLista(celula('associacoes')),
    })
  }

  return { rows, warnings }
}

/**
 * Lê o catalogo.csv na forma bruta ({@link CatalogoRow}), preservando a ordem
 * das linhas do arquivo. Não valida nada além do formato CSV: nivel, debito e
 * tipo_componente saem como estão no arquivo (a validação é papel de
 * {@link validarCatalogo}); células são trimadas, como em parseCatalogo.
 */
export function parseCatalogoRows(texto: string): CatalogoRow[] {
  const registros = parseCsv(texto)
  if (registros.length === 0) return []

  const cabecalho = registros[0].map((c) => c.trim())
  const indice = new Map<string, number>(cabecalho.map((c, i) => [c, i]))

  return registros.slice(1).map((registro) => {
    const celula = (col: Coluna): string => {
      const i = indice.get(col)
      return i === undefined ? '' : (registro[i] ?? '').trim()
    }
    const textoOuNull = (col: Coluna): string | null => {
      const v = celula(col)
      return v === '' ? null : v
    }
    return {
      nome: celula('nome'),
      nivel: celula('nivel'),
      tipo_componente: celula('tipo_componente'),
      dominio: celula('dominio'),
      consome: splitLista(celula('consome')),
      descricao: celula('descricao'),
      debito: celula('debito') as Debito | '',
      status: celula('status'),
      owner: textoOuNull('owner'),
      centro_de_custo: textoOuNull('centro_de_custo'),
      observacoes: celula('observacoes'),
      associacoes: splitLista(celula('associacoes')),
    }
  })
}

/** Célula CSV com aspas mínimas: só quando o valor exige (";", aspas ou
 *  quebra de linha), com aspas internas escapadas (""). */
function celulaCsv(valor: string): string {
  return /[";\n\r]/.test(valor) ? `"${valor.replaceAll('"', '""')}"` : valor
}

/**
 * Serializa linhas brutas de volta ao formato canônico do catalogo.csv:
 * BOM UTF-8 + cabeçalho na ordem de COLUNAS + separador ";", registros
 * terminados em \r\n (quebras internas às células ficam como estiverem no
 * valor), listas com " | ", null vira célula vazia e aspas mínimas. Todas as
 * colunas valem em qualquer nível — nada é canonizado por nível, porque nível
 * não muda a forma da linha.
 *
 * Round-trip garantido: parseCatalogoRows(serializarCatalogo(rows)) devolve
 * rows (para valores já trimados, como os que saem do próprio parse) e
 * serializarCatalogo(parseCatalogoRows(csv)) reproduz um arquivo canônico byte
 * a byte.
 */
export function serializarCatalogo(rows: CatalogoRow[]): string {
  const linhas = rows.map((row) => {
    const celulas: Record<Coluna, string> = {
      nome: row.nome,
      nivel: row.nivel,
      tipo_componente: row.tipo_componente,
      dominio: row.dominio,
      consome: row.consome.join(' | '),
      descricao: row.descricao,
      debito: row.debito,
      status: row.status,
      owner: row.owner ?? '',
      centro_de_custo: row.centro_de_custo ?? '',
      observacoes: row.observacoes,
      associacoes: row.associacoes.join(' | '),
    }
    return COLUNAS.map((c) => celulaCsv(celulas[c])).join(';')
  })
  return '\uFEFF' + [COLUNAS.join(';'), ...linhas].join('\r\n') + '\r\n'
}

export interface ValidacaoCatalogo {
  errors: string[]
  warnings: string[]
}

/**
 * Valida linhas brutas antes de gravar o catálogo (POST /api/catalogo).
 *
 * Erros (impedem a gravação): nome vazio; nivel vazio ou fora dos níveis
 * ativos; tipo_componente fora de {@link TIPOS_COMPONENTE}; debito preenchido
 * com algo que não seja sim/nao/avaliar; nome duplicado DENTRO do mesmo nível
 * (mesmo slug — cobre diferenças só de caixa/acento). O mesmo nome em níveis
 * diferentes é permitido: são componentes diferentes.
 *
 * Warnings (não impedem): `consome` que não resolve contra nenhuma linha — o
 * build criará um nó fantasma — e `associacoes` que não resolve, que o build
 * simplesmente ignora.
 *
 * "linha N" conta o cabeçalho do CSV como linha 1.
 */
export function validarCatalogo(
  rows: CatalogoRow[],
  niveis: readonly NivelInfo[] = NIVEIS_PADRAO,
): ValidacaoCatalogo {
  const errors: string[] = []
  const warnings: string[] = []
  const ativos = new Set(niveis.map((n) => n.slug))
  const porChave = new Map<string, { nome: string; linha: number }>()

  rows.forEach((row, i) => {
    const linha = i + 2
    const nome = row.nome.trim()
    if (nome === '') {
      errors.push(`linha ${linha}: "nome" é obrigatório`)
      return
    }
    const nivel = row.nivel.trim()
    if (nivel === '') {
      errors.push(`linha ${linha} ("${nome}"): "nivel" é obrigatório (${nivelsMsg(niveis)})`)
    } else if (!ativos.has(nivel)) {
      errors.push(`linha ${linha} ("${nome}"): nivel "${row.nivel}" inválido (${nivelsMsg(niveis)})`)
    }
    // Namespace de nome é POR NÍVEL: o que identifica um componente é o par
    // (nível, nome), que é exatamente o id dele.
    const chave = `${nivel}\u0000${slugify(nome)}`
    const anterior = porChave.get(chave)
    if (anterior !== undefined) {
      errors.push(
        `linha ${linha} ("${nome}"): nome duplicado no nível "${nivel}" — colide com "${anterior.nome}" (linha ${anterior.linha})`,
      )
    } else {
      porChave.set(chave, { nome, linha })
    }
    const tipo = row.tipo_componente.trim()
    if (tipo !== '' && !TIPOS_COMPONENTE_SET.has(tipo)) {
      errors.push(
        `linha ${linha} ("${nome}"): tipo_componente "${row.tipo_componente}" inválido (use ${TIPOS_COMPONENTE_MSG})`,
      )
    }
    // Débito e status são opcionais em qualquer nível; preenchido, o débito
    // precisa ser um dos três valores.
    if (row.debito !== '' && !DEBITOS_VALIDOS.has(row.debito)) {
      errors.push(
        `linha ${linha} ("${nome}"): debito "${row.debito}" inválido (use sim, nao, avaliar ou deixe vazio)`,
      )
    }
  })

  // Referências resolvem como no build: por id OU por nome de QUALQUER linha,
  // sem distinguir caixa nem acentos.
  const conhecidos = new Set<string>()
  for (const row of rows) {
    const nome = row.nome.trim()
    if (nome === '') continue
    conhecidos.add(chaveNome(nome))
    conhecidos.add(idDaLinha(row.nivel, nome))
  }
  const conhece = (alvo: string): boolean =>
    conhecidos.has(chaveNome(alvo)) || conhecidos.has(alvo.trim())
  for (const row of rows) {
    for (const alvo of row.consome) {
      if (!conhece(alvo)) {
        warnings.push(
          `"${row.nome}": consome "${alvo}", que não existe no catálogo — o build criará um nó fantasma`,
        )
      }
    }
    for (const alvo of row.associacoes) {
      if (!conhece(alvo)) {
        warnings.push(
          `"${row.nome}": associação "${alvo}" não existe no catálogo — o build vai ignorá-la`,
        )
      }
    }
  }

  return { errors, warnings }
}

// ---------------------------------------------------------------------------
// Resolução de referências entre linhas (`consome`, `associacoes`): toda
// referência aponta para QUALQUER linha do catálogo, de qualquer nível. Mudar
// um componente de nível muda só o id dele; quem o referencia continua achando
// pelo nome.
// ---------------------------------------------------------------------------

/** Candidato de uma referência: id do nó final e o nível a que ele pertence
 *  (usado só para desempatar nomes homônimos pela ordem da cadeia). */
export interface AlvoRef {
  id: string
  nome: string
  nivel: string
}

export interface IndiceAlvos {
  /** Acrescenta alvos (id repetido é ignorado: o primeiro vence). */
  adicionar(alvos: readonly AlvoRef[]): void
  /** Resolve por id e, sem casar, por nome sem distinguir caixa nem acentos.
   *  `candidatos` traz todos os homônimos — vence o de menor ordem de nível
   *  (empate: menor id). */
  resolver(texto: string, excluirId?: string): { alvo: AlvoRef | null; candidatos: AlvoRef[] }
}

export function criarIndiceAlvos(
  niveis: readonly NivelInfo[] = NIVEIS_PADRAO,
  alvos: readonly AlvoRef[] = [],
): IndiceAlvos {
  const ordemPorSlug = new Map(niveis.map((n) => [n.slug, n.ordem]))
  const ordemDe = (nivel: string): number => ordemPorSlug.get(nivel) ?? Number.MAX_VALUE
  const porId = new Map<string, AlvoRef>()
  const porNome = new Map<string, AlvoRef[]>()

  const adicionar = (novos: readonly AlvoRef[]): void => {
    for (const alvo of novos) {
      if (porId.has(alvo.id)) continue
      porId.set(alvo.id, alvo)
      const chave = chaveNome(alvo.nome)
      const lista = porNome.get(chave) ?? []
      lista.push(alvo)
      lista.sort(
        (a, b) => ordemDe(a.nivel) - ordemDe(b.nivel) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      )
      porNome.set(chave, lista)
    }
  }
  adicionar(alvos)

  return {
    adicionar,
    resolver(texto, excluirId) {
      const bruto = texto.trim()
      const exato = porId.get(bruto)
      if (exato !== undefined && exato.id !== excluirId) return { alvo: exato, candidatos: [exato] }
      const candidatos = (porNome.get(chaveNome(bruto)) ?? []).filter((a) => a.id !== excluirId)
      return { alvo: candidatos[0] ?? null, candidatos }
    },
  }
}

/**
 * Nó fantasma: alvo de `consome` que não tem linha no catálogo. Fica no mapa
 * (é justamente o buraco que o mapa precisa mostrar) no nível do fim da
 * cadeia — de onde vem o que ainda não foi catalogado.
 */
function nodeFantasma(nomeAlvo: string, nivel: string): GraphNode {
  return {
    id: idDaLinha(nivel, nomeAlvo),
    nome: nomeAlvo,
    nivel,
    tipoComponente: TIPO_COMPONENTE_DEFAULT,
    dominio: '',
    debito: 'avaliar',
    status: 'investigacao',
    owner: null,
    centroDeCusto: null,
    descricao: 'Nó fantasma: referenciado na coluna "consome", mas sem linha no catálogo.',
    incompleto: true,
    fantasma: true,
  }
}

/**
 * Monta o grafo a partir do texto do catalogo.csv.
 *
 * - um nó por LINHA do catálogo, em qualquer nível — nada é derivado de campo;
 * - id = `<slug do nível>-<slug do nome>`; duas linhas com o mesmo id (mesmo
 *   nome no mesmo nível) viram warning e a repetida é ignorada;
 * - `consome` vira aresta "consome" e `associacoes` vira aresta "vem de";
 *   ambas resolvem contra QUALQUER linha, por id ou por nome (sem distinguir
 *   caixa nem acentos). Nome homônimo em vários níveis → warning, e vence o
 *   nível de menor ordem;
 * - `consome` que não resolve vira nó fantasma (+ warning); `associacoes` que
 *   não resolve vira só warning, sem criar nó — não dá para adivinhar em que
 *   nível ele existiria;
 * - saída determinística (nodes por id, links por source/target/label).
 *
 * `niveis` é a lista COMPLETA de níveis ativos (built-ins + customs). Linha de
 * um nível que não está na lista é ignorada com warning: sem nível, o
 * componente não teria lugar no mapa.
 */
export function buildGraph(csv: string, niveis: readonly NivelInfo[] = NIVEIS_PADRAO): BuildResult {
  const { rows, warnings } = parseCatalogo(csv, niveis)

  const nodes: GraphNode[] = []
  const porId = new Map<string, GraphNode>()
  const aceitas: ParsedRow[] = []

  // Ordena por id (estável: entre duplicatas, a primeira linha do arquivo
  // vence) para que a saída não dependa da ordem das linhas no CSV.
  const ordenadas = [...rows].sort((a, b) => (a.node.id < b.node.id ? -1 : a.node.id > b.node.id ? 1 : 0))

  for (const p of ordenadas) {
    if (porId.has(p.node.id)) {
      warnings.push(
        `nome duplicado "${p.node.nome}" no nível "${p.node.nivel}" (id "${p.node.id}") — a linha repetida foi ignorada`,
      )
      continue
    }
    nodes.push(p.node)
    porId.set(p.node.id, p.node)
    aceitas.push(p)
  }

  const indice = criarIndiceAlvos(
    niveis,
    aceitas.map((p) => ({ id: p.node.id, nome: p.node.nome, nivel: p.node.nivel })),
  )

  // Fantasma nasce no fim da cadeia: é a ponta de onde vem o que ainda não foi
  // catalogado. Sem nível nenhum ativo não há linhas — nem fantasmas.
  const nivelFantasma = [...niveis].sort((a, b) => a.ordem - b.ordem).at(-1)?.slug ?? ''

  const links: GraphLink[] = []
  const fantasmas: GraphNode[] = []
  // Um fantasma por nome referenciado, seja qual for o número de consumidores.
  const idFantasmaPorNome = new Map<string, string>()

  for (const p of aceitas) {
    for (const nomeAlvo of p.consome) {
      const { alvo, candidatos } = indice.resolver(nomeAlvo)
      if (alvo === null) {
        const chave = chaveNome(nomeAlvo)
        let id = idFantasmaPorNome.get(chave)
        if (id === undefined) {
          const fantasma = nodeFantasma(nomeAlvo, nivelFantasma)
          warnings.push(
            `consome quebrado: "${nomeAlvo}" em "${p.node.nome}" não corresponde a nenhuma linha do catálogo — criado nó fantasma "${fantasma.id}"`,
          )
          // Nome com pontuação diferente pode slugificar igual ao de uma linha
          // já aceita: nesse caso a aresta aponta para ela, sem duplicar o nó.
          if (!porId.has(fantasma.id)) {
            porId.set(fantasma.id, fantasma)
            fantasmas.push(fantasma)
          }
          id = fantasma.id
          idFantasmaPorNome.set(chave, id)
        }
        links.push({ source: p.node.id, target: id, label: 'consome' })
        continue
      }
      if (candidatos.length > 1) {
        warnings.push(
          `"${p.node.nome}": consome "${nomeAlvo}", nome de ${candidatos.length} linhas do catálogo — usando "${alvo.nome}" (${alvo.nivel})`,
        )
      }
      links.push({ source: p.node.id, target: alvo.id, label: 'consome' })
    }
  }

  for (const p of aceitas) {
    for (const nomeAlvo of p.associacoes) {
      const { alvo, candidatos } = indice.resolver(nomeAlvo, p.node.id)
      if (alvo === null) {
        warnings.push(
          `"${p.node.nome}": associação "${nomeAlvo}" não corresponde a nenhum componente do mapa — ignorada (nenhum nó criado)`,
        )
        continue
      }
      if (candidatos.length > 1) {
        warnings.push(
          `"${p.node.nome}": associação "${nomeAlvo}" é ambígua (${candidatos.length} componentes) — usando "${alvo.nome}" (${alvo.nivel})`,
        )
      }
      links.push({ source: p.node.id, target: alvo.id, label: 'vem de' })
    }
  }

  const todosNodes = [...nodes, ...fantasmas]
  todosNodes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  const vistas = new Set<string>()
  const todosLinks = links.filter((l) => {
    const chave = `${l.source}\u0000${l.target}\u0000${l.label}`
    if (vistas.has(chave)) return false
    vistas.add(chave)
    return true
  })
  todosLinks.sort((a, b) => {
    const ka = `${a.source}\u0000${a.target}\u0000${a.label}`
    const kb = `${b.source}\u0000${b.target}\u0000${b.label}`
    return ka < kb ? -1 : ka > kb ? 1 : 0
  })

  return {
    graph: {
      niveis: [...niveis].sort((a, b) => a.ordem - b.ordem),
      nodes: todosNodes,
      links: todosLinks,
    },
    warnings,
  }
}
