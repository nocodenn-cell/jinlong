# Checklist de Hardening (Piloto e Producao)

Checklist minimo de seguranca e operacao.

## 1) Acesso ao servidor

- [ ] Usar autenticacao SSH por chave.
- [ ] Desabilitar login por senha no SSH.
- [ ] Desabilitar login direto como root.
- [ ] Usar usuario operacional com `sudo`.

## 2) Rede e firewall

- [ ] Ativar UFW.
- [ ] Liberar apenas portas necessarias (ex.: 22, 80, 443).
- [ ] Restringir origem para SSH quando possivel.

Comandos basicos UFW:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

## 3) Protecao contra brute force

- [ ] Instalar e habilitar Fail2Ban.
- [ ] Garantir jail ativa para SSH.

Comandos basicos:

```bash
sudo apt-get update
sudo apt-get install -y fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
sudo systemctl status fail2ban
```

## 4) Segredos e configuracao

- [ ] Nunca versionar secrets no repositorio.
- [ ] Manter variaveis sensiveis em `.env` local ou secret manager.
- [ ] Rotacionar chaves em caso de vazamento.

## 5) Observabilidade

- [ ] Configurar monitoramento de uptime.
- [ ] Configurar alerta por e-mail/Telegram.
- [ ] Conferir logs de aplicacao e banco no dia do release.

## 6) Backups

- [ ] Backup diario automatizado.
- [ ] Politica de retencao definida.
- [ ] Teste de restauracao semanal.

## 7) Go/No-Go

Somente seguir para producao quando:
- hardening minimo concluido;
- backup e restauracao testados;
- homologacao com gate `GO` registrada.
