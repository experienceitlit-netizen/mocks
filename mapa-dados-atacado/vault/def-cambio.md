---
id: def-cambio
nome: DEF_CAMBIO
tipo: insumo
nivel: primario
dominio: Resultado
origem: "DEF e Câmbio"
sistema: "base SQL on-premise"
descricao: "resultado e saldos de empréstimos e câmbio"
centro_de_custo: null
owner: null
debito: sim
status: producao
---
Base das operações de empréstimos (DEF) e câmbio, consumida pelo Atacado. Há a hipótese de que a estrutura carregue também os saldos (estoque de carteira) além do resultado — hipótese a validar. Dois domínios misturados na mesma estrutura e a base SQL on-premise, fora da plataforma curada, caracterizam o débito técnico.
