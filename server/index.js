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
// Поддерживаем оба варианта имени переменной окружения:
// MONGODB_URL (старое) и MONGODB_URI (новое, как в Atlas)
const mongoUrl =
  process.env.MONGODB_URL ||
  process.env.MONGODB_URI ||
  'mongodb://localhost:27017/poputchiki';
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

const dbUpdate = async (collection, filter, update) => {
  try {
    const result = await db
      .collection(collection)
      .updateOne(filter, { $set: update });
    return {
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount
    };
  } catch (err) {
    console.error('dbUpdate error:', err);
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
    const { name, email, password } = req.body || {};

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Необходимо указать имя, email и пароль' });
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
      role: 'user', // По умолчанию пользователь без роли
      created_at: new Date()
    });

    const user = { id: result.lastID, name, email, role: 'user' };
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

// Изменение роли пользователя
app.put('/api/user/role', authRequired, async (req, res) => {
  try {
    const { role } = req.body || {};
    
    if (!role || !['driver', 'passenger'].includes(role)) {
      return res.status(400).json({ message: 'Роль должна быть driver или passenger' });
    }

    await dbUpdate('users', 
      { _id: new ObjectId(req.user.id) }, 
      { role: role }
    );

    console.log(`Пользователь ${req.user.name} изменил роль на ${role}`);
    res.json({ message: `Роль изменена на ${role}`, role });
  } catch (err) {
    console.error('Ошибка изменения роли:', err);
    res.status(500).json({ message: 'Ошибка изменения роли' });
  }
});

// Добавление рейтинга
app.post('/api/rides/:rideId/rating', authRequired, async (req, res) => {
  try {
    const { rideId } = req.params;
    const { rating, comment } = req.body || {};

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Рейтинг должен быть от 1 до 5' });
    }

    // Проверяем, что пользователь участвовал в поездке
    const request = await dbGet('ride_requests', { 
      ride_id: new ObjectId(rideId), 
      passenger_name: req.user.name,
      status: 'accepted'
    });

    if (!request) {
      return res.status(403).json({ message: 'Вы не участвовали в этой поездке' });
    }

    // Проверяем, что рейтинг еще не оставлен
    const existingRating = await dbGet('ratings', { 
      ride_id: new ObjectId(rideId), 
      passenger_name: req.user.name 
    });

    if (existingRating) {
      return res.status(400).json({ message: 'Вы уже оставили рейтинг для этой поездки' });
    }

    // Получаем информацию о поездке
    const ride = await dbGet('rides', { _id: new ObjectId(rideId) });
    if (!ride) {
      return res.status(404).json({ message: 'Поездка не найдена' });
    }

    // Сохраняем рейтинг
    const result = await dbRun('ratings', {
      ride_id: new ObjectId(rideId),
      driver_id: ride.driver_id,
      passenger_name: req.user.name,
      rating: rating,
      comment: comment || '',
      created_at: new Date()
    });

    console.log(`Рейтинг ${rating} оставлен для водителя поездки ${rideId}`);
    res.status(201).json({ 
      message: 'Рейтинг сохранен', 
      rating,
      driver_name: ride.driver_id 
    });
  } catch (err) {
    console.error('Ошибка сохранения рейтинга:', err);
    res.status(500).json({ message: 'Ошибка сохранения рейтинга' });
  }
});

// Получение рейтингов водителя с деталями
app.get('/api/user/:userId/ratings', authRequired, async (req, res) => {
  try {
    const { userId } = req.params;
    
    const ratings = await dbAll('ratings', { driver_id: new ObjectId(userId) });
    
    // Вычисляем средний рейтинг
    const averageRating = ratings.length > 0 
      ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length 
      : 0;

    // Получаем информацию о водителе
    const driver = await dbGet('users', { _id: new ObjectId(userId) });

    res.json({
      driver: driver ? {
        name: driver.name,
        email: driver.email,
        member_since: driver.created_at
      } : null,
      ratings: ratings.map(r => ({
        rating: r.rating,
        comment: r.comment,
        passenger_name: r.passenger_name,
        created_at: r.created_at
      })),
      average_rating: Math.round(averageRating * 10) / 10,
      total_ratings: ratings.length,
      trust_score: calculateTrustScore(ratings.length, averageRating)
    });
  } catch (err) {
    console.error('Ошибка получения рейтингов:', err);
    res.status(500).json({ message: 'Ошибка получения рейтингов' });
  }
});

// Расчет показателя доверия
function calculateTrustScore(totalRatings, averageRating) {
  if (totalRatings === 0) return 0;
  
  // Базовый рейтинг
  let score = averageRating * 20;
  
  // Бонус за количество оценок
  if (totalRatings >= 10) score += 10;
  if (totalRatings >= 25) score += 15;
  if (totalRatings >= 50) score += 25;
  
  return Math.min(100, Math.round(score));
}

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

// Получить все поездки (для пассажиров) с улучшенным поиском
app.get('/api/rides/search', authRequired, async (req, res) => {
  try {
    const { from, to, date, minRating } = req.query;
    
    // Базовый фильтр
    let filter = {};
    
    // Фильтр по дате
    if (date) {
      const searchDate = new Date(date);
      const nextDay = new Date(searchDate);
      nextDay.setDate(nextDay.getDate() + 1);
      
      filter.departure_time = {
        $gte: searchDate,
        $lt: nextDay
      };
    }
    
    const rides = await dbAll('rides', filter);
    
    // Обогащаем поездки данными водителя и рейтингами
    const enrichedRides = await Promise.all(rides.map(async (ride) => {
      const driver = await dbGet('users', { _id: ride.driver_id });
      const ratings = await dbAll('ratings', { driver_id: ride.driver_id });
      
      const averageRating = ratings.length > 0 
        ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length 
        : 0;
      
      const trustScore = calculateTrustScore(ratings.length, averageRating);
      
      // Фильтрация по рейтингу
      if (minRating && averageRating < parseFloat(minRating)) {
        return null;
      }
      
      // Фильтрация по маршруту (простая проверка)
      let matchesRoute = true;
      if (from && !ride.from_text.toLowerCase().includes(from.toLowerCase())) {
        matchesRoute = false;
      }
      if (to && !ride.to_text.toLowerCase().includes(to.toLowerCase())) {
        matchesRoute = false;
      }
      
      if (!matchesRoute) {
        return null;
      }
      
      return {
        id: ride._id,
        from: ride.from_text,
        to: ride.to_text,
        fromText: ride.from_text,
        toText: ride.to_text,
        departureTime: ride.departure_time,
        driverName: driver ? driver.name : 'Неизвестно',
        driverEmail: driver ? driver.email : null,
        fromLat: ride.from_lat,
        fromLng: ride.from_lng,
        toLat: ride.to_lat,
        toLng: ride.to_lng,
        average_rating: Math.round(averageRating * 10) / 10,
        total_ratings: ratings.length,
        trust_score: trustScore,
        created_at: ride.created_at
      };
    }));
    
    // Удаляем null значения (отфильтрованные поездки)
    const filteredRides = enrichedRides.filter(ride => ride !== null);
    
    // Сортировка по рейтингу доверия
    filteredRides.sort((a, b) => b.trust_score - a.trust_score);
    
    res.json({
      rides: filteredRides,
      total: filteredRides.length,
      filters: {
        from,
        to,
        date,
        minRating
      }
    });
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

// Получение статистики платформы
app.get('/api/stats', authRequired, async (req, res) => {
  try {
    // Только для администраторов (пока для всех)
    const totalUsers = await dbAll('users', {});
    const totalRides = await dbAll('rides', {});
    const totalRequests = await dbAll('ride_requests', {});
    const totalRatings = await dbAll('ratings', {});
    
    // Статистика за последние 7 дней
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    
    const recentRides = await dbAll('rides', {
      created_at: { $gte: weekAgo }
    });
    
    const recentUsers = await dbAll('users', {
      created_at: { $gte: weekAgo }
    });
    
    // Активные пользователи (создали поездку или заявку)
    const activeDrivers = new Set();
    const activePassengers = new Set();
    
    recentRides.forEach(ride => {
      activeDrivers.add(ride.driver_id.toString());
    });
    
    const recentRequests = await dbAll('ride_requests', {
      created_at: { $gte: weekAgo }
    });
    
    recentRequests.forEach(request => {
      activePassengers.add(request.passenger_name);
    });
    
    res.json({
      overview: {
        total_users: totalUsers.length,
        total_rides: totalRides.length,
        total_requests: totalRequests.length,
        total_ratings: totalRatings.length
      },
      weekly_stats: {
        new_rides: recentRides.length,
        new_users: recentUsers.length,
        active_drivers: activeDrivers.size,
        active_passengers: activePassengers.size
      },
      platform_health: {
        average_rides_per_user: totalUsers.length > 0 ? (totalRides.length / totalUsers.length).toFixed(2) : 0,
        request_acceptance_rate: totalRequests.length > 0 ? 
          ((totalRequests.filter(r => r.status === 'accepted').length / totalRequests.length) * 100).toFixed(1) : 0,
        average_rating: totalRatings.length > 0 ? 
          (totalRatings.reduce((sum, r) => sum + r.rating, 0) / totalRatings.length).toFixed(1) : 0
      }
    });
  } catch (err) {
    console.error('Ошибка получения статистики:', err);
    res.status(500).json({ message: 'Ошибка получения статистики' });
  }
});

// Создание уведомления
app.post('/api/notifications', authRequired, async (req, res) => {
  try {
    const { type, message, recipient_id } = req.body || {};
    
    if (!type || !message) {
      return res.status(400).json({ message: 'Необходимо указать type и message' });
    }
    
    const notification = await dbRun('notifications', {
      type,
      message,
      sender_id: req.user.id,
      recipient_id: recipient_id || null,
      created_at: new Date(),
      read: false
    });
    
    console.log(`Уведомление создано: ${type} от ${req.user.name}`);
    res.status(201).json({ 
      message: 'Уведомление создано',
      notification_id: notification.lastID
    });
  } catch (err) {
    console.error('Ошибка создания уведомления:', err);
    res.status(500).json({ message: 'Ошибка создания уведомления' });
  }
});

// Получение уведомлений пользователя
app.get('/api/notifications', authRequired, async (req, res) => {
  try {
    const notifications = await dbAll('notifications', {
      $or: [
        { recipient_id: req.user.id },
        { recipient_id: null } // Общие уведомления
      ]
    });
    
    res.json({
      notifications: notifications.map(n => ({
        id: n._id,
        type: n.type,
        message: n.message,
        sender_name: n.sender_name,
        created_at: n.created_at,
        read: n.read
      })),
      unread_count: notifications.filter(n => !n.read).length
    });
  } catch (err) {
    console.error('Ошибка получения уведомлений:', err);
    res.status(500).json({ message: 'Ошибка получения уведомлений' });
  }
});

// Очистка базы данных (только для разработки)
app.delete('/api/admin/clear-database', async (req, res) => {
  try {
    console.log('🗑️ Очистка базы данных...');
    
    await db.collection('users').deleteMany({});
    await db.collection('rides').deleteMany({});
    await db.collection('ride_requests').deleteMany({});
    
    console.log('✅ База данных очищена');
    
    res.json({ message: 'База данных очищена' });
  } catch (err) {
    console.error('❌ Ошибка очистки:', err);
    res.status(500).json({ message: 'Ошибка очистки базы данных' });
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
