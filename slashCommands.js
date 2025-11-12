const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const vccService = require('./vccService');
const { Order, DailyStats } = require('./models');

/**
 * Handle all Discord slash commands
 * @param {Interaction} interaction - Discord interaction object
 */
async function handleSlashCommand(interaction) {
  const { commandName } = interaction;

  // Allow /ping for everyone (no admin check)
  if (commandName === 'ping') {
    return handlePing(interaction);
  }

  // Verify user has admin permissions for all other commands
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({
      content: '❌ You do not have permission to use this command. (Admin only)',
      ephemeral: true,
    });
  }

  try {
    switch (commandName) {
      case 'vcc-stats':
        await handleVccStats(interaction);
        break;
      case 'vcc-check':
        await handleVccCheck(interaction);
        break;
      case 'dailystats':
        await handleDailyStats(interaction);
        break;
      case 'close':
        await handleClose(interaction);
        break;
      case 'complete-order':
        await handleCompleteOrder(interaction);
        break;
      case 'announce':
        await handleAnnounce(interaction);
        break;
      case 'vcc-upload':
        await handleVccUpload(interaction);
        break;
      default:
        await interaction.reply({
          content: '❌ Unknown command.',
          ephemeral: true,
        });
    }
  } catch (error) {
    console.error(`❌ Error handling /${commandName}:`, error);

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: '❌ An error occurred while processing your command.',
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: '❌ An error occurred while processing your command.',
        ephemeral: true,
      });
    }
  }
}

/**
 * /vcc-stats - Display VCC inventory statistics
 */
async function handleVccStats(interaction) {
  await interaction.deferReply();

  try {
    const stats = await vccService.getVccStats();

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('💳 VCC System Statistics')
      .addFields(
        { name: '🟢 Unused VCCs', value: `${stats.unused}`, inline: true },
        { name: '🔴 Used VCCs', value: `${stats.used}`, inline: true },
        { name: '📊 Total VCCs', value: `${stats.total}`, inline: true }
      )
      .setFooter({ text: 'BitePlug VCC Management System' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('❌ Error fetching VCC stats:', error);
    await interaction.editReply('❌ Failed to fetch VCC statistics.');
  }
}

/**
 * /vcc-check - Force VCC inventory check
 */
async function handleVccCheck(interaction) {
  await interaction.deferReply();

  try {
    const stats = await vccService.getVccStats();
    const LOW_THRESHOLD = 10;

    const embed = new EmbedBuilder()
      .setColor(stats.unused < LOW_THRESHOLD ? 0xFF0000 : 0x00FF00)
      .setTitle('🔍 VCC Inventory Check')
      .addFields(
        { name: '🟢 Unused VCCs', value: `${stats.unused}`, inline: true },
        { name: '🔴 Used VCCs', value: `${stats.used}`, inline: true },
        { name: '📊 Total VCCs', value: `${stats.total}`, inline: true },
        {
          name: '⚠️ Status',
          value: stats.unused < LOW_THRESHOLD
            ? `🚨 LOW INVENTORY - Below ${LOW_THRESHOLD} cards!`
            : '✅ Inventory OK',
          inline: false,
        }
      )
      .setFooter({ text: 'Manual inventory check triggered by admin' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    // Send alert if low
    if (stats.unused < LOW_THRESHOLD) {
      const alertChannelId = '1437506432223150183';
      const alertChannel = interaction.client.channels.cache.get(alertChannelId);

      if (alertChannel) {
        const alertEmbed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('🚨 VCC LOW INVENTORY ALERT (Manual Check)')
          .setDescription(`Only **${stats.unused}** unused VCCs remaining!`)
          .addFields(
            { name: '🟢 Unused', value: `${stats.unused}`, inline: true },
            { name: '🔴 Used', value: `${stats.used}`, inline: true },
            { name: '📊 Total', value: `${stats.total}`, inline: true }
          )
          .setFooter({ text: 'Upload more VCCs immediately!' })
          .setTimestamp();

        await alertChannel.send({ embeds: [alertEmbed] });
      }
    }
  } catch (error) {
    console.error('❌ Error checking VCC inventory:', error);
    await interaction.editReply('❌ Failed to check VCC inventory.');
  }
}

/**
 * /dailystats - Show daily order statistics
 */
async function handleDailyStats(interaction) {
  await interaction.deferReply();

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get today's stats
    let stats = await DailyStats.findOne({ date: today });
    if (!stats) {
      stats = {
        successCount: 0,
        failureCount: 0,
      };
    }

    const totalOrders = stats.successCount + stats.failureCount;
    const successRate = totalOrders > 0
      ? ((stats.successCount / totalOrders) * 100).toFixed(1)
      : '0.0';

    // Get VCC stats
    const vccStats = await vccService.getVccStats();

    // Get current queue size (from queueService if available)
    const queueSize = global.queueService ? await global.queueService.getQueueSize() : 0;

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('📊 Daily Statistics')
      .setDescription(`Statistics for ${today.toLocaleDateString()}`)
      .addFields(
        {
          name: '📦 Orders Today',
          value: `**Total:** ${totalOrders}\n**Success:** ${stats.successCount} ✅\n**Failed:** ${stats.failureCount} ❌`,
          inline: true
        },
        {
          name: '📈 Success Rate',
          value: `${successRate}%`,
          inline: true
        },
        {
          name: '📋 Queue Size',
          value: `${queueSize} pending`,
          inline: true
        },
        {
          name: '💳 VCC Inventory',
          value: `**Unused:** ${vccStats.unused}\n**Used:** ${vccStats.used}\n**Total:** ${vccStats.total}`,
          inline: true
        }
      )
      .setFooter({ text: 'BitePlug Daily Statistics' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('❌ Error fetching daily stats:', error);
    await interaction.editReply('❌ Failed to fetch daily statistics.');
  }
}

/**
 * /close - Close a ticket channel
 */
async function handleClose(interaction) {
  const channel = interaction.channel;

  // Check if it's a ticket channel
  if (!channel.name.startsWith('ticket-')) {
    return interaction.reply({
      content: '❌ This command can only be used in ticket channels.',
      ephemeral: true,
    });
  }

  // Check if order has been charged
  const orderNumber = channel.name.replace('ticket-', '');
  const order = await Order.findOne({ orderNumber });

  if (order && order.status !== 'delivered' && order.status !== 'failed') {
    // Warning - order not completed
    return interaction.reply({
      content: '⚠️ **Warning:** This order has not been marked as complete or failed!\n\nUse `/complete-order <number>` first, or run `/close` again within 10 seconds to force close.',
      ephemeral: false,
    });
  }

  await interaction.reply('🗑️ Closing ticket channel in 5 seconds...');

  setTimeout(async () => {
    try {
      await channel.delete();
      console.log(`🗑️ Ticket channel ${channel.name} closed by admin`);
    } catch (error) {
      console.error('❌ Error deleting channel:', error);
    }
  }, 5000);
}

/**
 * /complete-order - Mark order as completed and charge wallet
 */
async function handleCompleteOrder(interaction) {
  const orderNumber = interaction.options.getInteger('order-number');
  const channel = interaction.channel;

  await interaction.deferReply();

  try {
    // Find the order
    const order = await Order.findOne({ orderNumber: orderNumber.toString() });

    if (!order) {
      return interaction.editReply(`❌ Order #${orderNumber} not found.`);
    }

    // Verify order belongs to this ticket
    if (order.discordChannelId !== channel.id) {
      return interaction.editReply(`❌ Order #${orderNumber} does not belong to this ticket channel.`);
    }

    if (order.status === 'delivered') {
      return interaction.editReply(`❌ Order #${orderNumber} is already marked as delivered.`);
    }

    // Get user and check balance
    const User = require('./models').User;
    const user = await User.findById(order.userId);

    if (!user) {
      return interaction.editReply(`❌ User not found for order #${orderNumber}.`);
    }

    if (user.walletBalance < order.totalPrice) {
      return interaction.editReply(
        `❌ Insufficient funds!\n**User:** ${user.email}\n**Balance:** $${user.walletBalance.toFixed(2)}\n**Order Total:** $${order.totalPrice.toFixed(2)}`
      );
    }

    // Charge the wallet
    user.walletBalance -= order.totalPrice;
    await user.save();

    // Mark order as delivered
    order.status = 'delivered';
    order.deliveredAt = new Date();
    await order.save();

    // Send success message
    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('✅ Order Completed Successfully')
      .addFields(
        { name: '📋 Order Number', value: `#${orderNumber}`, inline: true },
        { name: '💰 Amount Charged', value: `$${order.totalPrice.toFixed(2)}`, inline: true },
        { name: '👤 Customer', value: user.email, inline: false },
        { name: '💵 New Balance', value: `$${user.walletBalance.toFixed(2)}`, inline: true }
      )
      .setFooter({ text: 'Customer has been notified' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    // Notify customer via WebSocket
    const wss = global.wss;
    if (wss) {
      wss.clients.forEach(client => {
        if (client.userId === order.userId.toString()) {
          client.send(JSON.stringify({
            type: 'order-update',
            order: {
              orderNumber: order.orderNumber,
              status: 'delivered',
              deliveredAt: order.deliveredAt,
            },
          }));
        }
      });
    }

    console.log(`✅ Order #${orderNumber} completed by admin. Charged $${order.totalPrice.toFixed(2)} to ${user.email}`);
  } catch (error) {
    console.error('❌ Error completing order:', error);
    await interaction.editReply('❌ Failed to complete order. Check logs for details.');
  }
}

/**
 * /announce - Send announcement (Owner only)
 */
async function handleAnnounce(interaction) {
  const OWNER_ID = process.env.OWNER_ID;

  // Check if user is the owner
  if (interaction.user.id !== OWNER_ID) {
    return interaction.reply({
      content: '❌ Only the bot owner can use this command.',
      ephemeral: true,
    });
  }

  const message = interaction.options.getString('message');

  await interaction.deferReply();

  try {
    const embed = new EmbedBuilder()
      .setColor(0xFF5555)
      .setTitle('📢 ANNOUNCEMENT')
      .setDescription(message)
      .setFooter({ text: 'BitePlug Official Announcement' })
      .setTimestamp();

    // Send to the channel
    await interaction.channel.send({
      content: '@everyone',
      embeds: [embed],
    });

    await interaction.editReply('✅ Announcement sent!');
  } catch (error) {
    console.error('❌ Error sending announcement:', error);
    await interaction.editReply('❌ Failed to send announcement.');
  }
}

/**
 * /ping - Test if bot is responding (available to everyone)
 */
async function handlePing(interaction) {
  const latency = interaction.client.ws.ping;

  await interaction.reply({
    content: `🏓 Pong! Bot is online and responding.\n📡 Latency: **${latency}ms**`,
    ephemeral: true,
  });
}

/**
 * /vcc-upload - Upload VCCs from .txt file (Admin only)
 */
async function handleVccUpload(interaction) {
  await interaction.deferReply();

  try {
    // Get the uploaded file
    const attachment = interaction.options.getAttachment('file');

    // Validate file extension
    if (!attachment.name.endsWith('.txt')) {
      return interaction.editReply({
        content: '❌ Invalid file type. Please upload a .txt file.',
      });
    }

    // Validate file size (10MB limit)
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    if (attachment.size > MAX_SIZE) {
      return interaction.editReply({
        content: '❌ File too large. Maximum file size is 10MB.',
      });
    }

    // Download and parse file
    const response = await fetch(attachment.url);
    const fileContent = await response.text();

    const cardStrings = fileContent
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    if (cardStrings.length === 0) {
      return interaction.editReply({
        content: '❌ File is empty or contains no valid data.',
      });
    }

    // Send validation message
    await interaction.editReply({
      content: `🔍 **Validating ${cardStrings.length} VCCs...**\n\n**Format:** \`card_number,exp_date,cvv,zip,email\`\n• Card: Exactly 16 digits\n• Exp: MM/YY format\n• CVV: Exactly 3 digits\n• ZIP: Exactly 5 digits\n• Email: Valid format`,
    });

    // Strict validation - all or nothing
    const results = await vccService.bulkAddVccsStrict(cardStrings);

    if (!results.success) {
      // Build error message
      let errorMsg = '❌ **VCC Upload Failed - Validation Errors**\n\n';

      if (results.errors.length > 0) {
        errorMsg += '**Format Errors:**\n';
        const displayErrors = results.errors.slice(0, 10);
        for (const err of displayErrors) {
          errorMsg += `🚫 **Line ${err.lineNumber}:** ${err.error}\n   \`${err.card}\`\n\n`;
        }
        if (results.errors.length > 10) {
          errorMsg += `... and ${results.errors.length - 10} more format errors\n\n`;
        }
      }

      if (results.duplicates.length > 0) {
        errorMsg += '**Duplicate Cards:**\n';
        const displayDupes = results.duplicates.slice(0, 10);
        for (const dup of displayDupes) {
          errorMsg += `🔄 **Line ${dup.lineNumber}:** ${dup.error}\n   \`${dup.card}\`\n\n`;
        }
        if (results.duplicates.length > 10) {
          errorMsg += `... and ${results.duplicates.length - 10} more duplicates\n\n`;
        }
      }

      errorMsg += `📝 **Total errors:** ${results.errors.length + results.duplicates.length} out of ${cardStrings.length} lines\n\n`;
      errorMsg += '⚠️ **No VCCs were added to the database.**\nFix the errors and upload again.';

      // Split message if too long (Discord limit: 2000 chars)
      if (errorMsg.length > 2000) {
        await interaction.editReply(errorMsg.substring(0, 1997) + '...');

        // Send remaining errors as follow-up
        const remaining = errorMsg.substring(1997);
        const chunks = [];
        for (let i = 0; i < remaining.length; i += 2000) {
          chunks.push(remaining.substring(i, i + 2000));
        }

        for (const chunk of chunks) {
          await interaction.followUp(chunk);
        }
      } else {
        await interaction.editReply(errorMsg);
      }

      console.log(`❌ [/vcc-upload] Failed by ${interaction.user.username}: ${results.errors.length} errors, ${results.duplicates.length} duplicates`);
      return;
    }

    // Success - create embed
    const successEmbed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('✅ VCC Upload Successful')
      .setDescription('🎉 All VCCs validated and uploaded!')
      .addFields(
        { name: '📊 Lines processed', value: `${cardStrings.length}`, inline: true },
        { name: '✅ Valid VCCs', value: `${results.added}`, inline: true },
        { name: '💾 Added to database', value: `${results.added}`, inline: true }
      )
      .setFooter({ text: `Uploaded by ${interaction.user.username}` })
      .setTimestamp();

    await interaction.editReply({ content: null, embeds: [successEmbed] });

    console.log(`✅ [/vcc-upload] Success by ${interaction.user.username}: ${results.added} cards added from file ${attachment.name}`);

  } catch (error) {
    console.error('❌ [/vcc-upload] Error:', error);

    if (interaction.deferred) {
      await interaction.editReply('❌ An error occurred during VCC upload. Check logs for details.');
    } else {
      await interaction.reply({
        content: '❌ An error occurred during VCC upload. Check logs for details.',
        ephemeral: true,
      });
    }
  }
}

module.exports = { handleSlashCommand };
