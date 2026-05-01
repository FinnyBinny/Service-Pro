// ── Config ──────────────────────────────────────────────────────────────────
const CONFIG = {
  HQ_ADDRESS: 'Williamston, MI 48895',
  MIN_CHARGE: 45,
  LABOR_RATE: 0.15,
  SERVICES: {
    mowing:      { label: 'Lawn Mowing',         rate: 50,  perAcre: true  },
    edging:      { label: 'Edging',              rate: 15,  perAcre: true  },
    fertilizing: { label: 'Fertilizing',         rate: 55,  perAcre: true  },
    cleanup:     { label: 'Seasonal Cleanup',    rate: 80,  perAcre: true  },
    mulching:    { label: 'Mulching & Bed Care', rate: 120, perAcre: true  },
    hedges:      { label: 'Hedge Trimming',      rate: 45,  perAcre: false },
    leaves:      { label: 'Leaf Removal',        rate: 70,  perAcre: true  },
  },
  DIFFICULTY: {
    flat:     { label: 'Flat / Open',         multiplier: 1.0  },
    moderate: { label: 'Moderate Obstacles',  multiplier: 1.3  },
    complex:  { label: 'Complex / Hilly',     multiplier: 1.65 },
  },
  POLYGON_COLORS: ['#D4A017','#1A3A8F','#C0392B','#9B1060','#D4520A','#2B57D4'],
  AREA_LABELS: ['Front Yard','Back Yard','Side Yard','Driveway Strip','Other Area','Area 6'],
};

// ── State ────────────────────────────────────────────────────────────────────
let map, drawingManager, geocoder, distanceService;
let polygons    = [];   // { id, polygon, acres, label, color }
let polyCounter = 0;
let currentMiles    = 0;
let geocodedAddress = null;
let mapReady = false;

// ── Maps Callback ─────────────────────────────────────────────────────────────
window.initMap = function () {
  mapReady = true;
  geocoder        = new google.maps.Geocoder();
  distanceService = new google.maps.DistanceMatrixService();

  map = new google.maps.Map(document.getElementById('map-container'), {
    center: { lat: 42.6845, lng: -84.3985 }, // Williamston, MI
    zoom: 12,
    mapTypeId: google.maps.MapTypeId.HYBRID,
    zoomControl: true,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
    styles: [
      { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#1a2a4a' }] },
    ],
  });

  drawingManager = new google.maps.drawing.DrawingManager({
    drawingMode: null,
    drawingControl: false,
  });
  drawingManager.setMap(map);

  google.maps.event.addListener(drawingManager, 'polygoncomplete', onPolygonComplete);

  // Wire up controls
  document.getElementById('btn-find-property').addEventListener('click', geocodeAddress);
  document.getElementById('address-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') geocodeAddress();
  });
  document.getElementById('btn-draw').addEventListener('click', startDrawing);
  document.getElementById('btn-clear').addEventListener('click', clearAllPolygons);

  // Difficulty cards
  document.querySelectorAll('.difficulty-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.difficulty-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      card.querySelector('input[type="radio"]').checked = true;
      updateQuote();
    });
  });

  // Service checkboxes
  document.querySelectorAll('.service-check-item input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', updateQuote);
  });

  document.querySelector('.map-placeholder')?.classList.add('hidden');
};

// ── Geocode ───────────────────────────────────────────────────────────────────
function geocodeAddress() {
  const input = document.getElementById('address-input').value.trim();
  if (!input)    { showCalcError('Please enter an address first.'); return; }
  if (!mapReady) { showCalcError('Map is still loading, please wait.'); return; }
  hideCalcError();

  const btn = document.getElementById('btn-find-property');
  btn.textContent = 'Searching…';
  btn.disabled = true;

  geocoder.geocode({ address: input }, (results, status) => {
    btn.textContent = 'Find Property';
    btn.disabled = false;

    if (status !== 'OK' || !results[0]) {
      showCalcError('Address not found. Try a more specific address.');
      return;
    }

    geocodedAddress = results[0].formatted_address;
    const loc = results[0].geometry.location;

    map.setCenter(loc);
    map.setZoom(19);
    map.setMapTypeId(google.maps.MapTypeId.HYBRID);

    if (window._addrMarker) window._addrMarker.setMap(null);
    window._addrMarker = new google.maps.Marker({
      position: loc,
      map,
      title: geocodedAddress,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 8,
        fillColor: '#C0392B',
        fillOpacity: 1,
        strokeColor: '#F5ECD7',
        strokeWeight: 2,
      },
    });

    document.querySelector('.map-placeholder')?.classList.add('hidden');
    getDistance(geocodedAddress);
  });
}

// ── Distance Matrix ───────────────────────────────────────────────────────────
function getDistance(dest) {
  distanceService.getDistanceMatrix(
    {
      origins: [CONFIG.HQ_ADDRESS],
      destinations: [dest],
      travelMode: google.maps.TravelMode.DRIVING,
      unitSystem: google.maps.UnitSystem.IMPERIAL,
    },
    (resp, status) => {
      if (status === 'OK') {
        const el = resp.rows[0]?.elements[0];
        if (el && el.status === 'OK') currentMiles = el.distance.value / 1609.34;
      }
      updateQuote();
    }
  );
}

// ── Drawing ───────────────────────────────────────────────────────────────────
function startDrawing() {
  const colorIdx = polygons.length % CONFIG.POLYGON_COLORS.length;
  const color    = CONFIG.POLYGON_COLORS[colorIdx];

  drawingManager.setOptions({
    drawingMode: google.maps.drawing.OverlayType.POLYGON,
    polygonOptions: {
      fillColor: color,
      fillOpacity: 0.25,
      strokeColor: color,
      strokeWeight: 2.5,
      editable: true,
      draggable: false,
    },
  });

  const btn = document.getElementById('btn-draw');
  btn.textContent = 'Click to place points — double-click to finish';
  btn.disabled = true;
}

function onPolygonComplete(polygon) {
  polyCounter++;
  const colorIdx = (polygons.length) % CONFIG.POLYGON_COLORS.length;
  const color    = CONFIG.POLYGON_COLORS[colorIdx];
  const label    = CONFIG.AREA_LABELS[polygons.length] || `Area ${polygons.length + 1}`;
  const id       = polyCounter;
  const acres    = computeAcres(polygon);

  polygons.push({ id, polygon, acres, label, color });

  drawingManager.setOptions({ drawingMode: null });
  updateDrawBtn();

  // Listen for vertex edits
  ['set_at', 'insert_at', 'remove_at'].forEach(evt => {
    google.maps.event.addListener(polygon.getPath(), evt, () => {
      const p = polygons.find(p => p.id === id);
      if (p) { p.acres = computeAcres(polygon); renderAreaList(); updateQuote(); }
    });
  });

  renderAreaList();
  updateQuote();
}

function computeAcres(polygon) {
  return google.maps.geometry.spherical.computeArea(polygon.getPath()) / 4046.86;
}

function updateDrawBtn() {
  const btn = document.getElementById('btn-draw');
  btn.textContent = polygons.length ? 'Add Another Area' : 'Draw My Lawn Area';
  btn.disabled = false;
}

// ── Area List UI ──────────────────────────────────────────────────────────────
function renderAreaList() {
  const wrap   = document.getElementById('area-list-wrap');
  const list   = document.getElementById('area-list');
  const total  = polygons.reduce((s, p) => s + p.acres, 0);

  if (!polygons.length) { wrap.classList.remove('visible'); updateQuote(); return; }

  wrap.classList.add('visible');
  document.getElementById('area-total-value').textContent = total.toFixed(3);

  list.innerHTML = polygons.map(p => `
    <div class="area-item">
      <span class="area-color-dot" style="background-color:${p.color}"></span>
      <span class="area-label">${p.label}</span>
      <span class="area-acres">${p.acres.toFixed(3)} ac</span>
      <button class="area-delete" onclick="deletePolygon(${p.id})" aria-label="Remove ${p.label}">×</button>
    </div>
  `).join('');
}

window.deletePolygon = function (id) {
  const idx = polygons.findIndex(p => p.id === id);
  if (idx !== -1) {
    polygons[idx].polygon.setMap(null);
    polygons.splice(idx, 1);
    renderAreaList();
    updateDrawBtn();
    updateQuote();
  }
};

function clearAllPolygons() {
  polygons.forEach(p => p.polygon.setMap(null));
  polygons = [];
  currentMiles = 0;
  renderAreaList();
  updateDrawBtn();
  updateQuote();
}

// ── Pricing ───────────────────────────────────────────────────────────────────
function calcDistanceSurcharge(miles) {
  if (miles <= 10) return 0;
  if (miles <= 25) return (miles - 10) * 0.50;
  if (miles <= 50) return 7.50 + (miles - 25) * 0.75;
  return 26.25 + (miles - 50) * 1.25 + 25;
}

function updateQuote() {
  const totalAcres   = polygons.reduce((s, p) => s + p.acres, 0);
  const quoteOut     = document.getElementById('quote-output');
  const quoteLines   = document.getElementById('quote-service-lines');
  const emptyState   = document.getElementById('quote-empty-state');
  const quoteCta     = document.getElementById('quote-cta');
  const totalDisplay = document.getElementById('quote-total-value');

  const diffEl       = document.querySelector('input[name="difficulty"]:checked');
  const difficulty   = diffEl?.value || 'flat';
  const multiplier   = CONFIG.DIFFICULTY[difficulty]?.multiplier || 1.0;

  const selected = [...document.querySelectorAll('.service-check-item input:checked')]
    .map(cb => cb.value);

  if (!totalAcres || !selected.length) {
    emptyState.style.display = 'block';
    quoteOut.style.display   = 'none';
    quoteCta.style.display   = 'none';
    return;
  }

  emptyState.style.display = 'none';
  quoteOut.style.display   = 'block';
  quoteCta.style.display   = 'block';

  let serviceSubtotal = 0;
  let linesHTML = '';

  selected.forEach(key => {
    const svc  = CONFIG.SERVICES[key];
    if (!svc) return;
    const cost = svc.perAcre ? svc.rate * totalAcres : svc.rate;
    serviceSubtotal += cost;
    linesHTML += `
      <div class="quote-line">
        <span class="quote-line-label">${svc.label}</span>
        <span class="quote-line-value">$${cost.toFixed(2)}</span>
      </div>`;
  });

  const diffAdj       = serviceSubtotal * multiplier;
  const diffExtra     = diffAdj - serviceSubtotal;
  const distSurcharge = calcDistanceSurcharge(currentMiles);
  const labor         = (diffAdj + distSurcharge) * CONFIG.LABOR_RATE;
  const total         = Math.max(diffAdj + distSurcharge + labor, CONFIG.MIN_CHARGE);

  if (selected.length > 1) {
    linesHTML += `
      <div class="quote-line" style="font-weight:700;padding-top:8px;margin-top:4px;border-top:1px solid rgba(212,160,23,0.2)">
        <span class="quote-line-label">Services Subtotal</span>
        <span class="quote-line-value">$${serviceSubtotal.toFixed(2)}</span>
      </div>`;
  }

  if (multiplier !== 1.0) {
    linesHTML += `
      <div class="quote-line">
        <span class="quote-line-label">Difficulty (${CONFIG.DIFFICULTY[difficulty].label})</span>
        <span class="quote-line-value">+$${diffExtra.toFixed(2)}</span>
      </div>`;
  }

  if (distSurcharge > 0) {
    linesHTML += `
      <div class="quote-line">
        <span class="quote-line-label">Distance (${currentMiles.toFixed(1)} mi)</span>
        <span class="quote-line-value">+$${distSurcharge.toFixed(2)}</span>
      </div>`;
  }

  linesHTML += `
    <div class="quote-line">
      <span class="quote-line-label">Labor & Equipment</span>
      <span class="quote-line-value">+$${labor.toFixed(2)}</span>
    </div>`;

  quoteLines.innerHTML = linesHTML;
  animateValue(totalDisplay, total);
}

function animateValue(el, value) {
  el.textContent = `$${value.toFixed(2)}`;
  el.classList.remove('updated');
  void el.offsetWidth;
  el.classList.add('updated');
  setTimeout(() => el.classList.remove('updated'), 600);
}

// ── Error ─────────────────────────────────────────────────────────────────────
function showCalcError(msg) {
  const el = document.getElementById('calc-error');
  if (el) { el.textContent = msg; el.classList.add('visible'); }
}

function hideCalcError() {
  const el = document.getElementById('calc-error');
  if (el) el.classList.remove('visible');
}
