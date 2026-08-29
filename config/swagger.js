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
      'Backend for cargo booking, quotations, payments, orders, and driver workflow.\n\n' +
      '**Auth:** Click Authorize and paste your JWT (Swagger adds Bearer).\n\n' +
      'Roles: `user` | `driver` | `admin`\n\n' +
      'Admin panel APIs live under `/api/admin/*`\n\n' +
      '**Payment flow (a booking must be paid before it becomes an order):**\n' +
      '1. `POST /api/bookings/create` — draft booking\n' +
      '2. `POST /api/bookings/{id}/calculate-price` — show the quote\n' +
      '3. `POST /api/payments/create-intent` — server prices it and returns a Stripe `clientSecret`\n' +
      '4. Client confirms the card with the Stripe SDK (card details never touch this API)\n' +
      '5. Stripe webhook (or `POST /api/payments/confirm`) marks it paid and **creates the order**\n\n' +
      '**One order at a time:** a customer can save up as many bookings as they want, but step 3 returns ' +
      '`409` while they already have an order in progress. Nothing after step 3 re-checks it, so no one is ' +
      'ever charged for a job we then refuse.\n\n' +
      '**Images:** upload through `/api/uploads/*`, read through `/api/images/*` — the apps never talk to Supabase Storage directly.\n' +
      '- Driver photos go to a **public** bucket. Upload returns a permanent `url`; read it back with ' +
      '`GET /api/images/drivers/{id}` (or the admin list).\n' +
      '- Pickup/delivery proof goes to a **private** bucket. Upload returns a `storageKey` to save on the order; ' +
      'read the pictures with `GET /api/images/orders/{orderId}` (signed URLs, valid one hour — never cache them, ' +
      'call the images endpoint again).',
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
          moveDate: {
            type: 'string',
            format: 'date-time',
            example: '2026-09-03T00:00:00.000Z',
            description:
              'Customer-picked move/delivery day from the booking calendar. Optional; stored as null if omitted. Copied to the order as pickupDateTime on submit/pay.',
          },
          dateFlexibility: {
            type: 'string',
            enum: ['Exact Date Only', 'Within 3 Days', 'Within a Week', 'Flexible'],
            example: 'Exact Date Only',
          },
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
          403: { description: 'Account inactive' },
          404: { description: 'No account for this phone — sign up first' },
        },
      },
    },
    '/api/users/check-phone': {
      post: {
        tags: ['Users'],
        summary: 'Check whether a phone number already has an account',
        description:
          'Used by the login screen *before* Firebase sends an SMS. Returns `{ exists }` and never issues a JWT. ' +
          'Unknown numbers are `exists: false` (HTTP 200) so the client can tell the user to sign up first.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UserLogin' },
            },
          },
        },
        responses: {
          200: { description: '`data.exists` is true or false' },
          400: { description: 'Phone missing / lookup failed' },
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
    '/api/drivers/{id}/location': {
      get: {
        tags: ['Drivers'],
        summary: "Get a driver's last-known GPS position",
        description:
          'Read side of POST /api/drivers/{id}/update-location. Admin token reads any ' +
          'driver (live fleet map); a driver token can only read its own id. ' +
          'Customers must use GET /api/orders/{id}/driver-location instead — they are ' +
          'never given a driverId.\n\n' +
          'The position is only as fresh as the last ping the driver app sent, so the ' +
          'response includes `ageSeconds` and `isStale` (true past `staleAfterSeconds`, ' +
          'currently 120). Show "updated X ago" rather than a marker that looks live ' +
          'but is not. For continuous updates prefer the Supabase Realtime channel ' +
          '`driver-<driverId>` (event `location`), which is pushed on every ping.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: {
            description:
              '{ driverId, isOnline, hasLocation, latitude, longitude, lastUpdated, ageSeconds, isStale, staleAfterSeconds, realtimeChannel }. ' +
              'hasLocation is false with null coordinates when the driver has never sent a ping.',
          },
          403: { description: 'A driver tried to read another driver’s location' },
          404: { description: 'Driver not found' },
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
        description:
          'Upload the photos first via `POST /api/uploads/order-proof/{orderId}?kind=pickup` and send the ' +
          '`storageKeys` it returns. References that do not belong to this order are rejected.',
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
                  photos: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Storage keys from the upload endpoint. At least 1, at most 12.',
                    example: ['order-proofs/<orderId>/pickup/1712345678-0-a1b2c3d4.jpg'],
                  },
                  signature: {
                    type: 'string',
                    description: 'Storage key from `?kind=pickupSignature`',
                  },
                  comment: { type: 'string' },
                  additionalItems: { type: 'array', items: { type: 'object' } },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Pickup completed' },
          400: { description: 'No photos, or a photo reference that is not this order\'s' },
        },
      },
    },
    '/api/drivers/{id}/orders/{orderId}/complete-delivery': {
      post: {
        tags: ['Drivers'],
        summary: 'Complete delivery',
        description:
          'Upload the photos and the customer\'s signature first via ' +
          '`POST /api/uploads/order-proof/{orderId}` (`kind=delivery`, then `kind=deliverySignature`) and ' +
          'send the `storageKeys` it returns. References that do not belong to this order are rejected.',
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
                  photos: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Storage keys from `?kind=delivery`. At least 1, at most 12.',
                    example: ['order-proofs/<orderId>/delivery/1712345678-0-a1b2c3d4.jpg'],
                  },
                  signature: {
                    type: 'string',
                    description: 'Storage key from `?kind=deliverySignature`',
                  },
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
        responses: {
          200: { description: 'Delivery completed' },
          400: {
            description:
              'Missing photos/signature/waiver, or a reference that is not this order\'s',
          },
        },
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
          'A customer may hold **as many bookings as they like** — a booking is only a saved quote, so the ' +
          'app can show a list of them. The limit is one *order* at a time, and it is enforced at payment ' +
          '(`POST /api/payments/create-intent` returns 409 while an order is in progress), not here.',
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
          400: { description: 'Validation error' },
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
        summary: 'Submit booking (also creates the order) — requires payment first',
        description:
          '**Requires a succeeded Stripe payment on the booking, otherwise 402.** In the normal flow the ' +
          'frontend does not call this at all: paying via `POST /api/payments/create-intent` triggers it ' +
          'automatically once Stripe confirms the money, and the order comes back from the webhook or ' +
          'from `POST /api/payments/confirm`.\n\n' +
          'Locks the booking price (status: draft → submitted) AND converts it into an order (status: ' +
          'pending) in the same request. Response contains both `booking` (now converted_to_order) and ' +
          '`order` (the new job, with its `orderId`). The locked price is the amount Stripe actually ' +
          'captured, so the order total can never drift from what the customer was charged.',
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
          402: {
            description:
              'Booking not paid yet — create a payment with POST /api/payments/create-intent first',
          },
        },
      },
    },

    // ——— Orders ———
    '/api/orders/create-from-booking': {
      post: {
        tags: ['Orders'],
        summary: '[Retry/fallback only] Convert paid+submitted booking → order',
        description:
          'Not part of the normal flow. Use this only to recover a booking stuck at status "submitted" ' +
          '(payment succeeded, order creation failed). Safe to retry: throws if the booking was already ' +
          'converted, and returns 402 if the booking was never paid.\n\n' +
          '`totalPrice`/`quotedPrice` are no longer accepted — the order total is the amount Stripe captured.',
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
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Order created' },
          402: { description: 'Booking has no successful payment' },
        },
      },
    },
    '/api/orders/create': {
      post: {
        tags: ['Orders'],
        summary: 'Create order directly (admin only)',
        description:
          'Admin-only ops tool for manually entered jobs (e.g. a booking taken over the phone). It was ' +
          'previously open to customers, which became a way to obtain an order without paying once the ' +
          'booking flow required payment. Orders created here keep `paymentStatus: unpaid`.\n\n' +
          'Respects the one-active-order rule (`409` if that customer already has a job in progress). Send ' +
          '`allowConcurrentOrder: true` to override it for a genuine second job.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: { 'application/json': { schema: { type: 'object' } } },
        },
        responses: {
          201: { description: 'Order created' },
          403: { description: 'Not an admin' },
          409: { description: 'Customer already has an order in progress' },
        },
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
        description:
          'Full tracking screen payload. Each call spends a Google Distance Matrix ' +
          'request on the ETA, so call it to load the screen and then poll ' +
          'GET /api/orders/{id}/driver-location to keep the marker moving.',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'Tracking info' }, 404: { description: 'Order not found' } },
      },
    },
    '/api/orders/{id}/driver-location': {
      get: {
        tags: ['Orders'],
        summary: "Assigned driver's live position for one order (poll-friendly)",
        description:
          'Position only, no ETA — this is what the customer tracking map should poll ' +
          'to move the marker. GET /api/orders/{id}/tracking bills a Google Distance ' +
          'Matrix request for its ETA on every call, so use that once to load the ' +
          'screen and this one to refresh it.\n\n' +
          'Returns `driverAssigned: false` with `location: null` while the order is ' +
          'still unassigned — that is a normal state, not an error. Freshness fields ' +
          '(`ageSeconds`, `isStale`) work as described on GET /api/drivers/{id}/location.',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: {
            description:
              '{ orderId, status, driverAssigned, location: { isOnline, hasLocation, latitude, longitude, lastUpdated, ageSeconds, isStale, staleAfterSeconds } | null, realtimeChannel }',
          },
          404: { description: 'Order not found' },
        },
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
          'Creates an unapproved driver. Admin app verifies OTP client-side (Firebase) then calls approve. ' +
          'profilePictureUrl is required — get it from `POST /api/uploads/driver-photo` first.',
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
                  profilePictureUrl: {
                    type: 'string',
                    description: 'The `url` returned by POST /api/uploads/driver-photo',
                  },
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

    // ——— Payments (Stripe) ———
    '/api/payments/config': {
      get: {
        tags: ['Payments'],
        summary: 'Stripe publishable key + currency',
        description:
          'Auth: none. Lets the web/Flutter app initialize the Stripe SDK without hardcoding a key. ' +
          'The secret key never leaves the server.',
        responses: {
          200: { description: '{ publishableKey, currency, integration }' },
          503: { description: 'Stripe not configured on the server' },
        },
      },
    },
    '/api/payments/create-intent': {
      post: {
        tags: ['Payments'],
        summary: 'Start payment for a draft booking (step 1 of checkout)',
        description:
          '**This is where the money flow begins — a booking cannot become an order until it is paid.**\n\n' +
          'The server re-runs the pricing engine on the booking and uses that as the amount; ' +
          '`amount` is never read from the request body, so a client cannot choose its own price. ' +
          'Display the returned `amount` before opening the payment sheet — it is what will be charged, ' +
          'and it can differ from an earlier quote if items changed.\n\n' +
          'Confirm the returned `clientSecret` with Stripe on the client (Payment Element on web, ' +
          'PaymentSheet on Flutter). Then either wait for the webhook or call ' +
          '`POST /api/payments/confirm` to get the order immediately.\n\n' +
          'Safe to call more than once: an in-flight PaymentIntent is reused (and re-priced if the ' +
          'booking changed) instead of creating a second chargeable intent.\n\n' +
          '**One order at a time.** A customer may hold any number of bookings, but this endpoint returns ' +
          '`409` while they still have an order in progress (any status other than `completed`/`cancelled`), ' +
          'naming the order that is blocking them. The check lives here rather than on the conversion that ' +
          'follows, so nobody is ever charged for a job they cannot be given.',
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
                },
              },
            },
          },
        },
        responses: {
          201: {
            description:
              '{ paymentId, paymentIntentId, clientSecret, publishableKey, amount, amountMinor, currency, status, priceBreakdown }',
          },
          400: { description: 'No items / terms not accepted / amount below £0.30' },
          403: { description: 'Booking belongs to another customer' },
          404: { description: 'Booking not found' },
          409: {
            description:
              'Booking already paid / already converted, or the customer still has an order in progress',
          },
          503: { description: 'Stripe not configured' },
        },
      },
    },
    '/api/payments/confirm': {
      post: {
        tags: ['Payments'],
        summary: 'Re-read the payment from Stripe and finish the flow (step 2)',
        description:
          'Call this right after the payment sheet reports success to get the order without waiting for ' +
          'the webhook. It is also the way to complete a payment in local development, where Stripe ' +
          'cannot reach `localhost` without the Stripe CLI.\n\n' +
          'Not a trust hole: the client only names the PaymentIntent — the outcome is fetched from ' +
          "Stripe's API. A client claiming success for an unpaid intent gets `paymentStatus: pending`.\n\n" +
          'Idempotent: calling it repeatedly (or alongside the webhook) creates exactly one order.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['paymentIntentId'],
                properties: {
                  paymentIntentId: { type: 'string', example: 'pi_3abc123...' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description:
              '{ payment, order, paymentStatus }. `order` is the newly created order when the payment succeeded, otherwise null.',
          },
          400: { description: 'paymentIntentId missing' },
          403: { description: 'Payment belongs to another customer' },
          404: { description: 'Payment not found' },
        },
      },
    },
    '/api/payments/booking/{bookingId}': {
      get: {
        tags: ['Payments'],
        summary: 'Payment state for a booking (poll)',
        description:
          'Lightweight polling alternative to `/confirm` — no Stripe API call, reads what the webhook ' +
          'has already recorded. Returns the order once it exists.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'bookingId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: {
            description:
              '{ bookingId, bookingStatus, paymentStatus, isPaid, amount, currency, paidAt, receiptUrl, failureMessage, paymentIntentId, order }',
          },
          403: { description: 'Booking belongs to another customer' },
          404: { description: 'Booking not found' },
        },
      },
    },
    '/api/payments/webhook': {
      post: {
        tags: ['Payments'],
        summary: 'Stripe webhook (Stripe calls this, not your app)',
        description:
          'Auth: none — authenticity comes from the `Stripe-Signature` header, verified against the raw ' +
          'request body using `STRIPE_WEBHOOK_SECRET`. Returns 503 while that secret is unset, because an ' +
          'unverified endpoint would let anyone mark any booking as paid.\n\n' +
          'Handled events: `payment_intent.succeeded` (marks paid, submits the booking, creates the order), ' +
          '`payment_intent.payment_failed`, `payment_intent.canceled`, `charge.refunded`.\n\n' +
          'Local dev: `stripe listen --forward-to localhost:5000/api/payments/webhook`.',
        responses: {
          200: { description: '{ received: true }' },
          400: { description: 'Signature verification failed' },
          500: { description: 'Handler error — Stripe will retry' },
          503: { description: 'Stripe or webhook secret not configured' },
        },
      },
    },
    '/api/admin/payments': {
      get: {
        tags: ['Admin'],
        summary: 'List payments (ledger)',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'status',
            in: 'query',
            schema: {
              type: 'string',
              enum: ['pending', 'processing', 'succeeded', 'failed', 'cancelled', 'refunded'],
            },
          },
          { name: 'userId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'bookingId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'orderId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', example: 100 } },
        ],
        responses: { 200: { description: '{ count, netCollected, payments[] }' } },
      },
    },
    '/api/admin/payments/{id}/refund': {
      post: {
        tags: ['Admin'],
        summary: 'Refund a payment (full or partial)',
        description:
          'Omit `amount` for a full refund of whatever is still refundable. Pair this with ' +
          '`POST /api/admin/orders/{id}/cancel` when calling off a job the customer already paid for.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, description: 'payments.id (not the Stripe intent id)' },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  amount: { type: 'number', example: 50, description: 'GBP. Defaults to the full refundable amount.' },
                  reason: { type: 'string', example: 'Customer cancelled before pickup' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: '{ payment, refundId, refundedAmount }' },
          400: { description: 'Not refundable / amount out of range' },
          404: { description: 'Payment not found' },
          409: { description: 'Already fully refunded' },
        },
      },
    },
    '/api/uploads/limits': {
      get: {
        tags: ['Uploads'],
        summary: 'Size / type limits the pickers should enforce',
        description:
          'Auth: none. Read these instead of hard-coding limits in the apps, so the client-side check ' +
          'can never drift from what the server actually accepts.',
        responses: {
          200: {
            description:
              '{ maxFileBytes, maxFileMb, allowedMimeTypes[], maxFilesPerRequest, fieldName }',
          },
        },
      },
    },
    '/api/uploads/driver-photo': {
      post: {
        tags: ['Uploads'],
        summary: 'Upload a driver profile photo (admin)',
        description:
          'Auth: **admin** — admins are the only ones who create or edit drivers.\n\n' +
          'Goes into the PUBLIC `driver-photos` bucket and returns a permanent URL. Pass that URL ' +
          'straight into `POST /api/admin/drivers` as `profilePictureUrl` (or `PUT /api/drivers/{id}`, ' +
          'which also deletes the photo it replaces).\n\n' +
          'The file is validated by its magic bytes, not the declared Content-Type, so renaming a ' +
          '`.exe` to `.png` does not get past it.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  file: { type: 'string', format: 'binary', description: 'JPEG / PNG / WebP, max 10 MB' },
                  driverId: {
                    type: 'string',
                    format: 'uuid',
                    description:
                      'Optional. Only when replacing an existing driver\'s photo — files it under that ' +
                      'driver instead of `pending/`.',
                  },
                },
              },
            },
          },
        },
        responses: {
          201: { description: '{ url, storageKey, contentType, bytes } — `url` is what you store' },
          400: { description: 'No file, or not a JPEG/PNG/WebP' },
          401: { description: 'No token' },
          403: { description: 'Not an admin' },
          413: { description: 'File larger than 10 MB' },
        },
      },
    },
    '/api/uploads/order-proof/{orderId}': {
      post: {
        tags: ['Uploads'],
        summary: 'Upload proof of pickup / delivery for one order (driver)',
        description:
          'Auth: **driver** assigned to this order (admins may also upload, for support cases). Any ' +
          'other driver gets 403 — otherwise a driver could write photos into another driver\'s job.\n\n' +
          'Goes into the PRIVATE `order-proofs` bucket, so what comes back is a **storage key**, not a ' +
          'public URL. Store the keys, don\'t try to render them: submit them to ' +
          '`POST /api/drivers/{id}/orders/{orderId}/complete-pickup` or `.../complete-delivery`, which ' +
          'reject any reference that does not belong to that order. Use the returned `previewUrl` ' +
          '(short-lived) to show a thumbnail in the driver app straight away.\n\n' +
          'When you want to display them, call `GET /api/images/orders/{orderId}` — that returns signed URLs ' +
          'valid for one hour. Order/tracking payloads still include the signed fields too, for older clients.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'orderId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description:
              'Order UUID (`_id`) or the human `ORD-...` code (`order.id` / `orderId` from driver/customer payloads)',
          },
          {
            name: 'kind',
            in: 'query',
            required: true,
            schema: {
              type: 'string',
              enum: ['pickup', 'delivery', 'pickupSignature', 'deliverySignature'],
            },
            description: 'Signature kinds accept exactly one file',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  files: {
                    type: 'array',
                    items: { type: 'string', format: 'binary' },
                    description: 'Up to 8 images per request, 10 MB each. Also accepts field names file, photos, photo, image, images.',
                  },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description:
              '{ orderId, orderUuid, kind, storageKeys[], files[{ storageKey, previewUrl }] } — submit `storageKeys`',
          },
          400: { description: 'No file, unknown kind, or not a JPEG/PNG/WebP' },
          401: { description: 'No token' },
          403: { description: 'Order is not assigned to this driver' },
          404: { description: 'Order not found' },
          413: { description: 'File larger than 10 MB' },
        },
      },
    },
    '/api/images/drivers': {
      get: {
        tags: ['Images'],
        summary: "List every driver's profile photo (admin)",
        description:
          'Auth: **admin**. Built for the driver-management screen so it does not have to pull photos ' +
          'out of `GET /api/admin/drivers`. Each item is `{ driverId, name, hasPhoto, photo: { url, expiresAt } | null }`. ' +
          '`expiresAt` is always null here — driver photos are public permanent URLs.',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: '{ count, drivers[] }' },
          401: { description: 'No token' },
          403: { description: 'Not an admin' },
        },
      },
    },
    '/api/images/drivers/{id}': {
      get: {
        tags: ['Images'],
        summary: "One driver's profile photo",
        description:
          'Auth: none. Same public URL that already sits on `GET /api/drivers/{id}` as `profilePictureUrl`, ' +
          'returned on its own so the UI does not have to load the whole driver record to show a face.\n\n' +
          'Customers tracking an order do **not** receive a driverId — they should call ' +
          '`GET /api/images/orders/{orderId}` which includes `driverPhoto`.',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: {
            description:
              '{ driverId, name, hasPhoto, photo: { url, expiresAt: null } | null }. hasPhoto is false when none was uploaded.',
          },
          404: { description: 'Driver not found' },
        },
      },
    },
    '/api/images/drivers/{id}/orders': {
      get: {
        tags: ['Images'],
        summary: "Proof photos for every order assigned to a driver",
        description:
          'Auth: **driver** (own id) or **admin**. Driver-app job history.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: { description: '{ driverId, count, orders[] } — each order matches GET /api/images/orders/{orderId}' },
          403: { description: 'A driver tried to read another driver\'s jobs' },
          404: { description: 'Driver not found' },
        },
      },
    },
    '/api/images/orders/{orderId}': {
      get: {
        tags: ['Images'],
        summary: 'Driver photo + proof-of-delivery for one order',
        description:
          'Auth: the **customer who owns the order**, the **assigned driver**, or an **admin**.\n\n' +
          'This is the endpoint the order-detail / tracking / history screens should call for pictures. ' +
          'Proof URLs are signed and expire after `expiresInSeconds` (3600). Re-call this endpoint rather ' +
          'than caching the link.\n\n' +
          'Pass `?kind=` to fetch only one group: `driverPhoto` | `pickup` | `delivery` | ' +
          '`pickupSignature` | `deliverySignature`.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'orderId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Order UUID (`_id`) or the human `ORD-…` code',
          },
          {
            name: 'kind',
            in: 'query',
            required: false,
            schema: {
              type: 'string',
              enum: ['driverPhoto', 'pickup', 'delivery', 'pickupSignature', 'deliverySignature'],
            },
          },
        ],
        responses: {
          200: {
            description:
              '{ orderId, orderUuid, status, expiresInSeconds, driverPhoto, pickupPhotos[], deliveryPhotos[], pickupSignature, deliverySignature }. ' +
              'Each image is `{ url, expiresAt }` or null / empty array when nothing was uploaded yet.',
          },
          401: { description: 'No token' },
          403: { description: 'Not the owner, assigned driver, or admin' },
          404: { description: 'Order not found' },
        },
      },
    },
    '/api/images/users/{userId}/orders': {
      get: {
        tags: ['Images'],
        summary: "Proof photos for every order in a customer's history",
        description:
          'Auth: **user** (own id) or **admin**. Customer order-history screen.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'userId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: { description: '{ userId, count, orders[] } — each order matches GET /api/images/orders/{orderId}' },
          403: { description: 'A customer tried to read another customer\'s photos' },
        },
      },
    },
  },
};

module.exports = swaggerDefinition;
