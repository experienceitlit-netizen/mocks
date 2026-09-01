// Modal "⇢ Verbos" (só no modo edição): gerencia o VOCABULÁRIO das relações —
// os prefixos que uma célula de `consome` pode trazer ("envia:rar-grupo").
// Célula sem prefixo continua valendo `consome`, e por isso ele é o único verbo
// que não pode ser removido.
// O que amarra um verbo ao catálogo é o `slug`, não o título: renomear "Envia"
// para "Manda" não mexe em nenhuma linha do catalogo.csv — a mesma propriedade
// que faz "Jornada" ser o slug `dominio` nos níveis.
// Toda mudança vai pelo store com a lista COMPLETA (mesma disciplina do
// catálogo e dos níveis): adicionar/remover salvam na hora; edições de título,
// SENTIDO e SETA acumulam e vão juntas no "Salvar alterações". Remover pede
// confirmação (as referências que usam o verbo deixam de ser reconhecidas) e o
// save recusa remoção de verbo em uso — o erro aparece no próprio modal.
//
// Os dois atributos são eixos INDEPENDENTES: `sentido` diz por onde a LINHAGEM
// passa, `seta` se o DESENHO põe ponta. "Associado" não tem ponta e mesmo assim
// carrega o dado — sem ponta ≠ fora da linhagem. Ver o bloco de verbos em
// scripts/graph-lib.ts.
//
// Sem input de ordem, ao contrário dos níveis: a ordem de um nível é semântica
// (a coluna do mapa), a de um verbo é só a de um `<select>`, e verbo novo entra
// no fim da lista.
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { CatalogStore } from './catalog-store'
import type { Sentido, VerboDef } from './graph-types'
import { SENTIDOS } from './graph-build'
import type { LinhaVerbo } from './verbos-form'
import {
  comoLinhaVerbo,
  errosDeEdicaoVerbos,
  errosDeNovoVerbo,
  payloadVerbos,
  podeRemoverVerbo,
  SENTIDO_PADRAO,
  SETA_PADRAO,
} from './verbos-form'

/** Rótulo de um sentido no `<select>`: derivado do próprio vocabulário, para
 *  não haver uma segunda lista de sentidos a manter em dia. O que cada um
 *  significa está na `hint` do rodapé. */
function rotuloSentido(s: Sentido): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

interface VerbosModalProps {
  /** Onde os verbos são lidos e gravados; null = sem fonte editável. */
  store: CatalogStore | null
  /** Bloco `verbos` do graph.json atual: fallback de leitura quando não há
   *  store (build estático sem catálogo aberto). */
  verbos: readonly VerboDef[]
  /** Save confirmado: o App re-busca o que depende do catálogo (o graph.json
   *  novo chega por HMR, como no formulário de componentes). */
  onSaved(): void
  onClose(): void
}

export default function VerbosModal({ store, verbos, onSaved, onClose }: VerbosModalProps) {
  // null = leitura ainda em voo. `apiOff` cobre o app sem fonte editável: o
  // modal lista os verbos do graph.json e desliga as ações.
  const [linhas, setLinhas] = useState<LinhaVerbo[] | null>(null)
  const [apiOff, setApiOff] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // Slug do verbo cuja remoção aguarda confirmação.
  const [confirmar, setConfirmar] = useState<string | null>(null)
  const [novoTitulo, setNovoTitulo] = useState('')
  const okTimer = useRef(0)
  useEffect(() => () => window.clearTimeout(okTimer.current), [])

  useEffect(() => {
    let alive = true
    void (store?.lerVerbos() ?? Promise.resolve(null)).then((rows) => {
      if (!alive) return
      if (rows === null) {
        setApiOff(true)
        // O bloco `verbos` do graph.json tem a mesma forma da resposta do GET
        // (só não declara `builtin` no tipo — comoLinhaVerbo resolve).
        setLinhas(verbos.map(comoLinhaVerbo))
      } else {
        setLinhas(rows.map(comoLinhaVerbo))
      }
    })
    return () => {
      alive = false
    }
    // Só no mount: o modal é a dona da edição enquanto está aberto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const post = async (next: LinhaVerbo[], aposOk: () => void) => {
    if (store === null) return
    setErrors([])
    setOkMsg(null)
    setSaving(true)
    try {
      const res = await store.salvarVerbos(payloadVerbos(next))
      if (res.ok) {
        // Re-lê em vez de confiar no otimismo: é a gravação que deriva o slug
        // do verbo novo, e é ela que diz qual lista ficou valendo.
        const recarregado = await store.lerVerbos()
        setLinhas(recarregado === null ? next : recarregado.map(comoLinhaVerbo))
        setDirty(false)
        setConfirmar(null)
        aposOk()
        onSaved()
        setOkMsg('✓ Verbos salvos. O mapa foi atualizado.')
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
    const locais = errosDeNovoVerbo(novoTitulo, linhas)
    if (locais.length > 0) {
      setErrors(locais)
      return
    }
    // Slug vazio = verbo novo: o backend deriva do título. Nasce montante e com
    // seta — trocar os dois eixos é um segundo gesto, na linha que acabou de
    // aparecer (como a cor de um nível recém-criado).
    const novo: LinhaVerbo = {
      slug: '',
      titulo,
      sentido: SENTIDO_PADRAO,
      seta: SETA_PADRAO,
      builtin: false,
    }
    void post([...linhas, novo], () => setNovoTitulo(''))
  }

  const remover = (idx: number) => {
    if (linhas === null || saving || apiOff) return
    const alvo = linhas[idx]
    if (!podeRemoverVerbo(alvo)) return
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

  const editar = (idx: number, patch: Partial<LinhaVerbo>) => {
    if (linhas === null) return
    setLinhas(linhas.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
    setDirty(true)
  }

  const salvarEdicoes = () => {
    if (linhas === null || saving || apiOff) return
    const locais = errosDeEdicaoVerbos(linhas)
    if (locais.length > 0) {
      setErrors(locais)
      return
    }
    void post(linhas, () => {})
  }

  return (
    <div className="catalog-overlay">
      <div
        className="catalog-form niveis-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Gerenciar verbos"
      >
        <header className="catalog-form__header">
          <h2>Verbos das relações</h2>
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
                      type="text"
                      className="niveis-modal__titulo-input"
                      aria-label={l.slug === '' ? 'Título do verbo' : `Título do verbo ${l.slug}`}
                      value={l.titulo}
                      disabled={apiOff}
                      onChange={(e) => editar(i, { titulo: e.target.value })}
                    />
                    <select
                      className="verbos-modal__sentido"
                      aria-label={`Sentido do verbo ${l.titulo}`}
                      value={l.sentido}
                      disabled={apiOff}
                      onChange={(e) => editar(i, { sentido: e.target.value as Sentido })}
                    >
                      {SENTIDOS.map((s) => (
                        <option key={s} value={s}>
                          {rotuloSentido(s)}
                        </option>
                      ))}
                    </select>
                    <label className="verbos-modal__seta" title="A aresta desenha ponta?">
                      <input
                        type="checkbox"
                        aria-label={`Seta do verbo ${l.titulo}`}
                        checked={l.seta}
                        disabled={apiOff}
                        onChange={(e) => editar(i, { seta: e.target.checked })}
                      />
                      seta
                    </label>
                    {l.builtin && <span className="niveis-modal__tag">padrão</span>}
                    <button
                      type="button"
                      className="niveis-modal__remove"
                      aria-label={`Remover verbo ${l.titulo}`}
                      title={
                        podeRemoverVerbo(l)
                          ? undefined
                          : 'É o que vale para toda referência sem prefixo — não pode ser removido.'
                      }
                      disabled={saving || apiOff || !podeRemoverVerbo(l)}
                      onClick={() => remover(i)}
                    >
                      remover
                    </button>
                  </div>
                  {confirmar === l.slug && (
                    <div className="niveis-modal__confirma" role="alert">
                      <span>
                        Ao remover <strong>{l.titulo}</strong>, toda referência que usa esse verbo
                        deixa de ser reconhecida e a célula passa a valer como nome de componente.
                        Só é possível quando nenhuma linha do catálogo o usa.
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
            <div className="verbos-modal__add-row">
              <div className="cform__field">
                <label className="cform__label" htmlFor="vb-titulo">
                  Título
                </label>
                <input
                  id="vb-titulo"
                  type="text"
                  value={novoTitulo}
                  disabled={apiOff}
                  onChange={(e) => setNovoTitulo(e.target.value)}
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
              Renomear um verbo não mexe no catálogo; remover só é possível quando nenhuma
              referência o usa, e “Consome” nunca sai — é o significado de toda referência sem
              prefixo. Sentido = por onde a linhagem passa (montante sobe, jusante desce, ambos os
              dois, nenhum fica fora dela). Seta = se a aresta desenha ponta. São independentes:
              “Associado” não tem ponta e mesmo assim carrega o dado.
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
