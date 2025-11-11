# BitePlug Discord Bot

Discord bot for managing tickets, monitoring VCC inventory, sending order notifications, and tracking daily statistics for the BitePlug order system.

## Features

- **Ticket Management**: Create and manage Discord channels for order processing
- **VCC Inventory Monitoring**: Automated alerts when VCC inventory runs low
- **Order Notifications**: Real-time updates on order processing status
- **Daily Statistics**: Track success/failure rates and system health
- **Slash Commands**: Admin commands for VCC stats, daily stats, and more
- **File Uploads**: Bulk VCC uploads via .txt files
- **Button Interactions**: Interactive ticket claiming and closing

## Architecture

This service is part of a **3-service architecture**:

1. **biteplug-web-api** - Web server, API, WebSocket, frontend
2. **biteplug-discord-bot** (this service) - Discord bot, ticket management, notifications
3. **biteplug-payment-worker** - Payment verification (Venmo email monitoring, crypto webhooks)

All services share the same MongoDB database.

## Discord Commands

### Text Commands (anyone in server)

- `/vcc-stats` - Display VCC inventory statistics
- `/vcc-check` - Force VCC inventory check and alert if low
- `/dailystats` - Show daily order statistics (success rate, queue size, VCC inventory)
- `/close` - Close ticket channel (warns if order not charged)
- `/announce <message>` - Send announcement (owner only)

### File Uploads

- **Upload .txt file** - Bulk add VCCs
  - Format: `card_number,exp_date,cvv,zip_code,email` (one per line)
  - Bot will process and report results

### Button Interactions

- **Claim Ticket** - Assign ticket to staff member
- **✅ Success** - Mark order as successful (charges customer)
- **❌ Fail** - Mark order as failed (no charge)
- **🗑️ Close Ticket** - Delete ticket channel

## VCC Inventory Monitoring

The bot automatically monitors VCC inventory every 5 minutes:

- **Alert when unused < 10 VCCs**
- **Alert cooldown:** 1 hour (prevents spam)
- **Alert channel:** Configured via `VCC_ALERT_CHANNEL_ID` in code (line 12)
- **Manual check:** Use `/vcc-check` command

## Order Notifications

Sends real-time order updates to Discord:

- **🔄 Processing** - Order started
- **✅ Success** - Order completed (includes Uber Eats link)
- **❌ Failed** - Order failed (includes error message)
- **Notification channel:** Configured via `ORDER_NOTIFICATION_CHANNEL_ID` in code (line 16)

## Daily Statistics

Tracks:
- **Success count** - Orders completed today
- **Failure count** - Orders failed today
- **Success rate** - Percentage of successful orders
- **VCC inventory** - Current unused/used counts
- **Queue size** - Orders waiting to be processed

Statistics reset daily at midnight UTC.

## Environment Variables

See `.env.example` for all required variables.

### Critical Variables:

- `MONGODB_URI` - MongoDB connection string (shared with other services)
- `DISCORD_BOT_TOKEN` - Discord bot token from Discord Developer Portal
- `DISCORD_GUILD_ID` - Your Discord server ID
- `OWNER_ID` - Discord user ID for owner-only commands

## Local Development

```bash
# Install dependencies
npm install

# Copy and configure environment variables
cp .env.example .env
# Edit .env with your values

# Start the bot
npm start
```

The bot will connect to Discord and MongoDB.

## Railway Deployment

### Prerequisites

1. GitHub repository created: `https://github.com/sparkky4568/biteplug-discord-bot.git`
2. MongoDB Atlas database (same URI shared across all 3 services)
3. Discord bot created in Discord Developer Portal
4. Railway account with project created

### Discord Bot Setup

1. **Create Discord Application:**
   - Go to: https://discord.com/developers/applications
   - Click "New Application"
   - Name it "BitePlug Bot"

2. **Create Bot:**
   - Go to "Bot" tab
   - Click "Add Bot"
   - Copy the bot token (this is `DISCORD_BOT_TOKEN`)
   - Enable "Message Content Intent" (required for commands)

3. **Invite Bot to Server:**
   - Go to "OAuth2" → "URL Generator"
   - Select scopes: `bot`, `applications.commands`
   - Select permissions: `Administrator` (or specific permissions)
   - Copy generated URL and open in browser
   - Select your server and authorize

4. **Get Server ID:**
   - Enable Developer Mode in Discord (Settings → Advanced)
   - Right-click your server → Copy ID (this is `DISCORD_GUILD_ID`)

### Deploy Steps

1. **Push code to GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit: BitePlug Discord Bot"
   git remote add origin https://github.com/sparkky4568/biteplug-discord-bot.git
   git branch -M main
   git push -u origin main
   ```

2. **Create Railway service:**
   - Go to Railway dashboard
   - Select your "BitePlugStuff" project
   - Click "New Service" → "GitHub Repo"
   - Select `biteplug-discord-bot`
   - Railway will detect the Dockerfile and build automatically

3. **Set environment variables in Railway:**
   - Go to service settings → Variables
   - Add all variables from `.env.example`
   - **Important:** Use the same `MONGODB_URI` as other services

4. **Test deployment:**
   - Check Railway logs for: `✅ Discord Bot is online!`
   - Check Discord server - bot should appear online
   - Test `/vcc-stats` command in Discord

## Slash Commands (Optional)

To register slash commands (modern Discord UI):

1. Create `registerCommands.js`:
```javascript
require('dotenv').config();
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');

const commands = [
  {
    name: 'vcc-stats',
    description: 'Display VCC inventory statistics'
  },
  {
    name: 'vcc-check',
    description: 'Force VCC inventory check'
  },
  {
    name: 'dailystats',
    description: 'Show daily order statistics'
  }
];

const rest = new REST({ version: '9' }).setToken(process.env.DISCORD_BOT_TOKEN);

(async () => {
  try {
    console.log('Registering slash commands...');
    await rest.put(
      Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID),
      { body: commands }
    );
    console.log('✅ Slash commands registered!');
  } catch (error) {
    console.error('❌ Error registering commands:', error);
  }
})();
```

2. Run: `node registerCommands.js`

**Note:** Current bot uses text commands (`/vcc-stats`) which work without registration.

## Customization

### Change Alert Thresholds

Edit `bot.js`:
```javascript
const VCC_LOW_THRESHOLD = 10; // Alert when < 10 VCCs (line 12)
const VCC_CHECK_INTERVAL = 5 * 60 * 1000; // Check every 5 minutes (line 13)
const alertCooldown = 60 * 60 * 1000; // 1 hour cooldown (line 16)
```

### Change Notification Channels

Edit `bot.js`:
```javascript
const VCC_ALERT_CHANNEL_ID = '1437506432223150183'; // VCC alerts (line 11)
const ORDER_NOTIFICATION_CHANNEL_ID = '1437507548122185840'; // Order updates (line 16)
```

To get channel IDs:
- Enable Developer Mode in Discord
- Right-click channel → Copy ID

## Project Structure

```
biteplug-discord-bot/
├── bot.js                  # Main Discord bot client
├── slashCommands.js        # Slash command handlers
├── models.js               # MongoDB schemas (Mongoose)
├── vccService.js           # VCC management functions
├── package.json            # Dependencies
├── Dockerfile              # Docker build configuration
├── railway.toml            # Railway deployment config
├── .env.example            # Environment variables template
└── README.md               # This file
```

## Dependencies

- **discord.js** - Discord bot framework (v14)
- **mongoose** - MongoDB ORM
- **dotenv** - Environment variable loading

## Troubleshooting

### Bot not coming online

**Symptom:** Bot shows offline in Discord
**Solution:**
- Check `DISCORD_BOT_TOKEN` is correct
- Ensure bot has been invited to server
- Check Railway logs for errors

### Commands not working

**Symptom:** Bot doesn't respond to `/vcc-stats`
**Solution:**
- Ensure "Message Content Intent" is enabled in Discord Developer Portal
- Check bot has permissions to read/send messages in channel
- Check Railway logs for errors

### VCC alerts not sending

**Symptom:** No alerts when VCC inventory is low
**Solution:**
- Check `VCC_ALERT_CHANNEL_ID` is correct channel ID
- Verify bot has permission to send messages in alert channel
- Check Railway logs for monitoring messages

### MongoDB connection failing

**Symptom:** Bot crashes on startup
**Solution:**
- Verify `MONGODB_URI` is correct
- Ensure MongoDB Atlas allows connections from `0.0.0.0/0` (Railway)
- Check Railway logs for connection errors

## Support

For issues or questions:
- Check Railway logs: `railway logs`
- Verify bot permissions in Discord
- Ensure MongoDB connection works

---

**Part of the BitePlug Order System**
Version 1.0.0
