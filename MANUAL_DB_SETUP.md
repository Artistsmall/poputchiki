# 🚨 Ручная настройка базы данных Render

Если автоматическая настройка не работает, сделайте это вручную:

## 1. Создайте базу данных вручную
1. Откройте https://dashboard.render.com
2. Нажмите "New +" → "PostgreSQL"
3. **Name:** `poputchiki-db-manual`
4. **Database Name:** `poputchiki`
5. **User:** `poputchiki`
6. **Region:** оставьте по умолчанию
7. **Plan:** Free
8. Нажмите "Create Database"

## 2. Получите строку подключения
1. Дождитесь создания базы данных (2-3 минуты)
2. Откройте базу данных → "Connections"
3. Скопируйте "External Database URL"

## 3. Настройте переменные окружения
1. Откройте веб-сервис `poputchiki`
2. Перейдите в "Environment"
3. Добавьте переменные:
   ```
   DATABASE_URL = (вставьте сюда External Database URL)
   NODE_ENV = production
   JWT_SECRET = ваш_секретный_ключ_123
   PORT = 10000
   ```

## 4. Перезапустите сервис
1. Нажмите "Manual Deploy" → "Deploy Latest Commit"

## 5. Проверьте
Откройте логи - должно быть:
```
DATABASE_URL: postgresql://...
✅ PostgreSQL подключена
```

## 6. Удалите старую базу
Если все работает, удалите старую базу данных из render.yaml
