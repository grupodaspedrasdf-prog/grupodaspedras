# Grupo das Pedras

Placar e ranking do nosso dominó. É um app web instalável (PWA): abre pelo navegador,
vai para a tela de início do celular e funciona sem internet.

## Como usar na mesa

1. **Abrir os trabalhos** (tela Ranking) — cria a noite, com código pela data.
2. **Sala** — toque em quem chegou.
3. **Mesa** — arraste os nomes para as cadeiras. Parceiros sentam de frente.
4. **Placar** — marque os pontos. O app anuncia gato, gato aleijado ou partida fechada, e você toca em Encerrar.
5. **Resumo** — confirme; ele lança GD/GT/PF e já monta a próxima mesa pelo rodízio.
6. **Fechar os trabalhos** — envia a noite para o grupo, atualiza o ranking e entrega os títulos.
   Depois disso a noite não muda mais.

## Regras que o app conhece

| Desfecho | Quando | O que lança |
|---|---|---|
| **Gato** | 4 × 0 exato | 1 GD para cada vencedor, 1 GT para cada perdedor |
| **Gato Aleijado** | acima de 4 × 0 (5, 6, 7, 8) | igual ao gato — muda só o registro |
| **Partida Fechada** | 4 × 1, 2 ou 3, **com fila** | 1 PF para cada vencedor |
| **Reiniciada** | sem fila e sem gato | nada; placar volta a 0 × 0 |
| **Sem resultado** | acabou a noite no meio | nada |

**Ranking:** saldo puro (GD − GT). Desempate: PF, depois GD.

**Rodízio da fila:** ninguém esperando → mesma mesa. 1 esperando → sai quem tem mais partidas
seguidas; empatados, puxam pedra. 2 esperando → sai a dupla. 3 ou mais → sai a dupla e ela
volta na frente da fila.

## Publicar / atualizar

O app é servido pelo **GitHub Pages**, direto da branch `main`.

- Ativar uma vez: **Settings → Pages → Source: Deploy from a branch → main / (root)**.
- A cada mudança: `git push`. Em um ou dois minutos o site atualiza.
- **Importante:** ao publicar uma versão nova, mude o número em `const CACHE = 'pedras-v1'`
  no arquivo `sw.js` (v2, v3...). É isso que faz os celulares baixarem a versão nova em vez
  de continuar abrindo a antiga do cache.

## Instalar no celular

Abra o endereço do site no Chrome (Android) ou Safari (iPhone) e escolha
**Adicionar à tela de início**. Vira ícone e abre em tela cheia.

## Estrutura

```
index.html            a tela
styles.css            aparência (paleta Madeira e Feltro)
app.js                regras do jogo, placar, rodízio, ranking, salvamento local
sync.js               Firebase: envio e leitura das noites
manifest.webmanifest  dados de instalação
sw.js                 funcionamento offline
firestore.rules       regras de segurança (colar no console do Firebase)
icons/                emblema do grupo
```

## Como os dados ficam guardados

- **No celular:** tudo. O app funciona 100% offline, inclusive marcando a noite inteira.
- **Na nuvem (Firestore):** só as noites **fechadas**, enviadas no momento do fecho.
- **O ranking não é armazenado** — é recalculado a partir das noites toda vez que o app abre.
  Assim ele nunca discorda do histórico.

Como só o celular da mesa escreve, e só uma vez por noite, não existe conflito entre aparelhos.
