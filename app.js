const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');
const logger = require('./utils/logger');
const swaggerDefinition = require('./config/swagger');

const userRoutes = require('./routes/user_router');
const driverRoutes = require('./routes/driver_router');
const orderRoutes = require('./routes/order_router');
const bookingRoutes = require('./routes/booking_router');
const serviceRoutes = require('./routes/service_router');
const adminRoutes = require('./routes/admin_router');
const mapsRoutes = require('./routes/maps_router');
const paymentRoutes = require('./routes/payment_router');
const paymentWebhookRoutes = require('./routes/payment_webhook_router');
const uploadRoutes = require('./routes/upload_router');
const imageRoutes = require('./routes/image_router');
const signStorageUrls = require('./middleware/signStorageUrls');

const app = express();

const allowedOrigins = [
    'http://localhost:53485',
    'http://localhost:5000',
    'http://localhost:3000',
    'http://localhost:65389',
    'http://127.0.0.1:3000',
    'https://yourwaycouriers.co.uk'
];

//new latest push of 12:30

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
// Stripe webhook FIRST: its signature is computed over the raw request bytes,
// which bodyParser.json() below would destroy. Everything after this line
// gets normal JSON parsing.
app.use('/api/payments', paymentWebhookRoutes);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(morgan('combined'));

// Proof-of-delivery photos live in a private bucket, so the keys stored on
// orders are swapped for short-lived signed URLs as responses go out. Sits above
// the routes so no endpoint can forget to do it.
app.use(signStorageUrls);

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
    version: '1.1.0',
    status: 'running',
    database: 'supabase',
    auth: 'JWT Bearer (user | driver | admin)',
    docs: 'http://localhost:5000/docs',
    endpoints: {
      users: '/api/users',
      drivers: '/api/drivers',
      bookings: '/api/bookings',
      orders: '/api/orders',
      services: '/api/services',
      admin: '/api/admin',
      maps: '/api/maps',
      payments: '/api/payments',
      uploads: '/api/uploads',
      images: '/api/images',
    },
    payments: 'Stripe — a booking must be paid before it becomes an order',
    storage:
      'Supabase Storage — driver-photos (public URLs), order-proofs (private, signed URLs on read)',
    realtime: 'Supabase Realtime broadcast channels: driver-<id> (location/status), order-<id> (update)',
  });
});

// Swagger UI (same idea as FastAPI /docs)
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDefinition, {
  customSiteTitle: 'YourWays Logistics API Docs',
  swaggerOptions: {
    persistAuthorization: true,
  },
}));
logger.info('[APP] Swagger docs available at /docs');

app.use('/api/users', userRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/maps', mapsRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/images', imageRoutes);

logger.info('[APP] All routes registered');

app.use((req, res) => {
  logger.error(`[APP] Route not found: ${req.method} ${req.path}`);
  res.status(404).json({ message: 'Route not found', success: false });
});

module.exports = app;