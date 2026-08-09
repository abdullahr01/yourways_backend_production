/**
 * OpenAPI / Swagger definition for YourWays Logistics API.
 * Served at: http://localhost:5000/docs
 */
const swaggerDefinition = {
  openapi: '3.0.3',
  info: {
    title: 'YourWays Logistics API',
    version: '1.1.0',
    description:
      'Backend for cargo booking, quotations, orders, and driver workflow.\n\n' +
      '**Auth:** Click Authorize and paste your JWT (Swagger adds Bearer).\n\n' +
      'Roles: `user` | `driver` | `admin`\n\n' +
      'Admin panel APIs live under `/api/admin/*`',
  },
  servers: [
    {
      url: 'http://localhost:5000',
      description: 'Local development',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'JWT from /api/users/login, /api/drivers/login, or /api/admin/login',
      },
    },
    schemas: {
      SuccessResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string' },
          data: { type: 'object' },
        },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string' },
          error: { type: 'string' },
        },
      },
      AdminRegister: {
        type: 'object',
        required: ['name', 'email', 'password'],
        properties: {
          name: { type: 'string', example: 'Super Admin' },
          email: { type: 'string', example: 'admin@yourways.com' },
          password: { type: 'string', example: 'admin123' },
          phone: { type: 'string', example: '+447700900000' },
        },
      },
      AdminLogin: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', example: 'admin@yourways.com' },
          password: { type: 'string', example: 'admin123' },
        },
      },
      UserRegister: {
        type: 'object',
        required: ['name', 'email', 'phone'],
        properties: {
          name: { type: 'string', example: 'Ali Khan' },
          email: { type: 'string', example: 'ali@example.com' },
          phone: { type: 'string', example: '+447700900123' },
          address: { type: 'string', example: 'London' },
          dob: { type: 'string', format: 'date', example: '1995-01-15' },
        },
      },
      UserLogin: {
        type: 'object',
        required: ['phone'],
        properties: {
          phone: { type: 'string', example: '+447700900123' },
        },
      },
      DriverRegister: {
        type: 'object',
        required: ['name', 'email', 'phone'],
        properties: {
          name: { type: 'string', example: 'Ahmed Driver' },
          email: { type: 'string', example: 'ahmed@example.com' },
          phone: { type: 'string', example: '+447700900999' },
          licenseNumber: { type: 'string', example: 'DL123456' },
          vehicleType: { type: 'string', example: 'Van' },
          vehicleNumber: { type: 'string', example: 'AB12 CDE' },
        },
      },
      BookingCreate: {
        type: 'object',
        required: [
          'userId',
          'collectionAddress',
          'collectionPostcode',
          'deliveryAddress',
          'deliveryPostcode',
          'fullName',
          'email',
          'mobileNumber',
          'acceptTerms',
        ],
        properties: {
          userId: { type: 'string', format: 'uuid' },
          collectionAddress: {
            type: 'string',
            example: '42 Baker Street, Flat 4',
            description:
              'Required — real street address (house/flat + street). A postcode alone cannot identify a specific building for the driver.',
          },
          collectionPostcode: { type: 'string', example: 'SW1A 1AA' },
          deliveryAddress: { type: 'string', example: '10 Downing Street' },
          deliveryPostcode: { type: 'string', example: 'E1 6AN' },
          fullName: { type: 'string', example: 'Ali Khan' },
          email: { type: 'string', example: 'ali@example.com' },
          mobileNumber: { type: 'string', example: '+447700900123' },
          acceptTerms: { type: 'boolean', example: true },
          manpowerRequired: { type: 'string', example: '2 Man Team' },
          collectionCoordinates: {
            type: 'object',
            description:
              'Optional — send if already known (Places Autocomplete pick, dropped map pin, or device GPS). Used as-is instead of geocoding the address when provided.',
            properties: {
              latitude: { type: 'number', example: 51.501009 },
              longitude: { type: 'number', example: -0.1415876 },
            },
          },
          deliveryCoordinates: {
            type: 'object',
            description: 'Optional — same behavior as collectionCoordinates.',
            properties: {
              latitude: { type: 'number', example: 51.5164 },
              longitude: { type: 'number', example: -0.0703 },
            },
          },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                itemId: { type: 'string', example: '1' },
                category: { type: 'string', example: 'Bedroom' },
                itemName: { type: 'string', example: 'Single Bed & Mattress' },
                quantity: { type: 'integer', example: 2 },
                modifiers: { type: 'object' },
              },
            },
          },
        },
      },
      QuoteRequest: {
        type: 'object',
        properties: {
          collectionPostcode: { type: 'string', example: 'SW1A 1AA' },
          deliveryPostcode: { type: 'string', example: 'E1 6AN' },
          manpowerRequired: { type: 'string', example: '2 Man Team' },
          packingService: { type: 'string', example: 'None' },
          dismantlingRequired: { type: 'boolean', example: false },
          insuranceValue: { type: 'number', example: 0 },
          parkingAccess: {
            type: 'string',
            example: 'Easy Access (Driveway/Loading Bay)',
          },
          collectionFloorLevel: { type: 'string', example: 'Ground Floor' },
          deliveryFloorLevel: { type: 'string', example: 'Ground Floor' },
          collectionLiftAccess: { type: 'boolean', example: false },
          deliveryLiftAccess: { type: 'boolean', example: false },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                quantity: { type: 'integer', example: 2 },
                modifiers: {
                  type: 'object',
                  example: { 'Estimated Weight (kg)': 20 },
                },
              },
            },
          },
        },
      },
    },
  },
  paths: {
    '/': {
      get: {
        tags: ['Health'],
        summary: 'API health / info',
        responses: {
          200: { description: 'API is running' },
        },
      },
    },

    // ——— Users ———
    '/api/users/register': {
      post: {
        tags: ['Users'],
        summary: 'Register customer',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UserRegister' },
            },
          },
        },
        responses: {
          201: { description: 'Registered — returns user + JWT' },
          400: { description: 'Failed' },
        },
      },
    },
    '/api/users/login': {
      post: {
        tags: ['Users'],
        summary: 'Login by phone',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UserLogin' },
            },
          },
        },
        responses: {
          200: { description: 'Login OK — returns user + JWT' },
          400: { description: 'Failed' },
        },
      },
    },
    '/api/users/profile': {
      get: {
        tags: ['Users'],
        summary: 'Get logged-in profile',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Profile' },
          401: { description: 'Unauthorized' },
        },
      },
    },
    '/api/users/verify-token': {
      post: {
        tags: ['Users'],
        summary: 'Verify JWT',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Token valid' },
          401: { description: 'Invalid token' },
        },
      },
    },
    '/api/users/logout': {
      post: {
        tags: ['Users'],
        summary: 'Logout (revokes current JWT)',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Logged out' },
          401: { description: 'Invalid/expired token' },
        },
      },
    },

    // ——— Drivers ———
    // NOTE: no self-registration — drivers are created via POST /api/admin/drivers
    '/api/drivers/login': {
      post: {
        tags: ['Drivers'],
        summary: 'Driver login by phone (OTP verified client-side; needs admin approval first)',
        description:
          'Blocked drivers cannot log in. Deactivated drivers can log in but cannot go online. OTP itself is verified entirely on the Flutter client via Firebase — same as customers.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UserLogin' },
            },
          },
        },
        responses: { 200: { description: 'Returns driver + JWT' } },
      },
    },
    '/api/drivers/{id}': {
      get: {
        tags: ['Drivers'],
        summary: 'Get driver by ID',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'Driver' } },
      },
      put: {
        tags: ['Drivers'],
        summary: 'Update driver',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          content: { 'application/json': { schema: { type: 'object' } } },
        },
        responses: { 200: { description: 'Updated' } },
      },
    },
    '/api/drivers/{id}/status': {
      get: {
        tags: ['Drivers'],
        summary: 'Get driver status (lifecycle + online)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: {
            description:
              '{ driverId, status, isOnline, isApprovedByAdmin, lastOnlineAt } — status is active|deactivated|blocked|inactive',
          },
        },
      },
    },
    '/api/drivers/{id}/go-online': {
      post: {
        tags: ['Drivers'],
        summary: 'Driver go online',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'Online' } },
      },
    },
    '/api/drivers/{id}/go-offline': {
      post: {
        tags: ['Drivers'],
        summary: 'Driver go offline',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'Offline' } },
      },
    },
    '/api/drivers/{id}/update-location': {
      post: {
        tags: ['Drivers'],
        summary: 'Update GPS location',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['latitude', 'longitude'],
                properties: {
                  latitude: { type: 'number', example: 51.5074 },
                  longitude: { type: 'number', example: -0.1278 },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Location updated' } },
      },
    },
    '/api/drivers/{id}/orders': {
      get: {
        tags: ['Drivers'],
        summary: 'Driver orders',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Orders' } },
      },
    },
    '/api/drivers/{id}/orders/active': {
      get: {
        tags: ['Drivers'],
        summary: 'Driver active orders',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'Active orders' } },
      },
    },
    '/api/drivers/{id}/orders/{orderId}/complete-pickup': {
      post: {
        tags: ['Drivers'],
        summary: 'Complete pickup',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'orderId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  photos: { type: 'array', items: { type: 'string' } },
                  signature: { type: 'string' },
                  comment: { type: 'string' },
                  additionalItems: { type: 'array', items: { type: 'object' } },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Pickup completed' } },
      },
    },
    '/api/drivers/{id}/orders/{orderId}/complete-delivery': {
      post: {
        tags: ['Drivers'],
        summary: 'Complete delivery',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'orderId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['photos', 'signature', 'deliveryWaiverAccepted'],
                properties: {
                  photos: { type: 'array', items: { type: 'string' } },
                  signature: { type: 'string' },
                  comment: { type: 'string' },
                  deliveryWaiverAccepted: {
                    type: 'boolean',
                    description:
                      'Must be true — customer accepted the delivery waiver / T&Cs on the driver device after signing',
                  },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Delivery completed' } },
      },
    },
    '/api/drivers/logout': {
      post: {
        tags: ['Drivers'],
        summary: 'Logout (revokes current JWT, sets driver offline)',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Logged out' },
          401: { description: 'Invalid/expired token' },
        },
      },
    },
    '/api/drivers/{id}/statistics': {
      get: {
        tags: ['Drivers'],
        summary: 'Driver statistics',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'Stats' } },
      },
    },

    // ——— Services ———
    '/api/services/templates': {
      get: {
        tags: ['Services'],
        summary: 'All service templates / item catalog',
        responses: { 200: { description: 'Templates + handling options' } },
      },
    },
    '/api/services/templates/{serviceId}': {
      get: {
        tags: ['Services'],
        summary: 'Single service template',
        parameters: [
          {
            name: 'serviceId',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
              enum: ['home_move', 'man_and_van', 'vehicle', 'piano', 'office', 'manpower_only'],
            },
          },
        ],
        responses: { 200: { description: 'Template' } },
      },
    },
    '/api/services/quote': {
      post: {
        tags: ['Services'],
        summary: 'Quick quotation (no booking saved)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/QuoteRequest' },
            },
          },
        },
        responses: { 200: { description: 'Price breakdown' } },
      },
    },

    // ——— Bookings ———
    '/api/bookings/create': {
      post: {
        tags: ['Bookings'],
        summary: 'Create draft booking',
        description:
          'Rejects with 400 if this userId already has an unfinished booking (draft/submitted) or an active order (any status other than completed/cancelled) — a customer may only have one open request at a time.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/BookingCreate' },
            },
          },
        },
        responses: {
          201: { description: 'Booking created' },
          400: { description: 'Validation error, or customer already has an unfinished booking/active order' },
        },
      },
    },
    '/api/bookings/all': {
      get: {
        tags: ['Bookings'],
        summary: 'List bookings',
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['draft', 'submitted', 'converted_to_order'] } },
          { name: 'userId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 100 } },
        ],
        responses: { 200: { description: 'Bookings' } },
      },
    },
    '/api/bookings/user/{userId}': {
      get: {
        tags: ['Bookings'],
        summary: "Get the caller's own booking history",
        description:
          'userId must match the authenticated user (403 otherwise). Omit ?status to get all bookings and filter client-side using each item\'s status field, or pass ?status= for server-side filtering.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'userId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['draft', 'submitted', 'converted_to_order'] } },
        ],
        responses: {
          200: { description: 'User bookings' },
          403: { description: "userId does not match the caller's own id" },
        },
      },
    },
    '/api/bookings/{id}': {
      get: {
        tags: ['Bookings'],
        summary: 'Get booking',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'Booking' } },
      },
      put: {
        tags: ['Bookings'],
        summary: 'Update draft booking',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          content: { 'application/json': { schema: { type: 'object' } } },
        },
        responses: { 200: { description: 'Updated' } },
      },
      delete: {
        tags: ['Bookings'],
        summary: 'Delete draft booking',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'Deleted' } },
      },
    },
    '/api/bookings/{id}/items': {
      post: {
        tags: ['Bookings'],
        summary: 'Add item to booking',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  itemId: { type: 'string' },
                  category: { type: 'string' },
                  itemName: { type: 'string' },
                  quantity: { type: 'integer' },
                  modifiers: { type: 'object' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Item added' } },
      },
    },
    '/api/bookings/{id}/calculate-price': {
      post: {
        tags: ['Bookings'],
        summary: 'Calculate quotation for booking',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'Price calculated' } },
      },
    },
    '/api/bookings/{id}/submit': {
      post: {
        tags: ['Bookings'],
        summary: 'Submit booking (also creates the order)',
        description:
          'Locks the booking price (status: draft → submitted) AND immediately converts it into an order (status: pending) in the same request. Response contains both `booking` (now converted_to_order) and `order` (the new job, with its `orderId`) — no separate "create order" call is needed.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          201: {
            description: 'Booking submitted and order created',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Booking submitted and order created successfully' },
                    data: {
                      type: 'object',
                      properties: {
                        booking: { type: 'object', description: 'Booking, status: converted_to_order' },
                        order: { type: 'object', description: 'Newly created order, status: pending' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },

    // ——— Orders ———
    '/api/orders/create-from-booking': {
      post: {
        tags: ['Orders'],
        summary: '[Retry/fallback only] Convert submitted booking → order',
        description:
          'Not part of the normal flow — POST /api/bookings/{id}/submit now creates the order automatically. Use this only to recover a booking stuck at status "submitted" whose order-creation step failed on the first attempt. Safe to retry: throws if the booking was already converted.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['bookingId'],
                properties: {
                  bookingId: { type: 'string', format: 'uuid' },
                  serviceName: { type: 'string', example: 'Home Move' },
                  totalPrice: { type: 'number' },
                  quotedPrice: { type: 'number' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Order created' } },
      },
    },
    '/api/orders/create': {
      post: {
        tags: ['Orders'],
        summary: 'Create order directly',
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: { 'application/json': { schema: { type: 'object' } } },
        },
        responses: { 201: { description: 'Order created' } },
      },
    },
    '/api/orders/active': {
      get: {
        tags: ['Orders'],
        summary: 'Active orders',
        parameters: [
          { name: 'userId', in: 'query', schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'Active orders' } },
      },
    },
    '/api/orders/user/{userId}': {
      get: {
        tags: ['Orders'],
        summary: "Get the caller's own order history",
        description:
          'userId must match the authenticated user (403 otherwise). Omit ?status to get all orders and filter client-side using each item\'s status field, or pass ?status= for server-side filtering.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'userId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'User orders' },
          403: { description: "userId does not match the caller's own id" },
        },
      },
    },
    '/api/orders/code/{orderId}': {
      get: {
        tags: ['Orders'],
        summary: 'Get order by code (ORD-...)',
        parameters: [
          { name: 'orderId', in: 'path', required: true, schema: { type: 'string', example: 'ORD-20260722-003304-4754' } },
        ],
        responses: { 200: { description: 'Order' } },
      },
    },
    '/api/orders/{id}': {
      get: {
        tags: ['Orders'],
        summary: 'Get order by UUID',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'Order' } },
      },
    },
    '/api/orders/{id}/tracking': {
      get: {
        tags: ['Orders'],
        summary: 'Live tracking: status timeline + driver GPS + ETA',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'Tracking info' }, 404: { description: 'Order not found' } },
      },
    },
    '/api/orders/{id}/status': {
      patch: {
        tags: ['Orders'],
        summary: 'Update order status',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['status'],
                properties: {
                  status: {
                    type: 'string',
                    enum: [
                      'pending',
                      'confirmed',
                      'pickupScheduled',
                      'outForPickup',
                      'pickupCompleted',
                      'outForDropOff',
                      'completed',
                      'cancelled',
                    ],
                  },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Status updated' } },
      },
    },
    '/api/orders/{id}/cancel': {
      post: {
        tags: ['Orders'],
        summary: 'Cancel order',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['cancellationReason'],
                properties: {
                  cancellationReason: { type: 'string', example: 'Customer cancelled' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Cancelled' } },
      },
    },

    // ——— Admin ———
    '/api/admin/register': {
      post: {
        tags: ['Admin'],
        summary: 'Register admin (first is open; later needs admin JWT)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/AdminRegister' } },
          },
        },
        responses: { 201: { description: 'Admin + JWT' } },
      },
    },
    '/api/admin/login': {
      post: {
        tags: ['Admin'],
        summary: 'Admin login (email + password)',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/AdminLogin' } },
          },
        },
        responses: { 200: { description: 'Admin + JWT' } },
      },
    },
    '/api/admin/profile': {
      get: {
        tags: ['Admin'],
        summary: 'Admin profile',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Profile' } },
      },
    },
    '/api/admin/logout': {
      post: {
        tags: ['Admin'],
        summary: 'Logout (revokes current JWT)',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Logged out' },
          401: { description: 'Invalid/expired token' },
        },
      },
    },
    '/api/admin/dashboard': {
      get: {
        tags: ['Admin'],
        summary: 'Dashboard stats',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Counts + revenue' } },
      },
    },
    '/api/admin/users': {
      get: {
        tags: ['Admin'],
        summary: 'List all customers',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Users' } },
      },
    },
    '/api/admin/drivers': {
      get: {
        tags: ['Admin'],
        summary: 'List all drivers',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Drivers' } },
      },
      post: {
        tags: ['Admin'],
        summary: 'Create driver (admin-only — no self-registration)',
        description:
          'Creates an unapproved driver. Admin app verifies OTP client-side (Firebase) then calls approve. profilePictureUrl is required.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'email', 'phone', 'profilePictureUrl'],
                properties: {
                  name: { type: 'string' },
                  email: { type: 'string' },
                  phone: { type: 'string' },
                  address: { type: 'string' },
                  dob: { type: 'string' },
                  licenseNumber: { type: 'string' },
                  vehicleType: { type: 'string' },
                  vehicleNumber: { type: 'string' },
                  profilePictureUrl: { type: 'string', description: 'URL after client-side upload to storage' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Driver created (pending approval)' } },
      },
    },
    '/api/admin/drivers/{id}/approve': {
      put: {
        tags: ['Admin'],
        summary: 'Approve driver (after client-side OTP verification)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'Approved' } },
      },
    },
    '/api/admin/drivers/{id}/deactivate': {
      put: {
        tags: ['Admin'],
        summary: 'Deactivate driver (can log in, cannot go online)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'Deactivated' } },
      },
    },
    '/api/admin/drivers/{id}/block': {
      put: {
        tags: ['Admin'],
        summary: 'Block driver (cannot log in)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'Blocked' } },
      },
    },
    '/api/admin/drivers/{id}/activate': {
      put: {
        tags: ['Admin'],
        summary: 'Activate approved driver',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'Activated' } },
      },
    },
    '/api/admin/catalog/service-types': {
      post: {
        tags: ['Admin Catalog'],
        summary: 'Create service type',
        security: [{ bearerAuth: [] }],
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { 201: { description: 'Created' } },
      },
    },
    '/api/admin/catalog/service-types/{id}': {
      put: {
        tags: ['Admin Catalog'],
        summary: 'Update service type',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { 200: { description: 'Updated' } },
      },
      delete: {
        tags: ['Admin Catalog'],
        summary: 'Delete service type',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'Deleted' } },
      },
    },
    '/api/admin/catalog/categories': {
      post: {
        tags: ['Admin Catalog'],
        summary: 'Create category (optionally attach via serviceTypeId)',
        security: [{ bearerAuth: [] }],
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { 201: { description: 'Created' } },
      },
    },
    '/api/admin/catalog/categories/{id}': {
      put: {
        tags: ['Admin Catalog'],
        summary: 'Update category (e.g. pricingMultiplier)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { 200: { description: 'Updated' } },
      },
      delete: {
        tags: ['Admin Catalog'],
        summary: 'Delete category',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'Deleted' } },
      },
    },
    '/api/admin/catalog/categories/{categoryId}/attach': {
      post: {
        tags: ['Admin Catalog'],
        summary: 'Attach existing category to a service type',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'categoryId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['serviceTypeId'],
                properties: {
                  serviceTypeId: { type: 'string', format: 'uuid' },
                  sortOrder: { type: 'integer' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Attached' } },
      },
    },
    '/api/admin/catalog/items': {
      post: {
        tags: ['Admin Catalog'],
        summary: 'Create catalog item (set basePrice to override weight pricing)',
        security: [{ bearerAuth: [] }],
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { 201: { description: 'Created' } },
      },
    },
    '/api/admin/catalog/items/{id}': {
      put: {
        tags: ['Admin Catalog'],
        summary: 'Update catalog item / price',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { 200: { description: 'Updated' } },
      },
      delete: {
        tags: ['Admin Catalog'],
        summary: 'Delete catalog item',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'Deleted' } },
      },
    },
    '/api/admin/bookings': {
      get: {
        tags: ['Admin'],
        summary: 'List all bookings',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'userId', in: 'query', schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'Bookings' } },
      },
    },
    '/api/admin/bookings/{id}': {
      get: {
        tags: ['Admin'],
        summary: 'Get booking',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'Booking' } },
      },
    },
    '/api/admin/orders': {
      get: {
        tags: ['Admin'],
        summary: 'List all orders',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'userId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'driverId', in: 'query', schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'Orders' } },
      },
    },
    '/api/admin/orders/{id}': {
      get: {
        tags: ['Admin'],
        summary: 'Get order',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'Order' } },
      },
    },
    '/api/admin/orders/{id}/assign-driver': {
      post: {
        tags: ['Admin'],
        summary: 'Assign driver (pending → confirmed)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['driverId'],
                properties: { driverId: { type: 'string', format: 'uuid' } },
              },
            },
          },
        },
        responses: { 200: { description: 'Assigned' } },
      },
    },
    '/api/admin/orders/{id}/status': {
      patch: {
        tags: ['Admin'],
        summary: 'Update order status',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['status'],
                properties: { status: { type: 'string' } },
              },
            },
          },
        },
        responses: { 200: { description: 'Updated' } },
      },
    },
    '/api/admin/orders/{id}/pricing': {
      patch: {
        tags: ['Admin'],
        summary: 'Update order pricing',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  totalPrice: { type: 'number' },
                  quotedPrice: { type: 'number' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Pricing updated' } },
      },
    },
    '/api/admin/orders/{id}/schedule-pickup': {
      post: {
        tags: ['Admin'],
        summary: 'Schedule pickup',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['pickupDateTime'],
                properties: { pickupDateTime: { type: 'string', format: 'date-time' } },
              },
            },
          },
        },
        responses: { 200: { description: 'Scheduled' } },
      },
    },
    '/api/admin/orders/{id}/cancel': {
      post: {
        tags: ['Admin'],
        summary: 'Cancel order',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['cancellationReason'],
                properties: { cancellationReason: { type: 'string' } },
              },
            },
          },
        },
        responses: { 200: { description: 'Cancelled' } },
      },
    },

    // ——— Maps ———
    '/api/maps/geocode': {
      get: {
        tags: ['Maps'],
        summary: 'Address/postcode → lat/lng (Google Geocoding API proxy)',
        parameters: [
          { name: 'address', in: 'query', required: true, schema: { type: 'string', example: 'SW1A 1AA' } },
        ],
        responses: { 200: { description: 'Coordinates' }, 404: { description: 'Not resolvable' } },
      },
    },
    '/api/maps/distance': {
      get: {
        tags: ['Maps'],
        summary: 'Real distance + traffic-aware duration (Google Distance Matrix API proxy)',
        parameters: [
          { name: 'origin', in: 'query', required: true, schema: { type: 'string', example: 'SW1A 1AA' } },
          { name: 'destination', in: 'query', required: true, schema: { type: 'string', example: 'E1 6AN' } },
        ],
        responses: { 200: { description: 'Distance + duration' } },
      },
    },
  },
};

module.exports = swaggerDefinition;
