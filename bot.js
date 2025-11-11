require('dotenv').config();
const { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const mongoose = require('mongoose');
const { Order, User, ChatMessage, DailyStats } = require('./models');
const { handleSlashCommand } = require('./slashCommands');
const vccService = require('./vccService');

// Discord Bot Setup
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// ============================================
// VCC INVENTORY MONITORING
// ============================================

const VCC_ALERT_CHANNEL_ID = '1437506432223150183';
const VCC_LOW_THRESHOLD = 10;
const VCC_CHECK_INTERVAL = 5 * 60 * 1000; // Check every 5 minutes

let lastAlertSent = 0;
let alertCooldown = 60 * 60 * 1000; // Only alert once per hour

const ORDER_NOTIFICATION_CHANNEL_ID = '1437507548122185840';

function startVccInventoryMonitoring() {
  console.log(`📊 VCC Inventory Monitoring started (checking every ${VCC_CHECK_INTERVAL / 60000} minutes)`);

  checkVccInventoryAndAlert();
  setInterval(checkVccInventoryAndAlert, VCC_CHECK_INTERVAL);
}

async function checkVccInventoryAndAlert() {
  try {
    const stats = await vccService.getVccStats();

    console.log(`[VCC Monitor] Unused: ${stats.unused}, Used: ${stats.used}, Total: ${stats.total}`);

    if (stats.unused <= VCC_LOW_THRESHOLD) {
      const now = Date.now();

      if (now - lastAlertSent < alertCooldown) {
        console.log(`⏱️ [VCC Monitor] Inventory low but alert on cooldown (${Math.round((alertCooldown - (now - lastAlertSent)) / 60000)} minutes remaining)`);
        return;
      }

      try {
        const alertChannel = await client.channels.fetch(VCC_ALERT_CHANNEL_ID);

        if (!alertChannel) {
          console.error(`❌ [VCC Monitor] Alert channel ${VCC_ALERT_CHANNEL_ID} not found`);
          return;
        }

        const embed = {
          color: stats.unused === 0 ? 0xFF0000 : 0xFF9500,
          title: stats.unused === 0 ? '🚨 VCC INVENTORY EMPTY!' : '⚠️ VCC INVENTORY LOW!',
          description: stats.unused === 0
            ? '@everyone **URGENT:** No VCCs available! Orders cannot be processed until cards are added.'
            : '@everyone VCC inventory is running low. Please refill soon to avoid order processing delays.',
          fields: [
            { name: '🟢 Unused VCCs', value: `${stats.unused}`, inline: true },
            { name: '🔴 Used VCCs', value: `${stats.used}`, inline: true },
            { name: '📊 Total VCCs', value: `${stats.total}`, inline: true }
          ],
          footer: { text: 'Upload more VCCs using .txt file or /vcc-stats command' },
          timestamp: new Date()
        };

        await alertChannel.send({
          content: '@everyone',
          embeds: [embed]
        });

        lastAlertSent = now;
        console.log(`🚨 [VCC Monitor] Low inventory alert sent to channel ${VCC_ALERT_CHANNEL_ID}`);

      } catch (error) {
        console.error('❌ [VCC Monitor] Error sending alert:', error);
      }
    } else {
      console.log(`✅ [VCC Monitor] Inventory healthy (${stats.unused} unused VCCs)`);
    }

  } catch (error) {
    console.error('❌ [VCC Monitor] Error checking inventory:', error);
  }
}

// ============================================
// ORDER NOTIFICATION & DAILY STATS
// ============================================

async function sendOrderNotification(type, orderNumber, queueSize, additionalData = {}) {
  try {
    const channel = await client.channels.fetch(ORDER_NOTIFICATION_CHANNEL_ID);
    if (!channel) {
      console.error(`❌ Order notification channel ${ORDER_NOTIFICATION_CHANNEL_ID} not found`);
      return;
    }

    let message = '';
    let color = 0x5865F2;

    if (type === 'processing') {
      message = `🔄 Placing order #${orderNumber} | Queue: ${queueSize} orders remaining`;
      color = 0x5865F2;
    } else if (type === 'success') {
      const uberLink = additionalData.uberLink || 'N/A';
      message = `✅ Order #${orderNumber} placed successfully! | Queue: ${queueSize} orders remaining`;
      color = 0x57F287;

      if (uberLink && uberLink !== 'N/A') {
        message += `\n🔗 ${uberLink}`;
      }

      await updateDailyStats('success');

    } else if (type === 'failure') {
      const attempt = additionalData.attempt || 1;
      const maxAttempts = additionalData.maxAttempts || 3;
      const error = additionalData.error || 'Unknown error';

      message = `❌ Order #${orderNumber} failed (attempt ${attempt}/${maxAttempts}) | Queue: ${queueSize} orders remaining`;
      color = 0xED4245;

      if (error) {
        message += `\n⚠️ ${error}`;
      }

      if (attempt >= maxAttempts) {
        await updateDailyStats('failure');
      }
    }

    await channel.send({ content: message });

    console.log(`📢 [Order Notification] ${type}: #${orderNumber}`);

  } catch (error) {
    console.error('❌ Error sending order notification:', error);
  }
}

async function updateDailyStats(type) {
  try {
    const today = new Date().toISOString().split('T')[0];

    let stats = await DailyStats.findOne({ date: today });

    if (!stats) {
      stats = new DailyStats({
        date: today,
        successCount: 0,
        failureCount: 0
      });
    }

    if (type === 'success') {
      stats.successCount += 1;
    } else if (type === 'failure') {
      stats.failureCount += 1;
    }

    await stats.save();
    console.log(`📊 [Daily Stats] ${today} - Success: ${stats.successCount}, Failure: ${stats.failureCount}`);

  } catch (error) {
    console.error('❌ Error updating daily stats:', error);
  }
}

async function getTodayStats() {
  try {
    const today = new Date().toISOString().split('T')[0];
    let stats = await DailyStats.findOne({ date: today });

    if (!stats) {
      stats = {
        successCount: 0,
        failureCount: 0
      };
    }

    return stats;
  } catch (error) {
    console.error('❌ Error getting today stats:', error);
    return { successCount: 0, failureCount: 0 };
  }
}

// Make functions globally accessible for Python automation script API calls
global.sendOrderNotification = sendOrderNotification;

// ============================================
// DISCORD CLIENT READY
// ============================================

client.once('ready', () => {
  console.log('✅ Discord Bot is online!');
  console.log(`🔔 Logged in as ${client.user.tag}`);

  startVccInventoryMonitoring();
});

// ============================================
// MESSAGE HANDLERS
// ============================================

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // /vcc-stats command
  if (message.content.toLowerCase() === '/vcc-stats') {
    try {
      const stats = await vccService.getVccStats();

      const embed = {
        color: 0x5865F2,
        title: '💳 VCC System Statistics',
        fields: [
          { name: '🟢 Unused VCCs', value: `${stats.unused}`, inline: true },
          { name: '🔴 Used VCCs', value: `${stats.used}`, inline: true },
          { name: '📊 Total VCCs', value: `${stats.total}`, inline: true }
        ],
        footer: { text: 'BitePlug VCC Management System' },
        timestamp: new Date()
      };

      if (stats.unused < 10) {
        embed.description = '⚠️ **Warning:** Low VCC inventory! Consider adding more cards.';
        embed.color = 0xFF9500;
      }

      await message.reply({ embeds: [embed] });
      console.log(`📊 VCC stats requested by ${message.author.username}`);

    } catch (error) {
      console.error('❌ Error fetching VCC stats:', error);
      await message.reply('❌ Failed to fetch VCC statistics.');
    }

    return;
  }

  // /vcc-check command
  if (message.content.toLowerCase() === '/vcc-check') {
    try {
      await message.reply('🔍 Checking VCC inventory and sending alert if needed...');

      const stats = await vccService.getVccStats();

      if (stats.unused <= VCC_LOW_THRESHOLD) {
        const originalCooldown = lastAlertSent;
        lastAlertSent = 0;

        await checkVccInventoryAndAlert();

        if (lastAlertSent === 0) {
          lastAlertSent = originalCooldown;
        }

        await message.reply(`✅ Alert sent! Inventory is low: ${stats.unused} unused VCCs.`);
      } else {
        await message.reply(`✅ Inventory is healthy: ${stats.unused} unused VCCs. No alert needed.`);
      }

    } catch (error) {
      console.error('❌ Error with /vcc-check command:', error);
      await message.reply('❌ Failed to check VCC inventory.');
    }

    return;
  }

  // /dailystats command
  if (message.content.toLowerCase() === '/dailystats') {
    try {
      const todayStats = await getTodayStats();
      const vccStats = await vccService.getVccStats();
      const queuedOrders = await Order.countDocuments({ status: 'queued' });

      const totalOrders = todayStats.successCount + todayStats.failureCount;
      const successRate = totalOrders > 0
        ? ((todayStats.successCount / totalOrders) * 100).toFixed(1)
        : 0;

      const today = new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      const embed = {
        color: todayStats.successCount > todayStats.failureCount ? 0x57F287 : 0xFF9500,
        title: '📊 Daily Statistics',
        description: `**${today}**`,
        fields: [
          {
            name: '📈 Orders Today',
            value: `✅ Success: ${todayStats.successCount}\n❌ Failed: ${todayStats.failureCount}\n📊 Success Rate: ${successRate}%`,
            inline: false
          },
          {
            name: '💳 VCC Inventory',
            value: `🟢 Unused: ${vccStats.unused}\n🔴 Used: ${vccStats.used}\n📊 Total: ${vccStats.total}`,
            inline: true
          },
          {
            name: '🔄 Current Queue',
            value: `${queuedOrders} orders`,
            inline: true
          }
        ],
        footer: { text: 'Last 24 hours' },
        timestamp: new Date()
      };

      await message.reply({ embeds: [embed] });
      console.log(`📊 Daily stats requested by ${message.author.username}`);

    } catch (error) {
      console.error('❌ Error with /dailystats command:', error);
      await message.reply('❌ Failed to fetch daily statistics.');
    }

    return;
  }

  // VCC file upload (txt file attachment)
  if (message.attachments.size > 0) {
    const attachment = message.attachments.first();

    if (attachment.name.endsWith('.txt')) {
      try {
        await message.reply('📥 Processing VCC file... Please wait.');

        const response = await fetch(attachment.url);
        const fileContent = await response.text();

        const cardStrings = fileContent
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0);

        if (cardStrings.length === 0) {
          await message.reply('❌ File is empty or contains no valid data.');
          return;
        }

        const results = await vccService.bulkAddVccs(cardStrings);

        const embed = {
          color: results.failed > 0 ? 0xFF9500 : 0x57F287,
          title: '💳 VCC Upload Results',
          fields: [
            { name: '✅ Successfully Added', value: `${results.added}`, inline: true },
            { name: '❌ Failed', value: `${results.failed}`, inline: true },
            { name: '📊 Total Processed', value: `${cardStrings.length}`, inline: true }
          ],
          timestamp: new Date()
        };

        if (results.failed > 0 && results.errors.length > 0) {
          const errorMessages = results.errors.slice(0, 5).map(err =>
            `• ${err.error}`
          ).join('\n');

          embed.fields.push({
            name: '⚠️ Error Details (first 5)',
            value: errorMessages,
            inline: false
          });

          if (results.errors.length > 5) {
            embed.footer = { text: `... and ${results.errors.length - 5} more errors` };
          }
        }

        await message.reply({ embeds: [embed] });

        console.log(`📥 VCC file uploaded by ${message.author.username}: ${results.added} added, ${results.failed} failed`);

      } catch (error) {
        console.error('❌ Error processing VCC file:', error);
        await message.reply('❌ Failed to process VCC file. Make sure the format is correct:\n`card_number,exp_date,cvv,zip_code,email`');
      }

      return;
    }
  }

  // /close command
  if (message.content.toLowerCase() === '/close') {
    try {
      if (!message.channel.name.startsWith('order-')) {
        await message.reply('❌ This command can only be used in ticket channels.');
        return;
      }

      const ticketNumber = message.channel.name.replace('order-', '');

      const order = await Order.findOne({
        orderNumber: ticketNumber,
        discordChannelId: message.channel.id
      });

      if (order && !order.charged) {
        await message.reply('⚠️ **Warning:** This order has not been charged yet!\nUse the Success/Fail buttons to properly close this ticket, or use `/close` again to force close.');

        const recent = await message.channel.messages.fetch({ limit: 5 });
        const hasWarning = Array.from(recent.values()).some(msg =>
          msg.author.id === client.user.id &&
          msg.content.includes('Warning') &&
          (Date.now() - msg.createdTimestamp) < 10000
        );

        if (!hasWarning) {
          return;
        }
      }

      await message.reply('🔒 **Closing ticket...** Channel will be deleted in 5 seconds.');

      setTimeout(async () => {
        try {
          await message.channel.delete();
          console.log(`🔒 Closed ticket channel #${ticketNumber} via /close command`);
        } catch (error) {
          console.error('Error closing channel:', error);
        }
      }, 5000);

    } catch (error) {
      console.error('❌ Error handling /close command:', error);
      await message.reply('❌ An error occurred while closing the ticket.');
    }

    return;
  }

  // /announce command (Owner only)
  if (message.content.startsWith('/announce ')) {
    try {
      if (message.author.id !== process.env.OWNER_ID) {
        await message.reply('❌ Only the bot owner can use this command.');
        return;
      }

      const announcement = message.content.substring('/announce '.length).trim();

      if (!announcement) {
        await message.reply('❌ Please provide an announcement message.\n**Usage:** `/announce Your message here`');
        return;
      }

      await message.delete();

      const embed = {
        color: 0x5865F2,
        title: '📢 Announcement',
        description: announcement,
        footer: { text: `Sent by ${message.author.username}` },
        timestamp: new Date()
      };

      await message.channel.send({
        content: '@everyone',
        embeds: [embed]
      });

      console.log(`📢 Announcement sent by ${message.author.username} in #${message.channel.name}`);

    } catch (error) {
      console.error('❌ Error sending announcement:', error);
      await message.reply('❌ Failed to send announcement.');
    }

    return;
  }
});

// ============================================
// BUTTON INTERACTIONS
// ============================================

client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    return handleSlashCommand(interaction);
  }

  if (!interaction.isButton()) return;

  const parts = interaction.customId.split('_');
  let action, type, ticketNumber;

  if (parts[0] === 'claim') {
    action = parts[0];
    ticketNumber = parts[1];
    type = null;
  } else {
    action = parts[0];
    type = parts[1];
    ticketNumber = parts[2];
  }

  console.log(`🔘 Button clicked: action=${action}, type=${type}, ticketNumber=${ticketNumber}`);

  try {
    if (action === 'claim') {
      await interaction.reply({
        content: `🎫 **${interaction.user.username}** has claimed this ticket!`,
        ephemeral: false
      });

      const claimRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`claim_${ticketNumber}`)
            .setLabel(`🎫 Claimed by ${interaction.user.username}`)
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true)
        );

      const closeRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`close_success_${ticketNumber}`)
            .setLabel('✅ Success')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`close_fail_${ticketNumber}`)
            .setLabel('❌ Fail')
            .setStyle(ButtonStyle.Danger)
        );

      await interaction.message.edit({ components: [claimRow, closeRow] });

    } else if (action === 'closeticket') {
      await interaction.reply({
        content: `🔒 **Closing ticket #${ticketNumber}...** Channel will be deleted in 3 seconds.`,
        ephemeral: false
      });

      setTimeout(async () => {
        try {
          await interaction.channel.delete();
          console.log(`🗑️ Deleted ticket channel #${ticketNumber}`);
        } catch (error) {
          console.error('Error deleting channel:', error);
        }
      }, 3000);

    } else if (action === 'close') {
      let statusEmoji = '';
      let statusText = '';
      let shouldCharge = false;

      if (type === 'success') {
        statusEmoji = '✅';
        statusText = 'SUCCESS';
        shouldCharge = true;
      } else if (type === 'fail') {
        statusEmoji = '❌';
        statusText = 'FAILED';
        shouldCharge = false;
      }

      const order = await Order.findOne({
        orderNumber: ticketNumber,
        discordChannelId: interaction.channel.id
      });

      if (!order) {
        await interaction.reply({
          content: '❌ Order not found in database.',
          ephemeral: true
        });
        return;
      }

      if (shouldCharge && !order.charged) {
        const user = await User.findById(order.userId);
        if (!user) {
          await interaction.reply({
            content: '❌ User not found.',
            ephemeral: true
          });
          return;
        }

        if (user.balanceCents < order.chargeCents) {
          await interaction.reply({
            content: '❌ User no longer has sufficient funds. Cannot mark as success.',
            ephemeral: true
          });
          return;
        }

        user.balanceCents -= order.chargeCents;
        await user.save();

        order.charged = true;
        order.status = 'delivered';
        order.completedAt = new Date();
        await order.save();

        console.log(`✅ Charged $${(order.chargeCents / 100).toFixed(2)} for order #${ticketNumber}`);

        await interaction.reply({
          content: `${statusEmoji} **Ticket #${ticketNumber} marked as ${statusText}**\n💳 Charged: $${(order.chargeCents / 100).toFixed(2)}\n👤 Customer balance: $${(user.balanceCents / 100).toFixed(2)}\n\n✅ Click "Close Ticket" when ready to close this channel.`,
          ephemeral: false
        });
      } else {
        order.status = 'failed';
        order.charged = false;
        order.completedAt = new Date();
        await order.save();

        await interaction.reply({
          content: `${statusEmoji} **Ticket #${ticketNumber} marked as ${statusText}**\n\n💰 No charges applied.\n✅ Click "Close Ticket" when ready to close this channel.`,
          ephemeral: false
        });
      }

      // Disable Success/Fail buttons and show Close Ticket button
      const disabledClaimRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`claim_${ticketNumber}`)
            .setLabel(`🎫 ${statusText}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true)
        );

      const disabledCloseRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`close_success_${ticketNumber}`)
            .setLabel('✅ Success')
            .setStyle(ButtonStyle.Success)
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId(`close_fail_${ticketNumber}`)
            .setLabel('❌ Fail')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(true)
        );

      const closeTicketRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`closeticket_ticket_${ticketNumber}`)
            .setLabel('🗑️ Close Ticket')
            .setStyle(ButtonStyle.Danger)
        );

      const messages = await interaction.channel.messages.fetch({ limit: 10 });
      for (const msg of messages.values()) {
        if (msg.components.length > 0 && msg.components[0].components[0].data.custom_id?.includes(ticketNumber)) {
          await msg.edit({ components: [disabledClaimRow, disabledCloseRow, closeTicketRow] });
          break;
        }
      }
    }

  } catch (error) {
    console.error('❌ Error handling button interaction:', error);
    await interaction.reply({
      content: '❌ An error occurred processing your request.',
      ephemeral: true
    });
  }
});

// ============================================
// CONNECT TO MONGODB & START BOT
// ============================================

const mongoUri = process.env.MONGODB_URI;
console.log('🔍 Attempting MongoDB connection...');

mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    retryWrites: true,
    w: 'majority'
  })
  .then(() => {
    console.log('✅ MongoDB connected');

    // Login to Discord
    client.login(process.env.DISCORD_BOT_TOKEN);
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  });
