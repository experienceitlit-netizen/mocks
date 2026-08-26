// Modal "≣ Níveis" (só no modo edição): gerencia os níveis da cadeia.
// Built-ins são fixos (listados em cinza, sem edição); customizados vêm de
// GET /api/niveis e são editáveis (título/ordem), adicionáveis e removíveis.
// Toda mudança vai por POST /api/niveis com o conjunto COMPLETO de customs
// (mesma disciplina do catálogo): adicionar/remover postam na hora; edições
// de título/ordem acumulam e vão juntas no "Salvar alterações". A API recusa
// remoção de nível em uso — o erro aparece no próprio modal.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { NivelCustomRow } from './catalog-api'
import { fetchNiveis, saveNiveis } from './catalog-api'
import type { NivelDef } from './graph-types'
import { nivelCustomColor } from './palette'

function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/** Slug provável de um título (para o swatch de cor do modal): igual ao
 *  slugify do backend nos casos comuns; quando o nível já está no graph.json,
 *  o slug oficial do bloco `niveis` tem precedência. */
function slugLocal(titulo: string): string {
  return norm(titulo).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

interface NiveisModalProps {
  /** Bloco `niveis` do graph.json atual (built-ins + customs já buildados):
   *  fonte dos built-ins listados e dos slugs oficiais para as cores. */
  niveis: readonly NivelDef[]
  /** Save confirmado: o App re-busca o que depende do catálogo (o graph.json
   *  novo chega por HMR, como no formulário de componentes). */
  onSaved(): void
  onClose(): void
}

export default function NiveisModal({ niveis, onSaved, onClose }: NiveisModalProps) {
  // null = GET ainda em voo; [] = sem customs. `apiOff` cobre a integração em
  // andamento: sem /api/niveis o modal lista os níveis e desliga as ações.
  const [customs, setCustoms] = useState<NivelCustomRow[] | null>(null)
  const [apiOff, setApiOff] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [novoTitulo, setNovoTitulo] = useState('')
  const [novaOrdem, setNovaOrdem] = useState('')
  const okTimer = useRef(0)
  useEffect(() => () => window.clearTimeout(okTimer.current), [])

  useEffect(() => {
    let alive = true
    void fetchNiveis().then((rows) => {
      if (!alive) return
      if (rows === null) {
        setApiOff(true)
        // Fallback de leitura: os customs que o graph.json já conhece.
        setCustoms(niveis.filter((n) => !n.builtin).map((n) => ({ titulo: n.titulo, ordem: n.ordem })))
      } else {
        setCustoms(rows)
      }
    })
    return () => {
      alive = false
    }
    // Só no mount: o modal é a dona da edição enquanto está aberto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const builtins = useMemo(
    () => niveis.filter((n) => n.builtin).sort((a, b) => a.ordem - b.ordem),
    [niveis],
  )

  /** Slug oficial (graph.json) ou provável de um custom, para a cor. */
  const slugDe = (titulo: string): string =>
    niveis.find((n) => !n.builtin && norm(n.titulo) === norm(titulo))?.slug ?? slugLocal(titulo)

  const post = async (next: NivelCustomRow[], aposOk: () => void) => {
    setErrors([])
    setOkMsg(null)
    setSaving(true)
    try {
      const res = await saveNiveis(next)
      if (res.ok) {
        setCustoms((await fetchNiveis()) ?? next)
        setDirty(false)
        aposOk()
        onSaved()
        setOkMsg('✓ Níveis salvos. O mapa foi atualizado.')
        window.clearTimeout(okTimer.current)
        okTimer.current = window.setTimeout(() => setOkMsg(null), 4000)
      } else {
        setErrors(res.errors)
      }
    } catch (err) {
      setErrors([err instanceof Error ? err.message : 'Falha de rede ao salvar.'])
    } finally {
      setSaving(false)
    }
  }

  const adicionar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (customs === null || saving || apiOff) return
    const titulo = novoTitulo.trim()
    const ordem = Number(novaOrdem)
    const locais: string[] = []
    if (!titulo) locais.push('Título é obrigatório.')
    if (novaOrdem.trim() === '' || !Number.isInteger(ordem)) {
      locais.push('Ordem deve ser um número inteiro.')
    }
    const todos = [...builtins.map((n) => n.titulo), ...customs.map((c) => c.titulo)]
    if (titulo && todos.some((t) => norm(t) === norm(titulo))) {
      locais.push(`Já existe um nível chamado "${titulo}".`)
    }
    if (locais.length > 0) {
      setErrors(locais)
      return
    }
    void post([...customs, { titulo, ordem }], () => {
      setNovoTitulo('')
      setNovaOrdem('')
    })
  }

  const remover = (idx: number) => {
    if (customs === null || saving || apiOff) return
    void post(customs.filter((_, i) => i !== idx), () => {})
  }

  const editar = (idx: number, patch: Partial<NivelCustomRow>) => {
    if (customs === null) return
    setCustoms(customs.map((c, i) => (i === idx ? { ...c, ...patch } : c)))
    setDirty(true)
  }

  const salvarEdicoes = () => {
    if (customs === null || saving || apiOff) return
    const locais = customs.flatMap((c) =>
      c.titulo.trim() === '' ? ['Título de nível não pode ficar vazio.'] : [],
    )
    if (locais.length > 0) {
      setErrors(locais)
      return
    }
    void post(customs.map((c) => ({ titulo: c.titulo.trim(), ordem: c.ordem })), () => {})
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
              ⚠ API /api/niveis indisponível — lista somente leitura.
            </p>
          )}

          <ul className="niveis-modal__list">
            {builtins.map((n) => (
              <li key={n.slug} className="niveis-modal__row niveis-modal__row--builtin">
                <span className="niveis-modal__ordem">{n.ordem}</span>
                <span className="niveis-modal__titulo">{n.titulo}</span>
                <span className="niveis-modal__tag">fixo</span>
              </li>
            ))}
            {customs === null ? (
              <li className="niveis-modal__row niveis-modal__row--builtin">carregando…</li>
            ) : (
              customs.map((c, i) => (
                <li key={i} className="niveis-modal__row">
                  <input
                    type="number"
                    className="niveis-modal__ordem-input"
                    aria-label={`Ordem de ${c.titulo}`}
                    value={Number.isNaN(c.ordem) ? '' : c.ordem}
                    disabled={apiOff}
                    onChange={(e) => editar(i, { ordem: Number(e.target.value) })}
                  />
                  <span
                    className="niveis-modal__swatch"
                    style={{ background: nivelCustomColor(slugDe(c.titulo)) }}
                  />
                  <input
                    type="text"
                    className="niveis-modal__titulo-input"
                    aria-label="Título do nível"
                    value={c.titulo}
                    disabled={apiOff}
                    onChange={(e) => editar(i, { titulo: e.target.value })}
                  />
                  <button
                    type="button"
                    className="niveis-modal__remove"
                    aria-label={`Remover nível ${c.titulo}`}
                    disabled={saving || apiOff}
                    onClick={() => remover(i)}
                  >
                    remover
                  </button>
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
                disabled={saving || apiOff || customs === null}
              >
                Adicionar
              </button>
            </div>
            <p className="niveis-modal__hint">
              Ordem = posição entre os níveis existentes — ex.: 42 entra entre Fonte secundária
              (40) e Fonte (50).
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
