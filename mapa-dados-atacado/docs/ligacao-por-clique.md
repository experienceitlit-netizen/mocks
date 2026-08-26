# Ligação por clique no grafo

Especificação para uma melhoria futura: criar `Consome/Upstream` e `Associações`
ligando um componente ao outro **direto no mapa**, sem abrir o formulário. Nada
disto está implementado — o documento existe para a decisão não precisar ser
tomada de novo do zero.

## Por que é barato

A gravação já existe e é a mesma do formulário: ligar A a B é acrescentar o nome
de B na coluna `consome` (ou `associacoes`) da linha de A e salvar o catálogo
completo por `POST /api/catalogo`. O build já resolve nome → nó e emite a aresta.

Ou seja, **nada muda no build nem na API**: a melhoria é uma camada de interação
sobre peças testadas (`montarRow` em `src/components/catalog-form-row.ts`,
`saveCatalogo` em `catalog-api.ts`).

## Gesto

Na **vista de níveis** os nós têm posição fixa (`fx`/`fy`), então arrastar não os
move — o gesto de arrastar está livre e é o mais natural:

- **Arrastar de A e soltar em B** cria a ligação.
- No **mapa em modo Força** o arrastar já reposiciona o nó, então lá o caminho é
  um botão **"Ligar a…"** no balão: clica no botão, depois clica no alvo.
- `Esc` cancela a ligação em curso; soltar fora de um nó cancela.

Enquanto arrasta: linha fantasma do nó de origem até o cursor, alvos válidos
destacados e o resto esmaecido (a mecânica de `dimmedIds` já faz isso).

## Decisões pendentes (de produto, não técnicas)

1. **Qual relação o gesto cria.** `Consome/Upstream` e `Associações` são
   semanticamente diferentes. Opções: perguntar ao soltar (menu de duas opções
   no ponto do drop), usar tecla modificadora (arrastar = consome, Shift =
   associação) ou fixar uma e deixar a outra só no formulário.
2. **A direção.** Arrastar de A para B significa "A consome B" ou "B consome A"?
   A direção precisa estar visível durante o arraste (seta na linha fantasma e
   rótulo tipo "A consome B"), senão o usuário liga invertido sem perceber.
3. **Desfazer.** O save é imediato e não há undo no app. Ou o gesto pede
   confirmação, ou a ligação recém-criada oferece um "desfazer" por alguns
   segundos (o inverso — remover o nome da coluna — é trivial).

## Ponto de atenção: nomes repetidos

As colunas de ligação guardam **nome**, e o catálogo hoje tem nomes repetidos em
níveis diferentes. O build resolve pelo nível de menor ordem e avisa, mas uma
ligação criada por clique é ambígua nesse caso: o usuário aponta para um nó
específico e o arquivo grava só o nome.

Se a ligação por clique virar rotina, a correção é gravar o **id** (que já
carrega o nível: `gold-gdad`) em vez do nome. O parser aceita id ou nome, então
a mudança é pequena — mas muda o conteúdo do CSV e merece ser decidida antes.

## Esforço

Algumas horas, quase todas em interação e feedback visual. Nada de build, nada
de API, nada de formato de dados (exceto se a decisão do id acima for tomada
junto).
