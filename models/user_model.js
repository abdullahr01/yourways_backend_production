const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const userSchema = new mongoose.Schema(
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
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
    },
  },
  { timestamps: true }
);

// Method to generate JWT token
userSchema.methods.generateAuthToken = function() {
  const token = jwt.sign(
    { 
      _id: this._id, 
      phone: this.phone,
      email: this.email,
      name: this.name
    },
    process.env.JWT_SECRET || 'your-secret-key-change-this-in-production',
    { expiresIn: '7d' }
  );
  return token;
};

// Static method to verify JWT token
userSchema.statics.verifyToken = function(token) {
  try {
    const decoded = jwt.verify(
      token, 
      process.env.JWT_SECRET || 'your-secret-key-change-this-in-production'
    );
    return decoded;
  } catch (err) {
    throw new Error('Invalid or expired token');
  }
};

module.exports = mongoose.model('User', userSchema);