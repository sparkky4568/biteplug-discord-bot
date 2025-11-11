// Virtual Card Management Service
// Handles VCC (Virtual Credit Card) assignment and lifecycle

const { VirtualCard, Order } = require('./models');

/**
 * Get an unused VCC from the database
 * Returns the oldest unused card (FIFO)
 */
async function getUnusedVcc() {
  try {
    const unusedCard = await VirtualCard.findOne({ status: 'unused' })
      .sort({ createdAt: 1 }) // Oldest first (FIFO)
      .exec();

    if (!unusedCard) {
      throw new Error('No unused VCCs available in database');
    }

    return unusedCard;
  } catch (error) {
    console.error('Error getting unused VCC:', error);
    throw error;
  }
}

/**
 * Mark a VCC as used
 * @param {string} vccId - The MongoDB ObjectId of the VCC
 * @param {string} orderNumber - The order number this card was used for
 */
async function markVccAsUsed(vccId, orderNumber) {
  try {
    const card = await VirtualCard.findByIdAndUpdate(
      vccId,
      {
        status: 'used',
        usedAt: new Date(),
        usedForOrderNumber: orderNumber
      },
      { new: true }
    );

    if (!card) {
      throw new Error(`VCC with id ${vccId} not found`);
    }

    console.log(`✓ Marked VCC as used for order ${orderNumber}`);
    return card;
  } catch (error) {
    console.error('Error marking VCC as used:', error);
    throw error;
  }
}

/**
 * Add a new VCC to the database
 * @param {string} cardString - Format: "card_number,exp_date,cvv,zip_code,email"
 */
async function addVcc(cardString) {
  try {
    // Remove leading comma if present (from card scraper output)
    const cleanedString = cardString.replace(/^,/, '').trim();

    // Validate format (should have 5 comma-separated values)
    const parts = cleanedString.split(',');
    if (parts.length !== 5) {
      throw new Error('Invalid card string format. Expected: card_number,exp_date,cvv,zip_code,email');
    }

    // Check if this card already exists
    const existingCard = await VirtualCard.findOne({ cardString: cleanedString });
    if (existingCard) {
      throw new Error('This card already exists in the database');
    }

    const newCard = new VirtualCard({ cardString: cleanedString });
    await newCard.save();

    console.log(`✓ Added new VCC to database`);
    return newCard;
  } catch (error) {
    console.error('Error adding VCC:', error);
    throw error;
  }
}

/**
 * Get VCC statistics
 */
async function getVccStats() {
  try {
    const unusedCount = await VirtualCard.countDocuments({ status: 'unused' });
    const usedCount = await VirtualCard.countDocuments({ status: 'used' });

    return {
      unused: unusedCount,
      used: usedCount,
      total: unusedCount + usedCount
    };
  } catch (error) {
    console.error('Error getting VCC stats:', error);
    throw error;
  }
}

/**
 * Assign a VCC to an order
 * @param {string} orderId - The MongoDB ObjectId of the order
 */
async function assignVccToOrder(orderId) {
  try {
    // Get an unused VCC
    const vcc = await getUnusedVcc();

    // Update the order with the VCC
    const order = await Order.findByIdAndUpdate(
      orderId,
      {
        assignedVccId: vcc._id,
        vccString: vcc.cardString
      },
      { new: true }
    );

    if (!order) {
      throw new Error(`Order with id ${orderId} not found`);
    }

    console.log(`✓ Assigned VCC to order ${order.orderNumber}`);
    return { order, vcc };
  } catch (error) {
    console.error('Error assigning VCC to order:', error);
    throw error;
  }
}

/**
 * Bulk add VCCs from an array of card strings
 * @param {string[]} cardStrings - Array of card strings
 */
async function bulkAddVccs(cardStrings) {
  const results = {
    added: 0,
    failed: 0,
    errors: []
  };

  for (const cardString of cardStrings) {
    try {
      await addVcc(cardString);
      results.added++;
    } catch (error) {
      results.failed++;
      results.errors.push({
        cardString,
        error: error.message
      });
    }
  }

  return results;
}

module.exports = {
  getUnusedVcc,
  markVccAsUsed,
  addVcc,
  getVccStats,
  assignVccToOrder,
  bulkAddVccs
};
