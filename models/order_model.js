const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
  name: { type: String, required: true },   // e.g., "Bed"
  quantity: { type: Number, default: 1 },
  dimensions: {
    width: Number,
    height: Number,
    depth: Number,
    unit: { type: String, default: 'cm' }
  },
  fragile: { type: Boolean, default: false },
  notes: String
});

const addressSchema = new mongoose.Schema({
  address: String,
  city: String,
  postalCode: String,
  coordinates: {
    lat: Number,
    lng: Number
  }
});

const orderSchema = new mongoose.Schema(
  {
    requestCode: { type: String, unique: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // driver may be assigned later
    driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver' },

    // since frontend handles categories, store the category name
    category: { type: String, required: true }, // e.g. "Home Removals"
    subcategory: { type: String },              // e.g. "Sofa"

    // items moved
    items: [itemSchema],

    pickupLocation: addressSchema,
    dropLocation: addressSchema,

    pickupDateTime: { type: Date },
    deliveryDateTime: { type: Date },

    pickupFloor: { type: Number, default: 0 },
    dropFloor: { type: Number, default: 0 },
    pickupLiftAvailable: { type: Boolean, default: false },
    dropLiftAvailable: { type: Boolean, default: false },

    addonItems: [
      {
        name: String,
        quantity: { type: Number, default: 1 },
        price: Number
      }
    ],

    specialInstructions: { type: String },

    estimatedPrice: { type: Number },

    status: {
      type: String,
      enum: ['pending', 'assigned', 'in-progress', 'completed', 'cancelled'],
      default: 'pending'
    },

    meta: {
      ip: String,
      userAgent: String
    }
  },
  { timestamps: true }
);

// generate requestCode before save if not provided
orderSchema.pre('save', async function (next) {
  if (!this.requestCode) {
    // nice readable unique code: ORD-YYYYMMDD-HHMMSS-XXXX
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const dt = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    this.requestCode = `ORD-${dt}-${Math.floor(Math.random() * 9000) + 1000}`;
  }
  next();
});

module.exports = mongoose.model('Order', orderSchema);
