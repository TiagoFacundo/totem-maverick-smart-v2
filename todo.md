# Project TODO

- [x] Documentar os fluxos, estados, contratos REST e decisões de integração do Totem Maverick.
- [x] Criar a máquina de estados para idle, autenticação, seleção, confirmação, dispensação, finalização, offline e erro.
- [x] Implementar a experiência touchscreen premium, com identidade visual Maverick, acessibilidade e animações com redução de movimento.
- [x] Implementar a tela IDLE com QR Code, status de conectividade e entradas para Face ID e senha.
- [x] Implementar autenticação por QR Code, teclado numérico e validação facial com estados de sucesso e falha.
- [x] Implementar seleção de produto, seleção de copo, cálculo do valor e resumo de compra.
- [x] Implementar confirmação por pressionar e segurar para autorização segura da dispensação.
- [x] Implementar tela de dispensação com progresso, volume, valor, instrução de segurar e ações de segurança.
- [x] Implementar telas de conclusão, erro, offline e parada de emergência.
- [x] Criar a camada REST com X-Totem-ID, Idempotency-Key, tentativas com backoff e fila local de encerramentos pendentes.
- [x] Criar procedimentos do backend para simulação do contrato de torneira, telemetria e comandos de sessão.
- [x] Criar testes unitários para regras de estado, cálculo, idempotência e resiliência de comunicação.
- [x] Validar a aplicação visualmente nas dimensões de totem e em dispositivos menores.
- [x] Adicionar testes do cliente para retry exponencial e reenvio da fila local de encerramentos pendentes.
- [x] Capturar e revisar o layout em um viewport compacto para comprovar a adaptação mobile.
- [x] Registrar a análise objetiva de hierarquia, legibilidade, CTAs e ausência de overflow nos layouts verificados.
- [x] Produzir a documentação de arquitetura, integração, segurança e roteiro de validação.
