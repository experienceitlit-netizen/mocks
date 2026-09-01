// Balão de detalhe ancorado no nó selecionado. Um único layout para TODO
// componente: chips (domínio, nível, tipo de componente, débito, produto de
// dados quando a linha o declara), campos de
// governança, corpo markdown, uma lista de ligações POR VERBO e — por último —
// a árvore de linhagem, que é a seção que cresce sem limite. Não há variação
// por categoria de nó, porque não há categorias.
// Quais seções de ligação existem e em que ordem é decisão de
// ligacoes-por-verbo.ts; aqui só se desenha o que ele devolveu.
// A ancoragem segue o nó a cada frame (pan/zoom/física) via getAnchor().
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { GraphNodeData } from './graph-types'
import { debitoDe, ehProdutoDeDados, tipoComponenteDe } from './graph-types'
import { VERBO_PADRAO } from './graph-build'
import type { LineageEntry } from './lineage'
import type { CaminhoRamo } from './lineage-expand'
import {
  CAMINHO_RAIZ,
  caminhoFilho,
  comRamoAlternado,
  RAMOS_INICIAIS,
  ramoAberto,
  rotuloDoRamo,
} from './lineage-expand'
import type { SecaoDeLigacoes } from './ligacoes-por-verbo'
import { papelDoVerbo } from './ligacoes-por-verbo'
import { DEBITO_LABEL, domainColor, produtoChipColor } from './palette'
import { LOSANGO_PONTOS, LOSANGO_S } from './shapes'
import Markdown from './Markdown'

/** Posição do nó em coordenadas de tela + raio visual em px. */
export interface BalloonAnchor {
  x: number
  y: number
  r: number
}

interface NodeBalloonProps {
  node: GraphNodeData
  /** As ligações do componente já agrupadas por verbo e sentido de leitura
   *  (ver ligacoes-por-verbo.ts). Lista vazia = sem conexão nenhuma. */
  secoesDeLigacoes: SecaoDeLigacoes[]
  /** Árvore de linhagem montante; null quando o nó não está no grafo. */
  lineage: LineageEntry | null
  /** O nó já é o centro do modo foco (esconde o botão Focar). */
  isFocused: boolean
  /** Título do nível pelo slug (chip do nível). */
  nivelTituloDe(slug: string): string
  /** Título do verbo pelo rótulo da aresta (o verbo de cada relação). Espelha
   *  o nivelTituloDe: o vocabulário é dado, e quem o tem é o App. */
  verboTituloDe(label: string): string
  resolveWikiLink(target: string): string | null
  onNavigate(id: string): void
  /** Entra em modo foco neste nó (ou re-foca, se já em foco). */
  onFocus(id: string): void
  /** Abre o formulário de edição/cadastro do catálogo. Só vem definido no modo
   *  edição (dev server com /api/catalogo). */
  onEdit?: () => void
  /** Confirmação pendente sobre este nó (exclusão pelo teclado): entra no topo
   *  do corpo, antes dos detalhes, para ser lida sem rolar. */
  confirmacao?: ReactNode
  onClose(): void
  /** Âncora em coordenadas de tela; null se o nó não está no grafo atual. */
  getAnchor(): BalloonAnchor | null
}

function Missing() {
  return <span className="missing">⚠ a definir</span>
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <span className="field__value">{children}</span>
    </div>
  )
}

/** Uma seção de ligações: o verbo no cabeçalho, os alvos daquele verbo embaixo.
 *
 *  Não há rótulo de verbo POR ITEM: o cabeçalho já o diz para a lista inteira,
 *  e repeti-lo em cada linha era o que sobrava de quando havia duas seções
 *  fixas ("Consome →" e "← Consumido por") e o verbo real tinha de se esgueirar
 *  ao lado do nome — dizendo "Envia" debaixo de um título que afirmava
 *  "Consome". */
function SecaoDeLigacao({
  secao,
  onNavigate,
}: {
  secao: SecaoDeLigacoes
  onNavigate(id: string): void
}) {
  return (
    <section className="connections">
      <h3>{secao.titulo}</h3>
      <ul>
        {/* A chave é o alvo: dentro de uma seção o verbo é o mesmo para todos, e
            duas arestas de verbos diferentes entre os MESMOS dois componentes
            já caem em seções diferentes. */}
        {secao.itens.map(({ node }) => (
          <li key={node.id}>
            <button type="button" className="wikilink" onClick={() => onNavigate(node.id)}>
              {node.nome}
            </button>
            {node.fantasma === true && <span className="edge-label">fantasma</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Ramo recursivo da linhagem: o componente, a alça que abre o que ele consome
 *  e — quando aberto — os galhos de baixo. O rótulo da aresta só aparece quando
 *  não é o consumo padrão, e vem com ↩ quando a travessia andou ao contrário
 *  do que a relação declara (verbo `jusante`: quem ENVIA é montante de quem
 *  recebe, e a linhagem sobe pelo lado de quem enviou).
 *
 *  A alça é indexada pelo CAMINHO do galho, nunca pelo id: a árvore reusa a
 *  mesma entrada para um componente que várias cadeias consomem (ver
 *  lineage-expand.ts). */
function LineageBranch({
  entry,
  caminho,
  papel,
  isRoot = false,
  abertos,
  verboTituloDe,
  onAlternar,
  onNavigate,
}: {
  entry: LineageEntry
  caminho: CaminhoRamo
  papel?: string
  isRoot?: boolean
  abertos: ReadonlySet<CaminhoRamo>
  verboTituloDe(label: string): string
  onAlternar(caminho: CaminhoRamo): void
  onNavigate(id: string): void
}) {
  const filhos = entry.upstream
  const aberto = ramoAberto(abertos, caminho)
  return (
    <li className="lineage__row">
      {filhos.length > 0 ? (
        <button
          type="button"
          className="lineage__alca"
          aria-expanded={aberto}
          aria-label={rotuloDoRamo(entry.data.nome, filhos.length, aberto)}
          onClick={() => onAlternar(caminho)}
        >
          <span className="lineage__glifo" aria-hidden="true">
            {aberto ? '▾' : '▸'}
          </span>
          {filhos.length}
        </button>
      ) : (
        // Ponta de cadeia: o vazio ocupa a largura da alça para os nomes de uma
        // mesma lista começarem todos na mesma coluna.
        <span className="lineage__alca lineage__alca--folha" aria-hidden="true" />
      )}
      {papel !== undefined && <span className="lineage__papel">{papel}</span>}
      {isRoot ? (
        <span className="lineage__self">{entry.data.nome}</span>
      ) : (
        <button type="button" className="wikilink" onClick={() => onNavigate(entry.data.id)}>
          {entry.data.nome}
        </button>
      )}
      {aberto && filhos.length > 0 && (
        <ul className="lineage__children">
          {filhos.map(({ label, invertida, entry: filho }, i) => (
            <LineageBranch
              key={`${filho.data.id}-${i}`}
              entry={filho}
              caminho={caminhoFilho(caminho, i, filho.data.id)}
              papel={
                label === VERBO_PADRAO && !invertida
                  ? undefined
                  : papelDoVerbo(verboTituloDe(label), invertida)
              }
              abertos={abertos}
              verboTituloDe={verboTituloDe}
              onAlternar={onAlternar}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

/** A árvore inteira e o conjunto de galhos abertos que ela carrega.
 *
 *  Componente próprio, e não estado dentro do BalloonContent, por causa do
 *  reset: o balão NÃO é remontado ao navegar para outro componente (ver o
 *  render em App.tsx), então a expansão de um vazaria para o próximo. Com a
 *  chave no id, trocar de componente remonta a árvore e o estado volta ao
 *  inicial sem nenhum efeito para sincronizar. */
function LineageTree({
  raiz,
  verboTituloDe,
  onNavigate,
}: {
  raiz: LineageEntry
  verboTituloDe(label: string): string
  onNavigate(id: string): void
}) {
  const [abertos, setAbertos] = useState(RAMOS_INICIAIS)
  const alternar = useCallback((caminho: CaminhoRamo) => {
    setAbertos((atuais) => comRamoAlternado(atuais, caminho))
  }, [])

  return (
    <ul className="lineage__tree">
      <LineageBranch
        entry={raiz}
        caminho={CAMINHO_RAIZ}
        isRoot
        abertos={abertos}
        verboTituloDe={verboTituloDe}
        onAlternar={alternar}
        onNavigate={onNavigate}
      />
    </ul>
  )
}

type BalloonContentProps = Omit<NodeBalloonProps, 'onClose' | 'getAnchor'>

/** Corpo do balão — o mesmo para qualquer componente. */
function BalloonContent({
  node,
  secoesDeLigacoes,
  lineage,
  isFocused,
  nivelTituloDe,
  verboTituloDe,
  resolveWikiLink,
  onNavigate,
  onFocus,
  onEdit,
}: BalloonContentProps) {
  const debito = debitoDe(node)
  const nivel = node.nivel ?? ''

  return (
    <>
      <header className="node-balloon__header">
        <h2>{node.nome}</h2>
        <div className="chips">
          {nivel !== '' && <span className="chip chip--nivel">{nivelTituloDe(nivel)}</span>}
          <span className="chip chip--neutral">{tipoComponenteDe(node)}</span>
          {node.dominio && (
            <span
              className="chip"
              style={{ borderColor: domainColor(node.dominio), color: domainColor(node.dominio) }}
            >
              {node.dominio}
            </span>
          )}
          {node.fantasma !== true && (
            <span className={`chip chip--debito-${debito}`}>Débito: {DEBITO_LABEL[debito]}</span>
          )}
          {/* Só quando é: um chip "não é produto de dados" em toda linha comum
              poluiria o cabeçalho. O chip repete em palavras a marca que o nó
              tem no mapa, e traz o próprio losango junto — é a forma que o
              leitor precisa reconhecer lá.
              O texto do chip fica no peso normal de propósito: o negrito é o
              canal que distingue um nó dos OUTROS no mapa, e aqui já não há
              outros — o balão é de um nó só, e o chip já nomeia a bandeira. */}
          {ehProdutoDeDados(node) && (
            <span
              className="chip"
              style={{ borderColor: produtoChipColor(node), color: produtoChipColor(node) }}
            >
              <svg
                className="chip__losango"
                viewBox={`${-LOSANGO_S} ${-LOSANGO_S} ${2 * LOSANGO_S} ${2 * LOSANGO_S}`}
                aria-hidden="true"
              >
                <polygon
                  points={LOSANGO_PONTOS.map(([x, y]) => `${x},${y}`).join(' ')}
                  fill="currentColor"
                />
              </svg>
              Produto de dados
            </span>
          )}
        </div>
      </header>

      {(!isFocused || onEdit) && (
        <div className="node-balloon__actions">
          {!isFocused && (
            <button type="button" className="node-balloon__focus" onClick={() => onFocus(node.id)}>
              ⌖ Focar neste nó
            </button>
          )}
          {onEdit && (
            <button type="button" className="node-balloon__edit" onClick={onEdit}>
              ✎ Editar
            </button>
          )}
        </div>
      )}

      {node.fantasma === true ? (
        <p className="ghost-note">
          Nó fantasma: é citado por outro componente, mas ainda não tem linha no catálogo.
        </p>
      ) : (
        <>
          {node.descricao && <p className="node-balloon__descricao">{node.descricao}</p>}

          <div className="fields">
            {node.status && <Field label="Status">{node.status}</Field>}
            <Field label="Owner">{node.owner ? node.owner : <Missing />}</Field>
            <Field label="Centro de custo">
              {node.centroDeCusto ? node.centroDeCusto : <Missing />}
            </Field>
          </div>

          {node.corpo && (
            <Markdown text={node.corpo} resolveWikiLink={resolveWikiLink} onNavigate={onNavigate} />
          )}
        </>
      )}

      {/* Uma seção por verbo, na ordem do vocabulário: o que este componente
          declara primeiro, o que declararam sobre ele depois. */}
      {secoesDeLigacoes.map((secao) => (
        <SecaoDeLigacao key={secao.chave} secao={secao} onNavigate={onNavigate} />
      ))}
      {/* Fica colado às listas porque é sobre ELAS. Nunca disputa espaço com a
          Linhagem: a árvore sai das MESMAS arestas que alimentam as seções,
          então sem relação nenhuma também não há o que desenhar. */}
      {secoesDeLigacoes.length === 0 && <p className="ghost-note">Sem conexões mapeadas.</p>}

      {/* Por último: as listas de relação são curtas e respondem "com quem este
          componente fala"; a árvore é a parte que cresce, e no fim ela pode
          crescer sem empurrar o resto do balão para fora da vista. */}
      {lineage && lineage.upstream.length > 0 && (
        <section className="connections lineage">
          <h3>Linhagem</h3>
          <LineageTree
            key={node.id}
            raiz={lineage}
            verboTituloDe={verboTituloDe}
            onNavigate={onNavigate}
          />
        </section>
      )}
    </>
  )
}

/** Distância entre a borda do nó e o balão (comprimento visível da seta). */
const GAP = 12
/** Margem mínima até as bordas da viewport. */
const MARGIN = 10
/** Limite superior: o balão fica abaixo do topbar. */
const TOP_MIN = 58
/** A ponta da seta nunca encosta nos cantos arredondados do balão. */
const ARROW_INSET = 18

type Side = 'right' | 'left' | 'below' | 'above' | 'free'

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max)
}

export default function NodeBalloon(props: NodeBalloonProps) {
  const { onClose, getAnchor, node, confirmacao } = props
  const boxRef = useRef<HTMLElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const arrowRef = useRef<HTMLSpanElement>(null)

  // Posiciona o balão colado ao nó, com FLIP de lado para caber na viewport.
  // Escreve estilos direto no DOM (sem setState) para seguir pan/zoom/física
  // a cada frame sem re-renderizar o React.
  const place = useCallback(() => {
    const el = boxRef.current
    const arrow = arrowRef.current
    if (!el || !arrow) return
    const vw = window.innerWidth
    const vh = window.innerHeight
    const w = el.offsetWidth
    const h = el.offsetHeight
    const a = getAnchor()
    let side: Side
    let left: number
    let top: number
    if (!a) {
      // Nó fora do grafo atual (ex.: relação clicada na vista de linhagem que
      // não pertence à cadeia exibida): cartão fixo à direita, sem seta.
      side = 'free'
      left = Math.max(MARGIN, vw - w - MARGIN)
      top = TOP_MIN
    } else {
      const fitsRight = a.x + a.r + GAP + w + MARGIN <= vw
      const fitsLeft = a.x - a.r - GAP - w >= MARGIN
      const fitsBelow = a.y + a.r + GAP + h + MARGIN <= vh
      const fitsAbove = a.y - a.r - GAP - h >= TOP_MIN
      side = fitsRight
        ? 'right'
        : fitsLeft
          ? 'left'
          : fitsBelow
            ? 'below'
            : fitsAbove
              ? 'above'
              : 'right'
      if (side === 'right' || side === 'left') {
        left = side === 'right' ? a.x + a.r + GAP : a.x - a.r - GAP - w
        top = clamp(a.y - h / 2, TOP_MIN, Math.max(TOP_MIN, vh - h - MARGIN))
        arrow.style.top = `${Math.round(clamp(a.y - top, ARROW_INSET, h - ARROW_INSET))}px`
        arrow.style.left = ''
      } else {
        top = side === 'below' ? a.y + a.r + GAP : a.y - a.r - GAP - h
        left = clamp(a.x - w / 2, MARGIN, Math.max(MARGIN, vw - w - MARGIN))
        arrow.style.left = `${Math.round(clamp(a.x - left, ARROW_INSET, w - ARROW_INSET))}px`
        arrow.style.top = ''
      }
      // Nenhum lado coube (nó no meio de uma viewport minúscula): garante que
      // o balão pelo menos não vaze para fora à direita.
      left = Math.min(left, Math.max(MARGIN, vw - w - MARGIN))
    }
    el.style.left = `${Math.round(left)}px`
    el.style.top = `${Math.round(top)}px`
    if (el.dataset.side !== side) el.dataset.side = side
    el.style.visibility = 'visible'
  }, [getAnchor])

  useEffect(() => {
    let raf = 0
    const tick = () => {
      place()
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [place])

  // O corpo rola: uma confirmação que aparece com o balão já rolado ficaria
  // acima da área visível.
  const temConfirmacao = confirmacao !== undefined && confirmacao !== null
  useEffect(() => {
    if (temConfirmacao && bodyRef.current) bodyRef.current.scrollTop = 0
  }, [temConfirmacao])

  return (
    <aside className="node-balloon" ref={boxRef} role="dialog" aria-label={`Detalhes de ${node.nome}`}>
      <span className="node-balloon__arrow" ref={arrowRef} aria-hidden="true" />
      <div className="node-balloon__body" ref={bodyRef}>
        <button type="button" className="node-balloon__close" onClick={onClose} aria-label="Fechar">
          ×
        </button>
        {confirmacao}
        <BalloonContent {...props} />
      </div>
    </aside>
  )
}
