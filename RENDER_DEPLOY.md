# 🚀 Развертывание на Render.com (Бесплатно)

## 📋 Что нужно сделать (5 минут):

### 1. Загрузите код на GitHub
```bash
# Если еще нет репозитория
git init
git add .
git commit -m "Initial commit"

# Создайте репозиторий на GitHub и подключите
git remote add origin https://github.com/ВАШ_НИК/poputchiki.git
git push -u origin main
```

### 2. Развертывание на Render
1. Перейдите на https://render.com
2. Войдите через GitHub
3. Нажмите "New +" → "Web Service"
4. Выберите репозиторий `poputchiki`
5. Render автоматически обнаружит Node.js
6. Настройте:
   - **Name**: `poputchiki`
   - **Branch**: `main`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free`

### 3. Настройте переменные окружения
В разделе "Environment" добавьте:
```
NODE_ENV = production
JWT_SECRET = ваш_секретный_ключ
PORT = 10000
```

### 4. Развертывание!
Нажмите "Create Web Service" и ждите 2-3 минуты.

## 🎉 Результат:
- **URL**: `https://poputchiki.onrender.com`
- **Автоматическое развертывание** при пуше в GitHub
- **HTTPS** автоматически
- **Бесплатно** с перезапуском каждые 15 минут (для free плана)

## 📱 PWA на телефоне:
1. Откройте сайт на Android
2. Chrome → Меню → "Добавить на главный экран"
3. Приложение установлено!

## 🔧 Если что-то пошло не так:
Проверьте логи в Render Dashboard → "Logs"

## 📊 Мониторинг:
- Сайт работает на: `https://poputchiki.onrender.com`
- Health check: `https://poputchiki.onrender.com/api/health`
- Логи: в панели Render

## ✅ Все готово!
Приложение работает в интернете 24/7 на бесплатном тарифе!
