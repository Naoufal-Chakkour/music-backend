require('dotenv').config();

const express = require('express');
const cors = require('cors');

const musicRoutes = require('./routes/music');

const app = express();

const PORT = Number(process.env.PORT) || 3000;

/*
|--------------------------------------------------------------------------
| CORS
|--------------------------------------------------------------------------
|
| محليًا:
| http://localhost:3000
|
| في الإنتاج:
| ALLOWED_ORIGINS=https://naoufal-chakkour.github.io
|
| يمكن وضع أكثر من Origin مفصولًا بفاصلة:
| ALLOWED_ORIGINS=https://example.com,http://localhost:3000
|
*/

const allowedOrigins = String(
  process.env.ALLOWED_ORIGINS ||
  'http://localhost:3000'
)
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      /*
       * الطلبات التي لا تحتوي Origin مثل:
       * curl / Postman / server-to-server
       */
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(
        new Error('ORIGIN_NOT_ALLOWED')
      );
    },

    methods: [
      'GET',
      'POST',
      'OPTIONS'
    ],

    allowedHeaders: [
      'Content-Type'
    ]
  })
);

/*
|--------------------------------------------------------------------------
| JSON Body
|--------------------------------------------------------------------------
*/

app.use(
  express.json({
    limit: '1mb'
  })
);

/*
|--------------------------------------------------------------------------
| Health Check
|--------------------------------------------------------------------------
*/

app.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'Music Backend',
    version: '3.0.0'
  });
});

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
*/

app.use('/api', musicRoutes);

/*
|--------------------------------------------------------------------------
| 404
|--------------------------------------------------------------------------
*/

app.use((req, res) => {
  res.status(404).json({
    error: 'المسار غير موجود'
  });
});

/*
|--------------------------------------------------------------------------
| Global Error Handler
|--------------------------------------------------------------------------
|
| يجب أن يكون في نهاية middleware stack.
|
*/

app.use((err, req, res, next) => {
  console.error(
    '[SERVER ERROR]',
    err
  );

  if (res.headersSent) {
    return next(err);
  }

  if (err.message === 'ORIGIN_NOT_ALLOWED') {
    return res.status(403).json({
      error:
        'هذا المصدر غير مسموح له بالوصول إلى API'
    });
  }

  return res.status(500).json({
    error:
      'حدث خطأ داخلي في الخادم'
  });
});

/*
|--------------------------------------------------------------------------
| Start Server
|--------------------------------------------------------------------------
*/

const server = app.listen(
  PORT,
  '0.0.0.0',
  error => {
    if (error) {
      console.error(
        '[SERVER START ERROR]',
        error
      );

      process.exit(1);
    }

    console.log(
      `Music Backend running on port ${PORT}`
    );

    console.log(
      'Allowed origins:',
      allowedOrigins
    );
  }
);

module.exports = app;