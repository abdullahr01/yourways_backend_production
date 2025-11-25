// booking_model.js (UPDATED WITH PRICE FIELDS)
const mongoose = require('mongoose');

const bookingItemSchema = new mongoose.Schema({
  itemId: { type: String, required: true },
  category: { type: String, required: true },
  itemName: { type: String, required: true },
  quantity: { type: Number, default: 1, min: 1 },
  modifiers: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} }
}, { _id: false });

const bookingSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    
    // Route and Timing
    collectionPostcode: { type: String, required: true, trim: true },
    deliveryPostcode: { type: String, required: true, trim: true },
    moveDate: { type: Date },
    dateFlexibility: { 
      type: String, 
      enum: ['Exact Date Only', 'Within 3 Days', 'Within a Week', 'Flexible'],
      default: 'Exact Date Only' 
    },

    // Property Details
    collectionPropertyType: { 
      type: String, 
      enum: ['House', 'Flat', 'Studio', 'Storage Unit', 'Office', 'Flatshare'],
      default: 'House' 
    },
    deliveryPropertyType: { 
      type: String, 
      enum: ['House', 'Flat', 'Studio', 'Storage Unit', 'Office', 'Flatshare'],
      default: 'House' 
    },
    collectionFloorLevel: { 
      type: String, 
      enum: ['Ground Floor', '1st Floor', '2nd Floor', '3rd Floor+', 'Basement'],
      default: 'Ground Floor' 
    },
    deliveryFloorLevel: { 
      type: String, 
      enum: ['Ground Floor', '1st Floor', '2nd Floor', '3rd Floor+', 'Basement'],
      default: 'Ground Floor' 
    },
    collectionLiftAccess: { type: Boolean, default: false },
    deliveryLiftAccess: { type: Boolean, default: false },
    parkingAccess: { 
      type: String, 
      enum: [
        'Easy Access (Driveway/Loading Bay)', 
        'Difficult Access (Permits/Long Carry)', 
        'Street Parking', 
        'Restricted Access', 
        'No Parking Nearby'
      ],
      default: 'Easy Access (Driveway/Loading Bay)' 
    },

    // Service Level
    manpowerRequired: { 
      type: String, 
      enum: ['1 Man (Driver Assisted)', '2 Man Team', '3 Man Team', '4+ Man Team'],
      default: '2 Man Team' 
    },
    dismantlingRequired: { type: Boolean, default: false },
    packingService: { 
      type: String, 
      enum: ['None', 'Materials Only', 'Fragile Items Only', 'Full Packing Service'],
      default: 'None' 
    },
    insuranceValue: { type: Number, default: 0, min: 0 },
    jobNotes: { type: String, trim: true, default: '' },

    // Contact Info
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    mobileNumber: { type: String, required: true, trim: true },
    acceptTerms: { type: Boolean, required: true },

    // Items List
    items: [bookingItemSchema],

    // Pricing Information (NEW)
    calculatedPrice: { 
      type: Number, 
      default: null,
      min: 0 
    },
    priceBreakdown: {
      distanceMiles: { type: Number },
      basePrice: { type: Number },
      manpowerCost: { type: Number },
      itemsCost: { type: Number },
      floorCharge: { type: Number },
      packingCost: { type: Number },
      dismantlingCost: { type: Number },
      insuranceCost: { type: Number },
      parkingCharge: { type: Number },
      subtotal: { type: Number },
      vat: { type: Number },
      total: { type: Number },
      volumeDiscount: { type: Number }
    },

    // Metadata
    status: { 
      type: String, 
      enum: ['draft', 'submitted', 'converted_to_order'],
      default: 'draft' 
    },
    submittedAt: { type: Date },
    convertedOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },

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
bookingSchema.virtual('totalItems').get(function() {
  return this.items.reduce((sum, item) => sum + item.quantity, 0);
});

// Index for faster queries
bookingSchema.index({ userId: 1, status: 1, createdAt: -1 });

// Pre-save validation: ensure price is set before submission
bookingSchema.pre('save', function(next) {
  if (this.status === 'submitted' && !this.calculatedPrice) {
    return next(new Error('Price must be calculated before submission'));
  }
  next();
});

module.exports = mongoose.model('Booking', bookingSchema);