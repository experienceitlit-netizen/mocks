---
id: exemplo-slug            # slug único (kebab-case)
nome: Nome do Dado
tipo: produto               # produto | insumo | sistema | dominio
dominio: A definir          # Cadastro | Mercado | Risco | Resultado | Regulatorio | A definir
origem: "área ou processo de origem"
sistema: "sistema/plataforma onde o dado vive"
descricao: "descrição curta de uma linha"
centro_de_custo: null       # null = a definir (nó renderiza incompleto)
owner: null                 # null = a definir (nó renderiza incompleto)
debito: nao                 # sim | nao | avaliar
status: producao            # producao | transicao | investigacao
---
Corpo livre em markdown. Wikilinks criam arestas direcionadas (este nó → alvo):

Consome [[Outro Dado]] e [[Mais Um Dado]].

Sintaxe opcional para mudar o rótulo da aresta: [[Alvo|produz]].
