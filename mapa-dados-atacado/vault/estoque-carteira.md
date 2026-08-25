---
id: estoque-carteira
nome: Estoque (carteira)
tipo: produto
nivel: secundario
dominio: Resultado
origem: null
sistema: null
descricao: "saldos e posições da carteira do Atacado"
centro_de_custo: null
owner: null
debito: sim
status: investigacao
---
Estoque da carteira do Atacado: saldos e posições por cliente e produto. A composição ainda está em investigação — há a hipótese de que o DEF_CAMBIO carregue os saldos de empréstimos e câmbio (a validar) e um gap de mapeamento nos sistemas de produto (cash, captação e tesouraria). O débito "sim" é herdado da cadeia do DEF_CAMBIO, base SQL on-premise com dois domínios misturados.

Consome [[DEF_CAMBIO]] e [[posições por produto]].
