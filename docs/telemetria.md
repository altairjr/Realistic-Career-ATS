# Viagens do jogo (telemetria) — v0.18

Base da fase 3. O leitor de telemetria (programa no PC, junto com o jogo) **nunca altera a carreira**: ele só cria rascunhos na tabela `trip_drafts`. No app, o aviso "viagens do jogo para revisar" aparece no Painel, e cada rascunho é lançado pelo formulário de viagem (já preenchido) ou descartado.

Assim, o leitor e o celular podem gravar ao mesmo tempo sem que um apague o que o outro fez.

## Contrato do rascunho
O leitor envia uma linha por entrega, com a sessão da mesma conta do app:

```http
POST /rest/v1/trip_drafts?on_conflict=user_id,event_id
apikey: <chave publicável>
Authorization: Bearer <token da sessão>
Prefer: resolution=ignore-duplicates,return=minimal

{ "user_id": "<id do usuário>", "event_id": "<id único da entrega>", "source": "telemetria", "game": "ats",
  "data": { ... } }
```

| Campo de `data` | Tipo | Significado |
|---|---|---|
| `vehicle` | `"truck"` ou `"car"` | Caminhão (contrato) ou carro (fora do contrato). Padrão: truck |
| `origin`, `dest` | texto | Cidades de origem e destino |
| `cargo` | texto | Carga (só informativo) |
| `miles` | número | Distância em milhas |
| `freight` | número | Frete pago pelo jogo (USD) |
| `bonus` | número | Bônus do jogo (USD) |
| `fuel`, `tolls` | número | Combustível e pedágios pagos na viagem (USD) |
| `fines`, `damage` | número | Multas e danos (USD) |
| `drive`, `hours` | número | Horas de direção e de serviço |
| `status` | texto | Avaliação da entrega, se o leitor souber (uma das 8 do app) |

- `event_id` evita duplicatas: a mesma entrega enviada duas vezes vira um rascunho só.
- O dia do jogo, as refeições e as noites em hotel são conferidos por você ao lançar.
- Limites (no `schema.sql`): `data` com até ~20 KB; `game` = `ats` ou `ets2`; `status` = `new`, `accepted` ou `discarded`.

## Ciclo de vida
1. O leitor cria o rascunho com `status = new`.
2. O app busca os novos a cada sincronização (15 s, ou ao voltar para a tela).
3. **Lançar**: abre o formulário preenchido; ao salvar, a viagem guarda `draftId` e o rascunho vira `accepted`.
4. **Descartar**: o rascunho vira `discarded`.
5. Sem internet, a decisão fica numa fila no navegador e é enviada depois. Um rascunho já lançado em outro aparelho some da lista pela própria viagem sincronizada (`draftId`).

## Testar sem o jogo
```bash
node tools/enviar-rascunho.mjs
```
Pergunta e-mail, senha e os dados de uma entrega, entra na sua conta e cria o rascunho. Em até 15 segundos o aviso aparece no Painel do app.

## Próximo passo: o leitor (fase 3a)
- Confirmar no SDK de telemetria atual da SCS quais eventos chegam na entrega (frete, distância, dano, multas, pedágios, combustível) e com quais nomes.
- Escolher entre plugin próprio e um plugin da comunidade.
- Programa companheiro que entra na conta (mesmo login do app) e envia cada entrega neste formato.
