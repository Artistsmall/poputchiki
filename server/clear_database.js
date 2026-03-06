const { MongoClient } = require('mongodb');

async function clearDatabase() {
  const client = new MongoClient(process.env.MONGODB_URL || 'mongodb://localhost:27017/poputchiki');
  
  try {
    await client.connect();
    const db = client.db();
    
    console.log('🗑️ Очистка базы данных...');
    
    // Удаляем все коллекции
    await db.collection('users').deleteMany({});
    await db.collection('rides').deleteMany({});
    await db.collection('ride_requests').deleteMany({});
    
    console.log('✅ База данных очищена');
    
    // Создаем индексы
    await db.collection('users').createIndex({ email: 1 }, { unique: true });
    console.log('✅ Индексы созданы');
    
  } catch (err) {
    console.error('❌ Ошибка очистки:', err);
  } finally {
    await client.close();
  }
}

clearDatabase();
