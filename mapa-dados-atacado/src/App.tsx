import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import graphJson from './data/graph.json'
import Graph from './components/Graph'
import type { GraphHandle } from './components/Graph'
import NodeBalloon from './components/NodeBalloon'
import type { BalloonAnchor } from './components/NodeBalloon'
import type { Ligacao } from './components/ligacoes-por-verbo'
import { agruparLigacoesPorVerbo } from './components/ligacoes-por-verbo'
import SearchBox from './components/SearchBox'
import Filters from './components/Filters'
import FocusBar from './components/FocusBar'
import type { Vista } from './components/FocusBar'
import Legend from './components/Legend'
import PainelRecolhivel from './components/PainelRecolhivel'
import TableView from './components/TableView'
import type { Counts } from './components/Filters'
import type {
  Debito,
  GraphJson,
  GraphNodeData,
  NivelDef,
  SimLink,
  SimNode,
  VerboDef,
} from './components/graph-types'
import {
  debitoDe,
  derivarNiveis,
  ehProdutoDeDados,
  isReal,
  linkEndId,
  linkLabel,
  nivelDe,
  tituloDoVerbo,
} from './components/graph-types'
import type { Alcance } from './components/lineage'
import { ALCANCE_INICIAL, buildLineage, buildLineageTree, ehAlcance } from './components/lineage'
import { comVerboAlternado } from './components/arestas-visiveis'
import { grausPorId } from './components/node-size'
import CatalogForm from './components/CatalogForm'
import type { FormTarget } from './components/CatalogForm'
import NiveisModal from './components/NiveisModal'
import VerbosModal from './components/VerbosModal'
import { VERBOS_PADRAO } from './components/graph-build'
import DeleteConfirm from './components/DeleteConfirm'
import type { Referencia } from './components/catalog-delete'
import { removerComponente } from './components/catalog-delete'
import type { AlvoExclusao } from './components/delete-shortcut'
import { alvoDoAtalho, ehCampoDeTexto, ehTeclaExcluir } from './components/delete-shortcut'
import type { CatalogoRow, NivelApiRow } from './components/catalog-api'
import { comFator, podadas } from './components/node-resize'
import { aplicarLarguras, comFatorDaFaixa, podadasPorSlug } from './components/band-resize'
import type { ArrasteDeFaixa } from './components/band-move'
import {
  aplicarDeslocamentos,
  basesVerticais,
  comArraste,
  comDeslocamento,
  niveisReordenados,
  ordemAtualizada,
  ordemMesclada,
  ordemRestaurada,
  reordenarColunas,
} from './components/band-move'
import FonteBar from './components/FonteBar'
import { useFonteCatalogo } from './components/useFonteCatalogo'
import './App.css'

/** Busca insensível a caixa e acentos. */
function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/** Grafo de partida: o src/data/graph.json que o build gerou. No modo de
 *  edição em arquivo local (pacote HTML sem servidor) ele é substituído pelo
 *  grafo que o próprio navegador monta a partir dos CSVs abertos — ver
 *  components/catalog-store-local.ts. */
const GRAPH_INICIAL = graphJson as GraphJson

/** Níveis da cadeia ordenados por `ordem` (colunas da vista Níveis, chips de
 *  filtro, select do formulário). graph.json sem o bloco (build antigo) tem os
 *  níveis derivados dos próprios componentes. */
function niveisDoGrafo(graph: GraphJson): NivelDef[] {
  return graph.niveis !== undefined && graph.niveis.length > 0
    ? [...graph.niveis].sort((a, b) => a.ordem - b.ordem)
    : derivarNiveis(graph.nodes)
}

/** Vocabulário das relações na ordem do arquivo (o `<select>` de verbo de cada
 *  chip do formulário e a tela "⇢ Verbos"). graph.json sem o bloco `verbos`
 *  (build antigo) cai nos embutidos — e NADA é derivado das arestas: o
 *  vocabulário é dado declarado, não a lista do que está em uso. */
function verbosDoGrafo(graph: GraphJson): VerboDef[] {
  return graph.verbos !== undefined && graph.verbos.length > 0
    ? [...graph.verbos]
    : [...VERBOS_PADRAO]
}

function readUrlSelection(): string | null {
  return new URLSearchParams(window.location.search).get('no')
}

function readUrlFocus(): string | null {
  return new URLSearchParams(window.location.search).get('foco')
}

/** Caminho de foco na carga: só o ?foco= explícito. URL sem parâmetros abre o
 *  mapa completo, SEM foco.
 *
 *  O app já abriu "focado no componente de entrada" — mas era um foco de
 *  fachada, porque buildLineage tratava esse caso como inventário. A barra
 *  anunciava um foco que não estava valendo, e focar num componente da primeira
 *  coluna não isolava nada. Sem foco é o mesmo mapa na tela, dito com
 *  honestidade. */
function readInitialFocusPath(): string[] {
  const foco = readUrlFocus()
  return foco ? [foco] : []
}

function readUrlDepth(): number {
  const raw = Number(new URLSearchParams(window.location.search).get('prof'))
  return Number.isInteger(raw) && raw >= 1 && raw <= 3 ? raw : 1
}

/** ?vista=niveis|forca; ausente (links antigos com ?foco=) = níveis. */
function readUrlVista(): Vista {
  return new URLSearchParams(window.location.search).get('vista') === 'forca' ? 'forca' : 'niveis'
}

/** ?alcance=montante|vizinhos|ambos — o quanto do entorno o foco traz na vista
 *  Níveis. Ausente (link antigo com ?foco=) ou valor desconhecido = o padrão da
 *  tela, "+ vizinhos diretos". */
function readUrlAlcance(): Alcance {
  const bruto = new URLSearchParams(window.location.search).get('alcance')
  return ehAlcance(bruto) ? bruto : ALCANCE_INICIAL
}

type Aba = 'mapa' | 'tabela'

/** ?aba=tabela; ausente ou qualquer outro valor = mapa. */
function readUrlAba(): Aba {
  return new URLSearchParams(window.location.search).get('aba') === 'tabela' ? 'tabela' : 'mapa'
}

function toggled<T>(set: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(set)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

/** Janela entre dois cliques no mesmo nó para contar como duplo clique. */
const DBLCLICK_MS = 350

/** Exclusão pedida pelo teclado e ainda não confirmada. Guarda o que a
 *  pergunta mostra (as menções que saem junto) e o erro da última tentativa de
 *  gravar — tudo morre junto quando a pergunta é cancelada. */
interface PedidoExclusao extends AlvoExclusao {
  referencias: Referencia[]
  erro: string | null
}

function App() {
  // Grafo montado no cliente (modo arquivo local); null = usar o graph.json
  // importado. Ele NÃO é o estado inicial de um useState de propósito: no dev
  // server o graph.json novo chega por HMR re-executando este módulo, e um
  // estado inicializado uma vez só congelaria o mapa no que foi carregado no
  // mount. Lido assim, o comportamento no dev server é o de sempre.
  const [grafoLocal, setGrafoLocal] = useState<GraphJson | null>(null)
  const graph = grafoLocal ?? GRAPH_INICIAL
  const { nodes, links } = graph
  const niveis = useMemo(() => niveisDoGrafo(graph), [graph])
  const verbos = useMemo(() => verbosDoGrafo(graph), [graph])

  // A lib de força muta os objetos (injeta x/y) — clona uma única vez.
  const simData = useMemo<{ nodes: SimNode[]; links: SimLink[] }>(
    () => ({
      nodes: nodes.map((n) => ({ ...n })),
      links: links.map((l) => ({ ...l })),
    }),
    [nodes, links],
  )

  const nodesById = useMemo(() => {
    const map = new Map<string, GraphNodeData>()
    for (const n of nodes) map.set(n.id, n)
    return map
  }, [nodes])

  const idByName = useMemo(() => {
    const map = new Map<string, string>()
    for (const n of nodes) {
      map.set(norm(n.id), n.id)
      map.set(norm(n.nome), n.id)
    }
    return map
  }, [nodes])

  // O MESMO cálculo que a vista em níveis faz para se espaçar (node-size.ts):
  // o raio com que a coluna abre espaço é o raio com que o canvas desenha.
  const degreeById = useMemo(() => grausPorId(nodes, links), [nodes, links])

  const neighborsById = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const l of links) {
      if (!map.has(l.source)) map.set(l.source, new Set())
      if (!map.has(l.target)) map.set(l.target, new Set())
      map.get(l.source)?.add(l.target)
      map.get(l.target)?.add(l.source)
    }
    return map
  }, [links])

  // Contadores sobre TODO componente real (fantasmas ficam fora: não têm linha
  // no catálogo, logo não têm governança a cobrar).
  const counts = useMemo<Counts>(() => {
    const reais = nodes.filter(isReal)
    return {
      total: reais.length,
      comDebito: reais.filter((n) => n.debito === 'sim').length,
      semOwner: reais.filter((n) => !n.owner).length,
    }
  }, [nodes])

  const dominios = useMemo(
    () =>
      [...new Set(nodes.filter((n) => isReal(n) && n.dominio).map((n) => n.dominio ?? ''))].sort(
        (a, b) => a.localeCompare(b, 'pt-BR'),
      ),
    [nodes],
  )

  /** Título de um nível pelo slug (chip do balão). */
  const nivelTituloDe = useCallback(
    (slug: string) => niveis.find((nv) => nv.slug === slug)?.titulo ?? slug,
    [niveis],
  )

  /** Título de um verbo pelo rótulo da aresta (listas e árvore do balão).
   *  Espelha o nivelTituloDe; verbo fora do vocabulário mostra o próprio slug,
   *  que é o que {@link tituloDoVerbo} devolve. */
  const verboTituloDe = useCallback(
    (label: string) => tituloDoVerbo(verbos, label),
    [verbos],
  )

  // --- estado de UI ---
  // Aba ativa: o mapa (grafo) continua montado sob a tabela, preservando
  // pan/zoom, foco e filtros ao alternar.
  const [aba, setAba] = useState<Aba>(readUrlAba)
  const [selectedId, setSelectedId] = useState<string | null>(readUrlSelection)
  const [hoverId, setHoverId] = useState<string | null>(null)
  // "Hover fixado" pelo clique esquerdo: destaque persistente de nó+vizinhos
  // (cadeia inteira na vista Níveis), sem balão e sem URL. Estado efêmero.
  const [pinnedId, setPinnedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [selDominios, setSelDominios] = useState<ReadonlySet<string>>(new Set())
  const [selDebitos, setSelDebitos] = useState<ReadonlySet<Debito>>(new Set())
  const [selNiveis, setSelNiveis] = useState<ReadonlySet<string>>(new Set())
  const [somenteSemOwner, setSomenteSemOwner] = useState(false)
  const [somenteProdutos, setSomenteProdutos] = useState(false)

  const [focusPath, setFocusPath] = useState<string[]>(readInitialFocusPath)
  const [depth, setDepth] = useState<number>(readUrlDepth)
  const [vista, setVista] = useState<Vista>(readUrlVista)
  /** Quanto do entorno o foco traz na vista Níveis (ver Alcance em lineage.ts).
   *  Mora na URL junto de ?foco= e ?vista=: o link tem de reproduzir o que está
   *  na tela, e o alcance muda o mapa inteiro. */
  const [alcance, setAlcance] = useState<Alcance>(readUrlAlcance)
  // Faixas de nível (retângulos + títulos + chevrons) da vista Níveis.
  const [bandsOn, setBandsOn] = useState(true)
  /** "Mostrar ligações": desligado, o grafo fica só com os nós — as arestas
   *  do nó em destaque (hover, clique fixado ou balão) continuam visíveis. */
  const [ligacoesOn, setLigacoesOn] = useState(true)
  /** Verbos com o chip apagado na barra de foco: as arestas deles somem do
   *  mapa (os nós ficam). Guarda os OCULTOS, e não os visíveis, para que verbo
   *  cadastrado depois já nasça aceso — ver arestas-visiveis.ts. Estado de
   *  SESSÃO, como o "Mostrar ligações" de que ele é o irmão fino: não vai para
   *  a URL nem para o CSV. */
  const [verbosOcultos, setVerbosOcultos] = useState<ReadonlySet<string>>(() => new Set())

  // Tamanho ajustado à mão, arrastando a borda do nó (ver node-resize.ts).
  // Estado de SESSÃO e nada além disso: não vai para o CSV, nem para a URL, nem
  // para localStorage — o mapa sempre ABRE no tamanho que os dados calculam
  // (grau + bandeira de produto), e um F5 desfaz todos os ajustes de uma vez.
  // O que o usuário pediu é uma lente de conversa ("deixa esse aí maior enquanto
  // eu explico"), não um atributo do componente.
  const [escalas, setEscalas] = useState<ReadonlyMap<string, number>>(() => new Map())
  const alterarEscala = useCallback((id: string, fator: number) => {
    setEscalas((prev) => comFator(prev, id, fator))
  }, [])

  // Largura das FAIXAS de nível, arrastando a borda direita delas — mesma
  // natureza de sessão do tamanho dos nós (ver band-resize.ts). Note que a
  // largura vale mesmo com "Mostrar níveis" desligado: ela é uma propriedade do
  // LAYOUT das colunas, e a faixa é só o desenho que a mostra.
  const [larguras, setLarguras] = useState<ReadonlyMap<string, number>>(() => new Map())
  const alterarLargura = useCallback((slug: string, fator: number) => {
    setLarguras((prev) => comFatorDaFaixa(prev, slug, fator))
  }, [])

  // Faixas MOVIDAS pelo cabeçalho (ver band-move.ts), na mesma natureza de
  // sessão do tamanho e da largura. São dois estados porque os dois eixos do
  // gesto querem dizer coisas diferentes: a ORDEM é a sequência das colunas
  // (o eixo com fluxo) e o DESLOCAMENTO é um offset vertical por nível.
  //
  // A ordem guarda a sequência COMPLETA dos níveis, e não só a das colunas na
  // tela: entrar em foco esconde colunas, e uma ordem que só conhecesse o
  // visível perderia metade do arranjo no caminho. null = a ordem do catálogo,
  // e é esse null que faz o botão de aplicar aparecer só quando há o que gravar.
  const [ordemSessao, setOrdemSessao] = useState<readonly string[] | null>(null)
  const [deslocamentos, setDeslocamentos] = useState<ReadonlyMap<string, number>>(() => new Map())
  // Empurrão horizontal da faixa sob a mão, enquanto o gesto corre. NÃO é
  // layout: é o que a mantém colada ao cursor depois de as outras já terem se
  // acomodado, e é descartado no soltar (ver ArrasteDeFaixa).
  const [arrasteFaixa, setArrasteFaixa] = useState<ArrasteDeFaixa | null>(null)

  /** Ordem SALVA dos níveis (a do niveis.csv): a régua contra a qual a ordem de
   *  sessão se mede — e contra a qual ela desaparece quando as duas coincidem. */
  const slugsSalvos = useMemo(
    () => [...niveis].sort((a, b) => a.ordem - b.ordem).map((nv) => nv.slug),
    [niveis],
  )

  const alterarOrdemFaixas = useCallback(
    // O gesto só conhece as colunas na tela; a sequência inteira dos níveis
    // recebe essa reordenação nas posições correspondentes (ver ordemMesclada).
    (ordemDasColunas: readonly string[]) => {
      setOrdemSessao((prev) => ordemMesclada(prev ?? slugsSalvos, ordemDasColunas))
    },
    [slugsSalvos],
  )
  const alterarDeslocamento = useCallback((slug: string, dy: number) => {
    setDeslocamentos((prev) => comDeslocamento(prev, slug, dy))
  }, [])
  const alterarArrasteFaixa = useCallback((arraste: ArrasteDeFaixa | null) => {
    setArrasteFaixa((prev) => comArraste(prev, arraste))
  }, [])
  /** Duplo clique no cabeçalho: esta faixa volta ao lugar — no deslocamento
   *  vertical e na ordem. O irmão do duplo clique na borda, que restaura o
   *  tamanho. */
  const restaurarFaixa = useCallback(
    (slug: string) => {
      setDeslocamentos((prev) => comDeslocamento(prev, slug, 0))
      setOrdemSessao((prev) => (prev === null ? null : ordemRestaurada(slugsSalvos, prev, slug)))
    },
    [slugsSalvos],
  )

  /** Quantos ajustes de layout estão de pé (tamanhos de nó, larguras de coluna,
   *  faixas deslocadas e a ordem de sessão, que conta como um): é o que a
   *  legenda mostra e o que o botão de restaurar desfaz, de uma vez só. */
  const ajustes =
    escalas.size + larguras.size + deslocamentos.size + (ordemSessao === null ? 0 : 1)
  const restaurarLayout = useCallback(() => {
    setEscalas((prev) => (prev.size === 0 ? prev : new Map()))
    setLarguras((prev) => (prev.size === 0 ? prev : new Map()))
    setDeslocamentos((prev) => (prev.size === 0 ? prev : new Map()))
    setOrdemSessao(null)
    setArrasteFaixa(null)
  }, [])

  const focusId = focusPath.length > 0 ? focusPath[focusPath.length - 1] : null

  // --- modo edição ---
  // Quem persiste é o store escolhido no mount (ver useFonteCatalogo): a API do
  // dev server, uma pasta local aberta pelo usuário ou nada. Sem store, o app
  // fica somente leitura e nenhum controle de edição aparece — exatamente o que
  // acontecia no build estático antes de existir o modo arquivo.
  const fonte = useFonteCatalogo()
  const store = fonte.store
  const [catalogRows, setCatalogRows] = useState<CatalogoRow[] | null>(null)
  // null = fechado; FormTarget = cadastro em branco, edição de linha ou
  // cadastro pré-preenchido de um componente ainda sem linha.
  const [catalogForm, setCatalogForm] = useState<FormTarget | null>(null)
  // Modal "≣ Níveis" (gerenciar níveis; só em modo edição).
  const [niveisOpen, setNiveisOpen] = useState(false)
  // Modal "⇢ Verbos" (vocabulário das relações; só em modo edição).
  const [verbosOpen, setVerbosOpen] = useState(false)
  useEffect(() => {
    if (store === null) {
      setCatalogRows(null)
      return
    }
    let alive = true
    void store.lerCatalogo().then((rows) => {
      if (alive) setCatalogRows(rows)
    })
    return () => {
      alive = false
    }
  }, [store])

  // Catálogo aberto de um arquivo local: o grafo passa a ser o que o próprio
  // navegador montou a partir dos CSVs, e a navegação recomeça do zero — os ids
  // do catálogo novo não têm relação com os do graph.json embutido, então um
  // foco herdado apontaria para um nó que não existe mais.
  useEffect(() => {
    const novo = store?.grafo() ?? null
    if (novo === null) return
    setGrafoLocal(novo)
    setFocusPath([])
    setSelectedId(null)
    setPinnedId(null)
  }, [store])

  // Save confirmado pelo form: re-busca as rows. Um save NÃO recarrega a
  // página (no dev server o graph.json novo chega por HMR preservando o estado
  // dos hooks); sem o re-fetch, o próximo cadastro partiria da lista do mount e
  // apagaria o anterior do CSV. No modo arquivo local não há HMR: o grafo novo
  // é o que o próprio save acabou de montar.
  const refreshCatalogo = useCallback(() => {
    if (store === null) return
    void store.lerCatalogo().then((rows) => {
      if (rows) setCatalogRows(rows)
    })
    const novo = store.grafo()
    if (novo !== null) setGrafoLocal(novo)
  }, [store])

  // --- aplicar a ordem das faixas ---
  // A ordem arrastada é de sessão, e é isso que a torna útil para explorar. Mas
  // quando a disposição nova é a boa — o caso real é demonstrá-la numa reunião
  // e o pessoal aprovar —, ela precisa virar a ordem de verdade. É o MESMO
  // caminho do modal de níveis: a lista completa vai pelo store, o backend
  // grava o niveis.csv e regenera o grafo; aqui só a coluna `ordem` muda, e ela
  // muda por permutação (ver niveisReordenados), preservando a numeração que o
  // usuário escreveu.
  const [salvandoOrdem, setSalvandoOrdem] = useState(false)
  const [ordemMsg, setOrdemMsg] = useState<string | null>(null)
  const ordemMsgTimer = useRef(0)
  useEffect(() => () => window.clearTimeout(ordemMsgTimer.current), [])

  const aplicarOrdemDasFaixas = useCallback(async () => {
    if (store === null || ordemSessao === null || salvandoOrdem) return
    setSalvandoOrdem(true)
    setOrdemMsg(null)
    try {
      // Base FRESCA dos níveis, como o modal e a exclusão fazem: um save
      // anterior nesta sessão não recarrega a página.
      const atuais = await store.lerNiveis()
      if (atuais === null) {
        setOrdemMsg('Não foi possível ler os níveis para gravar a ordem.')
        return
      }
      // Payload com a mesma regra do modal: o slug preserva a identidade do
      // nível e cor vazia não vai (é assim que o backend entende "padrão").
      const rows: NivelApiRow[] = niveisReordenados(
        atuais.map((r) => ({ ...r, slug: r.slug ?? '' })),
        ordemSessao,
      ).map((r) => {
        const row: NivelApiRow = { titulo: r.titulo, ordem: r.ordem }
        if (r.slug !== '') row.slug = r.slug
        if (r.corFundo) row.corFundo = r.corFundo
        if (r.corBorda) row.corBorda = r.corBorda
        return row
      })
      const res = await store.salvarNiveis(rows)
      if (res.ok) {
        // A ordem de sessão NÃO é limpa aqui: ela some sozinha quando o grafo
        // novo chega e passa a dizer a mesma coisa (ver o efeito sobre
        // slugsSalvos). Limpar à mão faria as faixas piscarem na ordem antiga
        // no intervalo entre o save e o HMR.
        refreshCatalogo()
        setOrdemMsg('✓ Ordem das faixas salva no niveis.csv.')
        window.clearTimeout(ordemMsgTimer.current)
        ordemMsgTimer.current = window.setTimeout(() => setOrdemMsg(null), 4000)
      } else {
        setOrdemMsg(res.errors.join(' · '))
      }
    } catch (err) {
      setOrdemMsg(err instanceof Error ? err.message : 'Falha ao salvar a ordem.')
    } finally {
      setSalvandoOrdem(false)
    }
  }, [store, ordemSessao, salvandoOrdem, refreshCatalogo])

  // Cada abertura ganha uma key nova: o form monta sempre zerado, mesmo que o
  // alvo troque com o modal já aberto (nada herda do uso anterior).
  const formSeq = useRef(0)
  const openCatalogForm = useCallback((t: FormTarget) => {
    formSeq.current += 1
    setCatalogForm(t)
  }, [])

  const graphRef = useRef<GraphHandle>(null)
  // Seleção que veio da URL na carga: centralizada quando a física estabiliza.
  const [initialFocusId] = useState(readUrlSelection)

  const normQuery = norm(query)

  // --- subgrafo visível (modo foco) ---
  const visibleIds = useMemo(() => {
    const todos = new Set(nodes.map((n) => n.id))
    if (!focusId || !todos.has(focusId)) return todos

    const adj = new Map<string, string[]>()
    for (const l of links) {
      if (!adj.has(l.source)) adj.set(l.source, [])
      if (!adj.has(l.target)) adj.set(l.target, [])
      adj.get(l.source)?.push(l.target)
      adj.get(l.target)?.push(l.source)
    }
    // BFS até a profundidade escolhida a partir do nó em foco.
    const reached = new Set([focusId])
    let frontier = [focusId]
    for (let d = 0; d < depth && frontier.length > 0; d++) {
      const next: string[] = []
      for (const id of frontier) {
        for (const viz of adj.get(id) ?? []) {
          if (!reached.has(viz)) {
            reached.add(viz)
            next.push(viz)
          }
        }
      }
      frontier = next
    }
    return reached
  }, [nodes, links, focusId, depth])

  const visibleData = useMemo<{ nodes: SimNode[]; links: SimLink[] }>(
    () => ({
      nodes: simData.nodes.filter((n) => visibleIds.has(n.id)),
      links: simData.links.filter(
        (l) => visibleIds.has(linkEndId(l.source)) && visibleIds.has(linkEndId(l.target)),
      ),
    }),
    [simData, visibleIds],
  )

  // Vista em níveis: linhagem montante do componente focado, em colunas.
  //
  // Em DOIS memos de propósito. O primeiro monta a linhagem, que é caro e cria
  // nós novos; o segundo só recoloca colunas e nós segundo as larguras
  // ajustadas à mão. Se as larguras entrassem no primeiro, cada quadro do
  // arraste criaria um `graph` novo — e o Graph, vendo os dados trocarem, se
  // re-enquadraria sozinho no meio do gesto. Aqui `lineage.graph` mantém a
  // identidade e só as colunas mudam.
  const lineageBase = useMemo(
    () =>
      vista === 'niveis'
        ? buildLineage(focusId, nodes, links, niveis, verbos, alcance)
        : null,
    [focusId, vista, nodes, links, niveis, verbos, alcance],
  )
  // Y de origem de cada nó, capturado junto com a linhagem e ANTES de qualquer
  // deslocamento: aplicarDeslocamentos escreve o y absoluto e precisa da base
  // intacta (ver basesVerticais). Memo separado, dependente só de lineageBase,
  // porque os nós são mutados no lugar — reler n.y depois do primeiro arraste
  // devolveria o y já deslocado, e o offset se acumularia a cada quadro.
  const yBase = useMemo(
    () => basesVerticais(lineageBase?.graph.nodes ?? []),
    [lineageBase],
  )

  const lineage = useMemo(() => {
    if (lineageBase === null) return null
    // Os três passos do layout de sessão, nesta ordem: a ORDEM decide a
    // sequência das colunas, a LARGURA de cada uma decide onde a seguinte
    // começa, e o DESLOCAMENTO entra por último, como offset sobre o resultado
    // — assim redimensionar uma coluna qualquer não come o deslocamento de
    // quem já foi movido.
    const ordenadas = reordenarColunas(lineageBase.columns, ordemSessao)
    const ajustadas = aplicarLarguras(ordenadas, lineageBase.graph.nodes, larguras)
    return {
      ...lineageBase,
      columns: aplicarDeslocamentos(
        ajustadas,
        lineageBase.graph.nodes,
        yBase,
        deslocamentos,
        arrasteFaixa,
      ),
    }
  }, [lineageBase, ordemSessao, larguras, yBase, deslocamentos, arrasteFaixa])

  const graphData = lineage ? lineage.graph : visibleData
  const shownIds = lineage ? lineage.ids : visibleIds

  const searchMatches = useMemo(() => {
    if (!normQuery) return []
    const starts: GraphNodeData[] = []
    const contains: GraphNodeData[] = []
    const inDesc: GraphNodeData[] = []
    for (const n of nodes) {
      const nome = norm(n.nome)
      if (nome.startsWith(normQuery)) starts.push(n)
      else if (nome.includes(normQuery)) contains.push(n)
      else if (norm(n.descricao ?? '').includes(normQuery)) inDesc.push(n)
    }
    return [...starts, ...contains, ...inDesc]
  }, [nodes, normQuery])

  const hasActiveFilter =
    selDominios.size > 0 ||
    selDebitos.size > 0 ||
    selNiveis.size > 0 ||
    somenteSemOwner ||
    somenteProdutos ||
    normQuery.length > 0

  const dimmedIds = useMemo(() => {
    // Hover tem prioridade: acende o nó + vizinhos (na vista em níveis, a
    // cadeia inteira de ancestrais/descendentes) e esmaece todo o resto.
    // Depois vêm o "hover fixado" (clique esquerdo) e a seleção (balão) —
    // um hover momentâneo em outro nó sobrepõe e, ao sair, o fixado volta.
    const persistentId = pinnedId ?? selectedId
    const highlightId = hoverId ?? (persistentId && shownIds.has(persistentId) ? persistentId : null)
    if (highlightId) {
      const lit = lineage
        ? lineage.chainOf(highlightId)
        : new Set([highlightId, ...(neighborsById.get(highlightId) ?? [])])
      return new Set([...shownIds].filter((id) => !lit.has(id)))
    }
    if (!hasActiveFilter) return new Set<string>()
    const matchIds = new Set(searchMatches.map((n) => n.id))
    return new Set(
      [...shownIds].filter((id) => {
        const n = nodesById.get(id)
        if (!n) return normQuery.length > 0
        if (n.fantasma === true) {
          // Fantasma não tem governança declarada: só reage à busca.
          return normQuery.length > 0 && !matchIds.has(n.id)
        }
        if (normQuery && !matchIds.has(n.id)) return true
        if (selNiveis.size > 0 && !selNiveis.has(nivelDe(n))) return true
        if (selDominios.size > 0 && !selDominios.has(n.dominio ?? '')) return true
        if (selDebitos.size > 0 && !selDebitos.has(debitoDe(n))) return true
        if (somenteSemOwner && Boolean(n.owner)) return true
        if (somenteProdutos && !ehProdutoDeDados(n)) return true
        return false
      }),
    )
  }, [
    shownIds,
    nodesById,
    hoverId,
    pinnedId,
    selectedId,
    neighborsById,
    lineage,
    hasActiveFilter,
    normQuery,
    searchMatches,
    selDominios,
    selDebitos,
    selNiveis,
    somenteSemOwner,
    somenteProdutos,
  ])

  const select = useCallback((id: string | null, focus = false) => {
    setSelectedId(id)
    // A seleção assume o destaque persistente: o "hover fixado" anterior sai.
    if (id) setPinnedId(null)
    if (id && focus) graphRef.current?.focusNode(id)
  }, [])

  /** Clique no nome de um componente na tabela: volta ao mapa já com o nó
   *  selecionado e centralizado (mesmo caminho do ?no=). */
  const openFromTable = useCallback(
    (id: string) => {
      setAba('mapa')
      select(id, true)
    },
    [select],
  )

  // --- modo foco ---
  const enterFocus = useCallback((id: string) => {
    setVista('niveis') // vista padrão ao entrar em foco
    setFocusPath([id])
  }, [])

  const pushFocus = useCallback((id: string) => {
    setFocusPath((path) => (path[path.length - 1] === id ? path : [...path, id]))
  }, [])

  /** Botão "Focar" do painel e duplo clique: entra em foco ou re-foca. */
  const focusOn = useCallback(
    (id: string) => {
      if (focusId) pushFocus(id)
      else enterFocus(id)
    },
    [focusId, pushFocus, enterFocus],
  )

  // Componente excluído com a página aberta: o caminho de foco (e a seleção)
  // podem apontar para um id que não existe mais. Sem isto, a vista ficaria
  // presa — buildLineage não acha o nó e a tela cairia no grafo livre.
  useEffect(() => {
    setFocusPath((path) => {
      const valido = path.filter((id) => nodesById.has(id))
      return valido.length === path.length ? path : valido
    })
    setSelectedId((id) => (id !== null && !nodesById.has(id) ? null : id))
    // O tamanho ajustado à mão também morre com o nó: sem isto, um componente
    // recadastrado com o mesmo id herdaria o tamanho do que foi excluído.
    setEscalas((prev) => podadas(prev, (id) => nodesById.has(id)))
  }, [nodesById])

  // Verbo excluído no modal "⇢ Verbos": o chip apagado dele vai junto. Sem
  // isto, o slug ficaria preso no conjunto sem chip nenhum para reacendê-lo, e
  // um verbo recadastrado com o mesmo slug voltaria invisível.
  useEffect(() => {
    const slugs = new Set(verbos.map((v) => v.slug))
    setVerbosOcultos((prev) => {
      const proximo = new Set([...prev].filter((slug) => slugs.has(slug)))
      return proximo.size === prev.size ? prev : proximo
    })
  }, [verbos])

  // Nível excluído no modal "≣ Níveis": a largura e o deslocamento ajustados
  // dele vão junto.
  useEffect(() => {
    const slugs = new Set(niveis.map((nv) => nv.slug))
    setLarguras((prev) => podadasPorSlug(prev, (slug) => slugs.has(slug)))
    setDeslocamentos((prev) => podadasPorSlug(prev, (slug) => slugs.has(slug)))
  }, [niveis])

  // A ordem de sessão se acerta com a ordem SALVA sempre que o catálogo muda:
  // nível excluído sai, nível novo entra no fim, e — o caso que interessa — ela
  // SOME quando as duas passam a ser a mesma. É o que faz o "aplicar esta
  // ordem" se normalizar sozinho: gravado o niveis.csv, o grafo volta pelo HMR
  // com a ordem nova, a de sessão vira redundante e desaparece daqui, levando
  // junto o botão. Ver ordemAtualizada.
  useEffect(() => {
    setOrdemSessao((prev) => ordemAtualizada(slugsSalvos, prev))
  }, [slugsSalvos])

  // "Ver mapa completo": sai do foco e mostra o inventário — todos os
  // componentes nas colunas dos seus níveis. O switch Força leva ao grafo livre.
  const exitFocus = useCallback(() => setFocusPath([]), [])

  const lastClickRef = useRef({ id: '', t: 0 })
  const handleNodeClick = useCallback(
    (id: string) => {
      const now = performance.now()
      const isDouble = lastClickRef.current.id === id && now - lastClickRef.current.t < DBLCLICK_MS
      lastClickRef.current = { id, t: now }
      // Clique esquerdo simples fixa o destaque de hover (toggle no mesmo nó,
      // re-fixa em outro) — sem balão, sem URL. Duplo clique entra em foco
      // (ou re-foca, empilhando no breadcrumb); o foco já isola a vizinhança,
      // então o fixado é dispensado. O balão fica com o clique direito.
      if (isDouble) {
        setPinnedId(null)
        focusOn(id)
        return
      }
      setPinnedId((prev) => (prev === id ? null : id))
    },
    [focusOn],
  )

  // Clique direito: abre o balão de detalhe (a antiga ação do esquerdo).
  const handleNodeRightClick = useCallback((id: string) => select(id), [select])

  // URL reflete aba (?aba=tabela), seleção (?no=) e foco (?foco=&vista=) sem
  // poluir o histórico. Cada vista leva só o seu regulador de amplitude —
  // &prof= na de força, &alcance= na de níveis —, porque a URL não deve
  // prometer um ajuste que a vista da vez não usa. Sem foco, a URL fica limpa:
  // o inverso exato de readInitialFocusPath, e sem exceção — todo foco é
  // explícito, então todo foco vai para a URL e sobrevive ao recarregar.
  useEffect(() => {
    const url = new URL(window.location.href)
    if (aba === 'tabela') url.searchParams.set('aba', 'tabela')
    else url.searchParams.delete('aba')
    if (selectedId) url.searchParams.set('no', selectedId)
    else url.searchParams.delete('no')
    if (focusId) {
      url.searchParams.set('foco', focusId)
      url.searchParams.set('vista', vista)
      if (vista === 'forca') {
        url.searchParams.set('prof', String(depth))
        url.searchParams.delete('alcance')
      } else {
        url.searchParams.delete('prof')
        url.searchParams.set('alcance', alcance)
      }
    } else {
      url.searchParams.delete('foco')
      url.searchParams.delete('prof')
      url.searchParams.delete('alcance')
      url.searchParams.delete('vista')
    }
    window.history.replaceState(null, '', url)
  }, [aba, selectedId, focusId, depth, vista, alcance])

  // --- exclusão pelo teclado ---
  // Delete (e Backspace, o hábito do macOS) sobre o componente em evidência
  // pede a exclusão dele; Enter confirma e Esc cancela. O balão abre junto com
  // a pergunta: ninguém confirma o que não está vendo.
  const [exclusaoPendente, setExclusaoPendente] = useState<PedidoExclusao | null>(null)
  const [excluindo, setExcluindo] = useState(false)

  // A pergunta vale para o nó que estava em evidência quando ela subiu: se a
  // seleção muda, um modal abre, a tela vira tabela ou o modo de edição some,
  // ela sai de cena em vez de confirmar outra coisa.
  useEffect(() => {
    if (exclusaoPendente === null) return
    const valida =
      selectedId === exclusaoPendente.id &&
      catalogForm === null &&
      !niveisOpen &&
      !verbosOpen &&
      aba === 'mapa' &&
      store !== null
    if (!valida) setExclusaoPendente(null)
  }, [exclusaoPendente, selectedId, catalogForm, niveisOpen, verbosOpen, aba, store])

  const executarExclusao = useCallback(
    async (pedido: PedidoExclusao) => {
      if (store === null) return
      const falhar = (msg: string) =>
        setExclusaoPendente((p) => (p !== null && p.id === pedido.id ? { ...p, erro: msg } : p))
      setExcluindo(true)
      try {
        // Base FRESCA do catálogo, como no formulário: um save anterior nesta
        // sessão não recarrega a página, então as rows do estado podem estar
        // atrás do CSV.
        const atuais = (await store.lerCatalogo()) ?? catalogRows ?? []
        const r = removerComponente(atuais, { id: pedido.id, nome: pedido.nome }, verbos)
        if (!r.encontrada) {
          falhar(`"${pedido.nome}" não está mais no catálogo.`)
          return
        }
        const res = await store.salvarCatalogo(r.rows)
        if (res.ok) {
          // Fecha a pergunta e o balão; o foco/seleção que apontavam para o nó
          // sumido são descartados pelo efeito sobre nodesById.
          setExclusaoPendente(null)
          setSelectedId(null)
          setPinnedId(null)
          refreshCatalogo()
        } else {
          falhar(res.errors.join(' · '))
        }
      } catch (err) {
        falhar(err instanceof Error ? err.message : 'Falha ao excluir.')
      } finally {
        setExcluindo(false)
      }
    },
    [store, catalogRows, verbos, refreshCatalogo],
  )

  // Handlers globais leem o estado por ref (o listener é registrado uma vez).
  const teclaExcluirRef = useRef<(e: KeyboardEvent) => void>(() => {})
  teclaExcluirRef.current = (e) => {
    // Digitando em um campo, Delete/Backspace são do texto; com o formulário,
    // um dos modais de vocabulário ou a tabela na tela, a tecla não é do mapa.
    if (catalogForm !== null || niveisOpen || verbosOpen || aba !== 'mapa') return
    if (ehCampoDeTexto(document.activeElement)) return
    const alvo = alvoDoAtalho({ selectedId, pinnedId, nodesById, rows: catalogRows })
    if (alvo === null) return
    e.preventDefault()
    select(alvo.id) // abre o balão do alvo (e assume o destaque do fixado)
    setExclusaoPendente({
      ...alvo,
      referencias: removerComponente(catalogRows ?? [], alvo, verbos).referencias,
      erro: null,
    })
  }

  const teclaConfirmarRef = useRef<(e: KeyboardEvent) => void>(() => {})
  teclaConfirmarRef.current = (e) => {
    if (exclusaoPendente === null || excluindo) return
    if (ehCampoDeTexto(document.activeElement)) return
    e.preventDefault()
    void executarExclusao(exclusaoPendente)
  }

  // Esc em estágios: cancela a exclusão pendente, senão o formulário de edição,
  // senão fecha o balão, senão desfixa o destaque, senão sai do foco. Na aba
  // Tabela, volta ao mapa (o estado do mapa é invisível ali — não mexe nele).
  // Handlers globais leem o estado via ref (registro único).
  const escRef = useRef(() => {})
  escRef.current = () => {
    if (exclusaoPendente) setExclusaoPendente(null)
    else if (catalogForm) setCatalogForm(null)
    else if (niveisOpen) setNiveisOpen(false)
    else if (verbosOpen) setVerbosOpen(false)
    else if (aba === 'tabela') setAba('mapa')
    else if (selectedId) setSelectedId(null)
    else if (pinnedId) setPinnedId(null)
    else if (focusId) exitFocus()
  }

  useEffect(() => {
    const onPopState = () => {
      const id = readUrlSelection()
      setAba(readUrlAba())
      setSelectedId(id)
      setPinnedId(null)
      setFocusPath(readInitialFocusPath())
      setDepth(readUrlDepth())
      setVista(readUrlVista())
      if (id) graphRef.current?.focusNode(id)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        escRef.current()
        return
      }
      // Combinação com modificador é atalho do sistema/navegador, não do mapa.
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (ehTeclaExcluir(e.key)) teclaExcluirRef.current(e)
      else if (e.key === 'Enter') teclaConfirmarRef.current(e)
    }
    window.addEventListener('popstate', onPopState)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('popstate', onPopState)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  const selectedNode = selectedId ? (nodesById.get(selectedId) ?? null) : null

  // Alvo do "✎ Editar" do balão: a linha cujo id é o do nó — o id do nó É o da
  // linha. Componente citado mas ainda sem linha (fantasma) não tem id de
  // catálogo e abre o form pré-preenchido como "cadastrar este componente".
  const editTarget = useMemo<FormTarget | null>(() => {
    if (!catalogRows || !selectedNode) return null
    const row = catalogRows.find((r) => r.id === selectedNode.id)
    if (row) return { modo: 'editar', id: row.id }
    return { modo: 'cadastrar', nome: selectedNode.nome, nivel: nivelDe(selectedNode) }
  }, [catalogRows, selectedNode])

  // Alvos possíveis de "Consome/Upstream" no formulário: o formulário mostra o
  // nome e grava o id.
  const componentesGrafo = useMemo(
    () => nodes.filter(isReal).map((n) => ({ ref: n.id, nome: n.nome })),
    [nodes],
  )

  // Árvore de linhagem do painel.
  const selectedLineage = useMemo(
    () => (selectedNode ? buildLineageTree(selectedNode.id, nodes, links, verbos) : null),
    [selectedNode, nodes, links, verbos],
  )

  // As ligações do nó selecionado, agrupadas por VERBO para o balão. A aresta
  // de SAÍDA é a que este componente declarou (sentido direto); a de ENTRADA é
  // a mesma relação lida do outro lado, e vai marcada `invertida` — é
  // ligacoes-por-verbo.ts que decide título, ordem e agrupamento.
  const secoesDeLigacoes = useMemo(() => {
    const ligacoes: Ligacao[] = []
    if (selectedId) {
      for (const l of links) {
        const label = linkLabel(l)
        if (l.source === selectedId) {
          const node = nodesById.get(l.target)
          if (node) ligacoes.push({ node, label, invertida: false })
        } else if (l.target === selectedId) {
          const node = nodesById.get(l.source)
          if (node) ligacoes.push({ node, label, invertida: true })
        }
      }
    }
    return agruparLigacoesPorVerbo(ligacoes, verbos)
  }, [selectedId, links, nodesById, verbos])

  // Âncora do balão: posição do nó selecionado em coordenadas de tela, lida
  // a cada frame pelo próprio balão (segue pan/zoom/física sem re-render).
  const getBalloonAnchor = useCallback(
    (): BalloonAnchor | null =>
      selectedId ? (graphRef.current?.nodeScreenPosition(selectedId) ?? null) : null,
    [selectedId],
  )

  const resolveWikiLink = useCallback(
    (target: string) => idByName.get(norm(target)) ?? null,
    [idByName],
  )

  const breadcrumb = useMemo(
    // Sem foco (inventário), o rótulo é o mapa inteiro: não há componente de
    // partida para nomear a trilha.
    () =>
      focusPath.length === 0
        ? [{ id: '', nome: 'Todos os componentes' }]
        : focusPath.map((id) => ({ id, nome: nodesById.get(id)?.nome ?? id })),
    [focusPath, nodesById],
  )

  return (
    <div className="app">
      <Graph
        ref={graphRef}
        data={graphData}
        degreeById={degreeById}
        verbos={verbos}
        dimmedIds={dimmedIds}
        hoverId={hoverId}
        pinnedId={pinnedId}
        selectedId={selectedId}
        initialFocusId={initialFocusId}
        fixedLayout={lineage !== null}
        levelColumns={lineage && bandsOn ? lineage.columns : null}
        escalas={escalas}
        onEscalaChange={alterarEscala}
        larguras={larguras}
        onLarguraChange={alterarLargura}
        deslocamentos={deslocamentos}
        onOrdemFaixasChange={alterarOrdemFaixas}
        onDeslocamentoChange={alterarDeslocamento}
        onArrasteFaixaChange={alterarArrasteFaixa}
        onRestaurarFaixa={restaurarFaixa}
        ligacoesOn={ligacoesOn}
        verbosOcultos={verbosOcultos}
        onNodeClick={handleNodeClick}
        onNodeRightClick={handleNodeRightClick}
        onNodeHover={setHoverId}
        onBackgroundClick={() => {
          setSelectedId(null)
          setPinnedId(null)
        }}
      />

      {aba === 'tabela' && (
        <div className="table-layer">
          <TableView
            nodes={nodes}
            links={links}
            niveis={niveis}
            verbos={verbos}
            onSelectNode={openFromTable}
          />
        </div>
      )}

      <header className="topbar">
        <div className="topbar__title">
          <h1>Mapa de Dados do Atacado</h1>
          <span>quem produz e quem consome cada dado</span>
        </div>
        <nav className="topbar__tabs" aria-label="Visão">
          <button
            type="button"
            className={aba === 'mapa' ? 'topbar__tab topbar__tab--active' : 'topbar__tab'}
            onClick={() => setAba('mapa')}
          >
            Mapa
          </button>
          <button
            type="button"
            className={aba === 'tabela' ? 'topbar__tab topbar__tab--active' : 'topbar__tab'}
            onClick={() => setAba('tabela')}
          >
            Tabela
          </button>
        </nav>
        {catalogRows !== null && (
          <>
            <button
              type="button"
              className="topbar__new"
              onClick={() => openCatalogForm({ modo: 'novo' })}
            >
              + Novo componente
            </button>
            <button
              type="button"
              className="topbar__new topbar__niveis"
              onClick={() => setNiveisOpen(true)}
            >
              ≣ Níveis
            </button>
            <button
              type="button"
              className="topbar__new topbar__verbos"
              onClick={() => setVerbosOpen(true)}
            >
              ⇢ Verbos
            </button>
            {/* Fica AQUI, junto do "≣ Níveis", e não na legenda ao lado do
                "restaurar o layout": os dois botões desta ponta da barra gravam
                no catálogo, e a legenda só desfaz o que é da sessão. Misturar
                um save de arquivo com os controles de "nada disso persiste"
                borraria justamente a distinção em que a feature inteira se
                apoia. Aparece só quando há ordem de sessão — sem ela, não há o
                que aplicar. */}
            {ordemSessao !== null && (
              <button
                type="button"
                className="topbar__new topbar__ordem"
                disabled={salvandoOrdem}
                title="Gravar a ordem atual das faixas na coluna ordem do niveis.csv"
                onClick={() => void aplicarOrdemDasFaixas()}
              >
                {salvandoOrdem ? 'Salvando…' : '✓ Aplicar esta ordem'}
              </button>
            )}
          </>
        )}
        {ordemMsg !== null && (
          <span className="topbar__ordem-msg" role="status">
            {ordemMsg}
          </span>
        )}
        <FonteBar fonte={fonte} />
        {aba === 'mapa' && (
          <SearchBox
            query={query}
            matchCount={searchMatches.length}
            onQueryChange={setQuery}
            onSubmit={() => {
              const first = searchMatches[0]
              if (first) select(first.id, true)
            }}
          />
        )}
      </header>

      {aba === 'mapa' && (
        <FocusBar
          path={breadcrumb}
          depth={depth}
          vista={lineage ? 'niveis' : 'forca'}
          emFoco={focusId !== null}
          alcance={alcance}
          bandsOn={bandsOn}
          ligacoesOn={ligacoesOn}
          verbos={verbos}
          verbosOcultos={verbosOcultos}
          onCrumbClick={(i) => setFocusPath((path) => path.slice(0, i + 1))}
          onDepthChange={setDepth}
          onVistaChange={setVista}
          onAlcanceChange={setAlcance}
          onToggleBands={() => setBandsOn((v) => !v)}
          onToggleLigacoes={() => setLigacoesOn((v) => !v)}
          onToggleVerbo={(slug) => setVerbosOcultos((prev) => comVerboAlternado(prev, slug))}
          onExit={exitFocus}
        />
      )}

      {aba === 'mapa' && (
        <PainelRecolhivel titulo="Filtros" chave="mapa:filtros-recolhido" posicao="superior">
        <Filters
          dominios={dominios}
          selectedDominios={selDominios}
          selectedDebitos={selDebitos}
          niveis={niveis}
          selectedNiveis={selNiveis}
          somenteSemOwner={somenteSemOwner}
          somenteProdutos={somenteProdutos}
          ligacoesOn={ligacoesOn}
          counts={counts}
          hasActiveFilter={hasActiveFilter}
          onToggleDominio={(d) => setSelDominios((prev) => toggled(prev, d))}
          onToggleDebito={(d) => setSelDebitos((prev) => toggled(prev, d))}
          onToggleNivel={(n) => setSelNiveis((prev) => toggled(prev, n))}
          onToggleSemOwner={() => setSomenteSemOwner((v) => !v)}
          onToggleProdutos={() => setSomenteProdutos((v) => !v)}
          onToggleLigacoes={() => setLigacoesOn((v) => !v)}
          onClear={() => {
            setQuery('')
            setSelDominios(new Set())
            setSelDebitos(new Set())
            setSelNiveis(new Set())
            setSomenteSemOwner(false)
            setSomenteProdutos(false)
          }}
        />
        </PainelRecolhivel>
      )}

      {aba === 'mapa' && (
        <PainelRecolhivel titulo="Legenda" chave="mapa:legenda-recolhida" posicao="inferior">
          <Legend
            podeExcluir={catalogRows !== null}
            ajustes={ajustes}
            onRestaurarLayout={restaurarLayout}
          />
        </PainelRecolhivel>
      )}

      {aba === 'mapa' && selectedNode && (
        <NodeBalloon
          node={selectedNode}
          secoesDeLigacoes={secoesDeLigacoes}
          lineage={selectedLineage}
          isFocused={selectedId === focusId}
          nivelTituloDe={nivelTituloDe}
          verboTituloDe={verboTituloDe}
          resolveWikiLink={resolveWikiLink}
          onNavigate={(id) => select(id, true)}
          onFocus={focusOn}
          onEdit={editTarget ? () => openCatalogForm(editTarget) : undefined}
          confirmacao={
            exclusaoPendente !== null && exclusaoPendente.id === selectedId ? (
              <DeleteConfirm
                nome={exclusaoPendente.nome}
                referencias={exclusaoPendente.referencias}
                dica={
                  excluindo ? (
                    'Excluindo…'
                  ) : (
                    <>
                      <kbd>Enter</kbd> confirma · <kbd>Esc</kbd> cancela
                    </>
                  )
                }
                erro={exclusaoPendente.erro}
              />
            ) : undefined
          }
          onClose={() => setSelectedId(null)}
          getAnchor={getBalloonAnchor}
        />
      )}

      {catalogForm && catalogRows !== null && store !== null && (
        <CatalogForm
          key={formSeq.current}
          store={store}
          rows={catalogRows}
          target={catalogForm}
          niveis={niveis}
          verbos={verbos}
          componentesGrafo={componentesGrafo}
          onSaved={refreshCatalogo}
          onClose={() => setCatalogForm(null)}
        />
      )}

      {niveisOpen && (
        <NiveisModal
          store={store}
          niveis={niveis}
          onSaved={refreshCatalogo}
          onClose={() => setNiveisOpen(false)}
        />
      )}

      {verbosOpen && (
        <VerbosModal
          store={store}
          verbos={verbos}
          onSaved={refreshCatalogo}
          onClose={() => setVerbosOpen(false)}
        />
      )}

      {nodes.length === 0 && (
        <div className="empty-state">
          <p>
            Nenhum componente no grafo ainda. Rode <code>npm run data</code> para gerar{' '}
            <code>src/data/graph.json</code> a partir do catalogo.csv.
          </p>
        </div>
      )}
    </div>
  )
}

export default App
