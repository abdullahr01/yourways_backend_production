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
      enum: ['House', 'Flat', 'Apartment', 'Office', 'Storage', 'Other'],
      default: 'House' 
    },
    deliveryPropertyType: { 
      type: String, 
      enum: ['House', 'Flat', 'Apartment', 'Office', 'Storage', 'Other'],
      default: 'House' 
    },
    collectionFloorLevel: { 
      type: String, 
      enum: ['Ground Floor', 'First Floor', 'Second Floor', 'Third Floor', 'Fourth Floor+'],
      default: 'Ground Floor' 
    },
    deliveryFloorLevel: { 
      type: String, 
      enum: ['Ground Floor', 'First Floor', 'Second Floor', 'Third Floor', 'Fourth Floor+'],
      default: 'Ground Floor' 
    },
    collectionLiftAccess: { type: Boolean, default: false },
    deliveryLiftAccess: { type: Boolean, default: false },
    parkingAccess: { 
      type: String, 
      enum: ['Easy Access (Driveway/Loading Bay)', 'Street Parking', 'Restricted Access', 'No Parking Nearby'],
      default: 'Easy Access (Driveway/Loading Bay)' 
    },

    // Service Level
    manpowerRequired: { 
      type: String, 
      enum: ['1 Man Team', '2 Man Team', '3 Man Team', '4+ Man Team'],
      default: '2 Man Team' 
    },
    dismantlingRequired: { type: Boolean, default: false },
    packingService: { 
      type: String, 
      enum: ['None', 'Partial Packing', 'Full Packing'],
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

module.exports = mongoose.model('Booking', bookingSchema);