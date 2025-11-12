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
 * Validate a single VCC format with strict rules
 * @param {string} cardString - VCC string to validate
 * @param {number} lineNumber - Line number in file for error reporting
 * @returns {Object} - { valid: boolean, error?: string, lineNumber?: number }
 */
function validateVccFormat(cardString, lineNumber) {
  const parts = cardString.split(',').map(p => p.trim());

  // Check: Exactly 5 fields
  if (parts.length !== 5) {
    return {
      valid: false,
      lineNumber,
      error: `Expected 5 fields, got ${parts.length}`,
      card: cardString
    };
  }

  const [cardNumber, expDate, cvv, zipCode, email] = parts;

  // Check: Card number - EXACTLY 16 digits
  if (!/^\d{16}$/.test(cardNumber)) {
    return {
      valid: false,
      lineNumber,
      error: `Invalid card number (must be exactly 16 digits, got ${cardNumber.length} characters)`,
      card: cardString
    };
  }

  // Check: Expiration date - EXACTLY MM/YY format
  if (!/^\d{2}\/\d{2}$/.test(expDate)) {
    return {
      valid: false,
      lineNumber,
      error: `Invalid expiration date (must be MM/YY format)`,
      card: cardString
    };
  }

  // Validate month is 01-12
  const month = parseInt(expDate.split('/')[0]);
  if (month < 1 || month > 12) {
    return {
      valid: false,
      lineNumber,
      error: `Invalid month in expiration date (must be 01-12, got ${expDate.split('/')[0]})`,
      card: cardString
    };
  }

  // Check: CVV - EXACTLY 3 digits
  if (!/^\d{3}$/.test(cvv)) {
    return {
      valid: false,
      lineNumber,
      error: `Invalid CVV (must be exactly 3 digits, got ${cvv.length} characters)`,
      card: cardString
    };
  }

  // Check: ZIP code - EXACTLY 5 digits
  if (!/^\d{5}$/.test(zipCode)) {
    return {
      valid: false,
      lineNumber,
      error: `Invalid ZIP code (must be exactly 5 digits, got ${zipCode.length} characters)`,
      card: cardString
    };
  }

  // Check: Email format - must have @ and .
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return {
      valid: false,
      lineNumber,
      error: `Invalid email format (must contain @ and .)`,
      card: cardString
    };
  }

  return { valid: true };
}

/**
 * Validate a batch of VCC strings before adding to database
 * @param {string[]} cardStrings - Array of VCC strings
 * @returns {Object} - { valid: boolean, errors: [], duplicates: [] }
 */
async function validateVccBatch(cardStrings) {
  const errors = [];
  const duplicates = [];
  const seenCardNumbers = new Set();

  for (let i = 0; i < cardStrings.length; i++) {
    const cardString = cardStrings[i].trim();

    // Skip empty lines
    if (!cardString) continue;

    const lineNumber = i + 1;

    // Validate format
    const validation = validateVccFormat(cardString, lineNumber);
    if (!validation.valid) {
      errors.push(validation);
      continue;
    }

    // Extract card number for duplicate checking
    const cardNumber = cardString.split(',')[0].trim();

    // Check for duplicates within the file
    if (seenCardNumbers.has(cardNumber)) {
      duplicates.push({
        lineNumber,
        error: `Duplicate card number in file`,
        card: cardString
      });
      continue;
    }

    seenCardNumbers.add(cardNumber);

    // Check if card already exists in database
    const cleanedString = cardString.replace(/^,/, '').trim();
    const existingCard = await VirtualCard.findOne({ cardString: cleanedString });
    if (existingCard) {
      duplicates.push({
        lineNumber,
        error: `Card already exists in database`,
        card: cardString
      });
    }
  }

  return {
    valid: errors.length === 0 && duplicates.length === 0,
    errors,
    duplicates
  };
}

/**
 * Bulk add VCCs with strict validation (all-or-nothing)
 * @param {string[]} cardStrings - Array of card strings
 * @returns {Object} - { success: boolean, added: number, errors: [], duplicates: [] }
 */
async function bulkAddVccsStrict(cardStrings) {
  // Validate all cards first
  const validation = await validateVccBatch(cardStrings);

  if (!validation.valid) {
    return {
      success: false,
      added: 0,
      errors: validation.errors,
      duplicates: validation.duplicates
    };
  }

  // All valid - add to database
  const added = [];
  for (const cardString of cardStrings) {
    const trimmed = cardString.trim();
    if (!trimmed) continue;

    try {
      const cleanedString = trimmed.replace(/^,/, '').trim();
      const newCard = new VirtualCard({ cardString: cleanedString });
      await newCard.save();
      added.push(newCard);
    } catch (error) {
      // This shouldn't happen since we validated, but handle it anyway
      console.error('Unexpected error adding VCC:', error);
      return {
        success: false,
        added: 0,
        errors: [{ error: `Database error: ${error.message}` }],
        duplicates: []
      };
    }
  }

  return {
    success: true,
    added: added.length,
    errors: [],
    duplicates: []
  };
}

/**
 * Bulk add VCCs from an array of card strings (legacy - allows partial uploads)
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
  bulkAddVccs,
  validateVccFormat,
  validateVccBatch,
  bulkAddVccsStrict
};
