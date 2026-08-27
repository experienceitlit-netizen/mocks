# Ligação por clique no grafo

Especificação para uma melhoria futura: criar `Consome/Upstream` e `Associações`
ligando um componente ao outro **direto no mapa**, sem abrir o formulário. Nada
disto está implementado — o documento existe para a decisão não precisar ser
tomada de novo do zero.

## Por que é barato

A gravação já existe e é a mesma do formulário: ligar A a B é acrescentar o **id**
de B na coluna `consome` (ou `associacoes`) da linha de A e salvar o catálogo
completo por `POST /api/catalogo`. O build resolve id → nó e emite a aresta.

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

## Ponto de atenção: nomes repetidos — RESOLVIDO

Este documento registrava um risco: as colunas de ligação guardavam **nome**, e o
catálogo tem nomes repetidos em níveis diferentes, então uma ligação criada por
clique seria ambígua (o usuário aponta para um nó específico, o arquivo grava só
o rótulo). Renomear um componente também deixava órfã toda menção a ele.

**Isso foi resolvido antes desta melhoria.** O `catalogo.csv` tem hoje uma coluna
`id` — a chave estável de cada linha, gerada do nome na criação e imutável daí em
diante —, e `consome`/`associacoes` guardam **ids**. Consequências para o gesto
de ligar por clique:

- **A ambiguidade sumiu.** Gravar o id do nó em que o usuário soltou o cursor diz
  exatamente qual componente é, mesmo com nomes repetidos.
- **A ligação criada não quebra depois.** Renomear ou mudar de nível o alvo não
  mexe em quem aponta para ele.
- **Não há mais decisão de formato pendente**: o formulário já grava id (o
  usuário segue vendo e escolhendo nomes), e o gesto de clique faria o mesmo.

## Esforço

Algumas horas, quase todas em interação e feedback visual. Nada de build, nada
de API, nada de formato de dados.
