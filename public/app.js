const API_BASE = '/api';

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
const authRoleSelect = document.getElementById('authRole');
const currentUserPanel = document.getElementById('currentUserPanel');
const currentUserNameEl = document.getElementById('currentUserName');
const currentUserRoleEl = document.getElementById('currentUserRole');
const currentUserEmailEl = document.getElementById('currentUserEmail');

// Панели для разных ролей
const driverPanel = document.getElementById('driverSection');
const passengerPanel = document.getElementById('passengerSection');
const logoutBtn = document.getElementById('logoutBtn');

let authMode = 'login'; // 'login' | 'register'
let currentUser = null;

// Поля форм
const driverNameInput = document.getElementById('driverName');
const driverFromInput = document.getElementById('driverFrom');
const driverToInput = document.getElementById('driverTo');
const driverTimeInput = document.getElementById('driverTime');

const passengerNameInput = document.getElementById('passengerName');
const passengerFromInput = document.getElementById('passengerFrom');
const passengerToInput = document.getElementById('passengerTo');
// Карта
const mapElement = document.getElementById('map');
let ymap = null;
let activeMapTarget = 'driverFrom';
const mapMarkers = {
  driverFrom: null,
  driverTo: null,
  passengerFrom: null,
  passengerTo: null
};
const coordsState = {
  driverFrom: null,
  driverTo: null,
  passengerFrom: null,
  passengerTo: null
};
let driverRoute = null;

// Уведомления
function showNotification(message, type = 'info') {
  notification.textContent = message;
  notification.className = `notification ${type}`;
  notification.classList.remove('hidden');
  setTimeout(() => {
    notification.classList.add('hidden');
  }, 3000);
}

// Переключение роли
driverModeBtn.addEventListener('click', () => {
  driverModeBtn.classList.add('active');
  passengerModeBtn.classList.remove('active');
  driverSection.classList.remove('hidden');
  passengerSection.classList.add('hidden');
});

passengerModeBtn.addEventListener('click', () => {
  passengerModeBtn.classList.add('active');
  driverModeBtn.classList.remove('active');
  passengerSection.classList.remove('hidden');
  driverSection.classList.add('hidden');
});

// Вспомогательные функции API
function getAuthHeaders() {
  const token = localStorage.getItem('token');
  if (!token) return {};
  return {
    Authorization: `Bearer ${token}`
  };
}

async function apiGet(path) {
  const res = await fetch(API_BASE + path, {
    headers: getAuthHeaders()
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Ошибка запроса: ${res.status}`);
  }
  return res.json();
}

async function apiPost(path, body) {
  const url = API_BASE + path;
  const fullUrl = window.location.origin + url;
  const headers = {
    'Content-Type': 'application/json',
    ...getAuthHeaders()
  };
  
  console.log('POST запрос:', url, body);
  console.log('Полный URL:', fullUrl);
  console.log('POST заголовки:', headers);
  
  const res = await fetch(url, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(body)
  });
  
  console.log('POST ответ:', res.status, res.statusText);
  console.log('POST ответные заголовки:', [...res.headers.entries()]);
  
  if (!res.ok) {
    const text = await res.text();
    console.log('POST ошибка:', text);
    let message = text || `Ошибка запроса: ${res.status}`;
    try {
      const parsed = JSON.parse(text);
      if (parsed && parsed.message) {
        message = parsed.message;
      }
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  return res.json();
}

async function apiDelete(path) {
  const res = await fetch(API_BASE + path, {
    method: 'DELETE',
    headers: {
      ...getAuthHeaders()
    }
  });
  if (!res.ok) {
    const text = await res.text();
    let message = text || `Ошибка запроса: ${res.status}`;
    try {
      const parsed = JSON.parse(text);
      if (parsed && parsed.message) {
        message = parsed.message;
      }
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  return res.status === 204 ? null : res.json();
}

// -------------------
//   Авторизация
// -------------------

function setAuthMode(mode) {
  authMode = mode;
  if (mode === 'login') {
    authLoginTab.classList.add('active');
    authRegisterTab.classList.remove('active');
    authNameInput.parentElement.classList.add('hidden');
    authRoleSelect.parentElement.classList.add('hidden');
  } else {
    authRegisterTab.classList.add('active');
    authLoginTab.classList.remove('active');
    authNameInput.parentElement.classList.remove('hidden');
    authRoleSelect.parentElement.classList.remove('hidden');
  }
}

authLoginTab.addEventListener('click', () => setAuthMode('login'));
authRegisterTab.addEventListener('click', () => setAuthMode('register'));

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = authEmailInput.value.trim();
  const password = authPasswordInput.value;

  if (!email || !password) {
    showNotification('Введите email и пароль', 'error');
    return;
  }

  try {
    let response;
    if (authMode === 'register') {
      const name = authNameInput.value.trim();
      const role = authRoleSelect.value;
      if (!name) {
        showNotification('Введите имя', 'error');
        return;
      }
      response = await apiPost('/auth/register', { name, email, password, role });
    } else {
      response = await apiPost('/auth/login', { email, password });
    }

    const { token, user } = response;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    currentUser = user;
    updateUserPanel();
    showNotification(authMode === 'register' ? 'Регистрация успешна' : 'Успешный вход', 'success');

    authForm.reset();
    authPasswordInput.value = '';

    if (currentUser.role === 'driver') {
      driverNameInput.value = currentUser.name;
      driverNameInput.readOnly = true;
      driverModeBtn.click();
      await loadDriverRides();
    } else if (currentUser.role === 'passenger') {
      passengerNameInput.value = currentUser.name;
      passengerNameInput.readOnly = true;
      passengerModeBtn.click();
    }
  } catch (e) {
    showNotification(e.message || 'Ошибка авторизации', 'error');
  }
});

logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  currentUser = null;
  updateUserPanel();
  driverNameInput.value = '';
  driverNameInput.readOnly = false;
  passengerNameInput.readOnly = false;
  showNotification('Вы вышли из аккаунта', 'info');
});

function updateUserPanel() {
  const userJson = localStorage.getItem('user');
  if (!userJson) {
    currentUserPanel.classList.add('hidden');
    authForm.classList.remove('hidden');
    return;
  }
  try {
    currentUser = JSON.parse(userJson);
  } catch {
    currentUser = null;
  }

  if (!currentUser) {
    currentUserPanel.classList.add('hidden');
    authForm.classList.remove('hidden');
    return;
  }

  currentUserNameEl.textContent = currentUser.name;
  currentUserEmailEl.textContent = currentUser.email;
  currentUserRoleEl.textContent = currentUser.role === 'driver' ? 'Водитель' : 'Пассажир';

  currentUserPanel.classList.remove('hidden');
  authForm.classList.add('hidden');

  if (currentUser.role === 'driver') {
    driverPanel.style.display = 'block';
    passengerPanel.style.display = 'none';
    loadDriverRides();
    loadPassengerRequests(); // Водитель тоже может видеть свои заявки как пассажир
    console.log('Загружаем интерфейс водителя');
  } else if (currentUser.role === 'passenger') {
    driverPanel.style.display = 'none';
    passengerPanel.style.display = 'block';
    loadPassengerRides();
    loadPassengerRequests(); // Загружаем заявки пассажира
    console.log('Загружаем интерфейс пассажира');
  }
}

// Отрисовка поездок для водителя
function renderDriverRides(rides) {
  if (!rides.length) {
    driverRidesList.innerHTML = '<p class="muted">Пока нет созданных поездок.</p>';
    return;
  }

  driverRidesList.innerHTML = '';
  rides.forEach((ride) => {
    const card = document.createElement('div');
    card.className = 'card ride-card';

    const header = document.createElement('div');
    header.className = 'ride-header';
    header.innerHTML = `
      <div>
        <div class="ride-main">
          <span class="ride-from">${ride.from}</span>
          <span class="arrow">→</span>
          <span class="ride-to">${ride.to}</span>
        </div>
        <div class="ride-time">
          Время выезда: ${new Date(ride.departureTime).toLocaleString()}
        </div>
      </div>
      <div class="ride-driver">Водитель: <strong>${ride.driverName}</strong></div>
    `;

    const waypointsBlock = document.createElement('div');
    waypointsBlock.className = 'ride-waypoints';
    if (ride.waypoints && ride.waypoints.length) {
      const list = ride.waypoints
        .map(
          (wp) =>
            `<li><strong>${wp.passengerName}</strong>: ${wp.from} → ${wp.to}</li>`
        )
        .join('');
      waypointsBlock.innerHTML = `
        <h4>Маршрут с попутчиками</h4>
        <ul>${list}</ul>
      `;
    } else {
      waypointsBlock.innerHTML = '<p class="muted">Пока нет добавленных точек от попутчиков.</p>';
    }

    const requestsBlock = document.createElement('div');
    requestsBlock.className = 'ride-requests';
    requestsBlock.innerHTML = '<h4>Заявки от пассажиров</h4>';

    if (!ride.requests || !ride.requests.length) {
      const p = document.createElement('p');
      p.className = 'muted';
      p.textContent = 'Заявок пока нет.';
      requestsBlock.appendChild(p);
    } else {
      ride.requests.forEach((req) => {
        const item = document.createElement('div');
        item.className = 'request-item';
        item.innerHTML = `
          <div class="request-info">
            <div><strong>${req.passengerName}</strong></div>
            <div>${req.from} → ${req.to}</div>
            <div class="request-status status-${req.status}">Статус: ${translateStatus(req.status)}</div>
          </div>
        `;

        if (req.status === 'pending') {
          const actions = document.createElement('div');
          actions.className = 'request-actions';

          const acceptBtn = document.createElement('button');
          acceptBtn.className = 'secondary-btn';
          acceptBtn.textContent = 'Принять';
          acceptBtn.addEventListener('click', async () => {
            try {
              await apiPost(`/requests/${req.id}/accept`, {});
              showNotification('Заявка принята, точка добавлена в маршрут', 'success');
              await loadDriverRides();
            } catch (e) {
              showNotification(e.message || 'Ошибка при принятии заявки', 'error');
            }
          });

          const rejectBtn = document.createElement('button');
          rejectBtn.className = 'text-btn';
          rejectBtn.textContent = 'Отклонить';
          rejectBtn.addEventListener('click', async () => {
            try {
              await apiPost(`/requests/${req.id}/reject`, {});
              showNotification('Заявка отклонена', 'info');
              await loadDriverRides();
            } catch (e) {
              showNotification(e.message || 'Ошибка при отклонении заявки', 'error');
            }
          });

          actions.appendChild(acceptBtn);
          actions.appendChild(rejectBtn);
          item.appendChild(actions);
        }

        requestsBlock.appendChild(item);
      });
    }

    if (ride.mapsUrl) {
      const mapsLink = document.createElement('a');
      mapsLink.href = ride.mapsUrl;
      mapsLink.target = '_blank';
      mapsLink.rel = 'noopener noreferrer';
      mapsLink.className = 'maps-link';
      mapsLink.textContent = 'Открыть маршрут в Яндекс.Картах';
      card.appendChild(mapsLink);
    }

    const footerActions = document.createElement('div');
    footerActions.className = 'ride-footer';

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'text-btn';
    deleteBtn.textContent = 'Удалить поездку';
    deleteBtn.addEventListener('click', async () => {
      if (!confirm('Удалить эту поездку безвозвратно?')) return;
      try {
        await apiDelete(`/rides/${ride.id}`);
        showNotification('Поездка удалена', 'info');
        await loadDriverRides();
      } catch (e) {
        showNotification(e.message || 'Не удалось удалить поездку', 'error');
      }
    });

    footerActions.appendChild(deleteBtn);
    card.appendChild(footerActions);

    card.appendChild(header);
    card.appendChild(waypointsBlock);
    card.appendChild(requestsBlock);
    driverRidesList.appendChild(card);
  });
}

function translateStatus(status) {
  switch (status) {
    case 'pending':
      return 'ожидает решения';
    case 'accepted':
      return 'принята';
    case 'rejected':
      return 'отклонена';
    default:
      return status;
  }
}

// Отрисовка поездок для пассажира
function renderPassengerRides(rides) {
  if (!rides.length) {
    passengerRidesList.innerHTML = '<p class="muted">Подходящих поездок не найдено.</p>';
    return;
  }

  passengerRidesList.innerHTML = '';
  rides.forEach((ride) => {
    const card = document.createElement('div');
    card.className = 'card ride-card';
    card.innerHTML = `
      <div class="ride-header">
        <div>
          <div class="ride-main">
            <span class="ride-from">${ride.fromText || ride.from}</span>
            <span class="arrow">→</span>
            <span class="ride-to">${ride.toText || ride.to}</span>
          </div>
          <div class="ride-time">
            Время выезда: ${new Date(ride.departureTime).toLocaleString()}
          </div>
          ${ride.extraTimeInfo ? `<div class="ride-extra-time">${ride.extraTimeInfo}</div>` : ''}
        </div>
        <div class="ride-driver">Водитель: <strong>${ride.driverName}</strong></div>
      </div>
    `;

    const footer = document.createElement('div');
    footer.className = 'ride-footer';

    const button = document.createElement('button');
    button.className = 'primary-btn small';
    button.textContent = 'Поехать с этим водителем';
    button.addEventListener('click', () => handlePassengerRequest(ride.id));

    footer.appendChild(button);
    card.appendChild(footer);

    if (ride.mapsUrl) {
      const mapsLink = document.createElement('a');
      mapsLink.href = ride.mapsUrl;
      mapsLink.target = '_blank';
      mapsLink.rel = 'noopener noreferrer';
      mapsLink.className = 'maps-link';
      mapsLink.textContent = 'Маршрут в Яндекс.Картах';
      card.appendChild(mapsLink);
    }

    passengerRidesList.appendChild(card);
  });
}

// Обработка создания поездки водителем
driverForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!currentUser || currentUser.role !== 'driver') {
    showNotification('Для создания поездки войдите как водитель', 'error');
    return;
  }

  const from = driverFromInput.value.trim();
  const to = driverToInput.value.trim();
  const departureTime = driverTimeInput.value;

  if (!from || !to || !departureTime) {
    showNotification('Заполните все поля формы', 'error');
    return;
  }

  const geometry =
    coordsState.driverFrom && coordsState.driverTo
      ? {
          fromLat: coordsState.driverFrom.lat,
          fromLng: coordsState.driverFrom.lng,
          toLat: coordsState.driverTo.lat,
          toLng: coordsState.driverTo.lng
        }
      : {};

  try {
    await apiPost('/rides', { from, to, departureTime, ...geometry });
    showNotification('Поездка создана', 'success');
    driverFromInput.value = '';
    driverToInput.value = '';
    driverTimeInput.value = '';
    await loadDriverRides();
  } catch (e) {
    showNotification(e.message || 'Ошибка при создании поездки', 'error');
  }
});

// Поиск поездок пассажиром
passengerSearchForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  await loadPassengerRides();
});

async function loadDriverRides() {
  if (!currentUser || currentUser.role !== 'driver') {
    return;
  }
  try {
    const rides = await apiGet('/rides');
    renderDriverRides(rides);
  } catch (e) {
    showNotification(
      `Не удалось загрузить список поездок: ${e.message || 'ошибка запроса'}`,
      'error'
    );
  }
}

// Загрузка заявок пассажира
async function loadPassengerRequests() {
  console.log('=== НАЧАЛО ЗАГРУЗКИ ЗАЯВОК ===');
  console.log('Текущий пользователь:', currentUser);
  console.log('Загрузка заявок для пользователя:', currentUser?.name);
  try {
    const requests = await apiGet('/requests/passenger');
    console.log('Получены заявки:', requests);
    renderPassengerRequests(requests);
  } catch (e) {
    console.error('Ошибка загрузки заявок:', e);
  }
  console.log('=== КОНЕЦ ЗАГРУЗКИ ЗАЯВОК ===');
}

// Отображение заявок пассажира
function renderPassengerRequests(requests) {
  console.log('Рендеринг заявок:', requests.length, 'текущая роль:', currentUser?.role);
  
  // Определяем, какой контейнер использовать в зависимости от текущей роли
  const containerId = currentUser.role === 'driver' ? 'driverRequestsList' : 'passengerRequests';
  const container = document.getElementById(containerId);
  
  console.log('Контейнер для заявок:', containerId, container);
  
  if (!container) {
    console.error('Контейнер для заявок не найден:', containerId);
    return;
  }

  if (!requests.length) {
    container.innerHTML = '<p class="muted">У вас пока нет заявок на поездки</p>';
    return;
  }

  container.innerHTML = '<h3>Ваши заявки</h3>';
  
  requests.forEach(request => {
    const card = document.createElement('div');
    card.className = 'card request-card';
    
    const statusClass = request.status === 'accepted' ? 'success' : 
                        request.status === 'rejected' ? 'error' : 'info';
    const statusText = request.status === 'accepted' ? 'Принята' : 
                       request.status === 'rejected' ? 'Отклонена' : 'Ожидает';
    
    card.innerHTML = `
      <div class="request-header">
        <div>
          <div class="request-route">
            <span class="request-from">${request.from}</span>
            <span class="arrow">→</span>
            <span class="request-to">${request.to}</span>
          </div>
          <div class="request-time">
            Время выезда: ${new Date(request.departureTime).toLocaleString()}
          </div>
          <div class="request-status ${statusClass}">
            Статус: ${statusText}
          </div>
        </div>
        <div class="request-driver">
          Водитель: <strong>${request.driverName}</strong>
        </div>
      </div>
      <div class="request-footer">
        <small>Заявка создана: ${new Date(request.created_at).toLocaleString()}</small>
        <button class="primary-btn small" onclick="showRequestOnMap('${request.from}', '${request.to}', '${request.rideFrom}', '${request.rideTo}')">
          Показать на карте
        </button>
      </div>
    `;
    
    container.appendChild(card);
  });
  
  console.log('Заявки отрендерены в контейнер:', containerId);
}

// Показать маршрут заявки на карте (полная версия как у водителя)
function showRequestOnMap(from, to, driverFrom, driverTo) {
  console.log('Показываем полный маршрут на карте:', from, '→', to, 'Водитель:', driverFrom, '→', driverTo);
  
  // Устанавливаем точки пассажира
  passengerFromInput.value = from;
  passengerToInput.value = to;
  
  // Если есть точки водителя, устанавливаем их тоже
  if (driverFrom && driverTo) {
    // Создаем временные поля для водителя или используем существующие
    if (!driverFromInput.value) driverFromInput.value = driverFrom;
    if (!driverToInput.value) driverToInput.value = driverTo;
    
    // Запускаем геокодинг для всех точек
    setTimeout(() => {
      const events = ['change', 'blur'];
      events.forEach(eventType => {
        const fromEvent = new Event(eventType);
        const toEvent = new Event(eventType);
        const driverFromEvent = new Event(eventType);
        const driverToEvent = new Event(eventType);
        
        passengerFromInput.dispatchEvent(fromEvent);
        passengerToInput.dispatchEvent(toEvent);
        driverFromInput.dispatchEvent(driverFromEvent);
        driverToInput.dispatchEvent(driverToEvent);
      });
    }, 100);
  } else {
    // Только точки пассажира
    setTimeout(() => {
      const fromEvent = new Event('change');
      const toEvent = new Event('change');
      passengerFromInput.dispatchEvent(fromEvent);
      passengerToInput.dispatchEvent(toEvent);
    }, 100);
  }
  
  showNotification('Полный маршрут отображен на карте', 'info');
}

async function loadPassengerRides() {
  const from = passengerFromInput.value.trim();
  const to = passengerToInput.value.trim();

  // Ждем немного, чтобы геокодинг успел сработать
  await new Promise(resolve => setTimeout(resolve, 500));

  const params = new URLSearchParams();
  if (from) params.append('from', from);
  if (to) params.append('to', to);

  console.log('coordsState.passengerFrom:', coordsState.passengerFrom);
  console.log('coordsState.passengerTo:', coordsState.passengerTo);

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
    const rides = await apiGet(`/rides/search${query}`);
    console.log('Найдено поездок:', rides.length);
    renderPassengerRides(rides);
    
    if (rides.length === 0) {
      if (from || to) {
        showNotification('Поездок по заданному направлению не найдено. Попробуйте другие параметры.', 'info');
      } else {
        showNotification('Нет доступных поездок. Попробуйте позже или создайте поездку как водитель.', 'info');
      }
    } else {
      const searchParams = (from || to) ? `по запросу "${from || ''} → ${to || ''}"` : 'все доступные';
      showNotification(`Найдено поездок (${searchParams}): ${rides.length}`, 'success');
    }
  } catch (e) {
    console.error('Ошибка поиска поездок:', e);
    showNotification(e.message || 'Ошибка при поиске поездок', 'error');
  }
}

// Отправка заявки от пассажира
async function handlePassengerRequest(rideId) {
  const passengerName = passengerNameInput.value.trim();
  const from = passengerFromInput.value.trim();
  const to = passengerToInput.value.trim();

  console.log('Попытка отправки заявки:', { rideId, passengerName, from, to });

  if (!passengerName || !from || !to) {
    showNotification('Введите ваше имя и откуда/куда вы поедете', 'error');
    return;
  }

  try {
    console.log('Отправляем POST запрос на сервер...');
    const result = await apiPost(`/rides/${rideId}/requests`, {
      passengerName,
      from,
      to
    });
    console.log('Ответ сервера:', result);
    showNotification('Заявка отправлена водителю', 'success');
    loadPassengerRequests(); // Обновляем список заявок после отправки
    loadPassengerRides(); // Обновляем список поездок, чтобы убрать поездку с заявкой
  } catch (e) {
    console.error('Ошибка отправки заявки:', e);
    showNotification(e.message || 'Ошибка при отправке заявки', 'error');
  }
}

// -------------------
//   Карта (Яндекс)
// -------------------

function setPointFromMap(target, lat, lng, displayText) {
  if (!ymap) return;
  const coords = [lat, lng];

  if (!mapMarkers[target]) {
    mapMarkers[target] = new ymaps.Placemark(coords);
    ymap.geoObjects.add(mapMarkers[target]);
  } else {
    mapMarkers[target].geometry.setCoordinates(coords);
  }

  coordsState[target] = { lat, lng };

  // Обновляем соответствующее поле ввода
  switch (target) {
    case 'driverFrom':
      driverFromInput.value = displayText;
      updateDriverRoute();
      break;
    case 'driverTo':
      driverToInput.value = displayText;
      updateDriverRoute();
      break;
    case 'passengerFrom':
      passengerFromInput.value = displayText;
      updatePassengerRoute();
      break;
    case 'passengerTo':
      passengerToInput.value = displayText;
      updatePassengerRoute();
      break;
  }

  ymap.setCenter([lat, lng], 13);
}

// Функция для построения маршрута водителя с объединением дублирующихся точек
function updateDriverRoute() {
  if (!ymap) return;
  const from = coordsState.driverFrom;
  const to = coordsState.driverTo;
  if (!from || !to) return;

  if (driverRoute) {
    ymap.geoObjects.remove(driverRoute);
  }

  // Собираем все точки для маршрута с объединением дубликатов
  const referencePoints = [[from.lat, from.lng]];
  const uniquePoints = new Set();
  uniquePoints.add(`${from.lat},${from.lng}`);
  
  // Добавляем точки пассажира, если они есть и не дублируются
  if (coordsState.passengerFrom && coordsState.passengerTo) {
    const passengerFromKey = `${coordsState.passengerFrom.lat},${coordsState.passengerFrom.lng}`;
    const passengerToKey = `${coordsState.passengerTo.lat},${coordsState.passengerTo.lng}`;
    
    if (!uniquePoints.has(passengerFromKey)) {
      referencePoints.push([coordsState.passengerFrom.lat, coordsState.passengerFrom.lng]);
      uniquePoints.add(passengerFromKey);
    }
    
    if (!uniquePoints.has(passengerToKey)) {
      referencePoints.push([coordsState.passengerTo.lat, coordsState.passengerTo.lng]);
      uniquePoints.add(passengerToKey);
    }
  }
  
  const toKey = `${to.lat},${to.lng}`;
  if (!uniquePoints.has(toKey)) {
    referencePoints.push([to.lat, to.lng]);
  }

  console.log('Маршрут водителя с объединенными точками:', referencePoints);

  driverRoute = new ymaps.multiRouter.MultiRoute(
    {
      referencePoints: referencePoints,
      params: { results: 1 }
    },
    {
      routeStrokeColor: '#38bdf8',
      routeStrokeWidth: 5
    }
  );

  ymap.geoObjects.add(driverRoute);
}

// Функция для построения маршрута пассажира
function updatePassengerRoute() {
  if (!ymap) return;
  const from = coordsState.passengerFrom;
  const to = coordsState.passengerTo;
  if (!from || !to) return;

  if (window.passengerRoute) {
    ymap.geoObjects.remove(window.passengerRoute);
  }

  window.passengerRoute = new ymaps.multiRouter.MultiRoute(
    {
      referencePoints: [
        [from.lat, from.lng],
        [to.lat, to.lng]
      ],
      params: { results: 1 }
    },
    {
      routeStrokeColor: '#4ade80',
      routeStrokeWidth: 3,
      routeStrokeStyle: 'dash'
    }
  );

  ymap.geoObjects.add(window.passengerRoute);
}

function initYandexMap() {
  const mapElement = document.getElementById('map');
  if (!mapElement) {
    console.error('Элемент карты не найден');
    return;
  }
  
  if (!window.ymaps) {
    console.error('Яндекс.Карты не загружены');
    return;
  }

  try {
    ymap = new ymaps.Map('map', {
      center: [55.7963, 49.1088],
      zoom: 10,
      controls: ['zoomControl']
    });

    // Инициализация полей ввода адресов с улучшенным автокомплитом
    const addressInputs = [
      { id: 'driverFrom', target: 'driverFrom' },
      { id: 'driverTo', target: 'driverTo' },
      { id: 'passengerFrom', target: 'passengerFrom' },
      { id: 'passengerTo', target: 'passengerTo' }
    ];

    addressInputs.forEach(({ id, target }) => {
      const input = document.getElementById(id);
      if (!input) return;

      input.addEventListener('focus', () => {
        activeMapTarget = target;
      });

      // Создаем улучшенный автокомплит
      if (ymaps.SuggestView) {
        try {
          const suggestView = new ymaps.SuggestView(id, {
            results: 5
          });
          
          suggestView.events.add('select', function (e) {
            const selectedItem = e.get('item');
            if (selectedItem) {
              input.value = selectedItem.displayName;
              console.log('Выбран адрес из автокомплита:', selectedItem.displayName);
              geocodeAndMark();
            }
          });
          
          console.log('Автокомплит инициализирован для поля:', id);
        } catch (err) {
          console.warn('SuggestView недоступен для поля', id, err.message);
          // Запасной вариант - простой геокодинг при вводе
          setupFallbackSuggest(input, target);
        }
      } else {
        console.warn('SuggestView недоступен, используем запасной вариант');
        // Запасной вариант если SuggestView недоступен
        setupFallbackSuggest(input, target);
      }

      const geocodeAndMark = () => {
        const query = input.value.trim();
        if (!query) return;

        console.log(`Геокодинг для ${target}: "${query}"`);
        ymaps.geocode(query, { results: 1 }).then((res) => {
          const obj = res.geoObjects.get(0);
          if (!obj) {
            console.log(`Не найдено геокодирование для: "${query}"`);
            return;
          }
          const coords = obj.geometry.getCoordinates();
          const addressLine = obj.getAddressLine();
          console.log(`Найдены координаты для ${target}: [${coords[0]}, ${coords[1]}] - "${addressLine}"`);
          setPointFromMap(target, coords[0], coords[1], addressLine);
        }).catch((err) => {
          console.error(`Ошибка геокодинга для "${query}":`, err);
        });
      };

      input.addEventListener('change', geocodeAndMark);
      input.addEventListener('blur', geocodeAndMark);
    });
    
    console.log('Карта успешно инициализирована');
  } catch (error) {
    console.error('Ошибка инициализации карты:', error);
  }
}

// Глобальные переменные для модального окна
let addressMap = null;
let addressPlacemark = null;
let selectedAddressData = null;
let currentAddressTarget = null;

// Открыть модальное окно для выбора адреса
function openAddressModal(target) {
  currentAddressTarget = target;
  const modal = document.getElementById('addressModal');
  modal.classList.remove('hidden');
  
  // Инициализируем карту если еще не инициализирована
  if (!addressMap) {
    setTimeout(() => {
      initAddressMap();
    }, 100);
  } else {
    // Центрируем карту на последней позиции или на Казани
    const center = selectedAddressData ? 
      [selectedAddressData.lat, selectedAddressData.lng] : 
      [55.7963, 49.1088];
    addressMap.setCenter(center, 12);
  }
}

// Закрыть модальное окно
function closeAddressModal() {
  const modal = document.getElementById('addressModal');
  modal.classList.add('hidden');
  selectedAddressData = null;
  updateAddressInfo();
}

// Инициализация карты для выбора адреса
function initAddressMap() {
  const mapElement = document.getElementById('addressMap');
  if (!mapElement || !window.ymaps) return;

  addressMap = new ymaps.Map('addressMap', {
    center: [55.7963, 49.1088],
    zoom: 10,
    controls: ['zoomControl', 'searchControl', 'geolocationControl']
  });

  // Добавляем обработчик клика по карте
  addressMap.events.add('click', function (e) {
    const coords = e.get('coords');
    setAddressFromCoords(coords[0], coords[1]);
  });

  // Добавляем обработчик для поиска
  addressMap.controls.get('searchControl').events.add('resultshow', function (e) {
    const result = e.get('result');
    const coords = result.geometry.getCoordinates();
    const address = result.properties.get('name');
    
    selectedAddressData = {
      lat: coords[0],
      lng: coords[1],
      address: address
    };
    
    updateAddressInfo();
    updatePlacemark();
  });

  console.log('Карта для выбора адреса инициализирована');
}

// Установить адрес из координат
function setAddressFromCoords(lat, lng) {
  ymaps.geocode([lat, lng]).then(function (res) {
    const firstGeoObject = res.geoObjects.get(0);
    const address = firstGeoObject ? 
      firstGeoObject.getAddressLine() : 
      `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    
    selectedAddressData = {
      lat: lat,
      lng: lng,
      address: address
    };
    
    updateAddressInfo();
    updatePlacemark();
  });
}

// Обновить информацию об адресе
function updateAddressInfo() {
  const addressEl = document.getElementById('selectedAddress');
  const coordsEl = document.getElementById('selectedCoords');
  
  if (selectedAddressData) {
    addressEl.textContent = selectedAddressData.address;
    coordsEl.textContent = `${selectedAddressData.lat.toFixed(6)}, ${selectedAddressData.lng.toFixed(6)}`;
  } else {
    addressEl.textContent = '-';
    coordsEl.textContent = '-';
  }
}

// Обновить или создать метку на карте
function updatePlacemark() {
  if (!addressMap || !selectedAddressData) return;
  
  if (addressPlacemark) {
    addressPlacemark.geometry.setCoordinates([selectedAddressData.lat, selectedAddressData.lng]);
  } else {
    addressPlacemark = new ymaps.Placemark(
      [selectedAddressData.lat, selectedAddressData.lng],
      {},
      { preset: 'islands#redDotIcon' }
    );
    addressMap.geoObjects.add(addressPlacemark);
  }
}

// Подтвердить выбор адреса
function confirmAddressSelection() {
  if (!selectedAddressData || !currentAddressTarget) {
    showNotification('Сначала выберите адрес на карте', 'error');
    return;
  }
  
  // Устанавливаем значения в соответствующее поле
  const input = document.getElementById(currentAddressTarget);
  if (input) {
    input.value = selectedAddressData.address;
    
    // Обновляем координаты и карту
    setPointFromMap(currentAddressTarget, selectedAddressData.lat, selectedAddressData.lng, selectedAddressData.address);
    
    console.log(`Адрес выбран для ${currentAddressTarget}:`, selectedAddressData);
    showNotification('Адрес успешно выбран', 'success');
  }
  
  closeAddressModal();
}

// Запасной вариант автокомплита с визуальным списком
function setupFallbackSuggest(input, target) {
  let suggestTimeout;
  let suggestContainer = null;
  
  // Создаем контейнер для подсказок
  const createSuggestContainer = () => {
    if (suggestContainer) return suggestContainer;
    
    suggestContainer = document.createElement('div');
    suggestContainer.className = 'suggest-container';
    suggestContainer.style.cssText = `
      position: absolute;
      background: white;
      border: 1px solid #ccc;
      border-top: none;
      max-height: 200px;
      overflow-y: auto;
      z-index: 1000;
      width: 100%;
      box-sizing: border-box;
    `;
    
    // Вставляем после поля ввода
    input.parentNode.style.position = 'relative';
    input.parentNode.appendChild(suggestContainer);
    
    // Закрываем при клике вне
    document.addEventListener('click', (e) => {
      if (!input.contains(e.target) && !suggestContainer.contains(e.target)) {
        suggestContainer.style.display = 'none';
      }
    });
    
    return suggestContainer;
  };
  
  input.addEventListener('input', function(e) {
    clearTimeout(suggestTimeout);
    const query = e.target.value.trim();
    
    if (query.length < 3) {
      if (suggestContainer) suggestContainer.style.display = 'none';
      return;
    }
    
    suggestTimeout = setTimeout(() => {
      console.log(`Ищем подсказки для ${target}: "${query}"`);
      
      // Используем геокодинг для подсказок
      ymaps.geocode(query, { results: 5 }).then((res) => {
        const suggestions = res.geoObjects.toArray();
        const container = createSuggestContainer();
        
        // Очищаем старые подсказки
        container.innerHTML = '';
        
        if (suggestions.length === 0) {
          container.style.display = 'none';
          return;
        }
        
        // Добавляем новые подсказки
        suggestions.forEach((item, index) => {
          const address = item.getAddressLine();
          const div = document.createElement('div');
          div.className = 'suggest-item';
          div.style.cssText = `
            padding: 8px 12px;
            cursor: pointer;
            border-bottom: 1px solid #eee;
          `;
          div.textContent = address;
          
          div.addEventListener('click', () => {
            input.value = address;
            container.style.display = 'none';
            console.log(`Выбран адрес из подсказок: ${address}`);
            
            // Запускаем геокодинг
            const event = new Event('change');
            input.dispatchEvent(event);
          });
          
          div.addEventListener('mouseenter', () => {
            div.style.backgroundColor = '#f0f0f0';
          });
          
          div.addEventListener('mouseleave', () => {
            div.style.backgroundColor = 'white';
          });
          
          container.appendChild(div);
        });
        
        container.style.display = 'block';
        console.log(`Показано ${suggestions.length} подсказок для ${target}`);
        
      }).catch(err => {
        console.log('Ошибка получения подсказок:', err);
        if (suggestContainer) suggestContainer.style.display = 'none';
      });
    }, 300);
  });
}

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
  setAuthMode('login');
  updateUserPanel();
  
  if (window.ymaps) {
    ymaps.ready(initYandexMap);
  } else {
    window.addEventListener('load', () => {
      if (window.ymaps) {
        ymaps.ready(initYandexMap);
      }
    });
  }
});


