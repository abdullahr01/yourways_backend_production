// models/driver_model.js
const mongoose = require('mongoose');
const logger = require('../utils/logger');

const driverSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
    phone: { type: String, required: true, unique: true },
    address: { type: String },
    dob: { type: Date },
    licenseNumber: { type: String },
    vehicleType: { type: String },
    vehicleNumber: { type: String },
    isApprovedByAdmin: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['active', 'inactive', 'suspended'],
      default: 'inactive',
    },
    // Online/Offline status
    isOnline: { type: Boolean, default: false },
    lastOnlineAt: { type: Date },
    // Current location for tracking
    currentLocation: {
      latitude: { type: Number },
      longitude: { type: Number },
      lastUpdated: { type: Date },
    },
    // Assigned orders
    assignedOrders: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
      },
    ],
    // Statistics
    completedOrders: { type: Number, default: 0 },
    rating: { type: Number, default: 0 },
    totalRatings: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Instance methods
driverSchema.methods.updateRating = function (newRating) {
  this.totalRatings += 1;
  this.rating = ((this.rating * (this.totalRatings - 1)) + newRating) / this.totalRatings;
  return this.save();
};

driverSchema.methods.updateLocation = function (latitude, longitude) {
  logger.info(`[DRIVER MODEL] Location update: ${latitude}, ${longitude}`);
  this.currentLocation = {
    latitude,
    longitude,
    lastUpdated: new Date(),
  };
  return this.save();
};

module.exports = mongoose.model('Driver', driverSchema);