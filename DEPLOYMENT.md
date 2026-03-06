# Развертывание приложения "Попутчики"

## 🌐 Веб-сайт

### 1. Подготовка сервера
```bash
# Установите Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Склонируйте репозиторий
git clone <your-repo-url>
cd приложение-макс

# Установите зависимости
npm install

# Создайте .env файл
cp .env.example .env
# Отредактируйте .env с вашими данными
```

### 2. Запуск в продакшен
```bash
# Для продакшен
export NODE_ENV=production
npm start

# Или с PM2 (рекомендуется)
npm install -g pm2
pm2 start server/index.js --name "poputchiki"
pm2 startup
pm2 save
```

### 3. Настройка домена
Используйте Nginx как обратный прокси:
```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 📱 Android APK

### Вариант 1: PWA (Прогрессивное веб-приложение)
```bash
# Добавьте manifest.json в public/
# Приложение будет устанавливаться как нативное
```

### Вариант 2: Capacitor (рекомендуется)
```bash
# Установите Capacitor
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init "Попутчики" "com.poputchiki.app"

# Добавьте Android платформу
npx cap add android

# Соберите приложение
npx cap sync
npx cap open android

# Откроется Android Studio для сборки APK
```

### Вариант 3: WebView приложение
Создайте простое Android приложение с WebView:
```xml
<!-- activity_main.xml -->
<WebView
    android:id="@+id/webview"
    android:layout_width="match_parent"
    android:layout_height="match_parent" />
```

```java
// MainActivity.java
WebView webView = findViewById(R.id.webview);
webView.getSettings().setJavaScriptEnabled(true);
webView.loadUrl("https://your-domain.com");
```

## 🔧 Конфигурация

### Яндекс.Карты API
1. Зарегистрируйтесь на https://developer.tech.yandex.ru/
2. Создайте API ключ
3. Замените ключ в public/index.html

### Безопасность
- Измените JWT_SECRET в продакшен
- Настройте HTTPS
- Используйте надежную базу данных

## 📊 Мониторинг
```bash
# PM2 мониторинг
pm2 monit

# Логи
pm2 logs poputchiki
```

## 🚀 Быстрый старт
```bash
git clone <repo>
cd приложение-макс
npm install
cp .env.example .env
# Настройте .env
npm start
```

Приложение будет доступно на http://localhost:3000
