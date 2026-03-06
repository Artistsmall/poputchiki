const express = require('express');
const cors = require('cors');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const isProduction = process.env.NODE_ENV === 'production';

// Middleware
app.use(cors({
  origin: isProduction ? 'https://poputchiki.onrender.com' : 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// MongoDB connection
const mongoUrl = process.env.MONGODB_URL || 'mongodb://localhost:27017/poputchiki';
let db;
let client;

const initDatabase = async () => {
  try {
    console.log('🔄 Подключение к MongoDB...');
    client = new MongoClient(mongoUrl);
    await client.connect();
    db = client.db();
    console.log('✅ MongoDB подключена');
    await db.collection('users').createIndex({ email: 1 }, { unique: true });
  } catch (err) {
    console.error('❌ Ошибка подключения к MongoDB:', err);
    throw err;
  }
};

// Database helpers
const dbGet = async (collection, query) => {
  try {
    const result = await db.collection(collection).findOne(query);
    return result;
  } catch (err) {
    console.error('dbGet error:', err);
    throw err;
  }
};

const dbRun = async (collection, data) => {
  try {
    const result = await db.collection(collection).insertOne(data);
    return { lastID: result.insertedId, changes: 1 };
  } catch (err) {
    console.error('dbRun error:', err);
    throw err;
  }
};

const dbAll = async (collection, query = {}) => {
  try {
    const result = await db.collection(collection).find(query).toArray();
    return result;
  } catch (err) {
    console.error('dbAll error:', err);
    throw err;
  }
};

// JWT middleware
function authRequired(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Требуется авторизация' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Неверный токен' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role) {
      return res.status(403).json({ message: 'Доступ запрещен' });
    }
    next();
  };
}

// Routes
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body || {};

    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: 'Необходимо указать имя, email, пароль и роль' });
    }

    const existing = await dbGet('users', { email: email });
    if (existing) {
      return res.status(400).json({ message: 'Пользователь с таким email уже существует' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await dbRun('users', {
      name: name,
      email: email,
      password_hash: passwordHash,
      role: role,
      created_at: new Date()
    });

    const user = { id: result.lastID, name, email, role };
    const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({ token, user });
  } catch (err) {
    console.error('Ошибка регистрации:', err);
    res.status(500).json({ message: 'Ошибка регистрации', error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ message: 'Необходимо указать email и пароль' });
    }

    const userRow = await dbGet('users', { email: email });
    if (!userRow) {
      return res.status(400).json({ message: 'Неверный email или пароль' });
    }

    const passwordOk = await bcrypt.compare(password, userRow.password_hash);
    if (!passwordOk) {
      return res.status(400).json({ message: 'Неверный email или пароль' });
    }

    const user = {
      id: userRow._id,
      name: userRow.name,
      email: userRow.email,
      role: userRow.role
    };

    const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user });
  } catch (err) {
    console.error('Ошибка входа:', err);
    res.status(500).json({ message: 'Ошибка входа' });
  }
});

app.post('/api/rides', authRequired, requireRole('driver'), async (req, res) => {
  try {
    const { from, to, departureTime, fromLat, fromLng, toLat, toLng } = req.body || {};

    if (!from || !to || !departureTime) {
      return res.status(400).json({ message: 'Необходимо указать from, to, departureTime' });
    }

    const result = await dbRun('rides', {
      driver_id: req.user.id,
      from_text: from,
      to_text: to,
      departure_time: departureTime,
      from_lat: fromLat,
      from_lng: fromLng,
      to_lat: toLat,
      to_lng: toLng,
      created_at: new Date()
    });

    console.log('Поездка создана:', result);
    res.status(201).json({ 
      id: result.lastID,
      from,
      to,
      fromText: from,
      toText: to,
      departureTime,
      driverName: req.user.name
    });
  } catch (err) {
    console.error('Ошибка создания поездки:', err);
    res.status(500).json({ message: 'Ошибка создания поездки' });
  }
});

app.get('/api/rides', authRequired, requireRole('driver'), async (req, res) => {
  try {
    const ridesRows = await dbAll('rides', { driver_id: req.user.id });
    
    const ridesWithDriverName = ridesRows.map(ride => ({
      id: ride._id,
      from: ride.from_text,
      to: ride.to_text,
      fromText: ride.from_text,
      toText: ride.to_text,
      departureTime: ride.departure_time,
      driverName: req.user.name
    }));

    res.json(ridesWithDriverName);
  } catch (err) {
    console.error('Ошибка получения поездок:', err);
    res.status(500).json({ message: 'Ошибка получения поездок' });
  }
});

app.get('/api/requests/passenger', authRequired, async (req, res) => {
  try {
    const requests = await dbAll('ride_requests', { passenger_name: req.user.name });
    
    // Добавляем детали поездок к заявкам
    const requestsWithRideDetails = [];
    for (const request of requests) {
      const ride = await dbGet('rides', { _id: new ObjectId(request.ride_id) });
      requestsWithRideDetails.push({
        id: request._id,
        rideId: request.ride_id,
        passengerName: request.passenger_name,
        fromText: request.from_text,
        toText: request.to_text,
        status: request.status,
        createdAt: request.created_at,
        ride: ride ? {
          fromText: ride.from_text,
          toText: ride.to_text,
          departureTime: ride.departure_time,
          driverName: ride.driver_id
        } : null
      });
    }
    
    res.json(requestsWithRideDetails);
  } catch (err) {
    console.error('Ошибка получения заявок:', err);
    res.status(500).json({ message: 'Ошибка получения заявок' });
  }
});

// Создать заявку на поездку
app.post('/api/rides/:rideId/requests', authRequired, async (req, res) => {
  try {
    const { rideId } = req.params;
    const { from, to, passengerName } = req.body || {};

    if (!from || !to || !passengerName) {
      return res.status(400).json({ message: 'Необходимо указать from, to, passengerName' });
    }

    // Проверяем существование поездки
    const ride = await dbGet('rides', { _id: new ObjectId(rideId) });
    if (!ride) {
      return res.status(404).json({ message: 'Поездка не найдена' });
    }

    // Проверяем, нет ли уже заявки
    const existingRequests = await dbAll('ride_requests', { 
      ride_id: new ObjectId(rideId), 
      passenger_name: passengerName
    });
    
    const nonRejectedRequest = existingRequests.find(req => req.status !== 'rejected');

    if (nonRejectedRequest) {
      return res.status(400).json({ message: 'Вы уже отправили заявку на эту поездку' });
    }

    const result = await dbRun('ride_requests', {
      ride_id: new ObjectId(rideId),
      passenger_name: passengerName,
      from_text: from,
      to_text: to,
      status: 'pending',
      created_at: new Date()
    });

    console.log('Заявка создана:', result);
    res.status(201).json({
      id: result.lastID,
      rideId,
      passengerName,
      from,
      to,
      status: 'pending'
    });
  } catch (err) {
    console.error('Ошибка создания заявки:', err);
    res.status(500).json({ message: 'Ошибка создания заявки' });
  }
});

// Принять заявку
app.put('/api/requests/:requestId/accept', authRequired, requireRole('driver'), async (req, res) => {
  try {
    const { requestId } = req.params;

    // Получаем заявку с деталями поездки
    const request = await dbGet('ride_requests', { _id: new ObjectId(requestId) });
    if (!request) {
      return res.status(404).json({ message: 'Заявка не найдена' });
    }

    // Получаем поездку для проверки водителя
    const ride = await dbGet('rides', { _id: new ObjectId(request.ride_id) });
    if (!ride || ride.driver_id.toString() !== req.user.id.toString()) {
      return res.status(403).json({ message: 'Вы не водитель этой поездки' });
    }

    // Обновляем статус заявки
    await dbUpdate('ride_requests', 
      { _id: new ObjectId(requestId) }, 
      { status: 'accepted' }
    );

    console.log('Заявка принята:', requestId);
    res.json({
      id: requestId,
      status: 'accepted',
      passengerName: request.passenger_name
    });
  } catch (err) {
    console.error('Ошибка принятия заявки:', err);
    res.status(500).json({ message: 'Ошибка принятия заявки' });
  }
});

// Отклонить заявку
app.put('/api/requests/:requestId/reject', authRequired, requireRole('driver'), async (req, res) => {
  try {
    const { requestId } = req.params;

    // Получаем заявку с деталями поездки
    const request = await dbGet('ride_requests', { _id: new ObjectId(requestId) });
    if (!request) {
      return res.status(404).json({ message: 'Заявка не найдена' });
    }

    // Получаем поездку для проверки водителя
    const ride = await dbGet('rides', { _id: new ObjectId(request.ride_id) });
    if (!ride || ride.driver_id.toString() !== req.user.id.toString()) {
      return res.status(403).json({ message: 'Вы не водитель этой поездки' });
    }

    // Обновляем статус заявки
    await dbUpdate('ride_requests', 
      { _id: new ObjectId(requestId) }, 
      { status: 'rejected' }
    );

    console.log('Заявка отклонена:', requestId);
    res.json({
      id: requestId,
      status: 'rejected',
      passengerName: request.passenger_name
    });
  } catch (err) {
    console.error('Ошибка отклонения заявки:', err);
    res.status(500).json({ message: 'Ошибка отклонения заявки' });
  }
});

// Получить все поездки (для пассажиров)
app.get('/api/rides/search', authRequired, async (req, res) => {
  try {
    const rides = await dbAll('rides', {});
    
    const ridesWithDriverName = await Promise.all(rides.map(async (ride) => {
      const driver = await dbGet('users', { _id: ride.driver_id });
      return {
        id: ride._id,
        from: ride.from_text,
        to: ride.to_text,
        fromText: ride.from_text,
        toText: ride.to_text,
        departureTime: ride.departure_time,
        driverName: driver ? driver.name : 'Неизвестно',
        fromLat: ride.from_lat,
        fromLng: ride.from_lng,
        toLat: ride.to_lat,
        toLng: ride.to_lng
      };
    }));

    res.json(ridesWithDriverName);
  } catch (err) {
    console.error('Ошибка поиска поездок:', err);
    res.status(500).json({ message: 'Ошибка поиска поездок' });
  }
});

// Получить заявки на поездку (для водителей)
app.get('/api/rides/:rideId/requests', authRequired, requireRole('driver'), async (req, res) => {
  try {
    const { rideId } = req.params;

    // Проверяем, что водитель владеет поездкой
    const ride = await dbGet('rides', { _id: new ObjectId(rideId) });
    if (!ride || ride.driver_id.toString() !== req.user.id.toString()) {
      return res.status(403).json({ message: 'Вы не водитель этой поездки' });
    }

    const requests = await dbAll('ride_requests', { ride_id: new ObjectId(rideId) });
    
    const normalizedRequests = requests.map(request => ({
      id: request._id,
      passengerName: request.passenger_name,
      fromText: request.from_text,
      toText: request.to_text,
      status: request.status,
      createdAt: request.created_at
    }));

    res.json(normalizedRequests);
  } catch (err) {
    console.error('Ошибка получения заявок на поездку:', err);
    res.status(500).json({ message: 'Ошибка получения заявок' });
  }
});

app.get('/api/health', async (req, res) => {
  try {
    const result = await dbAll('users', {}).catch(() => []);
    res.json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: db ? '✅ подключена' : '❌ ошибка',
      users_count: result.length
    });
  } catch (err) {
    res.json({ 
      status: 'ERROR', 
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: '❌ ошибка',
      error: err.message
    });
  }
});

// Start server
initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
  });
}).catch(console.error);
