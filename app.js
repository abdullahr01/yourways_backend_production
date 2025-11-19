const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const logger = require('./utils/logger');

const userRoutes = require('./routes/user_router');
const driverRoutes = require('./routes/driver_router');
const orderRoutes = require('./routes/order_router');
const bookingRoutes = require('./routes/booking_router');

const app = express();

const allowedOrigins = [
    'http://localhost:65018',
    'http://localhost:5000'
];

app.use(cors({
  origin: (origin, callback) => {
        if(!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(morgan('combined'));

app.get('/', (req, res) => {
  res.json({
    message: 'Logistics Backend API',
    version: '1.0.0',
    status: 'running',
  });
});

app.use('/api/users', userRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/bookings', bookingRoutes);

app.use((req, res) => {
  logger.error(`Route not found: ${req.method} ${req.path}`);
  res.status(404).json({ message: 'Route not found', success: false });
});

module.exports = app;