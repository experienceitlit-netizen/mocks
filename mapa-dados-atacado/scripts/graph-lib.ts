// Funções puras do build do grafo — separadas do CLI para serem testáveis.
// Fonte única: catalogo.csv (separador ";", uma linha por dado).

export interface GraphNode {
  id: string
  nome: string
  tipo: string
  /** raiz | primario | final | ambos ("secundario" é apelido de "final" no parse) */
  nivel: string
  dominio: string
  debito: string
  owner: string | null
  centroDeCusto: string | null
  descricao: string
  /** null = não se aplica (produtos finais derivam a rota dos primários que consomem) */
  sistema: string | null
  origem: string | null
  status: string
  incompleto: boolean
  fantasma?: boolean
  derivado?: undefined
  cadastrado?: undefined
  /** Tabelas UCS onde a fonte é ingerida antes de virar produto (opcional):
   *  presença substitui a aresta direta dado→sistema por dado→fsec→sistema. */
  fontesSecundarias?: string[]
  /** Coluna "observacoes" do CSV: texto livre em markdown; ausente se vazia.
   *  [[Wikilinks]] no texto viram links de navegação no balão, mas NÃO geram
   *  arestas — arestas de consumo vêm só da coluna "consome". */
  corpo?: string
}

/** Nó de infraestrutura materializado pelo build: `fonte_sistema`/`origem`/
 *  `fontes_secundarias` dos produtos, o domínio dos produtos finais agregados
 *  pela raiz, ou um componente cadastrado no catálogo (linha de nivel
 *  dominio/origem/fonte/fonte-secundaria ou de um nível customizado, tipo
 *  "nivel-custom"). Componente cadastrado cujo slug coincide com um nó
 *  derivado do mesmo tipo FUNDE com ele (mesmo id), ganha `cadastrado: true`
 *  e carrega os campos da linha.
 *
 *  Nível customizado é NÍVEL DE DADO: a linha aceita os mesmos campos de um
 *  produto e o nó os carrega (os últimos sete campos), o que dá a ele a mesma
 *  semântica de cor/borda e as mesmas arestas de rota. Linha preenchida só com
 *  nome/descrição continua sendo um componente simples — os campos de dado
 *  ficam ausentes do JSON. */
export interface DerivedNode {
  id: string
  nome: string
  tipo: 'sistema' | 'origem' | 'dominio' | 'fonte-secundaria' | 'nivel-custom'
  derivado: true
  /** Gap de governança (owner/centro de custo vazios): só nós de nível
   *  customizado podem ser incompletos — os demais derivados não têm dono. */
  incompleto: boolean
  fantasma?: undefined
  /** Só em nós tipo "nivel-custom": slug do nível customizado (niveis.csv). */
  nivelCustom?: string
  /** true quando o componente tem linha própria no catalogo.csv; os quatro
   *  campos seguintes só existem em nós cadastrados (corpo só se não vazio). */
  cadastrado?: true
  descricao?: string
  owner?: string | null
  centroDeCusto?: string | null
  corpo?: string
  /** Campos de dado de uma linha de nível customizado; ausentes quando a
   *  célula está vazia (componente simples). */
  dominio?: string
  debito?: string
  status?: string
  sistema?: string | null
  origem?: string | null
  fontesSecundarias?: string[]
}

export type AnyNode = GraphNode | DerivedNode

export interface GraphLink {
  source: string
  target: string
  label: string
}

export interface Graph {
  /** TODOS os níveis da cadeia (built-ins + customizados), ordenados por
   *  `ordem` asc — a UI monta colunas/faixas/selects a partir daqui. */
  niveis: NivelInfo[]
  nodes: AnyNode[]
  links: GraphLink[]
}

export interface ParsedRow {
  node: GraphNode
  /** nomes (ou ids) da coluna "consome", ainda não resolvidos */
  consome: string[]
  /** nomes da coluna "associacoes" (vale em qualquer nível), não resolvidos */
  associacoes: string[]
}

// ---------------------------------------------------------------------------
// Níveis da cadeia: os sete built-in são fixos no código; níveis customizados
// (ex.: Bronze/Prata/Ouro de uma arquitetura medallion) vivem em niveis.csv
// (colunas titulo;ordem) e entram entre os built-in pela ordem numérica.
// ---------------------------------------------------------------------------

/** Linha do niveis.csv na forma bruta (formato trocado com GET/POST
 *  /api/niveis): titulo livre, ordem numérica (float aceito). Ordem inválida
 *  no arquivo vira NaN — pega em validarNiveis/carregarNiveis. */
export interface NivelRow {
  titulo: string
  ordem: number
}

/** Nível resolvido: slug(titulo) é o id (valor aceito na coluna `nivel` do
 *  catalogo.csv para linhas de componente daquele nível). */
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

/** Colunas do niveis.csv, na ordem canônica do cabeçalho. */
export const COLUNAS_NIVEIS = ['titulo', 'ordem'] as const

/** Slugs que um nível custom não pode usar: os built-in mais os valores de
 *  nivel de produto/apelido que já têm significado na coluna `nivel`. */
const SLUGS_RESERVADOS = new Set<string>([...NIVEIS_BUILTIN.map((n) => n.slug), 'ambos', 'secundario'])
const ORDENS_BUILTIN = new Map<number, string>(NIVEIS_BUILTIN.map((n) => [n.ordem, n.titulo]))

/** Bloco `niveis` do graph.json: built-ins + customs, ordenado por ordem. */
export function montarNiveis(customs: NivelDef[]): NivelInfo[] {
  return [
    ...NIVEIS_BUILTIN.map((n) => ({ ...n, builtin: true })),
    ...customs.map((n) => ({ ...n, builtin: false })),
  ].sort((a, b) => a.ordem - b.ordem)
}

/** NivelRow (bruta) → NivelDef (com slug), sem validar. */
export function defsDeNiveis(rows: NivelRow[]): NivelDef[] {
  return rows.map((r) => ({ slug: slugify(r.titulo), titulo: r.titulo.trim(), ordem: r.ordem }))
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
    return {
      titulo: celula(registro, 'titulo'),
      ordem: ordemTexto === '' ? Number.NaN : Number(ordemTexto),
    }
  })
}

/**
 * Serializa o niveis.csv canônico: BOM UTF-8 + cabeçalho titulo;ordem +
 * separador ";", registros em \r\n e aspas mínimas. Round-trip garantido para
 * títulos trimados e ordens em forma canônica de Number (42.5 → "42.5").
 */
export function serializarNiveis(rows: NivelRow[]): string {
  const linhas = rows.map((r) => `${celulaCsv(r.titulo)};${celulaCsv(String(r.ordem))}`)
  return '\uFEFF' + [COLUNAS_NIVEIS.join(';'), ...linhas].join('\r\n') + '\r\n'
}

/** Erros de UMA linha do niveis.csv contra os built-in e os customs já
 *  aceitos (mapas por slug e por ordem). Registra a linha nos mapas se ok. */
function checarNivel(
  row: NivelRow,
  linha: number,
  porSlug: Map<string, { titulo: string; linha: number }>,
  porOrdem: Map<number, { titulo: string; linha: number }>,
): string[] {
  const errors: string[] = []
  const titulo = row.titulo.trim()
  if (titulo === '') {
    errors.push(`linha ${linha}: "titulo" é obrigatório`)
    return errors
  }
  const slug = slugify(titulo)
  if (slug === '') {
    errors.push(`linha ${linha} ("${titulo}"): titulo inválido — precisa conter letras ou números`)
  } else if (SLUGS_RESERVADOS.has(slug)) {
    const builtin = NIVEIS_BUILTIN.find((n) => n.slug === slug)
    errors.push(
      builtin !== undefined
        ? `linha ${linha} ("${titulo}"): título colide com o nível built-in "${builtin.titulo}"`
        : `linha ${linha} ("${titulo}"): título reservado — "${slug}" já tem significado na coluna nivel do catálogo`,
    )
  } else {
    const anterior = porSlug.get(slug)
    if (anterior !== undefined) {
      errors.push(
        `linha ${linha} ("${titulo}"): título duplicado — colide com "${anterior.titulo}" (linha ${anterior.linha})`,
      )
    }
  }

  if (!Number.isFinite(row.ordem)) {
    errors.push(`linha ${linha} ("${titulo}"): ordem inválida — use um número (decimais aceitos)`)
  } else if (ORDENS_BUILTIN.has(row.ordem)) {
    errors.push(
      `linha ${linha} ("${titulo}"): ordem ${row.ordem} colide com o nível built-in "${ORDENS_BUILTIN.get(row.ordem)}" — use um valor intermediário`,
    )
  } else {
    const anterior = porOrdem.get(row.ordem)
    if (anterior !== undefined) {
      errors.push(
        `linha ${linha} ("${titulo}"): ordem ${row.ordem} duplicada — colide com "${anterior.titulo}" (linha ${anterior.linha})`,
      )
    }
  }

  if (errors.length === 0) {
    porSlug.set(slug, { titulo, linha })
    porOrdem.set(row.ordem, { titulo, linha })
  }
  return errors
}

/**
 * Valida linhas brutas antes de gravar o niveis.csv (POST /api/niveis).
 * Erros (impedem a gravação): titulo vazio ou sem letras/números, título
 * duplicado por slug (entre customs E contra os built-in — não pode custom
 * "Origem"), ordem não-numérica, ordem igual à de um built-in ou repetida
 * entre customs. "linha N" conta o cabeçalho do CSV como linha 1.
 */
export function validarNiveis(rows: NivelRow[]): ValidacaoCatalogo {
  const errors: string[] = []
  const porSlug = new Map<string, { titulo: string; linha: number }>()
  const porOrdem = new Map<number, { titulo: string; linha: number }>()
  rows.forEach((row, i) => errors.push(...checarNivel(row, i + 2, porSlug, porOrdem)))
  return { errors, warnings: [] }
}

/**
 * Carrega o niveis.csv para o build de forma tolerante: linha inválida vira
 * warning e é descartada (o arquivo gravado pela API é sempre válido; isto
 * protege contra edição manual quebrada sem derrubar o build).
 */
export function carregarNiveis(texto: string): { niveis: NivelDef[]; warnings: string[] } {
  const warnings: string[] = []
  const registros = parseCsv(texto)
  if (registros.length === 0) return { niveis: [], warnings }

  const cabecalho = registros[0].map((c) => c.trim())
  for (const col of COLUNAS_NIVEIS) {
    if (!cabecalho.includes(col)) warnings.push(`niveis.csv: coluna obrigatória "${col}" ausente do cabeçalho`)
  }

  const niveis: NivelDef[] = []
  const porSlug = new Map<string, { titulo: string; linha: number }>()
  const porOrdem = new Map<number, { titulo: string; linha: number }>()
  parseNiveisRows(texto).forEach((row, i) => {
    const errosLinha = checarNivel(row, i + 2, porSlug, porOrdem)
    if (errosLinha.length > 0) {
      warnings.push(...errosLinha.map((e) => `niveis.csv ${e} — nível ignorado`))
      return
    }
    niveis.push({ slug: slugify(row.titulo), titulo: row.titulo.trim(), ordem: row.ordem })
  })
  return { niveis, warnings }
}

/**
 * Erros de remoção de nível em uso: toda linha do catálogo cujo `nivel` não é
 * produto nem componente built-in precisa de um nível custom correspondente na
 * lista nova — remover (ou renomear) um nível ainda usado é erro.
 */
export function validarNiveisContraCatalogo(rows: NivelRow[], catalogo: CatalogoRow[]): string[] {
  const slugsNovos = new Set(rows.map((r) => slugify(r.titulo)))
  const usosPorNivel = new Map<string, string[]>()
  for (const row of catalogo) {
    const nivel = normalizarNivel(row.nivel)
    if (NIVEIS_PRODUTO.has(nivel) || NIVEIS_COMPONENTE.has(nivel) || slugsNovos.has(nivel)) continue
    const usos = usosPorNivel.get(nivel) ?? []
    usos.push(row.nome)
    usosPorNivel.set(nivel, usos)
  }
  return [...usosPorNivel.entries()].map(
    ([nivel, nomes]) =>
      `nível custom "${nivel}" está em uso por ${nomes.length} linha(s) do catálogo` +
      ` (${nomes.map((n) => `"${n}"`).join(', ')}) — mova essas linhas para outro nível antes de removê-lo`,
  )
}

/** Linha de componente do catálogo (nivel dominio/origem/fonte/fonte-secundaria)
 *  já interpretada: usa nome, descricao, owner, centro_de_custo e observacoes;
 *  as demais colunas da linha são ignoradas silenciosamente. `associacoes` vem
 *  da coluna "origem" (linha fonte: origens associadas) ou "fonte_sistema"
 *  (linha fonte-secundaria: fontes associadas), lista " | " com 0..n nomes. */
export interface ComponenteRow {
  nivel: NivelComponente
  nome: string
  descricao: string
  owner: string | null
  centroDeCusto: string | null
  corpo?: string
  associacoes: string[]
}

/** Linha de NÍVEL CUSTOM (nivel = slug de um nível do niveis.csv). Nível
 *  customizado é nível de DADO: a linha aceita todos os campos de um produto
 *  (dominio, origem, fonte_sistema, fontes_secundarias, consome, debito,
 *  status, owner, centro_de_custo) MAIS a coluna `associacoes` (lista " | ")
 *  — que aponta para qualquer outra linha do catálogo, resolvida por nome.
 *  Preencher só nome/descrição continua valendo: a linha vira um componente
 *  simples, sem rota nem semântica de débito. */
export interface ComponenteCustomRow {
  /** slug do nível custom (valor da coluna nivel) */
  nivel: string
  nome: string
  descricao: string
  owner: string | null
  centroDeCusto: string | null
  corpo?: string
  associacoes: string[]
  /** Campos de dado ("" / null / [] quando a célula está vazia). */
  dominio: string
  debito: string
  status: string
  sistema: string | null
  origem: string | null
  fontesSecundarias: string[]
  consome: string[]
}

export interface CatalogoParseResult {
  rows: ParsedRow[]
  componentes: ComponenteRow[]
  componentesCustom: ComponenteCustomRow[]
  warnings: string[]
}

export interface BuildResult {
  graph: Graph
  warnings: string[]
}

/** Níveis de produto (linhas de dado, como sempre foram). */
export type NivelProduto = 'primario' | 'final' | 'ambos'
/** Níveis de componente: a linha cadastra um nó de infraestrutura do mapa. */
export type NivelComponente = 'dominio' | 'origem' | 'fonte' | 'fonte-secundaria'
export type Nivel = NivelProduto | NivelComponente
export type Debito = 'sim' | 'nao' | 'avaliar'

/** "secundario" é apelido aceito de "final" (sem warning): o parse e o
 *  serializador sempre canonizam para "final". */
export function normalizarNivel(nivel: string): string {
  return nivel === 'secundario' ? 'final' : nivel
}

/** Linha do catalogo.csv na forma bruta: um campo por coluna, sem nada
 *  derivado (id, tipo, incompleto etc. são calculados só no build). Células
 *  vazias de origem/fonte_sistema/owner/centro_de_custo viram null; as
 *  listas ("A | B") viram arrays. É o formato trocado com a API do dev
 *  server (GET/POST /api/catalogo).
 *
 *  Semântica por tipo de linha (mesmas 13 colunas para todos):
 *  - nivel primario|final|ambos (produto): todos os campos como sempre;
 *    debito obrigatório (sim|nao|avaliar).
 *  - nivel dominio|origem (componente): usa nome, descricao, owner,
 *    centro_de_custo e observacoes; demais colunas ignoradas silenciosamente
 *    (deixe vazias — debito fica "").
 *  - nivel fonte (componente): idem, e a coluna `origem` vira lista " | " de
 *    0..n origens associadas (continua string no JSON: "A | B").
 *  - nivel fonte-secundaria (componente): idem, e a coluna `fonte_sistema`
 *    vira lista " | " de 0..n fontes associadas (string "A | B").
 *  - nivel <slug de nível custom> (componente): usa nome, descricao, owner,
 *    centro_de_custo, observacoes e a coluna `associacoes` (lista " | " de
 *    componentes de qualquer nível não-produto). Produtos e componentes
 *    built-in IGNORAM `associacoes`. */
export interface CatalogoRow {
  nome: string
  /** Nivel built-in OU slug de um nível custom do niveis.csv. */
  nivel: Nivel | string
  dominio: string
  origem: string | null
  fonte_sistema: string | null
  fontes_secundarias: string[]
  consome: string[]
  descricao: string
  /** "" só em linhas de componente (coluna ignorada nelas) */
  debito: Debito | ''
  status: string
  owner: string | null
  centro_de_custo: string | null
  observacoes: string
  /** Só linhas de componente de nível custom usam; vazia nas demais. */
  associacoes: string[]
}

/** Colunas do catalogo.csv, na ordem canônica do cabeçalho. A 14ª coluna
 *  (associacoes) é opcional na LEITURA — arquivo legado com 13 colunas parseia
 *  sem warning — mas o serializador sempre escreve as 14. */
export const COLUNAS = [
  'nome',
  'nivel',
  'dominio',
  'origem',
  'fonte_sistema',
  'fontes_secundarias',
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
const COLUNAS_OPCIONAIS = new Set<string>(['associacoes'])

type Coluna = (typeof COLUNAS)[number]

const NIVEIS_PRODUTO = new Set<string>(['primario', 'final', 'ambos'])
const NIVEIS_COMPONENTE = new Set<string>(['dominio', 'origem', 'fonte', 'fonte-secundaria'])
/** Níveis em que a lista de associações mora nas colunas de rota (`origem` em
 *  'fonte', `fonte_sistema` em 'fonte-secundaria') em vez de `associacoes`. */
const ASSOC_NA_ROTA = new Set<string>(['fonte', 'fonte-secundaria'])
const NIVEL_DEFAULT = 'primario'
const NIVEIS_MSG = 'use dominio, origem, fonte, fonte-secundaria, primario, final ou ambos'

/** Mensagem de nivel válido, citando também os níveis custom quando houver. */
function nivelsMsg(niveisCustom: NivelDef[]): string {
  return niveisCustom.length === 0
    ? NIVEIS_MSG
    : `${NIVEIS_MSG} — ou um nível customizado: ${niveisCustom.map((n) => n.slug).join(', ')}`
}
const DEBITOS_VALIDOS = new Set(['sim', 'nao', 'avaliar'])

/** Slug kebab-case sem acentos, usado como id dos nós (id = slug do nome). */
export function slugify(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
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

/**
 * Parseia o catalogo.csv: cabeçalho por nome de coluna (ordem livre) + uma
 * linha por dado ou por componente (nivel dominio/origem/fonte/fonte-secundaria
 * ou slug de um nível custom de `niveisCustom`). Warnings legíveis para coluna
 * faltando/desconhecida, linha sem nome e nivel inválido; "linha N" conta o
 * cabeçalho como linha 1.
 */
export function parseCatalogo(texto: string, niveisCustom: NivelDef[] = []): CatalogoParseResult {
  const warnings: string[] = []
  const registros = parseCsv(texto)
  if (registros.length === 0) {
    warnings.push('catalogo.csv: arquivo vazio — nenhum dado no catálogo')
    return { rows: [], componentes: [], componentesCustom: [], warnings }
  }

  const cabecalho = registros[0].map((c) => c.trim())
  const indice = new Map<string, number>(cabecalho.map((c, i) => [c, i]))
  for (const col of COLUNAS) {
    if (!indice.has(col) && !COLUNAS_OPCIONAIS.has(col)) {
      warnings.push(`catalogo.csv: coluna obrigatória "${col}" ausente do cabeçalho`)
    }
  }
  for (const col of cabecalho) {
    if (!(COLUNAS as readonly string[]).includes(col)) {
      warnings.push(`catalogo.csv: coluna desconhecida "${col}" ignorada`)
    }
  }

  const customPorSlug = new Map(niveisCustom.map((n) => [n.slug, n]))
  const rows: ParsedRow[] = []
  const componentes: ComponenteRow[] = []
  const componentesCustom: ComponenteCustomRow[] = []
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

    let nivel = normalizarNivel(celula('nivel'))
    if (NIVEIS_COMPONENTE.has(nivel)) {
      const nivelComp = nivel as NivelComponente
      const componente: ComponenteRow = {
        nivel: nivelComp,
        nome,
        descricao: celula('descricao'),
        owner: textoOuNull('owner'),
        centroDeCusto: textoOuNull('centro_de_custo'),
        associacoes:
          nivelComp === 'fonte'
            ? splitLista(celula('origem'))
            : nivelComp === 'fonte-secundaria'
              ? splitLista(celula('fonte_sistema'))
              : [],
      }
      const corpoComp = celula('observacoes')
      if (corpoComp !== '') componente.corpo = corpoComp
      componentes.push(componente)
      continue
    }
    if (customPorSlug.has(nivel)) {
      const componente: ComponenteCustomRow = {
        nivel,
        nome,
        descricao: celula('descricao'),
        owner: textoOuNull('owner'),
        centroDeCusto: textoOuNull('centro_de_custo'),
        associacoes: splitLista(celula('associacoes')),
        dominio: celula('dominio'),
        debito: celula('debito'),
        status: celula('status'),
        sistema: textoOuNull('fonte_sistema'),
        origem: textoOuNull('origem'),
        fontesSecundarias: splitLista(celula('fontes_secundarias')),
        consome: splitLista(celula('consome')),
      }
      const corpoComp = celula('observacoes')
      if (corpoComp !== '') componente.corpo = corpoComp
      componentesCustom.push(componente)
      continue
    }
    if (!NIVEIS_PRODUTO.has(nivel)) {
      warnings.push(
        `catalogo.csv linha ${linha} ("${nome}"): nivel "${nivel}" inválido` +
          ` (${nivelsMsg(niveisCustom)}) — assumindo "${NIVEL_DEFAULT}"`,
      )
      nivel = NIVEL_DEFAULT
    }

    const owner = textoOuNull('owner')
    const centroDeCusto = textoOuNull('centro_de_custo')

    const node: GraphNode = {
      id: slugify(nome),
      nome,
      // tipo é derivado do nivel: primário = insumo, o resto = produto final.
      tipo: nivel === 'primario' ? 'insumo' : 'produto',
      nivel,
      dominio: celula('dominio') || 'A definir',
      debito: celula('debito'),
      owner,
      centroDeCusto,
      descricao: celula('descricao'),
      sistema: textoOuNull('fonte_sistema'),
      origem: textoOuNull('origem'),
      status: celula('status'),
      incompleto: owner === null || centroDeCusto === null,
    }

    const fsecs = splitLista(celula('fontes_secundarias'))
    if (fsecs.length > 0) node.fontesSecundarias = fsecs

    const corpo = celula('observacoes')
    if (corpo !== '') node.corpo = corpo

    rows.push({
      node,
      consome: splitLista(celula('consome')),
      associacoes: splitLista(celula('associacoes')),
    })
  }

  return { rows, componentes, componentesCustom, warnings }
}

/**
 * Lê o catalogo.csv na forma bruta ({@link CatalogoRow}), preservando a ordem
 * das linhas do arquivo. Não valida nada além do formato CSV: nivel/debito
 * saem como estão no arquivo (a validação é papel de {@link validarCatalogo}),
 * exceto o apelido "secundario", canonizado para "final"; células são
 * trimadas, como em parseCatalogo.
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
      nivel: normalizarNivel(celula('nivel')) as Nivel,
      dominio: celula('dominio'),
      origem: textoOuNull('origem'),
      fonte_sistema: textoOuNull('fonte_sistema'),
      fontes_secundarias: splitLista(celula('fontes_secundarias')),
      consome: splitLista(celula('consome')),
      descricao: celula('descricao'),
      debito: celula('debito') as Debito,
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
 * valor), listas com " | ", null vira célula vazia e aspas mínimas. Em linhas
 * Todas as colunas valem em qualquer nível (o formulário é o mesmo para
 * todos): o débito de um componente é gravado como veio. `associacoes`
 * vale em qualquer nível, exceto 'fonte' e 'fonte-secundaria', onde a lista de
 * associações mora nas colunas `origem`/`fonte_sistema` — nessas duas a coluna
 * sai canonizada para "".
 * Round-trip garantido: parseCatalogoRows(serializarCatalogo(rows)) devolve
 * rows (para valores já trimados, como os que saem do próprio parse; em
 * componentes, com debito lido de volta como "") e
 * serializarCatalogo(parseCatalogoRows(csv)) reproduz o arquivo byte a byte.
 */
export function serializarCatalogo(rows: CatalogoRow[]): string {
  const linhas = rows.map((row) => {
    const nivel = normalizarNivel(row.nivel)

    const celulas: Record<Coluna, string> = {
      nome: row.nome,
      nivel,
      dominio: row.dominio,
      origem: row.origem ?? '',
      fonte_sistema: row.fonte_sistema ?? '',
      fontes_secundarias: row.fontes_secundarias.join(' | '),
      consome: row.consome.join(' | '),
      descricao: row.descricao,
      debito: row.debito,
      status: row.status,
      owner: row.owner ?? '',
      centro_de_custo: row.centro_de_custo ?? '',
      observacoes: row.observacoes,
      associacoes: ASSOC_NA_ROTA.has(nivel) ? '' : row.associacoes.join(' | '),
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
 * Erros (impedem a gravação): nome vazio, nome duplicado (mesmo slug —
 * cobre diferenças só de caixa/acento; global entre produtos, POR NÍVEL entre
 * componentes — produto e componente, ou componentes de níveis diferentes,
 * podem repetir o nome), nome de produto reservado ao nó-raiz, nivel fora dos
 * valores válidos ("secundario" é aceito como apelido de "final") e, só em
 * produtos, debito fora de sim/nao/avaliar (em componentes built-in a coluna é
 * ignorada). Linhas cujo nivel é slug de um nível custom (`niveisCustom`) têm
 * namespace de nome próprio por nível e aceitam debito vazio (componente
 * simples) ou um dos três valores (linha de dado). Warnings (não impedem):
 * "consome" de produto ou de linha de nível custom que não resolve por nome
 * nem id de NENHUMA linha do catálogo — o build criará um nó fantasma.
 * "linha N" conta o cabeçalho do CSV como linha 1.
 */
export function validarCatalogo(rows: CatalogoRow[], niveisCustom: NivelDef[] = []): ValidacaoCatalogo {
  const errors: string[] = []
  const warnings: string[] = []
  const raiz = criarRaiz()
  const porChave = new Map<string, { nome: string; linha: number }>()
  const slugsCustom = new Set(niveisCustom.map((n) => n.slug))

  /** Componente built-in: as colunas de dado não têm significado na linha. */
  const ehComponenteBuiltin = (row: CatalogoRow): boolean =>
    NIVEIS_COMPONENTE.has(normalizarNivel(row.nivel))

  rows.forEach((row, i) => {
    const linha = i + 2
    const nome = row.nome.trim()
    if (nome === '') {
      errors.push(`linha ${linha}: "nome" é obrigatório`)
      return
    }
    const nivel = normalizarNivel(row.nivel)
    const custom = slugsCustom.has(nivel)
    const componente = NIVEIS_COMPONENTE.has(nivel) || custom
    const slug = slugify(nome)
    if (!componente && slug === raiz.id) {
      errors.push(`linha ${linha} ("${nome}"): nome reservado ao nó-raiz "${raiz.nome}"`)
    } else {
      // produtos dividem um namespace global; componentes, um por nível.
      const chave = componente ? `${nivel}\u0000${slug}` : slug
      const anterior = porChave.get(chave)
      if (anterior !== undefined) {
        errors.push(
          `linha ${linha} ("${nome}"): nome duplicado — colide com "${anterior.nome}" (linha ${anterior.linha})`,
        )
      } else {
        porChave.set(chave, { nome, linha })
      }
    }
    if (!componente && !NIVEIS_PRODUTO.has(nivel)) {
      errors.push(`linha ${linha} ("${nome}"): nivel "${row.nivel}" inválido (${nivelsMsg(niveisCustom)})`)
    }
    if (!componente && !DEBITOS_VALIDOS.has(row.debito)) {
      errors.push(`linha ${linha} ("${nome}"): debito "${row.debito}" inválido (use sim, nao ou avaliar)`)
    }
    // Nível custom é linha de dado: aceita débito, mas só os valores válidos
    // (vazio = componente simples, sem semântica de débito).
    if (custom && row.debito !== '' && !DEBITOS_VALIDOS.has(row.debito)) {
      errors.push(`linha ${linha} ("${nome}"): debito "${row.debito}" inválido (use sim, nao, avaliar ou deixe vazio)`)
    }
  })

  // "consome" resolve como no build: por nome OU id de QUALQUER linha do
  // catálogo, sem distinguir caixa nem acentos.
  const conhecidos = new Set<string>([raiz.id, chaveNome(raiz.nome)])
  for (const row of rows) {
    const nome = row.nome.trim()
    if (nome === '') continue
    conhecidos.add(chaveNome(nome))
    conhecidos.add(slugify(nome))
  }
  for (const row of rows) {
    // Componente built-in ignora a coluna consome (como as demais de dado).
    if (ehComponenteBuiltin(row)) continue
    for (const alvo of row.consome) {
      if (!conhecidos.has(chaveNome(alvo)) && !conhecidos.has(slugify(alvo))) {
        warnings.push(`"${row.nome}": consome "${alvo}", que não existe no catálogo — o build criará um nó fantasma`)
      }
    }
  }

  return { errors, warnings }
}

// ---------------------------------------------------------------------------
// Resolução de referências entre linhas (`consome`, `fontes_secundarias`,
// `associacoes`): toda referência aponta para QUALQUER linha do catálogo —
// produto, componente built-in ou linha de nível customizado — mais a raiz e
// os nós derivados dos campos dos produtos. Transferir um dado de nível muda
// só o id/coluna dele; quem o referencia continua achando pelo nome.
// ---------------------------------------------------------------------------

/** Candidato de uma referência: id do nó final e o nível a que ele pertence
 *  (usado só para desempatar nomes ambíguos pela ordem das colunas). */
export interface AlvoRef {
  id: string
  nome: string
  /** slug do nível (built-in, custom ou o nível semântico de um derivado) */
  nivel: string
}

export interface IndiceAlvos {
  /** Acrescenta alvos (id repetido é ignorado: o primeiro vence). */
  adicionar(alvos: readonly AlvoRef[]): void
  /** Resolve por id (literal ou em forma de slug) e, sem casar, por nome sem
   *  distinguir caixa nem acentos. `candidatos` traz todos os homônimos —
   *  vence o de menor ordem de nível (empate: menor id). */
  resolver(texto: string, excluirId?: string): { alvo: AlvoRef | null; candidatos: AlvoRef[] }
}

export function criarIndiceAlvos(
  niveisCustom: NivelDef[],
  alvos: readonly AlvoRef[] = [],
): IndiceAlvos {
  const ordemPorSlug = new Map(montarNiveis(niveisCustom).map((n) => [n.slug, n.ordem]))
  // "ambos" é produto primário e final ao mesmo tempo; conta como primário.
  const ordemDe = (nivel: string): number =>
    ordemPorSlug.get(nivel === 'ambos' ? 'primario' : nivel) ?? Number.MAX_VALUE
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
      const exato = porId.get(bruto) ?? porId.get(slugify(bruto))
      if (exato !== undefined && exato.id !== excluirId) return { alvo: exato, candidatos: [exato] }
      const candidatos = (porNome.get(chaveNome(bruto)) ?? []).filter((a) => a.id !== excluirId)
      return { alvo: candidatos[0] ?? null, candidatos }
    },
  }
}

/** Valores de sistema/origem que significam "ainda não sabemos" — não viram nó. */
const VALORES_DESCONHECIDOS = new Set(['', 'a confirmar', 'a identificar', 'a detalhar'])

function valorConhecido(valor: string | null | undefined): string | null {
  if (valor === null || valor === undefined) return null
  const texto = valor.trim()
  return VALORES_DESCONHECIDOS.has(texto.toLowerCase()) ? null : texto
}

/** Nó que tem rota própria: produto ou linha de nível customizado. */
export interface NoComRota {
  id: string
  sistema?: string | null
  origem?: string | null
  fontesSecundarias?: string[]
}

/**
 * Materializa `fonte_sistema`, `origem` e `fontes_secundarias` dos dados como
 * nós derivados, criando a linhagem dado → [fonte secundária →] sistema → origem:
 * - dedup por chave normalizada (trim + lowercase) do texto original;
 * - valores desconhecidos ("a confirmar" etc.) não geram nó nem aresta;
 * - sistema desconhecido com origem conhecida liga dado → origem direto;
 * - `fontes_secundarias` (tabelas UCS) SUBSTITUI a aresta direta dado→sistema
 *   por dado→fsec ("vem de") + fsec→sistema ("vem de"); com sistema
 *   desconhecido, fsec→origem direto ("origina de");
 * - cada nome de `fontes_secundarias` passa antes por `resolverFonteSecundaria`:
 *   se ele já é uma linha do catálogo (inclusive de nível customizado), a rota
 *   usa aquele nó em vez de materializar um fsec-* paralelo.
 */
export function derivarSistemasOrigens(
  dados: readonly NoComRota[],
  resolverFonteSecundaria: (nome: string) => string | null = () => null,
): { nodes: DerivedNode[]; links: GraphLink[] } {
  const sistemas = new Map<string, DerivedNode>()
  const origens = new Map<string, DerivedNode>()
  const fontesSecundarias = new Map<string, DerivedNode>()
  const links: GraphLink[] = []
  const arestasVistas = new Set<string>()

  const noDerivado = (
    mapa: Map<string, DerivedNode>,
    prefixo: 'sys' | 'org' | 'fsec',
    tipo: DerivedNode['tipo'],
    texto: string,
  ): DerivedNode => {
    const chave = texto.toLowerCase()
    let no = mapa.get(chave)
    if (no === undefined) {
      no = { id: `${prefixo}-${slugify(texto)}`, nome: texto, tipo, derivado: true, incompleto: false }
      mapa.set(chave, no)
    }
    return no
  }

  const addLink = (source: string, target: string, label: string): void => {
    const chave = `${source}\u0000${target}\u0000${label}`
    if (arestasVistas.has(chave)) return
    arestasVistas.add(chave)
    links.push({ source, target, label })
  }

  for (const dado of dados) {
    const sistema = valorConhecido(dado.sistema)
    const origem = valorConhecido(dado.origem)
    const fsecs = (dado.fontesSecundarias ?? []).map((nome) => {
      const texto = nome.trim()
      return (
        resolverFonteSecundaria(texto) ??
        noDerivado(fontesSecundarias, 'fsec', 'fonte-secundaria', texto).id
      )
    })
    // O dado que declara ingestão via UCS não liga direto na fonte: a rota
    // passa pelas tabelas UCS (o débito técnico da fonte permanece no dado).
    const cabecas = fsecs.length > 0 ? fsecs : [dado.id]
    for (const f of fsecs) addLink(dado.id, f, 'vem de')
    if (sistema !== null) {
      const noSistema = noDerivado(sistemas, 'sys', 'sistema', sistema)
      for (const cabeca of cabecas) addLink(cabeca, noSistema.id, 'vem de')
      if (origem !== null) {
        const noOrigem = noDerivado(origens, 'org', 'origem', origem)
        addLink(noSistema.id, noOrigem.id, 'origina de')
      }
    } else if (origem !== null) {
      const noOrigem = noDerivado(origens, 'org', 'origem', origem)
      for (const cabeca of cabecas) addLink(cabeca, noOrigem.id, 'origina de')
    }
  }

  return { nodes: [...sistemas.values(), ...fontesSecundarias.values(), ...origens.values()], links }
}

/** O catálogo guarda domínios sem acento; o nó derivado exibe com. */
const DOMINIO_DISPLAY: Record<string, string> = {
  Regulatorio: 'Regulatório',
}

/**
 * Insere o nível de domínio entre a raiz e os produtos finais: cada aresta
 * "agrega" raiz→produto vira raiz→dom-<slug do domínio> e dom-<slug>→produto
 * (ambas "agrega", deduplicadas). As demais arestas passam intactas.
 * Devolve os nós de domínio derivados e a lista de arestas já reescrita.
 */
export function derivarDominios(
  dados: GraphNode[],
  links: GraphLink[],
): { nodes: DerivedNode[]; links: GraphLink[] } {
  const porId = new Map(dados.map((n) => [n.id, n]))
  const dominios = new Map<string, DerivedNode>()
  const saida: GraphLink[] = []
  const arestasVistas = new Set<string>()

  const addAgrega = (source: string, target: string): void => {
    const chave = `${source} ${target}`
    if (arestasVistas.has(chave)) return
    arestasVistas.add(chave)
    saida.push({ source, target, label: 'agrega' })
  }

  for (const l of links) {
    if (l.label !== 'agrega') {
      saida.push(l)
      continue
    }
    const dominio = porId.get(l.target)?.dominio ?? 'A definir'
    const id = `dom-${slugify(dominio)}`
    if (!dominios.has(id)) {
      dominios.set(id, {
        id,
        nome: DOMINIO_DISPLAY[dominio] ?? dominio,
        tipo: 'dominio',
        derivado: true,
        incompleto: false,
      })
    }
    addAgrega(l.source, id)
    addAgrega(id, l.target)
  }

  return { nodes: [...dominios.values()], links: saida }
}

/** Prefixo de id e tipo de nó de cada nível de componente cadastrável. */
const COMPONENTE_SPEC: Record<NivelComponente, { prefixo: string; tipo: DerivedNode['tipo'] }> = {
  dominio: { prefixo: 'dom', tipo: 'dominio' },
  origem: { prefixo: 'org', tipo: 'origem' },
  fonte: { prefixo: 'sys', tipo: 'sistema' },
  'fonte-secundaria': { prefixo: 'fsec', tipo: 'fonte-secundaria' },
}

/**
 * Funde os componentes cadastrados no catálogo com os nós derivados dos
 * produtos:
 * - componente cujo id (prefixo + slug do nome) bate com um nó derivado do
 *   mesmo tipo vira UM nó só: mantém id e nome derivados e ganha
 *   `cadastrado: true` + descricao/owner/centroDeCusto (corpo só se não vazio);
 * - componente sem produto que o referencie vira nó novo (pode ficar isolado);
 * - componente duplicado (mesmo slug DENTRO do nível) gera warning e a linha
 *   repetida é ignorada;
 * - associações: linha fonte → arestas sys→org "origina de" por origem
 *   listada; linha fonte-secundaria → fsec→sys "vem de" por fonte listada;
 *   alvo não cadastrado vira nó derivado do tipo alvo (sem fantasma). Arestas
 *   deduplicadas contra as já derivadas dos produtos.
 */
export function aplicarComponentes(
  componentes: ComponenteRow[],
  derivados: DerivedNode[],
  links: GraphLink[],
): { nodes: DerivedNode[]; links: GraphLink[]; warnings: string[] } {
  const warnings: string[] = []
  const porId = new Map(derivados.map((n) => [n.id, n]))
  const saida = [...links]
  const arestasVistas = new Set(links.map((l) => `${l.source}\u0000${l.target}\u0000${l.label}`))

  const addLink = (source: string, target: string, label: string): void => {
    const chave = `${source}\u0000${target}\u0000${label}`
    if (arestasVistas.has(chave)) return
    arestasVistas.add(chave)
    saida.push({ source, target, label })
  }

  const garantirNo = (nivel: NivelComponente, nome: string): DerivedNode => {
    const { prefixo, tipo } = COMPONENTE_SPEC[nivel]
    const id = `${prefixo}-${slugify(nome)}`
    let no = porId.get(id)
    if (no === undefined) {
      const display = tipo === 'dominio' ? (DOMINIO_DISPLAY[nome] ?? nome) : nome
      no = { id, nome: display, tipo, derivado: true, incompleto: false }
      porId.set(id, no)
    }
    return no
  }

  // Ordena por id (estável: entre duplicatas, a primeira linha do arquivo
  // vence), como nos produtos, para saída independente da ordem das linhas.
  const ordenados = [...componentes]
    .map((c) => ({ c, id: `${COMPONENTE_SPEC[c.nivel].prefixo}-${slugify(c.nome)}` }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const aceitos: { c: ComponenteRow; id: string }[] = []

  for (const item of ordenados) {
    if (aceitos.some((a) => a.id === item.id)) {
      warnings.push(
        `componente duplicado "${item.c.nome}" (id "${item.id}") — a linha repetida foi ignorada`,
      )
      continue
    }
    aceitos.push(item)
    const no = garantirNo(item.c.nivel, item.c.nome)
    no.cadastrado = true
    no.descricao = item.c.descricao
    no.owner = item.c.owner
    no.centroDeCusto = item.c.centroDeCusto
    if (item.c.corpo !== undefined) no.corpo = item.c.corpo
  }

  // Associações depois de todos os cadastros: o alvo pode ser outra linha
  // componente e deve fundir com ela, não criar um nó paralelo.
  for (const { c } of aceitos) {
    if (c.nivel === 'fonte') {
      const noSistema = garantirNo('fonte', c.nome)
      for (const nomeOrigem of c.associacoes) {
        addLink(noSistema.id, garantirNo('origem', nomeOrigem).id, 'origina de')
      }
    } else if (c.nivel === 'fonte-secundaria') {
      const noFsec = garantirNo('fonte-secundaria', c.nome)
      for (const nomeFonte of c.associacoes) {
        addLink(noFsec.id, garantirNo('fonte', nomeFonte).id, 'vem de')
      }
    }
  }

  return { nodes: [...porId.values()], links: saida, warnings }
}

/** Nível semântico de um nó derivado, para ordenar candidatos de referência
 *  (tipo "sistema" vive no nível built-in "fonte"). */
function slugNivelDoDerivado(no: DerivedNode): string {
  if (no.tipo === 'sistema') return 'fonte'
  if (no.tipo === 'nivel-custom') return no.nivelCustom ?? ''
  return no.tipo
}

/** Nós derivados como alvos de referência: sistemas, origens, domínios e
 *  tabelas UCS materializados dos campos dos produtos também podem ser
 *  citados em `associacoes`, mesmo sem linha própria no catálogo. */
export function alvosDeDerivados(derivados: readonly DerivedNode[]): AlvoRef[] {
  return derivados.map((n) => ({ id: n.id, nome: n.nome, nivel: slugNivelDoDerivado(n) }))
}

/** Linha de nível custom aceita no build, com o nó que ela materializou. */
export interface CustomAceito {
  row: ComponenteCustomRow
  node: DerivedNode
}

/**
 * Materializa as linhas de NÍVEL CUSTOM (nivel = slug de um nível do
 * niveis.csv) como nós `niv-<slugNivel>-<slugNome>` de tipo "nivel-custom".
 * Duplicada (mesmo slug DENTRO do nível) gera warning e é ignorada, como nos
 * demais componentes. Os campos de dado da linha (domínio, débito, status,
 * rota, fontes secundárias) entram no nó só quando preenchidos: a linha que
 * traz apenas nome/descrição continua sendo um componente simples.
 */
export function criarNosCustom(componentes: ComponenteCustomRow[]): {
  aceitos: CustomAceito[]
  warnings: string[]
} {
  const warnings: string[] = []
  // Ordena por id (estável: entre duplicatas, a primeira linha do arquivo
  // vence), como nos demais componentes, para saída independente da ordem.
  const ordenados = [...componentes]
    .map((c) => ({ c, id: `niv-${c.nivel}-${slugify(c.nome)}` }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const aceitos: CustomAceito[] = []
  const vistos = new Set<string>()

  for (const { c, id } of ordenados) {
    if (vistos.has(id)) {
      warnings.push(`componente duplicado "${c.nome}" (id "${id}") — a linha repetida foi ignorada`)
      continue
    }
    vistos.add(id)
    const node: DerivedNode = {
      id,
      nome: c.nome,
      tipo: 'nivel-custom',
      nivelCustom: c.nivel,
      derivado: true,
      incompleto: c.owner === null || c.centroDeCusto === null,
      cadastrado: true,
      descricao: c.descricao,
      owner: c.owner,
      centroDeCusto: c.centroDeCusto,
    }
    if (c.corpo !== undefined) node.corpo = c.corpo
    if (c.dominio !== '') node.dominio = c.dominio
    if (c.debito !== '') node.debito = c.debito
    if (c.status !== '') node.status = c.status
    if (c.sistema !== null) node.sistema = c.sistema
    if (c.origem !== null) node.origem = c.origem
    if (c.fontesSecundarias.length > 0) node.fontesSecundarias = c.fontesSecundarias
    aceitos.push({ row: c, node })
  }

  return { aceitos, warnings }
}

/**
 * Resolve a coluna `associacoes` das linhas de nível custom em arestas
 * custom → alvo, label "vem de" (deduplicadas):
 * - cada nome resolve por id ou nome (case/acento-insensitive) contra
 *   QUALQUER linha do catálogo — produto, componente ou outro nível custom —
 *   e contra os nós derivados dos campos dos produtos;
 * - nome ambíguo → warning e vence o do nível de menor ordem;
 * - inexistente → warning, SEM criar nó nem aresta (não dá para adivinhar o
 *   nível a que o nome pertenceria).
 */
export function aplicarAssociacoesCustom(
  aceitos: readonly { row: { nome: string; associacoes: string[] }; node: { id: string } }[],
  indice: IndiceAlvos,
  links: GraphLink[],
): { links: GraphLink[]; warnings: string[] } {
  const warnings: string[] = []
  const saida = [...links]
  const arestasVistas = new Set(links.map((l) => `${l.source} ${l.target} ${l.label}`))

  for (const { row, node } of aceitos) {
    for (const nomeAlvo of row.associacoes) {
      const { alvo, candidatos } = indice.resolver(nomeAlvo, node.id)
      if (alvo === null) {
        warnings.push(
          `"${row.nome}": associação "${nomeAlvo}" não corresponde a nenhum componente do mapa — ignorada (nenhum nó criado)`,
        )
        continue
      }
      if (candidatos.length > 1) {
        warnings.push(
          `"${row.nome}": associação "${nomeAlvo}" é ambígua (${candidatos.length} componentes) — usando "${alvo.nome}" (${alvo.nivel})`,
        )
      }
      const chave = `${node.id} ${alvo.id} vem de`
      if (arestasVistas.has(chave)) continue
      arestasVistas.add(chave)
      saida.push({ source: node.id, target: alvo.id, label: 'vem de' })
    }
  }

  return { links: saida, warnings }
}

function nodeFantasma(nomeAlvo: string): GraphNode {
  return {
    id: slugify(nomeAlvo) || nomeAlvo.toLowerCase(),
    nome: nomeAlvo,
    tipo: 'desconhecido',
    nivel: NIVEL_DEFAULT,
    dominio: 'A definir',
    debito: 'avaliar',
    owner: null,
    centroDeCusto: null,
    descricao: 'Nó fantasma: referenciado na coluna "consome", mas sem linha no catálogo.',
    sistema: 'desconhecido',
    origem: 'desconhecida',
    status: 'investigacao',
    incompleto: true,
    fantasma: true,
  }
}

/**
 * Nó-raiz do portfólio, criado automaticamente pelo build (não tem linha no
 * catalogo.csv). Agrega todos os dados de nivel final/ambos; owner e
 * centro de custo não se aplicam (nunca renderiza incompleto).
 */
export function criarRaiz(): GraphNode {
  return {
    id: 'atacado-dados',
    nome: 'Atacado — Dados',
    tipo: 'dominio',
    nivel: 'raiz',
    dominio: 'Atacado',
    debito: 'nao',
    owner: null,
    centroDeCusto: null,
    descricao: 'Portfólio de dados da Diretoria Comercial Atacado — ponto de entrada do mapa',
    sistema: null,
    origem: null,
    status: 'producao',
    incompleto: false,
    corpo:
      'Portfólio de dados da Diretoria Comercial Atacado — ponto de entrada do mapa. ' +
      'Agrega todos os produtos finais do catálogo, as visões consumidas diretamente pelas ' +
      'equipes comerciais e de gestão. Não é um dado em si: é o nó-raiz que organiza a ' +
      'navegação do portfólio.\n\n' +
      'Agrega [[Account|agrega]], [[Faturamento|agrega]], [[Segmentação e Encarteiramento|agrega]], ' +
      '[[Setorização|agrega]], [[Localização|agrega]], [[Evolução do Resultado|agrega]], ' +
      '[[Evolução do Resultado por produto|agrega]], [[RAR 12M|agrega]], [[Estoque (carteira)|agrega]], ' +
      '[[Resultado|agrega]], [[Endividamento de mercado|agrega]], [[Rating|agrega]] e ' +
      '[[Restritivos e tipos|agrega]].',
  }
}

/**
 * Monta o grafo a partir do texto do catalogo.csv.
 * - id = slug(nome) nos produtos e niv-<nivel>-<slug do nome> nas linhas de
 *   nível customizado; nome duplicado (mesmo id) vira warning e é ignorado;
 * - a raiz "Atacado — Dados" é criada automaticamente e agrega todos os
 *   dados de nivel final/ambos;
 * - a coluna "consome" (de produtos e de linhas de nível custom) resolve
 *   contra QUALQUER linha do catálogo, por nome ou id, sem distinguir caixa
 *   nem acentos; alvo inexistente vira warning + nó fantasma;
 * - linhas de componente (dominio/origem/fonte/fonte-secundaria) fundem com
 *   os nós derivados dos produtos ({@link aplicarComponentes}); linhas de
 *   nível custom viram nós "nivel-custom" ({@link criarNosCustom}) com a mesma
 *   rota (fonte/origem/fontes secundárias) de um produto;
 * - saída determinística (nodes por id, links por source/target/label).
 */
export function buildGraph(csv: string, niveisCustom: NivelDef[] = []): BuildResult {
  const { rows, componentes, componentesCustom, warnings } = parseCatalogo(csv, niveisCustom)

  const raiz = criarRaiz()
  const nodes: GraphNode[] = [raiz]
  const porId = new Map<string, GraphNode>([[raiz.id, raiz]])
  const aceitas: ParsedRow[] = []

  // Ordena por id (estável: entre duplicatas, a primeira linha do arquivo
  // vence) para que a saída não dependa da ordem das linhas no CSV.
  const ordenadas = [...rows].sort((a, b) => (a.node.id < b.node.id ? -1 : a.node.id > b.node.id ? 1 : 0))

  for (const p of ordenadas) {
    if (porId.has(p.node.id)) {
      warnings.push(`nome duplicado "${p.node.nome}" (id "${p.node.id}") — a linha repetida foi ignorada`)
      continue
    }
    nodes.push(p.node)
    porId.set(p.node.id, p.node)
    aceitas.push(p)
  }

  const custom = criarNosCustom(componentesCustom)
  warnings.push(...custom.warnings)
  const nosCustom = custom.aceitos.map((a) => a.node)

  // Índice de resolução de referências: raiz + produtos + linhas de nível
  // custom + componentes built-in (cujo id é previsível sem construir o nó).
  const indice = criarIndiceAlvos(niveisCustom, [
    { id: raiz.id, nome: raiz.nome, nivel: 'raiz' },
    ...aceitas.map((p) => ({ id: p.node.id, nome: p.node.nome, nivel: p.node.nivel })),
    ...custom.aceitos.map((a) => ({ id: a.node.id, nome: a.node.nome, nivel: a.row.nivel })),
    ...componentes.map((c) => ({
      id: `${COMPONENTE_SPEC[c.nivel].prefixo}-${slugify(c.nome)}`,
      nome: c.nome,
      nivel: c.nivel,
    })),
  ])

  const links: GraphLink[] = []
  const fantasmas = new Map<string, GraphNode>()

  // "consome" de produtos e de linhas de nível custom (componente built-in
  // ignora a coluna). Ordenado por id: warnings independem da ordem do CSV.
  const consumidores = [
    ...aceitas.map((p) => ({ id: p.node.id, nome: p.node.nome, consome: p.consome })),
    ...custom.aceitos.map((a) => ({ id: a.node.id, nome: a.node.nome, consome: a.row.consome })),
  ].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  for (const consumidor of consumidores) {
    for (const nomeAlvo of consumidor.consome) {
      const { alvo, candidatos } = indice.resolver(nomeAlvo)
      if (alvo === null) {
        const chave = chaveNome(nomeAlvo)
        let fantasma = fantasmas.get(chave)
        if (fantasma === undefined) {
          fantasma = nodeFantasma(nomeAlvo)
          fantasmas.set(chave, fantasma)
          warnings.push(
            `consome quebrado: "${nomeAlvo}" em "${consumidor.nome}" não corresponde a nenhuma linha do catálogo — criado nó fantasma "${fantasma.id}"`,
          )
        }
        links.push({ source: consumidor.id, target: fantasma.id, label: 'consome' })
        continue
      }
      if (candidatos.length > 1) {
        warnings.push(
          `"${consumidor.nome}": consome "${nomeAlvo}", nome de ${candidatos.length} linhas do catálogo — usando "${alvo.nome}" (${alvo.nivel})`,
        )
      }
      links.push({ source: consumidor.id, target: alvo.id, label: 'consome' })
    }
  }

  // A raiz agrega automaticamente todos os produtos finais do catálogo.
  for (const n of nodes) {
    if (n.nivel === 'final' || n.nivel === 'ambos') {
      links.push({ source: raiz.id, target: n.id, label: 'agrega' })
    }
  }

  const dominios = derivarDominios([...nodes, ...fantasmas.values()], links)
  // Nome de fonte secundária que já é linha do catálogo aponta para a linha —
  // é o que mantém a rota intacta quando uma tabela UCS muda de nível.
  const derivados = derivarSistemasOrigens(
    [...nodes, ...nosCustom],
    (nome) => indice.resolver(nome).alvo?.id ?? null,
  )
  const comps = aplicarComponentes(
    componentes,
    [...dominios.nodes, ...derivados.nodes],
    [...dominios.links, ...derivados.links],
  )
  warnings.push(...comps.warnings)
  // Sistemas/origens/domínios derivados dos campos dos produtos também são
  // alvos válidos de associação, mesmo sem linha própria no catálogo.
  indice.adicionar(alvosDeDerivados(comps.nodes))
  // A coluna `associacoes` vale em qualquer nível (o formulário a oferece em
  // todos): além das linhas de nível custom, as de produto que a preencherem.
  const assocProdutos = aceitas
    .filter((p) => p.associacoes.length > 0)
    .map((p) => ({ row: { nome: p.node.nome, associacoes: p.associacoes }, node: p.node }))
  const assoc = aplicarAssociacoesCustom(
    [...custom.aceitos, ...assocProdutos],
    indice,
    comps.links,
  )
  warnings.push(...assoc.warnings)
  const todosNodes: AnyNode[] = [...nodes, ...fantasmas.values(), ...comps.nodes, ...nosCustom]
  const todosLinks = assoc.links

  todosNodes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  todosLinks.sort((a, b) => {
    const ka = `${a.source}\u0000${a.target}\u0000${a.label}`
    const kb = `${b.source}\u0000${b.target}\u0000${b.label}`
    return ka < kb ? -1 : ka > kb ? 1 : 0
  })

  return { graph: { niveis: montarNiveis(niveisCustom), nodes: todosNodes, links: todosLinks }, warnings }
}
