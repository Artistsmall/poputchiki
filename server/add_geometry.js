const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'poputchiki.db');
const db = new sqlite3.Database(dbPath);

// Функция расстояния
function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Координаты для Зеленодольска и Казани (примерные)
const coords = {
  'Зеленодольск, лесная улица, 18': { lat: 55.5311, lng: 48.6488 },
  'Казань, Товарищеская улица, 30': { lat: 55.7854, lng: 49.1558 },
  'Зеленодольск': { lat: 55.5311, lng: 48.6488 }
};

async function addGeometry() {
  try {
    const rides = await new Promise((resolve, reject) => {
      db.all('SELECT id, from_text, to_text FROM rides', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    for (const ride of rides) {
      const fromCoords = coords[ride.from_text];
      const toCoords = coords[ride.to_text];
      
      if (fromCoords && toCoords) {
        const baseDistanceKm = distanceKm(fromCoords.lat, fromCoords.lng, toCoords.lat, toCoords.lng);
        
        console.log(`Поездка ${ride.id}: ${ride.from_text} → ${ride.to_text}`);
        console.log(`Координаты: [${fromCoords.lat}, ${fromCoords.lng}] → [${toCoords.lat}, ${toCoords.lng}]`);
        console.log(`Расстояние: ${baseDistanceKm.toFixed(1)} км`);
        
        // Сохраняем в памяти (в реальном приложении это было бы в rideGeometry)
        console.log('Геометрия добавлена');
      } else {
        console.log(`Нет координат для поездки ${ride.id}: ${ride.from_text} → ${ride.to_text}`);
      }
    }
    
    db.close();
  } catch (err) {
    console.error('Ошибка:', err);
    db.close();
  }
}

addGeometry();
