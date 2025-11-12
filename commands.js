// Discord Slash Command Definitions
// These commands will be registered with Discord's API

module.exports = [
  {
    name: 'ping',
    description: 'Test if the bot is online and responding'
  },
  {
    name: 'vcc-stats',
    description: 'Display VCC inventory statistics (unused/used/total)'
  },
  {
    name: 'vcc-check',
    description: 'Force an immediate VCC inventory check and alert if low'
  },
  {
    name: 'dailystats',
    description: 'Display today\'s order statistics (success/failure counts)'
  },
  {
    name: 'close',
    description: 'Close the current ticket channel (order channel only)'
  },
  {
    name: 'complete-order',
    description: 'Mark an order as delivered and close the ticket',
    options: [
      {
        name: 'order-number',
        description: 'The order number to mark as delivered (e.g., BP-1234A)',
        type: 3, // STRING type
        required: true
      }
    ]
  },
  {
    name: 'announce',
    description: 'Send an announcement to the order notification channel',
    options: [
      {
        name: 'message',
        description: 'The announcement message to send',
        type: 3, // STRING type
        required: true
      }
    ]
  },
  {
    name: 'vcc-upload',
    description: 'Upload VCCs from a .txt file to the database (Admin only)',
    options: [
      {
        name: 'file',
        description: 'Text file with VCCs (format: card_number,exp_date,cvv,zip,email)',
        type: 11, // ATTACHMENT type
        required: true
      }
    ]
  }
];
