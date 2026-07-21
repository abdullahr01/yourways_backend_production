const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const logger = require('./utils/logger');

const userRoutes = require('./routes/user_router');
const driverRoutes = require('./routes/driver_router');
const orderRoutes = require('./routes/order_router');
const bookingRoutes = require('./routes/booking_router');
const serviceRoutes = require('./routes/service_router');

const app = express();

const allowedOrigins = [
    'http://localhost:53485',
    'http://localhost:5000'
];

logger.info('[APP] Initializing YourWays Logistics API...');

app.use(cors({
  origin: (origin, callback) => {
        if(!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            logger.warn(`[APP] CORS blocked origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(morgan('combined'));

// Log every incoming request
app.use((req, res, next) => {
  logger.info(`[REQUEST] ${req.method} ${req.originalUrl} | IP: ${req.ip}`);
  if (req.body && Object.keys(req.body).length > 0) {
    const safeBody = { ...req.body };
    if (safeBody.email) safeBody.email = '***';
    if (safeBody.password) safeBody.password = '***';
    logger.info(`[REQUEST DATA] ${JSON.stringify(safeBody)}`);
  }
  next();
});

app.get('/', (req, res) => {
  logger.info('[APP] Health check hit');
  res.json({
    message: 'YourWays Logistics Backend API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      users: '/api/users',
      drivers: '/api/drivers',
      bookings: '/api/bookings',
      orders: '/api/orders',
      services: '/api/services',
    },
  });
});

app.use('/api/users', userRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/services', serviceRoutes);

logger.info('[APP] All routes registered');

app.use((req, res) => {
  logger.error(`[APP] Route not found: ${req.method} ${req.path}`);
  res.status(404).json({ message: 'Route not found', success: false });
});

module.exports = app;