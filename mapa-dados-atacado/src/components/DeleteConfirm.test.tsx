// O painel de confirmação é o que o usuário lê antes de apagar uma linha: ele
// tem que nomear o componente e listar TODA menção que sai junto, no formulário
// e no atalho de teclado (é o mesmo componente nos dois).
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import DeleteConfirm from './DeleteConfirm'

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el)

describe('DeleteConfirm', () => {
  it('sem menções, avisa que nada mais muda', () => {
    const out = html(<DeleteConfirm nome="GDAD" referencias={[]} />)

    expect(out).toContain('Excluir &quot;GDAD&quot; do catálogo?')
    expect(out).toContain('Nenhum outro componente cita este')
    expect(out).not.toContain('<ul>')
  })

  it('lista cada menção que será removida, com o campo', () => {
    const out = html(
      <DeleteConfirm
        nome="GDAD"
        referencias={[
          { nome: 'RAR 12M', campo: 'Consome/Upstream' },
          { nome: 'Painel', campo: 'Associações' },
        ]}
      />,
    )

    expect(out).toContain('2 menções também serão removidas')
    expect(out).toContain('RAR 12M')
    expect(out).toContain('Consome/Upstream')
    expect(out).toContain('Painel')
    expect(out).toContain('Associações')
  })

  it('uma menção só fica no singular', () => {
    const out = html(
      <DeleteConfirm nome="GDAD" referencias={[{ nome: 'RAR 12M', campo: 'Associações' }]} />,
    )

    expect(out).toContain('Uma menção também será removida')
  })

  it('a dica de teclas e o erro só aparecem quando vêm', () => {
    const semExtras = html(<DeleteConfirm nome="GDAD" referencias={[]} erro={null} />)
    expect(semExtras).not.toContain('catalog-form__danger-dica')
    expect(semExtras).not.toContain('catalog-form__danger-erro')

    const comExtras = html(
      <DeleteConfirm
        nome="GDAD"
        referencias={[]}
        dica={<kbd>Enter</kbd>}
        erro="não está mais no catálogo."
      />,
    )
    expect(comExtras).toContain('<kbd>Enter</kbd>')
    expect(comExtras).toContain('não está mais no catálogo.')
  })
})
