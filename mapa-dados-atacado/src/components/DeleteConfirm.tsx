// Painel de confirmação de exclusão de um componente — o mesmo conteúdo nos
// dois caminhos que excluem: o botão "🗑 Excluir" do formulário e o atalho de
// teclado (Delete/Backspace sobre o nó em evidência). O que sai junto é
// calculado sempre por removerComponente; aqui só se mostra o resultado, para
// as duas confirmações jamais divergirem no que prometem.
import type { ReactNode } from 'react'
import type { Referencia } from './catalog-delete'

interface DeleteConfirmProps {
  /** Nome do componente que sairá do catálogo. */
  nome: string
  /** Menções que serão removidas junto (referencias de removerComponente). */
  referencias: readonly Referencia[]
  /** Como confirmar, onde não há botões (o atalho diz "Enter confirma…"). */
  dica?: ReactNode
  /** Falha da última tentativa de gravar; null/'' = nenhuma. */
  erro?: string | null
}

export default function DeleteConfirm({ nome, referencias, dica, erro }: DeleteConfirmProps) {
  return (
    <div className="catalog-form__danger" role="alert">
      <strong>Excluir "{nome}" do catálogo?</strong>
      {referencias.length === 0 ? (
        <p>Nenhum outro componente cita este — nada mais será alterado.</p>
      ) : (
        <>
          <p>
            {referencias.length === 1
              ? 'Uma menção também será removida:'
              : `${referencias.length} menções também serão removidas:`}
          </p>
          <ul>
            {referencias.map((r) => (
              <li key={`${r.nome}-${r.campo}`}>
                {r.nome} — {r.campo}
              </li>
            ))}
          </ul>
        </>
      )}
      <p>Não dá para desfazer pelo app (o histórico do Git guarda a versão anterior).</p>
      {dica !== undefined && <p className="catalog-form__danger-dica">{dica}</p>}
      {erro !== undefined && erro !== null && erro !== '' && (
        <p className="catalog-form__danger-erro">✕ {erro}</p>
      )}
    </div>
  )
}
