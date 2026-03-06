# 🚀 Настройка MongoDB Atlas (бесплатно)

## 1. Создайте кластер MongoDB
1. Перейдите на https://www.mongodb.com/cloud/atlas/register
2. Зарегистрируйтесь (бесплатно)
3. Нажмите "Build a Cluster"
4. Выберите "M0 Sandbox" (бесплатный)
5. Выберите регион (ближайший к вам)
6. Нажмите "Create Cluster"

## 2. Настройте доступ
### Добавьте IP адрес:
1. В разделе "Network Access" → "Add IP Address"
2. Выберите "Allow access from anywhere" (0.0.0.0/0)
3. Нажмите "Confirm"

### Создайте пользователя:
1. В разделе "Database Access" → "Add New Database User"
2. Username: `poputchiki`
3. Password: создайте сложный пароль
4. Привилегии: "Read and write to any database"
5. Нажмите "Add User"

## 3. Получите строку подключения
1. Откройте кластер → "Connect"
2. Выберите "Connect your application"
3. Driver: "Node.js"
4. Скопируйте строку подключения
5. Замените `<password>` на ваш пароль

## 4. Настройте Render
1. Откройте ваш сервис на Render
2. Перейдите в "Environment"
3. Добавьте переменные:
   ```
   MONGODB_URL = mongodb+srv://poputchiki:ВАШ_ПАРОЛЬ@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   NODE_ENV = production
   JWT_SECRET = ваш_секретный_ключ_123
   PORT = 10000
   ```

## 5. Перезапустите
1. Нажмите "Manual Deploy" → "Deploy Latest Commit"

## 6. Проверьте
В логах должно быть:
```
MONGODB_URL: mongodb+srv://...
✅ MongoDB подключена
✅ Индексы созданы
```

## ✅ Преимущества MongoDB Atlas:
- **Полностью бесплатно** (512MB)
- **Работает везде**
- **Надежно** (MongoDB Cloud)
- **Масштабируемо**
- **Автоматические бэкапы**
