/* ═══════════════════════════════════════════════════════════
   Nimbus Weather Dashboard — script.js
   Uses OpenWeatherMap free-tier APIs:
     • Current Weather  /data/2.5/weather
     • 5-Day Forecast   /data/2.5/forecast
     • Air Pollution    /data/2.5/air_pollution
   ═══════════════════════════════════════════════════════════ */

/* ── CONFIG ─────────────────────────────────────────────── */
// Replace with your own key from https://openweathermap.org/api
const API_KEY = '39d7641d07ebd0b7b58056e0c6e13476';
const BASE    = 'https://api.openweathermap.org';

/* ── STATE ───────────────────────────────────────────────── */
let currentUnit   = 'metric';   // 'metric' | 'imperial'
let currentCoords = null;       // { lat, lon }
let recentCities  = JSON.parse(localStorage.getItem('nimbus_recent') || '[]');

/* ── DOM REFS ────────────────────────────────────────────── */
const $ = id => document.getElementById(id);

const searchInput    = $('searchInput');
const searchBtn      = $('searchBtn');
const locationBtn    = $('locationBtn');
const refreshBtn     = $('refreshBtn');
const unitToggle     = $('unitToggle');
const themeToggle    = $('themeToggle');
const iconSun        = $('iconSun');
const iconMoon       = $('iconMoon');
const loadingOverlay = $('loadingOverlay');
const errorMsg       = $('errorMsg');
const errorText      = $('errorText');
const emptyState     = $('emptyState');
const weatherContent = $('weatherContent');
const recentBar      = $('recentBar');
const recentList     = $('recentList');

/* ── THEME ───────────────────────────────────────────────── */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  iconSun.style.display  = theme === 'light' ? 'block' : 'none';
  iconMoon.style.display = theme === 'dark'  ? 'block' : 'none';
  localStorage.setItem('nimbus_theme', theme);
}

// Init theme from storage
applyTheme(localStorage.getItem('nimbus_theme') || 'dark');

themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
});

/* ── UNIT TOGGLE ─────────────────────────────────────────── */
unitToggle.addEventListener('click', () => {
  currentUnit = currentUnit === 'metric' ? 'imperial' : 'metric';
  unitToggle.textContent = currentUnit === 'metric' ? '°C' : '°F';
  if (currentCoords) fetchWeather(currentCoords.lat, currentCoords.lon);
});

/* ── SEARCH ──────────────────────────────────────────────── */
searchBtn.addEventListener('click', handleSearch);
searchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') handleSearch();
});

function handleSearch() {
  const city = searchInput.value.trim();
  if (!city) return;
  fetchByCity(city);
}

async function fetchByCity(city) {
  showLoading(true);
  clearError();
  try {
    const res  = await fetch(`${BASE}/data/2.5/weather?q=${encodeURIComponent(city)}&units=${currentUnit}&appid=${API_KEY}`);
    const data = await res.json();
    if (data.cod !== 200) throw new Error(data.message || 'City not found.');
    currentCoords = { lat: data.coord.lat, lon: data.coord.lon };
    addRecent(city);
    await loadAllData(data.coord.lat, data.coord.lon);
  } catch (err) {
    showError(err.message);
  } finally {
    showLoading(false);
  }
}

/* ── GEOLOCATION ─────────────────────────────────────────── */
locationBtn.addEventListener('click', () => {
  if (!navigator.geolocation) {
    showError('Geolocation is not supported by your browser.');
    return;
  }
  showLoading(true);
  clearError();
  navigator.geolocation.getCurrentPosition(
    pos => {
      currentCoords = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      loadAllData(currentCoords.lat, currentCoords.lon);
    },
    err => {
      showLoading(false);
      showError('Location access denied. Please search manually.');
    }
  );
});

/* ── REFRESH ─────────────────────────────────────────────── */
refreshBtn.addEventListener('click', () => {
  if (currentCoords) fetchWeather(currentCoords.lat, currentCoords.lon);
});

/* ── CORE FETCH ──────────────────────────────────────────── */
async function loadAllData(lat, lon) {
  showLoading(true);
  clearError();
  try {
    await Promise.all([
      fetchWeather(lat, lon),
      fetchForecast(lat, lon),
      fetchAqi(lat, lon),
    ]);
    showWeatherContent();
    refreshBtn.disabled = false;
  } catch (err) {
    showError(err.message);
  } finally {
    showLoading(false);
  }
}

/* ── CURRENT WEATHER ─────────────────────────────────────── */
async function fetchWeather(lat, lon) {
  const res  = await fetch(`${BASE}/data/2.5/weather?lat=${lat}&lon=${lon}&units=${currentUnit}&appid=${API_KEY}`);
  const data = await res.json();
  if (data.cod !== 200) throw new Error(data.message || 'Failed to fetch weather.');

  const unitSymbol = currentUnit === 'metric' ? '°C' : '°F';
  const speedUnit  = currentUnit === 'metric' ? 'km/h' : 'mph';
  const windSpeed  = currentUnit === 'metric'
    ? (data.wind.speed * 3.6).toFixed(1)
    : data.wind.speed.toFixed(1);

  $('cityName').textContent     = data.name;
  $('countryName').textContent  = data.sys.country;
  $('currentTemp').textContent  = Math.round(data.main.temp);
  $('heroUnit').textContent     = unitSymbol;
  $('weatherDesc').textContent  = data.weather[0].description;
  $('feelsLike').textContent    = `${Math.round(data.main.feels_like)}${unitSymbol}`;
  $('tempRange').textContent    = `↑${Math.round(data.main.temp_max)}° ↓${Math.round(data.main.temp_min)}°`;
  $('lastUpdated').textContent  = `Updated ${formatTime(data.dt, data.timezone)}`;

  // Weather icon
  const iconCode = data.weather[0].icon;
  $('weatherIcon').src = `https://openweathermap.org/img/wn/${iconCode}@2x.png`;
  $('weatherIcon').alt = data.weather[0].description;

  // Details
  $('humidity').textContent   = `${data.main.humidity}%`;
  $('humidityBar').style.width = `${data.main.humidity}%`;
  $('windSpeed').textContent  = `${windSpeed} ${speedUnit}`;
  $('windDir').textContent    = `Direction: ${degToCompass(data.wind.deg)}`;
  $('pressure').textContent   = data.main.pressure;
  $('visibility').textContent = (data.visibility / 1000).toFixed(1);

  // Sunrise / Sunset
  $('sunrise').textContent = formatTime(data.sys.sunrise, data.timezone);
  $('sunset').textContent  = `Sunset ${formatTime(data.sys.sunset, data.timezone)}`;
}

/* ── FORECAST ────────────────────────────────────────────── */
async function fetchForecast(lat, lon) {
  const res  = await fetch(`${BASE}/data/2.5/forecast?lat=${lat}&lon=${lon}&units=${currentUnit}&appid=${API_KEY}`);
  const data = await res.json();
  if (data.cod !== '200') throw new Error(data.message || 'Failed to fetch forecast.');

  // One reading per day at ~noon
  const daily = {};
  data.list.forEach(item => {
    const d    = new Date(item.dt * 1000);
    const key  = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const hour = d.getHours();
    if (!daily[key] || Math.abs(hour - 12) < Math.abs(new Date(daily[key].dt * 1000).getHours() - 12)) {
      daily[key] = item;
    }
  });

  const days  = Object.values(daily).slice(0, 5);
  const unitSymbol = currentUnit === 'metric' ? '°C' : '°F';
  const container  = $('forecastCards');
  container.innerHTML = '';

  days.forEach(item => {
    const d    = new Date(item.dt * 1000);
    const day  = d.toLocaleDateString('en-US', { weekday: 'short' });
    const icon = item.weather[0].icon;
    const desc = item.weather[0].description;
    const max  = Math.round(item.main.temp_max);
    const min  = Math.round(item.main.temp_min);

    const card = document.createElement('div');
    card.className = 'forecast-card';
    card.innerHTML = `
      <span class="forecast-day">${day}</span>
      <img class="forecast-icon" src="https://openweathermap.org/img/wn/${icon}@2x.png" alt="${desc}" />
      <span class="forecast-desc">${desc}</span>
      <div class="forecast-temps">
        <span class="forecast-max">${max}°</span>
        <span class="forecast-min">${min}°</span>
      </div>
    `;
    container.appendChild(card);
  });
}

/* ── AIR QUALITY ─────────────────────────────────────────── */
async function fetchAqi(lat, lon) {
  const res  = await fetch(`${BASE}/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${API_KEY}`);
  const data = await res.json();

  if (!data.list || !data.list.length) return;

  const item       = data.list[0];
  const aqi        = item.main.aqi;   // 1–5
  const components = item.components;

  const aqiLabels = ['', 'Good', 'Fair', 'Moderate', 'Poor', 'Very Poor'];
  const aqiClasses = ['', 'aqi-good', 'aqi-fair', 'aqi-moderate', 'aqi-poor', 'aqi-vpoor'];
  const label      = aqiLabels[aqi]  || '—';
  const cls        = aqiClasses[aqi] || '';

  // Small card
  $('aqiValue').textContent = aqi;
  $('aqiStatus').textContent = label;
  $('aqiStatus').className = `detail-sub aqi-status ${cls}`;

  // Extended section
  const section = $('aqiSection');
  section.style.display = 'block';

  $('aqiFull').textContent  = aqi;
  $('aqiTag').textContent   = label;
  $('aqiTag').className     = `aqi-item-tag ${cls}`;
  $('pm25').textContent     = components.pm2_5?.toFixed(1) ?? '—';
  $('pm10').textContent     = components.pm10?.toFixed(1)  ?? '—';
  $('no2').textContent      = components.no2?.toFixed(1)   ?? '—';

  // Bar position: aqi is 1–5, map to 10%–90% so marker stays on track
  const pct = ((aqi - 1) / 4) * 80 + 10;
  $('aqiBar').style.left = `${pct}%`;
}

/* ── UI HELPERS ──────────────────────────────────────────── */
function showLoading(state) {
  loadingOverlay.classList.toggle('active', state);
}

function showError(msg) {
  errorText.textContent = msg;
  errorMsg.style.display = 'flex';
}

function clearError() {
  errorMsg.style.display = 'none';
}

function showWeatherContent() {
  emptyState.style.display    = 'none';
  weatherContent.style.display = 'block';
  renderRecent();
}

/* ── RECENT SEARCHES ─────────────────────────────────────── */
function addRecent(city) {
  const normalised = city.trim();
  recentCities = recentCities.filter(c => c.toLowerCase() !== normalised.toLowerCase());
  recentCities.unshift(normalised);
  if (recentCities.length > 5) recentCities = recentCities.slice(0, 5);
  localStorage.setItem('nimbus_recent', JSON.stringify(recentCities));
}

function renderRecent() {
  if (!recentCities.length) {
    recentBar.style.display = 'none';
    return;
  }
  recentBar.style.display = 'flex';
  recentList.innerHTML = '';
  recentCities.forEach(city => {
    const pill = document.createElement('button');
    pill.className   = 'recent-pill';
    pill.textContent = city;
    pill.addEventListener('click', () => {
      searchInput.value = city;
      fetchByCity(city);
    });
    recentList.appendChild(pill);
  });
}

/* ── UTILS ───────────────────────────────────────────────── */
/**
 * Format a Unix timestamp + timezone offset (seconds) to local HH:MM
 */
function formatTime(unixTs, timezoneOffset) {
  // OWM timezone offset is in seconds from UTC
  const utcMs  = unixTs * 1000;
  const localMs = utcMs + timezoneOffset * 1000;
  const d      = new Date(localMs);
  // d is relative to epoch in UTC, so read UTC hours/minutes
  const h      = d.getUTCHours().toString().padStart(2, '0');
  const m      = d.getUTCMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Convert wind degrees to compass direction
 */
function degToCompass(deg) {
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

/* ── INIT ────────────────────────────────────────────────── */
// Render any stored recent searches on load
renderRecent();
