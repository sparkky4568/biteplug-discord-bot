// BitePlug MongoDB Schema
// Using Mongoose (makes MongoDB easier to use)

const mongoose = require('mongoose');

// ============================================
// USER SCHEMA
// ============================================
const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: false // Not required for Google OAuth users
  },
  fullName: {
    type: String,
    required: true
  },
  phoneNumber: {
    type: String,
    default: null
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date,
    default: null
  },
  // OAuth fields
  googleId: {
    type: String,
    unique: true,
    sparse: true // Allows null values while maintaining uniqueness
  },
  discordId: {
    type: String,
    unique: true,
    sparse: true // Allows null values while maintaining uniqueness
  },
  authProvider: {
    type: String,
    enum: ['local', 'google', 'discord'],
    default: 'local'
  },
  profilePicture: {
    type: String,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// ============================================
// EMAIL VERIFICATION SCHEMA
// ============================================
const emailVerificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  token: {
    type: String,
    required: true,
    unique: true
  },
  expiresAt: {
    type: Date,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Auto-delete expired tokens
emailVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// ============================================
// ADDRESS SCHEMA
// ============================================
const addressSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  addressLine: {
    type: String,
    required: true
  },
  deliveryInstructions: {
    type: String,
    default: ''
  },
  isDefault: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// ============================================
// ORDER SCHEMA
// ============================================
const orderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    required: true,
    unique: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  // Order details
  groupOrderLink: {
    type: String,
    required: true
  },
  uberLink: {
    type: String,
    default: null
  },
  deliveryAddress: {
    type: String,
    default: ''
  },
  deliveryInstructions: {
    type: String,
    default: ''
  },
  customerName: {
    type: String,
    default: ''
  },

  // Money (in cents)
  appTotalCents: {
    type: Number,
    required: true
  },
  chargeCents: {
    type: Number,
    required: true
  },

  // Payment details
  paymentMethod: {
    type: String,
    enum: ['venmo', 'zelle', 'crypto'],
    required: true
  },
  paymentReferenceCode: {
    type: String,
    unique: true,
    required: true
  },
  cryptoDiscount: {
    type: Boolean,
    default: false
  },
  cryptoInvoiceId: {
    type: String,
    default: null
  },
  cryptoPaymentId: {
    type: String,
    default: null
  },

  // Status
  status: {
    type: String,
    enum: ['pending_payment', 'payment_submitted', 'payment_verified', 'payment_failed', 'queued', 'processing', 'order_placed', 'delivered', 'failed', 'automation_failed', 'cancelled'],
    default: 'pending_payment'
  },

  // Payment verification
  paymentVerified: {
    type: Boolean,
    default: false
  },
  paymentVerifiedAt: {
    type: Date,
    default: null
  },
  
  // Discord integration
  discordChannelId: {
    type: String,
    default: null
  },

  // Automation/Queue fields
  queuePosition: {
    type: Number,
    default: null
  },
  automationAttempts: {
    type: Number,
    default: 0
  },
  automationError: {
    type: String,
    default: null
  },
  automationStartedAt: {
    type: Date,
    default: null
  },
  automationCompletedAt: {
    type: Date,
    default: null
  },

  // VCC fields
  assignedVccId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'VirtualCard',
    default: null
  },
  vccString: {
    type: String,
    default: null
  },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  completedAt: {
    type: Date,
    default: null
  }
});

// Update updatedAt on save
orderSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// ============================================
// PASSWORD RESET SCHEMA
// ============================================
const passwordResetSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  token: {
    type: String,
    required: true,
    unique: true
  },
  expiresAt: {
    type: Date,
    required: true
  },
  used: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Auto-delete expired tokens
passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// ============================================
// VIRTUAL CARD SCHEMA
// ============================================
const virtualCardSchema = new mongoose.Schema({
  cardString: {
    type: String,
    required: true,
    unique: true
  },
  status: {
    type: String,
    enum: ['unused', 'used'],
    default: 'unused'
  },
  usedAt: {
    type: Date,
    default: null
  },
  usedForOrderNumber: {
    type: String,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Index for fast unused card lookups
virtualCardSchema.index({ status: 1, createdAt: 1 });

// ============================================
// CHAT MESSAGE SCHEMA
// ============================================
const chatMessageSchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  discordChannelId: {
    type: String,
    required: true
  },
  author: {
    type: String,
    required: true
  },
  content: {
    type: String,
    required: true
  },
  isStaff: {
    type: Boolean,
    default: false
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

// Index for fast lookups
chatMessageSchema.index({ discordChannelId: 1, timestamp: 1 });

// ============================================
// DAILY STATS SCHEMA
// ============================================
const dailyStatsSchema = new mongoose.Schema({
  date: {
    type: String,
    required: true,
    unique: true // Format: YYYY-MM-DD
  },
  successCount: {
    type: Number,
    default: 0
  },
  failureCount: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update updatedAt on save
dailyStatsSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Note: date field already has index from unique:true, no need for explicit index

// ============================================
// CREATE MODELS
// ============================================
const User = mongoose.model('User', userSchema);
const EmailVerification = mongoose.model('EmailVerification', emailVerificationSchema);
const Address = mongoose.model('Address', addressSchema);
const Order = mongoose.model('Order', orderSchema);
const PasswordReset = mongoose.model('PasswordReset', passwordResetSchema);
const VirtualCard = mongoose.model('VirtualCard', virtualCardSchema);
const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);
const DailyStats = mongoose.model('DailyStats', dailyStatsSchema);

// ============================================
// EXPORT MODELS
// ============================================
module.exports = {
  User,
  EmailVerification,
  Address,
  Order,
  PasswordReset,
  VirtualCard,
  ChatMessage,
  DailyStats
};
