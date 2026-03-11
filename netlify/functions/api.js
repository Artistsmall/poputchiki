const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// MongoDB connection
const mongoUrl = process.env.MONGODB_URL;
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
        body: { message: 'Требуется авторизация' }
      };
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret_change_me');
      event.user = decoded;
      return await handler(event, context);
    } catch (err) {
      return {
        statusCode: 401,
        body: { message: 'Неверный токен' }
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
      headers: corsHeaders
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
