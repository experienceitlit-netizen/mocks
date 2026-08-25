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
 *  dominio/origem/fonte/fonte-secundaria). Componente cadastrado cujo slug
 *  coincide com um nó derivado do mesmo tipo FUNDE com ele (mesmo id), ganha
 *  `cadastrado: true` e carrega os campos da linha. */
export interface DerivedNode {
  id: string
  nome: string
  tipo: 'sistema' | 'origem' | 'dominio' | 'fonte-secundaria'
  derivado: true
  incompleto: false
  fantasma?: undefined
  /** true quando o componente tem linha própria no catalogo.csv; os quatro
   *  campos seguintes só existem em nós cadastrados (corpo só se não vazio). */
  cadastrado?: true
  descricao?: string
  owner?: string | null
  centroDeCusto?: string | null
  corpo?: string
}

export type AnyNode = GraphNode | DerivedNode

export interface GraphLink {
  source: string
  target: string
  label: string
}

export interface Graph {
  nodes: AnyNode[]
  links: GraphLink[]
}

export interface ParsedRow {
  node: GraphNode
  /** nomes (ou ids) da coluna "consome", ainda não resolvidos */
  consome: string[]
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

export interface CatalogoParseResult {
  rows: ParsedRow[]
  componentes: ComponenteRow[]
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
 *    vira lista " | " de 0..n fontes associadas (string "A | B"). */
export interface CatalogoRow {
  nome: string
  nivel: Nivel
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
}

/** Colunas do catalogo.csv, na ordem canônica do cabeçalho. */
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
] as const

type Coluna = (typeof COLUNAS)[number]

const NIVEIS_PRODUTO = new Set<string>(['primario', 'final', 'ambos'])
const NIVEIS_COMPONENTE = new Set<string>(['dominio', 'origem', 'fonte', 'fonte-secundaria'])
const NIVEL_DEFAULT = 'primario'
const NIVEIS_MSG = 'use dominio, origem, fonte, fonte-secundaria, primario, final ou ambos'
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
 * linha por dado ou por componente (nivel dominio/origem/fonte/fonte-secundaria).
 * Warnings legíveis para coluna faltando/desconhecida, linha sem nome e nivel
 * inválido; "linha N" conta o cabeçalho como linha 1.
 */
export function parseCatalogo(texto: string): CatalogoParseResult {
  const warnings: string[] = []
  const registros = parseCsv(texto)
  if (registros.length === 0) {
    warnings.push('catalogo.csv: arquivo vazio — nenhum dado no catálogo')
    return { rows: [], componentes: [], warnings }
  }

  const cabecalho = registros[0].map((c) => c.trim())
  const indice = new Map<string, number>(cabecalho.map((c, i) => [c, i]))
  for (const col of COLUNAS) {
    if (!indice.has(col)) warnings.push(`catalogo.csv: coluna obrigatória "${col}" ausente do cabeçalho`)
  }
  for (const col of cabecalho) {
    if (!(COLUNAS as readonly string[]).includes(col)) {
      warnings.push(`catalogo.csv: coluna desconhecida "${col}" ignorada`)
    }
  }

  const rows: ParsedRow[] = []
  const componentes: ComponenteRow[] = []
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
    if (!NIVEIS_PRODUTO.has(nivel)) {
      warnings.push(
        `catalogo.csv linha ${linha} ("${nome}"): nivel "${nivel}" inválido` +
          ` (${NIVEIS_MSG}) — assumindo "${NIVEL_DEFAULT}"`,
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

    rows.push({ node, consome: splitLista(celula('consome')) })
  }

  return { rows, componentes, warnings }
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
 * de componente a coluna debito é ignorada e sai canonizada para "" (o form
 * envia o default "avaliar" nelas — não vira ruído no arquivo).
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
      debito: NIVEIS_COMPONENTE.has(nivel) ? '' : row.debito,
      status: row.status,
      owner: row.owner ?? '',
      centro_de_custo: row.centro_de_custo ?? '',
      observacoes: row.observacoes,
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
 * produtos, debito fora de sim/nao/avaliar (em componentes a coluna é
 * ignorada). Warnings (não impedem): "consome" de produto que não resolve por
 * nome nem id de nenhuma linha de produto — o build criará um nó fantasma,
 * como hoje. "linha N" conta o cabeçalho do CSV como linha 1.
 */
export function validarCatalogo(rows: CatalogoRow[]): ValidacaoCatalogo {
  const errors: string[] = []
  const warnings: string[] = []
  const raiz = criarRaiz()
  const porChave = new Map<string, { nome: string; linha: number }>()

  const ehComponente = (row: CatalogoRow): boolean => NIVEIS_COMPONENTE.has(normalizarNivel(row.nivel))

  rows.forEach((row, i) => {
    const linha = i + 2
    const nome = row.nome.trim()
    if (nome === '') {
      errors.push(`linha ${linha}: "nome" é obrigatório`)
      return
    }
    const nivel = normalizarNivel(row.nivel)
    const componente = NIVEIS_COMPONENTE.has(nivel)
    const slug = slugify(nome)
    if (!componente && slug === raiz.id) {
      errors.push(`linha ${linha} ("${nome}"): nome reservado ao nó-raiz "${raiz.nome}"`)
    } else {
      // produtos dividem um namespace global; componentes, um por nível.
      const chave = componente ? `${nivel} ${slug}` : slug
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
      errors.push(`linha ${linha} ("${nome}"): nivel "${row.nivel}" inválido (${NIVEIS_MSG})`)
    }
    if (!componente && !DEBITOS_VALIDOS.has(row.debito)) {
      errors.push(`linha ${linha} ("${nome}"): debito "${row.debito}" inválido (use sim, nao ou avaliar)`)
    }
  })

  // "consome" (só de produtos) resolve como no build: por nome OU id, case-insensitive.
  const conhecidos = new Set<string>([raiz.id, raiz.nome.toLowerCase()])
  for (const row of rows) {
    const nome = row.nome.trim()
    if (nome !== '' && !ehComponente(row)) {
      conhecidos.add(nome.toLowerCase())
      conhecidos.add(slugify(nome))
    }
  }
  for (const row of rows) {
    if (ehComponente(row)) continue
    for (const alvo of row.consome) {
      if (!conhecidos.has(alvo.trim().toLowerCase())) {
        warnings.push(`"${row.nome}": consome "${alvo}", que não existe no catálogo — o build criará um nó fantasma`)
      }
    }
  }

  return { errors, warnings }
}

/** Valores de sistema/origem que significam "ainda não sabemos" — não viram nó. */
const VALORES_DESCONHECIDOS = new Set(['', 'a confirmar', 'a identificar', 'a detalhar'])

function valorConhecido(valor: string | null | undefined): string | null {
  if (valor === null || valor === undefined) return null
  const texto = valor.trim()
  return VALORES_DESCONHECIDOS.has(texto.toLowerCase()) ? null : texto
}

/**
 * Materializa `fonte_sistema`, `origem` e `fontes_secundarias` dos dados como
 * nós derivados, criando a linhagem dado → [fonte secundária →] sistema → origem:
 * - dedup por chave normalizada (trim + lowercase) do texto original;
 * - valores desconhecidos ("a confirmar" etc.) não geram nó nem aresta;
 * - sistema desconhecido com origem conhecida liga dado → origem direto;
 * - `fontes_secundarias` (tabelas UCS) SUBSTITUI a aresta direta dado→sistema
 *   por dado→fsec ("vem de") + fsec→sistema ("vem de"); com sistema
 *   desconhecido, fsec→origem direto ("origina de").
 */
export function derivarSistemasOrigens(dados: GraphNode[]): { nodes: DerivedNode[]; links: GraphLink[] } {
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
    const fsecs = (dado.fontesSecundarias ?? []).map((nome) =>
      noDerivado(fontesSecundarias, 'fsec', 'fonte-secundaria', nome.trim()),
    )
    // O dado que declara ingestão via UCS não liga direto na fonte: a rota
    // passa pelas tabelas UCS (o débito técnico da fonte permanece no dado).
    const cabecas = fsecs.length > 0 ? fsecs.map((f) => f.id) : [dado.id]
    for (const f of fsecs) addLink(dado.id, f.id, 'vem de')
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
  const arestasVistas = new Set(links.map((l) => `${l.source} ${l.target} ${l.label}`))

  const addLink = (source: string, target: string, label: string): void => {
    const chave = `${source} ${target} ${label}`
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
 * - id = slug(nome); nome duplicado (mesmo slug) vira warning e é ignorado;
 * - a raiz "Atacado — Dados" é criada automaticamente e agrega todos os
 *   dados de nivel final/ambos;
 * - a coluna "consome" resolve por nome OU id, case-insensitive; alvo
 *   inexistente vira warning + nó fantasma;
 * - linhas de componente (dominio/origem/fonte/fonte-secundaria) fundem com
 *   os nós derivados dos produtos ({@link aplicarComponentes});
 * - saída determinística (nodes por id, links por source/target/label).
 */
export function buildGraph(csv: string): BuildResult {
  const { rows, componentes, warnings } = parseCatalogo(csv)

  const raiz = criarRaiz()
  const nodes: GraphNode[] = [raiz]
  const porId = new Map<string, GraphNode>([[raiz.id, raiz]])
  const porNome = new Map<string, GraphNode>([[raiz.nome.toLowerCase(), raiz]])
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
    porNome.set(p.node.nome.toLowerCase(), p.node)
    aceitas.push(p)
  }

  const links: GraphLink[] = []
  const fantasmas = new Map<string, GraphNode>()

  for (const p of aceitas) {
    for (const nomeAlvo of p.consome) {
      const chave = nomeAlvo.toLowerCase()
      let alvo = porId.get(chave) ?? porNome.get(chave)
      if (alvo === undefined) {
        alvo = fantasmas.get(chave)
        if (alvo === undefined) {
          alvo = nodeFantasma(nomeAlvo)
          fantasmas.set(chave, alvo)
          warnings.push(
            `consome quebrado: "${nomeAlvo}" em "${p.node.nome}" não corresponde a nenhuma linha do catálogo — criado nó fantasma "${alvo.id}"`,
          )
        }
      }
      links.push({ source: p.node.id, target: alvo.id, label: 'consome' })
    }
  }

  // A raiz agrega automaticamente todos os produtos finais do catálogo.
  for (const n of nodes) {
    if (n.nivel === 'final' || n.nivel === 'ambos') {
      links.push({ source: raiz.id, target: n.id, label: 'agrega' })
    }
  }

  const dominios = derivarDominios([...nodes, ...fantasmas.values()], links)
  const derivados = derivarSistemasOrigens(nodes)
  const comps = aplicarComponentes(
    componentes,
    [...dominios.nodes, ...derivados.nodes],
    [...dominios.links, ...derivados.links],
  )
  warnings.push(...comps.warnings)
  const todosNodes: AnyNode[] = [...nodes, ...fantasmas.values(), ...comps.nodes]
  const todosLinks = comps.links

  todosNodes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  todosLinks.sort((a, b) => {
    const ka = `${a.source}\u0000${a.target}\u0000${a.label}`
    const kb = `${b.source}\u0000${b.target}\u0000${b.label}`
    return ka < kb ? -1 : ka > kb ? 1 : 0
  })

  return { graph: { nodes: todosNodes, links: todosLinks }, warnings }
}
