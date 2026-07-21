// models/order_model.js
const mongoose = require('mongoose');
const logger = require('../utils/logger');

const orderItemSchema = new mongoose.Schema({
  category: { type: String, required: true },
  itemName: { type: String, required: true },
  quantity: { type: Number, required: true, min: 1 },
  modifiers: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} }
}, { _id: false });

const orderSchema = new mongoose.Schema(
  {
    orderId: { type: String, unique: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
    
    serviceName: { type: String, required: true },
    
    // Status Management (YourWays doc Section 7 flow)
    // pending -> confirmed -> outForPickup -> pickupCompleted -> outForDropOff -> completed
    status: {
      type: String,
      enum: [
        'pending',
        'confirmed',
        'pickupScheduled',
        'outForPickup',
        'pickupCompleted',
        'outForDropOff',
        'completed',
        'cancelled'
      ],
      default: 'pending'
    },

    // Locations
    pickupLocation: { type: String, required: true },
    deliveryLocation: { type: String, required: true },

    // Date & Time
    pickupDateTime: { type: Date },
    deliveryDateTime: { type: Date },
    pickupCompletedAt: { type: Date },
    deliveryCompletedAt: { type: Date },
    completedAt: { type: Date },

    // Property Details
    pickupPropertyType: { type: String, required: true },
    deliveryPropertyType: { type: String, required: true },
    pickupFloorLevel: { type: String, required: true },
    deliveryFloorLevel: { type: String, required: true },
    pickupLiftAccess: { type: Boolean, required: true },
    deliveryLiftAccess: { type: Boolean, required: true },

    // Service Details
    manpowerRequired: { type: String, required: true },
    packingService: { type: String, required: true },
    dismantlingRequired: { type: Boolean, required: true },
    parkingAccess: { type: String, required: true },
    insuranceValue: { type: Number, required: true, default: 0 },
    jobNotes: { type: String, default: '' },

    // Contact
    customerName: { type: String, required: true },
    customerEmail: { type: String, required: true },
    customerPhone: { type: String, required: true },

    // Items
    items: [orderItemSchema],

    // Additional items collected by driver
    additionalItems: [orderItemSchema],

    // Photos & Signatures (YourWays doc Section 6.4)
    pickupPhotos: [{ type: String }],
    deliveryPhotos: [{ type: String }],
    pickupSignature: { type: String },
    deliverySignature: { type: String },

    // Driver comments
    driverComment: { type: String },

    // Driver Assignment - FIXED: Now references Driver model
    driver: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Driver',
      default: null
    },

    // Pricing
    totalPrice: { type: Number, required: true, default: 0 },
    quotedPrice: { type: Number },

    // Cancellation
    cancellationReason: { type: String },

    // Metadata
    meta: {
      ip: String,
      userAgent: String
    }
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Virtual for total items count
orderSchema.virtual('totalItems').get(function() {
  return this.items.reduce((sum, item) => sum + item.quantity, 0);
});

// Virtual to check if order is active
orderSchema.virtual('isActive').get(function() {
  return this.status !== 'completed' && this.status !== 'cancelled';
});

// Generate orderId before save
orderSchema.pre('save', async function(next) {
  if (!this.orderId) {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const dateStr = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
    const timeStr = `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    const random = Math.floor(Math.random() * 9000) + 1000;
    this.orderId = `ORD-${dateStr}-${timeStr}-${random}`;
    logger.info(`[ORDER MODEL] Generated orderId: ${this.orderId}`);
  }
  if (this.isModified('status')) {
    logger.info(`[ORDER MODEL] Status changed to: ${this.status} (orderId: ${this.orderId || 'new'})`);
  }
  next();
});

// Index for faster queries
orderSchema.index({ userId: 1, status: 1, createdAt: -1 });
orderSchema.index({ driver: 1, status: 1 });
orderSchema.index({ orderId: 1 });

module.exports = mongoose.model('Order', orderSchema);