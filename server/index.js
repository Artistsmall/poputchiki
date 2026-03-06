const express = require('express');
const cors = require('cors');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const API_BASE = '/api';

// Продакшен режим
const isProduction = process.env.NODE_ENV === 'production';

// CORS настройки для Render
const corsOptions = {
  origin: isProduction 
    ? ['https://your-app-name.onrender.com'] // Render заменит на ваш домен
    : ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(express.json());

// Обслуживание статических файлов из папки public
app.use(express.static(path.join(__dirname, '../public')));

// Логирование всех входящих запросов
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path} - ${req.ip}`);
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);
  next();
});

// Логирование POST запросов отдельно
app.post('*', (req, res, next) => {
  console.log(`POST DETECTED: ${req.path}`);
  console.log('POST Headers:', req.headers);
  console.log('POST Body:', req.body);
  next();
});

// Обработка CORS preflight запросов
app.options('*', (req, res) => {
  console.log('OPTIONS request:', req.path);
  res.header('Access-Control-Allow-Origin', 'http://localhost:3000');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.sendStatus(200);
});

// Статические файлы (frontend)
app.use(express.static(path.join(__dirname, '../public')));

// Инициализация SQLite БД
const dbPath = path.join(__dirname, 'poputchiki.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run('PRAGMA foreign_keys = ON');

  db.run(
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('driver','passenger')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS rides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      driver_id INTEGER NOT NULL,
      from_text TEXT NOT NULL,
      to_text TEXT NOT NULL,
      departure_time TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (driver_id) REFERENCES users(id) ON DELETE CASCADE
    )`
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS ride_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ride_id INTEGER NOT NULL,
      passenger_name TEXT NOT NULL,
      from_text TEXT NOT NULL,
      to_text TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (ride_id) REFERENCES rides(id) ON DELETE CASCADE
    )`
  );
});

// Утилиты работы с БД (Promise-обертки)
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

// JWT-аутентификация
function authRequired(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  console.log('Auth check:', { path: req.path, method: req.method, hasToken: !!token });

  if (!token) {
    return res.status(401).json({ message: 'Требуется авторизация' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    console.log('Auth success:', { userId: payload.id, userRole: payload.role });
    next();
  } catch (err) {
    console.error('Auth error:', err.message);
    return res.status(401).json({ message: 'Неверный или просроченный токен' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ message: 'Недостаточно прав' });
    }
    next();
  };
}

// Вспомогательная функция: ссылка на маршрут в Яндекс.Картах
function buildMapsUrl(ride, requests = []) {
  const base = 'https://yandex.ru/maps/?';
  const points = [];
  points.push(encodeURIComponent(ride.from));
  const accepted = requests.filter((r) => r.status === 'accepted');
  accepted.forEach((r) => points.push(encodeURIComponent(r.from)));
  points.push(encodeURIComponent(ride.to));
  const rtext = points.join('~');
  return `${base}rtext=${rtext}&rtt=auto`;
}

// Геометрия маршрутов в памяти (для оценки увеличения времени)
const rideGeometry = {};
const AVG_SPEED_KMH = 40;
const MAX_EXTRA_MINUTES = 60; // Увеличим до 60 минут для Татарстана
const MAX_EXTRA_DISTANCE_KM = (AVG_SPEED_KMH * MAX_EXTRA_MINUTES) / 60; // ~40 км

// Функция проверки пересечения маршрутов
function doRoutesIntersect(driverFrom, driverTo, passengerFrom, passengerTo) {
  // Создаем 4 возможных маршрута для пассажира:
  const passengerRoutes = [
    // 1. Водитель забирает пассажира -> везет до цели
    { from: driverFrom, to: passengerFrom, then: passengerTo },
    // 2. Водитель везет пассажира от его точки до цели
    { from: passengerFrom, to: passengerTo, then: driverTo },
    // 3. Классический: водитель -> пассажир -> цель -> водитель
    { from: driverFrom, to: passengerFrom, then: passengerTo, finally: driverTo },
    // 4. Пассажир на пути водителя
    { from: driverFrom, to: passengerTo, then: driverTo }
  ];

  for (const route of passengerRoutes) {
    if (isRouteLogical(route, driverFrom, driverTo, passengerFrom, passengerTo)) {
      return true;
    }
  }
  
  return false;
}

// Проверка, является ли маршрут логичным
function isRouteLogical(route, driverFrom, driverTo, passengerFrom, passengerTo) {
  console.log('Проверка маршрута:', {
    driverFrom: `${driverFrom.lat}, ${driverFrom.lng}`,
    driverTo: `${driverTo.lat}, ${driverTo.lng}`,
    passengerFrom: `${passengerFrom.lat}, ${passengerFrom.lng}`,
    passengerTo: `${passengerTo.lat}, ${passengerTo.lng}`
  });
  
  // Проверяем основные пересечения
  if (route.from === driverFrom && route.to === driverTo) {
    console.log('Полное совпадение маршрутов');
    return true;
  }
  if (route.from === driverFrom && route.to === passengerFrom) {
    console.log('Водитель едет к пассажиру');
    return true;
  }
  if (route.from === passengerFrom && route.to === driverTo) {
    console.log('Пассажир на пути к цели водителя');
    return true;
  }
  
  // Проверяем, находится ли пассажир на пути водителя
  const driverDistance = distanceKm(driverFrom.lat, driverFrom.lng, driverTo.lat, driverTo.lng);
  const driverToPassenger = distanceKm(driverFrom.lat, driverFrom.lng, passengerFrom.lat, passengerFrom.lng);
  const passengerToDriver = distanceKm(passengerFrom.lat, passengerFrom.lng, driverTo.lat, driverTo.lng);
  
  console.log(`Расстояния: водитель=${driverDistance.toFixed(1)}км, до пассажира=${driverToPassenger.toFixed(1)}км, от пассажира=${passengerToDriver.toFixed(1)}км`);
  
  // Если пассажир находится недалеко от маршрута водителя (в пределах 50% увеличения)
  if (driverToPassenger + passengerToDriver <= driverDistance * 1.5) {
    console.log('Пассажир на пути водителя (в пределах 50% увеличения)');
    return true;
  }
  
  // Дополнительная проверка: если пассажир находится в разумном расстоянии от водителя
  if (driverToPassenger <= 30 && passengerToDriver <= 30) { // Увеличим до 30км для Татарстана
    console.log('Пассажир в разумном расстоянии (до 30км от каждой точки)');
    return true;
  }
  
  console.log('Маршрут не подходит');
  return false;
}

// Загрузка геометрии существующих поездок при старте
async function loadExistingRidesGeometry() {
  try {
    const rides = await dbAll('SELECT id, from_text, to_text FROM rides');
    
    // Временные координаты для тестирования
    const tempCoords = {
      'Зеленодольск, лесная улица, 18': { lat: 55.5311, lng: 48.6488 },
      'Казань, Товарищеская улица, 30': { lat: 55.7854, lng: 49.1558 },
      'Зеленодольск': { lat: 55.5311, lng: 48.6488 },
      // Добавим координаты для тестовых адресов пассажира
      'Зеленодольск Юности 3': { lat: 55.847311, lng: 48.516931 }, // Реальные координаты из геокодинга
      'Товарищеская 30': { lat: 55.7854, lng: 49.1558 }, // Примерно центр Казани
      'Казань': { lat: 55.796127, lng: 49.106414 } // Реальные координаты из геокодинга
    };
    
    for (const ride of rides) {
      try {
        // Используем временные координаты для тестирования
        const fromCoords = tempCoords[ride.from_text];
        const toCoords = tempCoords[ride.to_text];
        
        if (fromCoords && toCoords) {
          const baseDistanceKm = distanceKm(fromCoords.lat, fromCoords.lng, toCoords.lat, toCoords.lng);
          rideGeometry[ride.id] = {
            fromLat: fromCoords.lat,
            fromLng: fromCoords.lng,
            toLat: toCoords.lat,
            toLng: toCoords.lng,
            baseDistanceKm
          };
          console.log(`Загружена геометрия для поездки ${ride.id}: ${baseDistanceKm.toFixed(1)}км`);
        } else {
          console.warn(`Нет координат для поездки ${ride.id}: ${ride.from_text} → ${ride.to_text}`);
        }
      } catch (err) {
        console.warn(`Не удалось загрузить геометрию для поездки ${ride.id}:`, err.message);
      }
    }
    console.log(`Загружено геометрий: ${Object.keys(rideGeometry).length}`);
  } catch (err) {
    console.error('Ошибка загрузки геометрии поездок:', err);
  }
}

// Простая функция геокодинга (заглушка для реального API)
async function geocodeAddress(address) {
  // В реальном приложении здесь был бы вызов API геокодинга
  // Пока возвращаем null, чтобы не блокировать функциональность
  return null;
}

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// --------------------
//   АВТОРИЗАЦИЯ
// --------------------

// Регистрация
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body || {};

    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: 'Необходимо указать имя, email, пароль и роль' });
    }

    if (!['driver', 'passenger'].includes(role)) {
      return res.status(400).json({ message: 'Роль должна быть driver или passenger' });
    }

    const existing = await dbGet('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) {
      return res.status(400).json({ message: 'Пользователь с таким email уже существует' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await dbRun(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [name, email, passwordHash, role]
    );

    const user = { id: result.id, name, email, role };
    const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка регистрации' });
  }
});

// Вход
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ message: 'Необходимо указать email и пароль' });
    }

    const userRow = await dbGet('SELECT * FROM users WHERE email = ?', [email]);
    if (!userRow) {
      return res.status(400).json({ message: 'Неверный email или пароль' });
    }

    const passwordOk = await bcrypt.compare(password, userRow.password_hash);
    if (!passwordOk) {
      return res.status(400).json({ message: 'Неверный email или пароль' });
    }

    const user = {
      id: userRow.id,
      name: userRow.name,
      email: userRow.email,
      role: userRow.role
    };

    const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка входа' });
  }
});

// --------------------
//   ПОЕЗДКИ И ЗАЯВКИ
// --------------------

// Создать поездку (только водитель)
app.post('/api/rides', authRequired, requireRole('driver'), async (req, res) => {
  try {
    const { from, to, departureTime, fromLat, fromLng, toLat, toLng } = req.body || {};

    if (!from || !to || !departureTime) {
      return res.status(400).json({ message: 'Необходимо указать from, to, departureTime' });
    }

    const result = await dbRun(
      'INSERT INTO rides (driver_id, from_text, to_text, departure_time) VALUES (?, ?, ?, ?)',
      [req.user.id, from, to, departureTime]
    );

    const rideId = result.id;

    if (
      Number.isFinite(fromLat) &&
      Number.isFinite(fromLng) &&
      Number.isFinite(toLat) &&
      Number.isFinite(toLng)
    ) {
      const baseDistanceKm = distanceKm(fromLat, fromLng, toLat, toLng);
      rideGeometry[rideId] = {
        fromLat,
        fromLng,
        toLat,
        toLng,
        baseDistanceKm
      };
    }

    const ride = {
      id: rideId,
      driverName: req.user.name,
      from,
      to,
      departureTime,
      waypoints: [],
      requests: [],
      mapsUrl: buildMapsUrl({ from, to }, [])
    };

    res.status(201).json(ride);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка создания поездки' });
  }
});

// Удалить поездку (только её водитель)
app.delete('/api/rides/:rideId', authRequired, requireRole('driver'), async (req, res) => {
  try {
    const rideId = Number(req.params.rideId);
    if (!Number.isFinite(rideId)) {
      return res.status(400).json({ message: 'Некорректный идентификатор поездки' });
    }

    const rideRow = await dbGet(
      'SELECT id, driver_id AS driverId FROM rides WHERE id = ?',
      [rideId]
    );

    if (!rideRow) {
      return res.status(404).json({ message: 'Поездка не найдена' });
    }

    if (rideRow.driverId !== req.user.id) {
      return res.status(403).json({ message: 'Вы не являетесь водителем этой поездки' });
    }

    await dbRun('DELETE FROM rides WHERE id = ?', [rideId]);
    delete rideGeometry[rideId];
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка удаления поездки' });
  }
});

// Получить поездки текущего водителя
app.get('/api/rides', authRequired, requireRole('driver'), async (req, res) => {
  try {
    const ridesRows = await dbAll(
      `SELECT r.id,
              r.from_text AS fromText,
              r.to_text AS toText,
              r.departure_time AS departureTime,
              u.name AS driverName
       FROM rides r
       JOIN users u ON u.id = r.driver_id
       WHERE r.driver_id = ?
       ORDER BY r.departure_time`,
      [req.user.id]
    );

    const ridesWithDetails = [];
    for (const row of ridesRows) {
      const ride = {
        id: row.id,
        from: row.fromText,
        to: row.toText,
        departureTime: row.departureTime,
        driverName: row.driverName
      };

      const requests = await dbAll(
        `SELECT id,
                passenger_name AS passengerName,
                from_text AS fromText,
                to_text AS toText,
                status
         FROM ride_requests
         WHERE ride_id = ?
         ORDER BY created_at`,
        [ride.id]
      );

      const normalizedRequests = requests.map((r) => ({
        id: r.id,
        passengerName: r.passengerName,
        from: r.fromText,
        to: r.toText,
        status: r.status
      }));

      const waypoints = normalizedRequests
        .filter((r) => r.status === 'accepted')
        .map((r) => ({
          from: r.from,
          to: r.to,
          passengerName: r.passengerName
        }));

      const mapsUrl = buildMapsUrl(ride, normalizedRequests);

      ridesWithDetails.push({
        ...ride,
        requests: normalizedRequests,
        waypoints,
        mapsUrl
      });
    }

    res.json(ridesWithDetails);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка получения поездок' });
  }
});

// Поиск поездок по направлению (пассажир, может без авторизации)
app.get('/api/rides/search', async (req, res) => {
  try {
    const { from, to, fromLat, fromLng, toLat, toLng } = req.query;
    const passengerName = req.user?.name; // Получаем имя пассажира если авторизован

    const fromQ = (from || '').toString().trim();
    const toQ = (to || '').toString().trim();

    console.log('Оригинальный текстовый поиск:', { fromQ, toQ, passengerName });

    // Извлекаем только города из длинных адресов
    const extractCity = (address) => {
      const cities = ['Зеленодольск', 'Казань', 'Москва', 'Набережные Челны', 'Нижнекамск', 'Альметьевск', 'Чистополь'];
      for (const city of cities) {
        if (address.toLowerCase().includes(city.toLowerCase())) {
          return city;
        }
      }
      return address; // Если не найден город, возвращаем как есть
    };

    const fromCity = extractCity(fromQ);
    const toCity = extractCity(toQ);

    console.log('Поиск по городам:', { fromCity, toCity });

    let where = [];
    let params = [];

    // Текстовый поиск по городам
    if (fromCity) {
      where.push('r.from_text COLLATE NOCASE LIKE ?');
      params.push(`%${fromCity}%`);
    }
    if (toCity) {
      where.push('r.to_text COLLATE NOCASE LIKE ?');
      params.push(`%${toCity}%`);
    }

    // Если нет текстовых параметров, показываем все будущие поездки
    if (where.length === 0) {
      where.push('r.departure_time > datetime("now")');
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    console.log('SQL запрос:', whereSql);
    console.log('SQL параметры:', params);

    const rows = await dbAll(
      `SELECT r.id,
              r.from_text AS fromText,
              r.to_text AS toText,
              r.departure_time AS departureTime,
              u.name AS driverName
       FROM rides r
       JOIN users u ON u.id = r.driver_id
       ${whereSql}
       ORDER BY r.departure_time`,
      params
    );

    console.log(`Найдено поездок по текстовому поиску: ${rows.length}`);

    // Дополнительная фильтрация по координатам (если они есть)
    const passFromLat = parseFloat(fromLat);
    const passFromLng = parseFloat(fromLng);
    const passToLat = parseFloat(toLat);
    const passToLng = parseFloat(toLng);

    console.log('Координаты пассажира:', { passFromLat, passFromLng, passToLat, passToLng });

    const hasPassengerCoords =
      Number.isFinite(passFromLat) &&
      Number.isFinite(passFromLng) &&
      Number.isFinite(passToLat) &&
      Number.isFinite(passToLng);

    console.log('hasPassengerCoords:', hasPassengerCoords);

    // Получаем заявки пассажира, чтобы исключить поездки с уже отправленными заявками
    let excludedRideIds = [];
    if (passengerName) {
      const existingRequests = await dbAll(
        'SELECT ride_id FROM ride_requests WHERE passenger_name = ? AND status != "rejected"',
        [passengerName]
      );
      excludedRideIds = existingRequests.map(req => req.ride_id);
      console.log('Исключенные поездки (уже есть заявки):', excludedRideIds);
    }

    const filteredRows = [];
    for (const row of rows) {
      // Исключаем поездки с уже отправленными заявками
      if (excludedRideIds.includes(row.id)) {
        console.log(`Исключаем поездку ${row.id} - уже есть заявка`);
        continue;
      }
      
      if (!hasPassengerCoords) {
        filteredRows.push(row);
        continue;
      }
      
      // Если у поездки нет координат, показываем её (текстовый поиск уже сработал)
      const geom = rideGeometry[row.id];
      if (!geom || !Number.isFinite(geom.baseDistanceKm)) {
        filteredRows.push(row);
        continue;
      }

      // Новая логика: проверяем пересечение маршрутов
      const driverFrom = { lat: geom.fromLat, lng: geom.fromLng };
      const driverTo = { lat: geom.toLat, lng: geom.toLng };
      const passengerFrom = { lat: passFromLat, lng: passFromLng };
      const passengerTo = { lat: passToLat, lng: passToLng };

      const routesIntersect = doRoutesIntersect(driverFrom, driverTo, passengerFrom, passengerTo);
      
      console.log(`Поездка ${row.id}: пересечение маршрутов = ${routesIntersect}`);
      
      // Дополнительно проверяем время как запасной вариант
      let timeOk = false;
      if (routesIntersect) {
        const base = geom.baseDistanceKm;
        const newDistance =
          distanceKm(geom.fromLat, geom.fromLng, passFromLat, passFromLng) +
          distanceKm(passFromLat, passFromLng, passToLat, passToLng) +
          distanceKm(passToLat, passToLng, geom.toLat, geom.lng);
        const extra = newDistance - base;
        const extraMinutes = (extra / AVG_SPEED_KMH) * 60;
        timeOk = extraMinutes <= MAX_EXTRA_MINUTES;
        console.log(`Поездка ${row.id}: время доп = ${extraMinutes.toFixed(1)}мин, ок = ${timeOk}`);
      }
      
      if (routesIntersect || timeOk) {
        filteredRows.push(row);
      }
    }

    console.log('Отфильтровано поездок:', filteredRows.length);

    const ridesWithMaps = filteredRows.map((ride) => {
      const mapsUrl = `https://yandex.ru/maps/?rtext=${encodeURIComponent(
        `${ride.from_text}~${ride.to_text}`
      )}`;
      return {
        ...ride,
        mapsUrl,
      };
    });

    res.json(ridesWithMaps);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка поиска поездок' });
  }
});

// Создать заявку пассажира на конкретную поездку (любой авторизованный пользователь)
app.post('/api/rides/:rideId/requests', authRequired, async (req, res) => {
  try {
    const rideId = Number(req.params.rideId);
    const { passengerName, from, to } = req.body || {};

    console.log('Создание заявки:', { rideId, passengerName, from, to, user: req.user });

    if (!Number.isFinite(rideId)) {
      return res.status(400).json({ message: 'Некорректный идентификатор поездки' });
    }

    const rideRow = await dbGet(
      `SELECT r.id,
              r.from_text AS fromText,
              r.to_text AS toText,
              r.departure_time AS departureTime
       FROM rides r
       WHERE r.id = ?`,
      [rideId]
    );

    if (!rideRow) {
      return res.status(404).json({ message: 'Поездка не найдена' });
    }

    if (!passengerName || !from || !to) {
      return res.status(400).json({ message: 'Необходимо указать passengerName, from, to' });
    }

    // Проверяем, нет ли уже заявки от этого пассажира
    const existingRequest = await dbGet(
      'SELECT id FROM ride_requests WHERE ride_id = ? AND passenger_name = ? AND status != "rejected"',
      [rideId, passengerName]
    );
    
    if (existingRequest) {
      return res.status(400).json({ message: 'Вы уже отправили заявку на эту поездку' });
    }

    const result = await dbRun(
      `INSERT INTO ride_requests (ride_id, passenger_name, from_text, to_text, status)
       VALUES (?, ?, ?, ?, 'pending')`,
      [rideId, passengerName, from, to]
    );

    console.log('Заявка успешно создана:', result);

    res.json({
      message: 'Заявка отправлена',
      requestId: result.lastID,
      ride: rideRow
    });

  } catch (err) {
    console.error('Ошибка создания заявки:', err);
    res.status(500).json({ message: 'Ошибка создания заявки' });
  }
});

// Health check для Render
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Тестовый эндпоинт для проверки POST запросов
app.post('/api/test', (req, res) => {
  console.log('TEST ENDPOINT REACHED!');
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);
  res.json({ message: 'POST запрос работает!', timestamp: new Date().toISOString() });
});

// Получить заявки пользователя (простой вариант)
app.get('/api/requests/passenger', authRequired, async (req, res) => {
  try {
    const passengerName = req.user.name;
    console.log('Простой запрос заявок для:', passengerName);
    
    // Сначала получаем заявки
    const requests = await dbAll(
      `SELECT id, ride_id, passenger_name, from_text, to_text, status, created_at
       FROM ride_requests 
       WHERE passenger_name = ?
       ORDER BY created_at DESC`,
      [passengerName]
    );

    console.log('Найдено заявок:', requests.length);

    // Добавляем информацию о поездках и водителях
    const requestsWithInfo = [];
    for (const request of requests) {
      try {
        const ride = await dbGet(
          `SELECT r.from_text, r.to_text, r.departure_time, u.name as driverName
           FROM rides r 
           JOIN users u ON u.id = r.driver_id 
           WHERE r.id = ?`,
          [request.ride_id]
        );
        
        if (ride) {
          requestsWithInfo.push({
            id: request.id,
            ride_id: request.ride_id,
            passenger_name: request.passenger_name,
            from: request.from_text,
            to: request.to_text,
            status: request.status,
            created_at: request.created_at,
            rideFrom: ride.from_text,
            rideTo: ride.to_text,
            departureTime: ride.departure_time,
            driverName: ride.driverName
          });
        }
      } catch (err) {
        console.warn('Ошибка получения информации о поездке:', request.ride_id, err.message);
      }
    }

    console.log('Отдано заявок с информацией:', requestsWithInfo.length);
    res.json(requestsWithInfo);
  } catch (err) {
    console.error('Ошибка получения заявок пользователя:', err);
    res.status(500).json({ message: 'Ошибка получения заявок' });
  }
});

// Простая система принятия заявок
app.post('/api/requests/:requestId/accept', authRequired, requireRole('driver'), async (req, res) => {
  try {
    const requestId = Number(req.params.requestId);
    console.log('Простой прием заявки:', { requestId, userId: req.user.id });
    
    if (!Number.isFinite(requestId)) {
      return res.status(400).json({ message: 'Некорректный ID заявки' });
    }

    // Простая проверка - существует ли заявка
    const request = await dbGet(
      `SELECT rq.id, rq.ride_id, rq.status, r.driver_id 
       FROM ride_requests rq 
       JOIN rides r ON r.id = rq.ride_id 
       WHERE rq.id = ?`,
      [requestId]
    );

    if (!request) {
      return res.status(404).json({ message: 'Заявка не найдена' });
    }

    if (request.driver_id !== req.user.id) {
      return res.status(403).json({ message: 'Вы не водитель этой поездки' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ message: 'Заявка уже обработана' });
    }

    // Просто обновляем статус
    await dbRun('UPDATE ride_requests SET status = ? WHERE id = ?', ['accepted', requestId]);

    console.log('Заявка принята:', requestId);
    res.json({ 
      message: 'Заявка принята',
      requestId: requestId,
      status: 'accepted'
    });

  } catch (err) {
    console.error('Ошибка принятия заявки:', err);
    res.status(500).json({ message: 'Ошибка принятия заявки' });
  }
});

// Отклонение заявки
app.post('/api/requests/:requestId/reject', authRequired, requireRole('driver'), async (req, res) => {
  try {
    const requestId = Number(req.params.requestId);
    if (!Number.isFinite(requestId)) {
      return res.status(400).json({ message: 'Некорректный идентификатор заявки' });
    }

    const requestRow = await dbGet(
      `SELECT rq.id, rq.status, r.driver_id AS driverId
       FROM ride_requests rq
       JOIN rides r ON r.id = rq.ride_id
       WHERE rq.id = ?`,
      [requestId]
    );

    if (!requestRow) {
      return res.status(404).json({ message: 'Заявка не найдена' });
    }

    if (requestRow.driverId !== req.user.id) {
      return res.status(403).json({ message: 'Вы не являетесь водителем этой поездки' });
    }

    if (requestRow.status !== 'pending') {
      return res.status(400).json({ message: 'Заявка уже обработана' });
    }

    await dbRun('UPDATE ride_requests SET status = ? WHERE id = ?', ['rejected', requestId]);

    res.json({ request: { id: requestRow.id, status: 'rejected' } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка отклонения заявки' });
  }
});

// Отдать index.html по умолчанию
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Глобальный обработчик ошибок
app.use((err, req, res, next) => {
  console.error('Глобальная ошибка:', err);
  res.status(500).json({ message: 'Внутренняя ошибка сервера' });
});

// Обработка необработанных ошибок
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
});

app.listen(PORT, async () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
  // Загружаем геометрию существующих поездок
  await loadExistingRidesGeometry();
});
