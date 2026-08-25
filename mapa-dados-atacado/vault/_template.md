---
id: exemplo-slug            # slug único (kebab-case)
nome: Nome do Dado
tipo: produto               # produto | insumo | sistema | dominio
nivel: primario             # raiz | primario | secundario | ambos (default: primario)
dominio: A definir          # Cadastro | Mercado | Risco | Resultado | Regulatorio | A definir
origem: "área ou processo de origem"    # null em secundários = não se aplica (rota vem dos primários)
sistema: "sistema/plataforma onde o dado vive"  # null em secundários = não se aplica
descricao: "descrição curta de uma linha"
centro_de_custo: null       # null = a definir (nó renderiza incompleto)
owner: null                 # null = a definir (nó renderiza incompleto)
debito: nao                 # sim | nao | avaliar (secundário herda o pior débito das entradas)
status: producao            # producao | transicao | investigacao
---
Corpo livre em markdown. Wikilinks criam arestas direcionadas (este nó → alvo):

Consome [[Outro Dado]] e [[Mais Um Dado]].

Sintaxe opcional para mudar o rótulo da aresta: [[Alvo|produz]].

Convenções do catálogo em 4 níveis (origem → sistema → primário → secundário):
- primários NÃO têm wikilinks (a rota deles é origem/sistema do frontmatter);
- secundários linkam TODOS os primários que consomem, com origem/sistema: null;
- nivel "ambos" = produto consumido direto (primário e secundário), sem self-loop;
- nivel "raiz" = nó agregador único (atacado-dados): linka os produtos finais com
  rótulo [[Alvo|agrega]], sistema/origem/owner/centro_de_custo null e nunca
  renderiza incompleto (owner/CC não se aplicam a um agregador).
