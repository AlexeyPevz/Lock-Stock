# Deployment Guide

## Prerequisites

- Node.js 20+
- Telegram Bot Token from @BotFather
- (Optional) OpenRouter API key for content generation

## Quick Start

1. Clone the repository
```bash
git clone <repository-url>
cd lock-stock-question-bot
```

2. Install dependencies
```bash
npm install
```

3. Configure environment
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Build the project
```bash
npm run build
```

5. Seed initial content (optional)
```bash
npm run seed
# or for all content packs:
npm run seed:all
```

6. Start the bot
```bash
npm start
```

## Docker Deployment

```bash
# Build image
docker build -t lockstock-bot .

# Run container
docker run -d \
  --name lockstock-bot \
  --restart unless-stopped \
  -e BOT_TOKEN=your_bot_token \
  -e ADMIN_USER_IDS=your_telegram_id \
  -e OPENROUTER_API_KEY=your_api_key \
  -v $(pwd)/lockstock.db:/app/lockstock.db \
  lockstock-bot
```

## Cloud Deployment

### Fly.io

1. Install flyctl
```bash
curl -L https://fly.io/install.sh | sh
```

2. Login and launch
```bash
fly auth login
fly launch
```

3. Set secrets
```bash
fly secrets set BOT_TOKEN=your_bot_token
fly secrets set OPENROUTER_API_KEY=your_api_key
fly secrets set ADMIN_USER_IDS=your_telegram_id
```

4. Deploy
```bash
fly deploy
```

### Railway

1. Connect GitHub repository
2. Add environment variables in Railway dashboard
3. Deploy automatically on push

### VPS with systemd

1. Create service file `/etc/systemd/system/lockstock-bot.service`:
```ini
[Unit]
Description=Lock Stock Question Bot
After=network.target

[Service]
Type=simple
User=bot
WorkingDirectory=/opt/lockstock-bot
Environment="NODE_ENV=production"
EnvironmentFile=/opt/lockstock-bot/.env
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

2. Enable and start service
```bash
sudo systemctl enable lockstock-bot
sudo systemctl start lockstock-bot
```

## Environment Variables

### Required
- `BOT_TOKEN` - Telegram bot token

### Recommended
- `ADMIN_USER_IDS` - Comma-separated admin Telegram IDs
- `OPENROUTER_API_KEY` - For content generation

### Optional
- `FREE_ROUNDS` - Number of free rounds (default: 5)
- `PREMIUM_ROUNDS` - Number of premium rounds (default: 15)
- `LOG_LEVEL` - Logging level (DEBUG|INFO|WARN|ERROR)
- `ENABLE_BG_GEN` - Enable background generation (0|1)
- `ADMIN_LOG_CHAT_ID` - Chat ID for admin notifications

## Monitoring

### Health Check

The bot includes built-in health monitoring that logs:
- Database connectivity
- Memory usage
- Active sessions
- Content statistics

### Logs

Monitor logs with:
```bash
# Docker
docker logs -f lockstock-bot

# systemd
journalctl -u lockstock-bot -f

# Fly.io
fly logs
```

### Metrics

Key metrics logged every 5 minutes:
- Total rounds in database
- Verified rounds count
- Active game sessions
- Memory usage

## Backup

### Database backup

```bash
# Create backup
sqlite3 lockstock.db ".backup lockstock-backup-$(date +%Y%m%d).db"

# Restore backup
cp lockstock-backup-20240101.db lockstock.db
```

### Automated backups

Add to crontab:
```bash
0 3 * * * sqlite3 /opt/lockstock-bot/lockstock.db ".backup /backups/lockstock-$(date +\%Y\%m\%d).db"
```

## Troubleshooting

### Bot not responding
1. Check bot token is correct
2. Verify bot is not already running elsewhere
3. Check logs for errors

### Database errors
1. Check file permissions
2. Ensure sufficient disk space
3. Run database integrity check:
   ```bash
   sqlite3 lockstock.db "PRAGMA integrity_check"
   ```

### Memory issues
1. Check `HEALTH_CHECK_INTERVAL` logs
2. Restart bot if memory > 500MB
3. Consider increasing server resources

### Content generation failing
1. Verify OpenRouter API key
2. Check API quota/credits
3. Monitor `BG generation error` in logs

## Security Recommendations

1. Use environment variables, never commit secrets
2. Restrict database file permissions: `chmod 600 lockstock.db`
3. Use HTTPS webhook mode in production (future feature)
4. Regularly update dependencies: `npm audit fix`
5. Enable firewall and allow only necessary ports
6. Use separate user account for bot process

## Performance Tuning

1. Adjust `BG_GEN_INTERVAL_SEC` based on usage
2. Increase `HEALTH_CHECK_INTERVAL` if logs are too verbose
3. Use Redis for session storage at scale (future feature)
4. Enable database WAL mode for better concurrency