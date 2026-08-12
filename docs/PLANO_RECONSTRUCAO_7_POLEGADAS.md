# Plano de Reconstrução — Totem Vertical de 7 Polegadas

## Comparativo objetivo

| Elemento | Implementação anterior | Referência Lovable | Direção de reconstrução |
|---|---|---|---|
| Estrutura | Navegação em telas ricas, com cards decorativos, gradientes dourados e grandes títulos serifados | Interface utilitária, escura e compacta, com um único foco de ação por estado | Substituir a camada visual por uma composição funcional de coluna única. |
| Identidade | Marca textual criada com ícone genérico | Logotipo Maverick pequeno e real no topo | Usar o ativo de marca observado na referência. |
| Tela inicial | QR Code e ações divididos em composição de marketing | Produto, dados técnicos, QR Code e ações horizontais organizados por prioridade | Reproduzir a hierarquia da referência em formato vertical: produto, métricas, QR e ações grandes empilhadas. |
| Face ID | Moldura de câmera larga, botões múltiplos e explicação longa | Um círculo de captura central e um único cancelar | Reduzir ao padrão visual minimalista da referência; manter a integração real da câmera em segundo plano. |
| Sessão | Copo ilustrado, botão circular para servir e barra de progresso | Títulos, identificador de sessão, métricas e botão de encerramento | Recriar a visão operacional da referência e preservar o polling de `GET /command`. |
| Conclusão | Cartão de resultado e ação de nova compra | Confirmação central temporizada, dois cards de resultado e retorno automático | Aplicar o retorno automático após a confirmação de `POST /finished`. |
| Cartão | Não era o fluxo principal visual | Cadastro simples com nome, CPF e data de nascimento | Disponibilizar o cadastro como na referência, sem processar dados de cartão no navegador. |

## Especificação de ergonomia

O alvo de display é vertical de 7 polegadas. A interface deve priorizar uma largura de projeto de aproximadamente 600 pixels, evitar rolagem horizontal e reservar áreas de toque de pelo menos 48 pixels CSS para as ações críticas. A tela principal será vertical, com conteúdo centralizado, cabeçalho reduzido e rodapé técnico; em dimensões maiores, a escala visual permanece compacta em vez de migrar para duas colunas.

## Preservações técnicas obrigatórias

A reconstrução não remove a máquina de estados, `X-Totem-ID`, `Idempotency-Key`, tentativas exponenciais, fila local de encerramentos, polling de `GET /command`, `POST /finished`, parada de emergência, bloqueio offline ou a confirmação por manter pressionado antes de liberar uma compra. Esses comportamentos serão conectados às telas compactas da referência, sem estarem expostos como elementos decorativos da interface.
