// Modal "≣ Níveis" (só no modo edição): gerencia os níveis. TODOS os níveis são
// editáveis e removíveis — os que vieram com o modelo inclusive. O que amarra
// um nível ao catálogo é o `slug`, não o título: renomear um nível não mexe em
// nenhuma linha do catalogo.csv.
// Toda mudança vai pelo store com a lista COMPLETA (mesma disciplina do
// catálogo): adicionar/remover salvam na hora; edições de título, ordem e COR
// acumulam e vão juntas no "Salvar alterações". Remover pede confirmação (o
// nível deixa de ser uma coluna do mapa) e o save recusa remoção de nível em
// uso — o erro aparece no próprio modal.
//
// As duas cores (fundo e borda da faixa) são atributo livre do nível: nada no
// código associa cor a nome de camada. No mapa elas entram com alpha, para não
// estourar o tema escuro — ver band-colors.ts.
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { NivelApiRow } from './catalog-api'
import type { CatalogStore } from './catalog-store'
import type { NivelDef } from './graph-types'

function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/** Linha do modal: o nível como a API o devolve, com slug e origem resolvidos.
 *  As cores viram string sempre presente — "" é "sem cor, use o padrão", que é
 *  o estado que o <input type="color"> não sabe representar sozinho. */
interface Linha {
  slug: string
  titulo: string
  ordem: number
  builtin: boolean
  corFundo: string
  corBorda: string
}

const comoLinha = (r: NivelApiRow): Linha => ({
  slug: r.slug ?? '',
  titulo: r.titulo,
  ordem: r.ordem,
  builtin: r.builtin === true,
  corFundo: r.corFundo ?? '',
  corBorda: r.corBorda ?? '',
})

/** Valor que o seletor mostra quando o nível não tem cor: o cinza da faixa
 *  neutra, para o swatch não mentir sobre o que está desenhado no mapa. O
 *  "sem cor" de verdade é o `--vazio` no CSS (swatch tracejado e esmaecido). */
const COR_FUNDO_NEUTRA = '#2a2a2a'
const COR_BORDA_NEUTRA = '#8a8a8a'

interface NiveisModalProps {
  /** Onde os níveis são lidos e gravados; null = sem fonte editável. */
  store: CatalogStore | null
  /** Bloco `niveis` do graph.json atual: fallback de leitura quando não há
   *  store (build estático sem catálogo aberto). */
  niveis: readonly NivelDef[]
  /** Save confirmado: o App re-busca o que depende do catálogo (o graph.json
   *  novo chega por HMR, como no formulário de componentes). */
  onSaved(): void
  onClose(): void
}

export default function NiveisModal({ store, niveis, onSaved, onClose }: NiveisModalProps) {
  // null = leitura ainda em voo. `apiOff` cobre o app sem fonte editável: o
  // modal lista os níveis do graph.json e desliga as ações.
  const [linhas, setLinhas] = useState<Linha[] | null>(null)
  const [apiOff, setApiOff] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // Slug do nível cuja remoção estrutural aguarda confirmação.
  const [confirmar, setConfirmar] = useState<string | null>(null)
  const [novoTitulo, setNovoTitulo] = useState('')
  const [novaOrdem, setNovaOrdem] = useState('')
  const okTimer = useRef(0)
  useEffect(() => () => window.clearTimeout(okTimer.current), [])

  useEffect(() => {
    let alive = true
    void (store?.lerNiveis() ?? Promise.resolve(null)).then((rows) => {
      if (!alive) return
      if (rows === null) {
        setApiOff(true)
        // O bloco `niveis` do graph.json tem a mesma forma da resposta do GET.
        setLinhas([...niveis].sort((a, b) => a.ordem - b.ordem).map(comoLinha))
      } else {
        setLinhas(rows.map(comoLinha))
      }
    })
    return () => {
      alive = false
    }
    // Só no mount: o modal é a dona da edição enquanto está aberto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Lista completa como o store a espera: o slug preserva a identidade de cada
   *  nível (vazio só no que acabou de ser criado) e cor vazia não vai no
   *  payload — é assim que o backend entende "de volta ao padrão". */
  const payload = (rows: Linha[]): NivelApiRow[] =>
    rows.map((r) => {
      const row: NivelApiRow = { titulo: r.titulo.trim(), ordem: r.ordem }
      if (r.slug !== '') row.slug = r.slug
      if (r.corFundo !== '') row.corFundo = r.corFundo
      if (r.corBorda !== '') row.corBorda = r.corBorda
      return row
    })

  const post = async (next: Linha[], aposOk: () => void) => {
    if (store === null) return
    setErrors([])
    setOkMsg(null)
    setSaving(true)
    try {
      const res = await store.salvarNiveis(payload(next))
      if (res.ok) {
        const recarregado = await store.lerNiveis()
        setLinhas(recarregado === null ? next : recarregado.map(comoLinha))
        setDirty(false)
        setConfirmar(null)
        aposOk()
        onSaved()
        setOkMsg('✓ Níveis salvos. O mapa foi atualizado.')
        window.clearTimeout(okTimer.current)
        okTimer.current = window.setTimeout(() => setOkMsg(null), 4000)
      } else {
        setErrors(res.errors)
      }
    } catch (err) {
      setErrors([err instanceof Error ? err.message : 'Falha ao salvar.'])
    } finally {
      setSaving(false)
    }
  }

  const adicionar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (linhas === null || saving || apiOff) return
    const titulo = novoTitulo.trim()
    const ordem = Number(novaOrdem)
    const locais: string[] = []
    if (!titulo) locais.push('Título é obrigatório.')
    if (novaOrdem.trim() === '' || !Number.isInteger(ordem)) {
      locais.push('Ordem deve ser um número inteiro.')
    }
    if (titulo && linhas.some((l) => norm(l.titulo) === norm(titulo))) {
      locais.push(`Já existe um nível chamado "${titulo}".`)
    }
    if (locais.length > 0) {
      setErrors(locais)
      return
    }
    // Slug vazio = nível novo: o backend deriva do título. Nasce sem cor —
    // colorir é um segundo gesto, na linha que acabou de aparecer.
    const novo: Linha = { slug: '', titulo, ordem, builtin: false, corFundo: '', corBorda: '' }
    void post([...linhas, novo], () => {
      setNovoTitulo('')
      setNovaOrdem('')
    })
  }

  const remover = (idx: number) => {
    if (linhas === null || saving || apiOff) return
    const alvo = linhas[idx]
    // Remoção só depois da frase de efeito — um clique confirma.
    if (confirmar !== alvo.slug) {
      setErrors([])
      setConfirmar(alvo.slug)
      return
    }
    void post(
      linhas.filter((_, i) => i !== idx),
      () => {},
    )
  }

  const editar = (idx: number, patch: Partial<Linha>) => {
    if (linhas === null) return
    setLinhas(linhas.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
    setDirty(true)
  }

  const salvarEdicoes = () => {
    if (linhas === null || saving || apiOff) return
    const locais: string[] = []
    if (linhas.some((l) => l.titulo.trim() === '')) {
      locais.push('Título de nível não pode ficar vazio.')
    }
    const vistos = new Set<string>()
    for (const l of linhas) {
      const chave = norm(l.titulo)
      if (chave !== '' && vistos.has(chave)) locais.push(`Título repetido: "${l.titulo.trim()}".`)
      vistos.add(chave)
    }
    if (locais.length > 0) {
      setErrors([...new Set(locais)])
      return
    }
    void post(linhas, () => {})
  }

  return (
    <div className="catalog-overlay">
      <div className="catalog-form niveis-modal" role="dialog" aria-modal="true" aria-label="Gerenciar níveis">
        <header className="catalog-form__header">
          <h2>Níveis da cadeia</h2>
          <button type="button" className="catalog-form__close" aria-label="Fechar" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="catalog-form__body">
          {apiOff && (
            <p className="cform__ghost-note">
              ⚠ Nenhum catálogo aberto para edição — lista somente leitura.
            </p>
          )}

          <ul className="niveis-modal__list">
            {linhas === null ? (
              <li className="niveis-modal__row niveis-modal__row--builtin">carregando…</li>
            ) : (
              linhas.map((l, i) => (
                <li key={l.slug === '' ? `novo-${i}` : l.slug}>
                  <div className="niveis-modal__row">
                    <input
                      type="number"
                      className="niveis-modal__ordem-input"
                      aria-label={l.slug === '' ? 'Ordem do nível' : `Ordem do nível ${l.slug}`}
                      value={Number.isNaN(l.ordem) ? '' : l.ordem}
                      disabled={apiOff}
                      onChange={(e) => editar(i, { ordem: Number(e.target.value) })}
                    />
                    <input
                      type="text"
                      className="niveis-modal__titulo-input"
                      aria-label={l.slug === '' ? 'Título do nível' : `Título do nível ${l.slug}`}
                      value={l.titulo}
                      disabled={apiOff}
                      onChange={(e) => editar(i, { titulo: e.target.value })}
                    />
                    <span className="niveis-modal__cores">
                      <input
                        type="color"
                        className={`niveis-modal__cor${l.corFundo === '' ? ' niveis-modal__cor--vazio' : ''}`}
                        title="Cor de fundo da faixa"
                        aria-label={`Cor de fundo do nível ${l.titulo}`}
                        value={l.corFundo === '' ? COR_FUNDO_NEUTRA : l.corFundo}
                        disabled={apiOff}
                        onChange={(e) => editar(i, { corFundo: e.target.value })}
                      />
                      <input
                        type="color"
                        className={`niveis-modal__cor${l.corBorda === '' ? ' niveis-modal__cor--vazio' : ''}`}
                        title="Cor da borda da faixa"
                        aria-label={`Cor da borda do nível ${l.titulo}`}
                        value={l.corBorda === '' ? COR_BORDA_NEUTRA : l.corBorda}
                        disabled={apiOff}
                        onChange={(e) => editar(i, { corBorda: e.target.value })}
                      />
                      <button
                        type="button"
                        className="niveis-modal__cor-limpar"
                        title="Voltar às cores padrão"
                        aria-label={`Limpar cores do nível ${l.titulo}`}
                        disabled={apiOff || (l.corFundo === '' && l.corBorda === '')}
                        onClick={() => editar(i, { corFundo: '', corBorda: '' })}
                      >
                        ↺
                      </button>
                    </span>
                    {l.builtin && <span className="niveis-modal__tag">padrão</span>}
                    <button
                      type="button"
                      className="niveis-modal__remove"
                      aria-label={`Remover nível ${l.titulo}`}
                      disabled={saving || apiOff}
                      onClick={() => remover(i)}
                    >
                      remover
                    </button>
                  </div>
                  {confirmar === l.slug && (
                    <div className="niveis-modal__confirma" role="alert">
                      <span>
                        Ao remover <strong>{l.titulo}</strong>, a coluna correspondente some do
                        mapa. Só é possível quando nenhum componente está nesse nível.
                      </span>
                      <div className="niveis-modal__confirma-acoes">
                        <button
                          type="button"
                          className="niveis-modal__confirma-ok"
                          disabled={saving}
                          onClick={() => remover(i)}
                        >
                          Remover mesmo assim
                        </button>
                        <button
                          type="button"
                          className="niveis-modal__confirma-cancel"
                          onClick={() => setConfirmar(null)}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))
            )}
          </ul>

          {dirty && (
            <button
              type="button"
              className="niveis-modal__apply"
              disabled={saving || apiOff}
              onClick={salvarEdicoes}
            >
              {saving ? 'Salvando…' : 'Salvar alterações'}
            </button>
          )}

          <form className="niveis-modal__add" onSubmit={adicionar}>
            <div className="niveis-modal__add-row">
              <div className="cform__field">
                <label className="cform__label" htmlFor="nv-titulo">
                  Título
                </label>
                <input
                  id="nv-titulo"
                  type="text"
                  value={novoTitulo}
                  disabled={apiOff}
                  onChange={(e) => setNovoTitulo(e.target.value)}
                />
              </div>
              <div className="cform__field">
                <label className="cform__label" htmlFor="nv-ordem">
                  Ordem
                </label>
                <input
                  id="nv-ordem"
                  type="number"
                  value={novaOrdem}
                  disabled={apiOff}
                  onChange={(e) => setNovaOrdem(e.target.value)}
                />
              </div>
              <button
                type="submit"
                className="niveis-modal__add-btn"
                disabled={saving || apiOff || linhas === null}
              >
                Adicionar
              </button>
            </div>
            <p className="niveis-modal__hint">
              Ordem = posição da coluna, da esquerda para a direita. Renomear um nível não mexe no
              catálogo; remover só é possível quando nenhuma linha está nele. Os dois quadradinhos
              pintam a faixa do nível no mapa (fundo e borda, aplicados com transparência); ↺ volta
              à cor padrão.
            </p>
          </form>

          {okMsg !== null && <p className="catalog-form__ok">{okMsg}</p>}
          {errors.length > 0 && (
            <ul className="catalog-form__errors" role="alert">
              {errors.map((er) => (
                <li key={er}>✕ {er}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
