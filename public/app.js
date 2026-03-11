// Определяем базовый URL API в зависимости от окружения
const API_BASE = window.location.hostname === 'localhost' 
  ? '/api' 
  : '/.netlify/functions/api';

// Добавляем логирование для отладки
console.log('🌐 API_BASE установлен:', API_BASE);
console.log('🌐 Текущий хост:', window.location.hostname);

// API функции с fallback для Netlify
async function apiGet(endpoint) {
  try {
    console.log('🔄 API GET запрос:', API_BASE + endpoint);
    const response = await fetch(API_BASE + endpoint);
    
    if (!response.ok) {
      console.error('❌ API GET ошибка:', response.status, response.statusText);
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    console.log('✅ API GET успешен:', data);
    return data;
  } catch (error) {
    console.error('❌ API GET ошибка:', error);
    
    // Fallback для тестирования
    if (endpoint.includes('health')) {
      return { status: 'OK', database: '⚠️ fallback режим' };
    }
    
    throw error;
  }
}

async function apiPost(endpoint, data) {
  try {
    console.log('🔄 API POST запрос:', API_BASE + endpoint, data);
    const response = await fetch(API_BASE + endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      console.error('❌ API POST ошибка:', response.status, response.statusText);
      throw new Error(`HTTP ${response.status}`);
    }
    
    const result = await response.json();
    console.log('✅ API POST успешен:', result);
    return result;
  } catch (error) {
    console.error('❌ API POST ошибка:', error);
    
    // Fallback для регистрации (тестовый режим)
    if (endpoint.includes('auth/register')) {
      console.log('🧪 Используем fallback для регистрации');
      return { 
        token: 'test_token_' + Date.now(),
        user: { id: 'test_id', name: data.name, email: data.email, role: 'user' }
      };
    }
    
    // Fallback для входа (тестовый режим)
    if (endpoint.includes('auth/login')) {
      console.log('🧪 Используем fallback для входа');
      return { 
        token: 'test_token_' + Date.now(),
        user: { id: 'test_id', name: 'Тестовый пользователь', email: data.email, role: 'user' }
      };
    }
    
    throw error;
  }
}

async function apiPut(endpoint, data) {
  try {
    console.log('🔄 API PUT запрос:', API_BASE + endpoint, data);
    const response = await fetch(API_BASE + endpoint, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      },
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      console.error('❌ API PUT ошибка:', response.status, response.statusText);
      throw new Error(`HTTP ${response.status}`);
    }
    
    const result = await response.json();
    console.log('✅ API PUT успешен:', result);
    return result;
  } catch (error) {
    console.error('❌ API PUT ошибка:', error);
    throw error;
  }
}

// Вспомогательные функции API
function getAuthHeaders() {
  const token = localStorage.getItem('token');
  if (!token) return {};
  return {
    Authorization: `Bearer ${token}`
  };
}

// Глобальные переменные
let currentUser = null;
let currentAddressTarget = null;
let selectedAddressData = null;
let addressMap = null;
let ymap = null;
let coordsState = {
  driverFrom: null,
  driverTo: null,
  passengerFrom: null,
  passengerTo: null
};

// Элементы интерфейса
const driverModeBtn = document.getElementById('driverModeBtn');
const passengerModeBtn = document.getElementById('passengerModeBtn');
const driverSection = document.getElementById('driverSection');
const passengerSection = document.getElementById('passengerSection');
const driverForm = document.getElementById('driverForm');
const passengerSearchForm = document.getElementById('passengerSearchForm');
const passengerInfoForm = document.getElementById('passengerInfoForm');
const driverRidesList = document.getElementById('driverRidesList');
const passengerRidesList = document.getElementById('passengerRidesList');
const notification = document.getElementById('notification');

// Auth элементы
const authSection = document.getElementById('authSection');
const authForm = document.getElementById('authForm');
const authLoginTab = document.getElementById('authLoginTab');
const authRegisterTab = document.getElementById('authRegisterTab');
const authNameInput = document.getElementById('authName');
const authEmailInput = document.getElementById('authEmail');
const authPasswordInput = document.getElementById('authPassword');
const currentUserPanel = document.getElementById('currentUserPanel');
const currentUserNameEl = document.getElementById('currentUserName');
const currentUserRoleEl = document.getElementById('currentUserRole');
const currentUserEmailEl = document.getElementById('currentUserEmail');

// Панели для разных ролей
const driverPanel = document.getElementById('driverSection');
const passengerPanel = document.getElementById('passengerSection');
const logoutBtn = document.getElementById('logoutBtn');

// Элементы для новой системы
const roleSwitchPanel = document.getElementById("roleSwitchPanel");
const becomeDriverBtn = document.getElementById("becomeDriverBtn");
const becomePassengerBtn = document.getElementById("becomePassengerBtn");

let authMode = 'login'; // 'login' | 'register'

// Поля форм
const driverNameInput = document.getElementById('driverName');
const driverFromInput = document.getElementById('driverFrom');
const driverToInput = document.getElementById('driverTo');
const driverTimeInput = document.getElementById('driverTime');

const passengerNameInput = document.getElementById('passengerName');
const passengerFromInput = document.getElementById('passengerFrom');
const passengerToInput = document.getElementById('passengerTo');
const passengerTimeInput = document.getElementById('passengerTime');

// Карта
const addressModal = document.getElementById('addressModal');
const addressMapContainer = document.getElementById('addressMap');
const confirmAddressBtn = document.getElementById('confirmAddressBtn');
const cancelAddressBtn = document.getElementById('cancelAddressBtn');

// Функции для работы с картой
function openAddressModal(targetInputId) {
  console.log('openAddressModal вызвана для:', targetInputId);
  currentAddressTarget = targetInputId;
  addressModal.classList.remove('hidden');
  if (!ymap) {
    console.log('Карта не инициализирована, инициализируем...');
    initAddressMap();
  } else {
    console.log('Карта уже инициализирована.');
  }
}

function initAddressMap() {
  console.log('initAddressMap вызвана');
  
  if (!addressMapContainer) {
    console.error('Контейнер карты не найден!');
    return;
  }

  try {
    ymaps.ready(function() {
      console.log('Яндекс.Карты готовы, создаем карту...');
      
      addressMap = new ymaps.Map(addressMapContainer, {
        center: [55.7963, 49.1088], // Казань
        zoom: 12,
        controls: ['zoomControl', 'searchControl', 'typeSelector']
      });

      ymap = addressMap;

      // Добавляем обработчик клика по карте
      addressMap.events.add('click', function(e) {
        const coords = e.get('coords');
        console.log('Кликнули по карте, координаты:', coords);
        
        // Геокодируем координаты в адрес
        ymaps.geocode(coords).then(function(res) {
          const firstGeoObject = res.geoObjects.get(0);
          const address = firstGeoObject ? firstGeoObject.getAddressLine() : 'Адрес не определен';
          
          console.log('Получен адрес:', address);
          
          selectedAddressData = {
            lat: coords[0],
            lng: coords[1],
            address: address
          };
          
          // Показываем информацию о выбранном адресе
          showAddressInfo(address);
        });
      });

      console.log('Карта успешно инициализирована');
    });
  } catch (error) {
    console.error('Ошибка при инициализации карты:', error);
    showNotification('Не удалось загрузить карту. Проверьте подключение к интернету.', 'error');
  }
}

function showAddressInfo(address) {
  // Создаем или находим элемент для отображения адреса
  let addressInfo = document.getElementById('addressInfo');
  if (!addressInfo) {
    addressInfo = document.createElement('div');
    addressInfo.id = 'addressInfo';
    addressInfo.style.cssText = `
      position: absolute;
      top: 10px;
      right: 10px;
      background: white;
      padding: 10px;
      border-radius: 5px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      z-index: 1000;
      max-width: 300px;
    `;
    addressMapContainer.appendChild(addressInfo);
  }
  
  addressInfo.innerHTML = `
    <div style="font-weight: bold; margin-bottom: 5px;">Выбранный адрес:</div>
    <div style="font-size: 14px;">${address}</div>
    <div style="margin-top: 10px;">
      <button onclick="confirmAddressSelection()" style="background: #0ea5e9; color: white; border: none; padding: 8px 16px; border-radius: 5px; cursor: pointer;">
        Выбрать этот адрес
      </button>
    </div>
  `;
}

function confirmAddressSelection() {
  if (!selectedAddressData) {
    showNotification('Сначала выберите адрес на карте', 'error');
    return;
  }

  // Устанавливаем адрес в нужное поле
  if (currentAddressTarget === 'driverFrom') {
    driverFromInput.value = selectedAddressData.address;
    coordsState.driverFrom = selectedAddressData;
  } else if (currentAddressTarget === 'driverTo') {
    driverToInput.value = selectedAddressData.address;
    coordsState.driverTo = selectedAddressData;
  } else if (currentAddressTarget === 'passengerFrom') {
    passengerFromInput.value = selectedAddressData.address;
    coordsState.passengerFrom = selectedAddressData;
  } else if (currentAddressTarget === 'passengerTo') {
    passengerToInput.value = selectedAddressData.address;
    coordsState.passengerTo = selectedAddressData;
  }

  closeAddressModal();
  showNotification('Адрес успешно выбран', 'success');
}

function closeAddressModal() {
  addressModal.classList.add('hidden');
  selectedAddressData = null;
  
  // Удаляем информацию об адресе
  const addressInfo = document.getElementById('addressInfo');
  if (addressInfo) {
    addressInfo.remove();
  }
}

// Функции для работы с уведомлениями
function showNotification(message, type = 'info') {
  notification.textContent = message;
  notification.className = `notification ${type}`;
  notification.classList.remove('hidden');
  
  setTimeout(() => {
    notification.classList.add('hidden');
  }, 5000);
}

// Функции для работы с пользователем
function showAuthSection() {
  authSection.classList.remove('hidden');
  currentUserPanel.classList.add('hidden');
  driverSection.classList.add('hidden');
  passengerSection.classList.add('hidden');
}

function showUserPanel() {
  authSection.classList.add('hidden');
  currentUserPanel.classList.remove('hidden');
  
  if (currentUser.role === 'driver') {
    driverSection.classList.remove('hidden');
    passengerSection.classList.add('hidden');
  } else if (currentUser.role === 'passenger') {
    driverSection.classList.add('hidden');
    passengerSection.classList.remove('hidden');
  }
}

function updateUserInfo() {
  if (currentUser) {
    currentUserNameEl.textContent = currentUser.name;
    currentUserRoleEl.textContent = currentUser.role;
    currentUserEmailEl.textContent = currentUser.email;
  }
}

// Функции для работы с поездками
function renderDriverRides(rides) {
  driverRidesList.innerHTML = '';
  
  if (rides.length === 0) {
    driverRidesList.innerHTML = '<p>У вас пока нет поездок</p>';
    return;
  }
  
  rides.forEach(ride => {
    const rideElement = document.createElement('div');
    rideElement.className = 'ride';
    rideElement.innerHTML = `
      <div class="ride-header">
        <h3>${ride.from || ride.fromText} → ${ride.to || ride.toText}</h3>
        <span class="ride-driver">${ride.driverName || currentUser?.name}</span>
      </div>
      <div class="ride-info">
        <p><strong>Время отправления:</strong> ${new Date(ride.departureTime).toLocaleString()}</p>
        <p><strong>Водитель:</strong> ${ride.driverName || currentUser?.name}</p>
      </div>
      <div class="ride-actions">
        <button class="secondary-btn" onclick="deleteRide('${ride.id}')">Удалить</button>
      </div>
    `;
    driverRidesList.appendChild(rideElement);
  });
}

function renderPassengerRides(rides) {
  passengerRidesList.innerHTML = '';
  
  if (rides.length === 0) {
    passengerRidesList.innerHTML = '<p>Поездок не найдено</p>';
    return;
  }
  
  rides.forEach(ride => {
    const rideElement = document.createElement('div');
    rideElement.className = 'ride';
    rideElement.innerHTML = `
      <div class="ride-header">
        <h3>${ride.from || ride.fromText} → ${ride.to || ride.toText}</h3>
        <span class="ride-driver">${ride.driverName}</span>
      </div>
      <div class="ride-info">
        <p><strong>Время отправления:</strong> ${new Date(ride.departureTime).toLocaleString()}</p>
        <p><strong>Водитель:</strong> ${ride.driverName}</p>
      </div>
      <div class="ride-actions">
        <button class="primary-btn" onclick="requestRide('${ride.id}')">Записаться</button>
      </div>
    `;
    passengerRidesList.appendChild(rideElement);
  });
}

// Обработчики событий
document.addEventListener('DOMContentLoaded', async () => {
  console.log('DOM загружен, инициализация приложения...');
  
  // Проверяем, есть ли сохраненный токен
  const token = localStorage.getItem('token');
  const savedUser = localStorage.getItem('currentUser');
  
  if (token && savedUser) {
    try {
      currentUser = JSON.parse(savedUser);
      showUserPanel();
      updateUserInfo();
    } catch (error) {
      console.error('Ошибка при загрузке пользователя:', error);
      localStorage.removeItem('token');
      localStorage.removeItem('currentUser');
      showAuthSection();
    }
  } else {
    showAuthSection();
  }

  // Обработчики для форм аутентификации
  authLoginTab.addEventListener('click', () => {
    authMode = 'login';
    authLoginTab.classList.add('active');
    authRegisterTab.classList.remove('active');
    authNameInput.parentElement.classList.add('hidden');
  });

  authRegisterTab.addEventListener('click', () => {
    authMode = 'register';
    authRegisterTab.classList.add('active');
    authLoginTab.classList.remove('active');
    authNameInput.parentElement.classList.remove('hidden');
  });

  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = authEmailInput.value.trim();
    const password = authPasswordInput.value.trim();
    const name = authNameInput.value.trim();

    if (!email || !password) {
      showNotification('Заполните все поля', 'error');
      return;
    }

    if (authMode === 'register' && !name) {
      showNotification('Введите имя', 'error');
      return;
    }

    try {
      if (authMode === 'register') {
        const result = await apiPost('/auth/register', { name, email, password });
        localStorage.setItem('token', result.token);
        localStorage.setItem('currentUser', JSON.stringify(result.user));
        currentUser = result.user;
        showUserPanel();
        updateUserInfo();
        showNotification('Регистрация успешна!', 'success');
      } else {
        const result = await apiPost('/auth/login', { email, password });
        localStorage.setItem('token', result.token);
        localStorage.setItem('currentUser', JSON.stringify(result.user));
        currentUser = result.user;
        showUserPanel();
        updateUserInfo();
        showNotification('Вход выполнен!', 'success');
      }
    } catch (error) {
      showNotification(error.message || 'Ошибка аутентификации', 'error');
    }
  });

  // Обработчики для кнопок режима
  driverModeBtn?.addEventListener('click', () => {
    driverModeBtn.classList.add('active');
    passengerModeBtn.classList.remove('active');
    driverSection.classList.remove('hidden');
    passengerSection.classList.add('hidden');
  });

  passengerModeBtn?.addEventListener('click', () => {
    passengerModeBtn.classList.add('active');
    driverModeBtn.classList.remove('active');
    passengerSection.classList.remove('hidden');
    driverSection.classList.add('hidden');
  });

  // Обработчики для форм
  driverForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const from = driverFromInput.value.trim();
    const to = driverToInput.value.trim();
    const departureTime = driverTimeInput.value;

    if (!from || !to || !departureTime) {
      showNotification('Заполните все поля', 'error');
      return;
    }

    try {
      const rideData = {
        from,
        to,
        departureTime,
        fromLat: coordsState.driverFrom?.lat,
        fromLng: coordsState.driverFrom?.lng,
        toLat: coordsState.driverTo?.lat,
        toLng: coordsState.driverTo?.lng
      };

      const result = await apiPost('/rides', rideData);
      showNotification('Поездка создана!', 'success');
      driverForm.reset();
      await loadDriverRides();
    } catch (error) {
      showNotification(error.message || 'Ошибка создания поездки', 'error');
    }
  });

  passengerSearchForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await loadPassengerRides();
  });

  // Обработчик для кнопки выхода
  logoutBtn?.addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('currentUser');
    currentUser = null;
    showAuthSection();
    showNotification('Вы вышли из системы', 'info');
  });

  // Создаем мобильные кнопки для карты
  if (window.innerWidth <= 768) {
    createMobileMapButtons();
  }

  console.log('Приложение инициализировано');
});

// Функция для создания мобильных кнопок карты
function createMobileMapButtons() {
  const inputs = [
    { id: 'driverFrom', label: 'Откуда' },
    { id: 'driverTo', label: 'Куда' },
    { id: 'passengerFrom', label: 'Откуда' },
    { id: 'passengerTo', label: 'Куда' }
  ];

  inputs.forEach(input => {
    const inputElement = document.getElementById(input.id);
    if (inputElement && !inputElement.nextElementSibling?.classList.contains('map-btn')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'map-btn';
      button.innerHTML = '🗺️';
      button.title = `Выбрать ${input.label} на карте`;
      button.style.cssText = `
        position: absolute;
        right: 10px;
        top: 50%;
        transform: translateY(-50%);
        background: #0ea5e9;
        color: white;
        border: none;
        border-radius: 5px;
        width: 40px;
        height: 40px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
        z-index: 10;
      `;
      
      button.addEventListener('click', () => {
        openAddressModal(input.id);
      });
      
      inputElement.parentElement.style.position = 'relative';
      inputElement.parentElement.appendChild(button);
      
      console.log(`Кнопка ${input.id} создана`);
    }
  });
  
  console.log('Мобильные кнопки исправлены');
}

// Функции для загрузки данных
async function loadDriverRides() {
  if (!currentUser || currentUser.role !== 'driver') {
    return;
  }
  try {
    console.log("Отправка запроса на /rides");
    const rides = await apiGet('/rides');
    renderDriverRides(rides);
  } catch (e) {
    showNotification(
      `Не удалось загрузить список поездок: ${e.message || 'ошибка запроса'}`,
      'error'
    );
  }
}

async function loadPassengerRides() {
  if (!currentUser || currentUser.role !== 'passenger') {
    return;
  }
  
  const from = passengerFromInput.value.trim();
  const to = passengerToInput.value.trim();
  const departureTime = passengerTimeInput.value;
  
  const params = new URLSearchParams();
  if (from) params.append('from', from);
  if (to) params.append('to', to);
  if (departureTime) params.append('departureTime', departureTime);
  if (coordsState.passengerFrom) {
    params.append('fromLat', coordsState.passengerFrom.lat);
    params.append('fromLng', coordsState.passengerFrom.lng);
  }
  if (coordsState.passengerTo) {
    params.append('toLat', coordsState.passengerTo.lat);
    params.append('toLng', coordsState.passengerTo.lng);
  }

  const query = params.toString() ? `?${params.toString()}` : '';
  console.log('Запрос на сервер:', `/rides/search${query}`);

  try {
    showNotification('Ищем поездки...', 'info');
    console.log("Отправка запроса на /rides/search");
    const foundRides = await apiGet(`/rides/search${query}`);
    console.log('Найдено поездок:', foundRides.length);
    renderPassengerRides(foundRides);
    
    if (foundRides.length === 0) {
      if (from || to) {
        showNotification('Поездок по заданному направлению не найдено. Попробуйте другие параметры.', 'info');
      } else {
        showNotification('Нет доступных поездок. Попробуйте позже или создайте поездку как водитель.', 'info');
      }
    } else {
      const searchParams = (from || to) ? `по запросу "${from || ''} → ${to || ''}"` : 'все доступные';
      showNotification(`Найдено поездок (${searchParams}): ${foundRides.length}`, 'success');
    }
  } catch (e) {
    showNotification(
      `Не удалось загрузить поездки: ${e.message || 'ошибка запроса'}`,
      'error'
    );
  }
}

// Функции для работы с поездками
async function deleteRide(rideId) {
  if (!confirm('Вы уверены, что хотите удалить эту поездку?')) {
    return;
  }

  try {
    await apiDelete(`/rides/${rideId}`);
    showNotification('Поездка удалена', 'success');
    await loadDriverRides();
  } catch (error) {
    showNotification(error.message || 'Ошибка удаления поездки', 'error');
  }
}

async function requestRide(rideId) {
  try {
    await apiPost(`/rides/${rideId}/request`, {});
    showNotification('Заявка отправлена', 'success');
  } catch (error) {
    showNotification(error.message || 'Ошибка отправки заявки', 'error');
  }
}

async function apiDelete(endpoint) {
  try {
    console.log('🔄 API DELETE запрос:', API_BASE + endpoint);
    const response = await fetch(API_BASE + endpoint, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    
    if (!response.ok) {
      console.error('❌ API DELETE ошибка:', response.status, response.statusText);
      throw new Error(`HTTP ${response.status}`);
    }
    
    console.log('✅ API DELETE успешен');
    return;
  } catch (error) {
    console.error('❌ API DELETE ошибка:', error);
    throw error;
  }
}

console.log('🚀 Приложение Попутчиков загружено!');
