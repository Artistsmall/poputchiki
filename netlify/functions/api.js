const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// MongoDB connection
const mongoUrl = process.env.MONGODB_URL || 'mongodb+srv://user:password@cluster.mongodb.net/poputchiki';
let db;
let client;

const initDatabase = async () => {
  if (db) return db;
  
  try {
    client = new MongoClient(mongoUrl);
    await client.connect();
    db = client.db();
    console.log('✅ MongoDB подключена (Netlify)');
    return db;
  } catch (err) {
    console.error('❌ Ошибка подключения к MongoDB:', err);
    throw err;
  }
};

// Database helpers
const dbGet = async (collection, query) => {
  const database = await initDatabase();
  try {
    const result = await database.collection(collection).findOne(query);
    return result;
  } catch (err) {
    console.error('dbGet error:', err);
    throw err;
  }
};

const dbRun = async (collection, data) => {
  const database = await initDatabase();
  try {
    const result = await database.collection(collection).insertOne(data);
    return { lastID: result.insertedId, changes: 1 };
  } catch (err) {
    console.error('dbRun error:', err);
    throw err;
  }
};

const dbAll = async (collection, query = {}) => {
  const database = await initDatabase();
  try {
    const result = await database.collection(collection).find(query).toArray();
    return result;
  } catch (err) {
    console.error('dbAll error:', err);
    throw err;
  }
};

const dbUpdate = async (collection, filter, update) => {
  const database = await initDatabase();
  try {
    const result = await database.collection(collection).updateOne(filter, { $set: update });
    return result;
  } catch (err) {
    console.error('dbUpdate error:', err);
    throw err;
  }
};

// JWT middleware
function authRequired(handler) {
  return async (event, context) => {
    const header = event.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Требуется авторизация' })
      };
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret_change_me');
      event.user = decoded;
      return await handler(event, context);
    } catch (err) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Неверный токен' })
      };
    }
  };
}

// Main handler
exports.handler = async (event, context) => {
  const { httpMethod, path, body, headers } = event;
  const pathParts = path.split('/').filter(p => p);
  
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };

  // Handle preflight
  if (httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }

  try {
    let requestBody;
    if (body) {
      requestBody = typeof body === 'string' ? JSON.parse(body) : body;
    }

    // Route handling
    if (pathParts[0] === 'api') {
      switch (pathParts[1]) {
        case 'auth':
          if (pathParts[2] === 'register') {
            // Registration
            const { name, email, password } = requestBody || {};
            
            if (!name || !email || !password) {
              return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ message: 'Необходимо указать имя, email и пароль' })
              };
            }

            const existing = await dbGet('users', { email: email });
            if (existing) {
              return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ message: 'Пользователь с таким email уже существует' })
              };
            }

            const passwordHash = await bcrypt.hash(password, 10);
            const result = await dbRun('users', {
              name: name,
              email: email,
              password_hash: passwordHash,
              role: 'user',
              created_at: new Date()
            });

            const user = { id: result.lastID, name, email, role: 'user' };
            const token = jwt.sign(user, process.env.JWT_SECRET || 'dev_secret_change_me', { expiresIn: '7d' });

            return {
              statusCode: 201,
              headers: corsHeaders,
              body: JSON.stringify({ token, user })
            };
          }
          
          if (pathParts[2] === 'login') {
            // Login
            const { email, password } = requestBody || {};
            
            if (!email || !password) {
              return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ message: 'Необходимо указать email и пароль' })
              };
            }

            const userRow = await dbGet('users', { email: email });
            if (!userRow) {
              return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ message: 'Неверный email или пароль' })
              };
            }

            const passwordOk = await bcrypt.compare(password, userRow.password_hash);
            if (!passwordOk) {
              return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ message: 'Неверный email или пароль' })
              };
            }

            const user = {
              id: userRow._id,
              name: userRow.name,
              email: userRow.email,
              role: userRow.role
            };

            const token = jwt.sign(user, process.env.JWT_SECRET || 'dev_secret_change_me', { expiresIn: '7d' });
            
            return {
              statusCode: 200,
              headers: corsHeaders,
              body: JSON.stringify({ token, user })
            };
          }
          break;

        case 'health':
          // Health check
          const result = await dbAll('users', {}).catch(() => []);
          return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
              status: 'OK',
              timestamp: new Date().toISOString(),
              database: '✅ подключена',
              users_count: result.length
            })
          };

        case 'user':
          if (pathParts[2] === 'role') {
            // Change user role
            return authRequired(async (event) => {
              const { role } = requestBody || {};
              
              if (!role || !['driver', 'passenger'].includes(role)) {
                return {
                  statusCode: 400,
                  headers: corsHeaders,
                  body: JSON.stringify({ message: 'Роль должна быть driver или passenger' })
                };
              }

              await dbUpdate('users', 
                { _id: new ObjectId(event.user.id) }, 
                { role: role }
              );

              return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify({ message: `Роль изменена на ${role}`, role })
              };
            })(event, context);
          }
          break;

        case 'rides':
          if (httpMethod === 'GET') {
            // Get rides
            return authRequired(async (event) => {
              const rides = await dbAll('rides', { driver_id: event.user.id });
              
              const ridesWithDriverName = rides.map(ride => ({
                id: ride._id,
                fromText: ride.from_text,
                toText: ride.to_text,
                departureTime: ride.departure_time,
                driverName: event.user.name
              }));

              return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify(ridesWithDriverName)
              };
            })(event, context);
          }
          
          if (httpMethod === 'POST') {
            // Create ride
            return authRequired(async (event) => {
              const { from, to, departureTime, fromLat, fromLng, toLat, toLng } = requestBody || {};

              if (!from || !to || !departureTime) {
                return {
                  statusCode: 400,
                  headers: corsHeaders,
                  body: JSON.stringify({ message: 'Необходимо указать from, to, departureTime' })
                };
              }

              const result = await dbRun('rides', {
                driver_id: event.user.id,
                from_text: from,
                to_text: to,
                from_lat: fromLat,
                from_lng: fromLng,
                to_lat: toLat,
                to_lng: toLng,
                departure_time: new Date(departureTime),
                created_at: new Date()
              });

              return {
                statusCode: 201,
                headers: corsHeaders,
                body: JSON.stringify({
                  id: result.lastID,
                  from,
                  to,
                  departureTime,
                  driverName: event.user.name
                })
              };
            })(event, context);
          }
          break;

        case 'rides':
          if (pathParts[2] === 'search') {
            // Search rides
            return authRequired(async (event) => {
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

              return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify(ridesWithDriverName)
              };
            })(event, context);
          }
          break;

        default:
          return {
            statusCode: 404,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Endpoint не найден' })
          };
      }
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Попутчики API работает!' })
    };

  } catch (err) {
    console.error('API Error:', err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Внутренняя ошибка сервера' })
    };
  }
};
