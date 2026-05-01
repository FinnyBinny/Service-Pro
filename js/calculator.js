// ── Config ──────────────────────────────────────────────────────────────────
const CONFIG = {
  HQ_ADDRESS: 'Williamston, MI 48895',
  MIN_CHARGE: 45,
  LABOR_RATE: 0.15,
  SERVICES: {
    mowing:      { label: 'Lawn Mowing',         rate: 65,  perAcre: true  },
    edging:      { label: 'Edging',              rate: 15,  perAcre: true  },
    fertilizing: { label: 'Fertilizing',         rate: 55,  perAcre: true  },
    cleanup:     { label: 'Seasonal Cleanup',    rate: 80,  perAcre: true  },
    mulching:    { label: 'Mulching & Bed Care', rate: 120, perAcre: true  },
    hedges:      { label: 'Hedge Trimming',      rate: 45,  perAcre: false },
    leaves:      { label: 'Leaf Removal',        rate: 70,  perAcre: true  },
  },
  DIFFICULTY: {
    flat:     { label: 'Flat / Open',          multiplier: 1.0  },
    moderate: { label: 'Moderate Obstacles',   multiplier: 1.3  },
    complex:  { label: 'Complex / Hilly',      multiplier: 1.65 },
  },
  DISTANCE_TIERS: [
    { upTo: 10, rate: 0,    base: 0  },
    { upTo: 25, rate: 0.50, base: 0  },
    { upTo: 50, rate: 0.75, base: 7.5  },
    { upTo: Infinity, rate: 1.25, base: 26.25, flatSurcharge: 25 },
  ],
};

// ── State ────────────────────────────────────────────────────────────────────
let map, drawingManager, geocoder, distanceService;
let currentPolygon = null;
let currentAcres   = 0;
let currentMiles   = 0;
let geocodedAddress = null;
let mapReady = false;

// ── Maps Callback (called by Google Maps API) ─────────────────────────────────
window.initMap = function () {
  mapReady = true;
  geocoder        = new google.maps.Geocoder();
  distanceService = new google.maps.DistanceMatrixService();

  map = new google.maps.Map(document.getElementById('map-container'), {
    center: { lat: 42.6845, lng: -84.3985 }, // Williamston, MI
    zoom: 11,
    mapTypeId: google.maps.MapTypeId.HYBRID,
    disableDefaultUI: false,
    zoomControl: true,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
    styles: [
      { featureType: 'water',  elementType: 'geometry', stylers: [{ color: '#1a2a4a' }] },
      { featureType: 'road',   elementType: 'geometry', stylers: [{ color: '#3d2a15' }] },
    ],
  });

  drawingManager = new google.maps.drawing.DrawingManager({
    drawingMode: null,
    drawingControl: false,
    polygonOptions: {
      fillColor: '#D4A017',
      fillOpacity: 0.28,
      strokeColor: '#D4A017',
      strokeWeight: 2.5,
      editable: true,
      draggable: false,
      clickable: true,
    },
  });
  drawingManager.setMap(map);

  google.maps.event.addListener(drawingManager, 'polygoncomplete', onPolygonComplete);

  // Wire up buttons
  document.getElementById('btn-find-property').addEventListener('click', geocodeAddress);
  document.getElementById('address-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') geocodeAddress();
  });
  document.getElementById('btn-draw').addEventListener('click', startDrawing);
  document.getElementById('btn-clear').addEventListener('click', clearPolygon);

  // Wire up difficulty and services
  document.querySelectorAll('.difficulty-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.difficulty-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      card.querySelector('input[type="radio"]').checked = true;
      updateQuote();
    });
  });

  document.querySelectorAll('.service-check-item input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', updateQuote);
  });

  // Hide map placeholder
  document.querySelector('.map-placeholder')?.classList.add('hidden');
};

// ── Geocode ──────────────────────────────────────────────────────────────────
function geocodeAddress() {
  const input = document.getElementById('address-input').value.trim();
  if (!input) { showCalcError('Please enter an address first.'); return; }
  if (!mapReady) { showCalcError('Map is still loading. Please try again.'); return; }
  hideCalcError();

  document.getElementById('btn-find-property').textContent = 'Searching…';

  geocoder.geocode({ address: input }, (results, status) => {
    document.getElementById('btn-find-property').textContent = 'Find Property';

    if (status !== 'OK' || !results[0]) {
      showCalcError('Address not found. Please try a more specific address.');
      return;
    }

    geocodedAddress = results[0].formatted_address;
    const location  = results[0].geometry.location;

    map.setCenter(location);
    map.setZoom(19);
    map.setMapTypeId(google.maps.MapTypeId.HYBRID);

    if (window._addressMarker) window._addressMarker.setMap(null);
    window._addressMarker = new google.maps.Marker({
      position: location,
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
    getDistanceFromHQ(geocodedAddress);
  });
}

// ── Distance Matrix ───────────────────────────────────────────────────────────
function getDistanceFromHQ(destination) {
  distanceService.getDistanceMatrix(
    {
      origins: [CONFIG.HQ_ADDRESS],
      destinations: [destination],
      travelMode: google.maps.TravelMode.DRIVING,
      unitSystem: google.maps.UnitSystem.IMPERIAL,
    },
    (response, status) => {
      if (status === 'OK') {
        const element = response.rows[0]?.elements[0];
        if (element && element.status === 'OK') {
          currentMiles = element.distance.value / 1609.34;
        }
      }
      updateQuote();
    }
  );
}

// ── Drawing ───────────────────────────────────────────────────────────────────
function startDrawing() {
  clearPolygon();
  drawingManager.setDrawingMode(google.maps.drawing.OverlayType.POLYGON);
  document.getElementById('btn-draw').textContent = 'Drawing… (click to place points, double-click to finish)';
  document.getElementById('btn-draw').disabled = true;
}

function onPolygonComplete(polygon) {
  currentPolygon = polygon;
  drawingManager.setDrawingMode(null);
  document.getElementById('btn-draw').textContent = 'Redraw Area';
  document.getElementById('btn-draw').disabled = false;

  computeArea();

  // Listen for vertex edits
  ['set_at', 'insert_at', 'remove_at'].forEach(event => {
    google.maps.event.addListener(polygon.getPath(), event, computeArea);
  });

  // Click polygon to re-enable editing
  polygon.addListener('click', () => { polygon.setEditable(true); });
}

function clearPolygon() {
  if (currentPolygon) {
    currentPolygon.setMap(null);
    currentPolygon = null;
  }
  currentAcres = 0;
  document.getElementById('acreage-display').classList.add('hidden');
  document.getElementById('btn-draw').textContent = 'Draw My Lawn Area';
  document.getElementById('btn-draw').disabled = false;
  updateQuote();
}

function computeArea() {
  if (!currentPolygon) return;
  const areaSqMeters = google.maps.geometry.spherical.computeArea(currentPolygon.getPath());
  currentAcres = areaSqMeters / 4046.86;

  const display = document.getElementById('acreage-display');
  display.classList.remove('hidden');
  document.getElementById('acreage-number').textContent = currentAcres.toFixed(3);
  updateQuote();
}

// ── Pricing Engine ────────────────────────────────────────────────────────────
function calcDistanceSurcharge(miles) {
  if (miles <= 10) return 0;
  if (miles <= 25) return (miles - 10) * 0.50;
  if (miles <= 50) return 7.50 + (miles - 25) * 0.75;
  return 26.25 + (miles - 50) * 1.25 + 25; // flat surcharge for 50+ mi
}

function updateQuote() {
  const quoteOutput  = document.getElementById('quote-output');
  const quoteLines   = document.getElementById('quote-service-lines');
  const emptyState   = document.getElementById('quote-empty-state');
  const totalDisplay = document.getElementById('quote-total-value');
  const quoteCta     = document.getElementById('quote-cta');

  // Get difficulty
  const difficultyEl = document.querySelector('input[name="difficulty"]:checked');
  const difficulty   = difficultyEl ? difficultyEl.value : 'flat';
  const multiplier   = CONFIG.DIFFICULTY[difficulty]?.multiplier || 1.0;

  // Get selected services
  const selected = [...document.querySelectorAll('.service-check-item input:checked')]
    .map(cb => cb.value);

  if (!currentAcres || !selected.length) {
    quoteLines.innerHTML = '';
    emptyState.style.display = 'block';
    quoteOutput.style.display = 'none';
    quoteCta.style.display = 'none';
    return;
  }

  emptyState.style.display = 'none';
  quoteOutput.style.display = 'block';
  quoteCta.style.display = 'block';

  // Build service lines
  let serviceSubtotal = 0;
  let linesHTML = '';

  selected.forEach(key => {
    const svc = CONFIG.SERVICES[key];
    if (!svc) return;
    const cost = svc.perAcre ? svc.rate * currentAcres : svc.rate;
    serviceSubtotal += cost;
    const desc = svc.perAcre
      ? `${currentAcres.toFixed(2)} ac @ $${svc.rate}/ac`
      : 'flat rate';
    linesHTML += `
      <div class="quote-line">
        <span class="quote-line-label">${svc.label} <small style="opacity:0.6">(${desc})</small></span>
        <span class="quote-line-value">$${cost.toFixed(2)}</span>
      </div>`;
  });

  const diffAdj      = serviceSubtotal * multiplier;
  const diffExtra    = diffAdj - serviceSubtotal;
  const distSurcharge = calcDistanceSurcharge(currentMiles);
  const laborBase    = diffAdj + distSurcharge;
  const labor        = laborBase * CONFIG.LABOR_RATE;
  const total        = Math.max(diffAdj + distSurcharge + labor, CONFIG.MIN_CHARGE);

  // Build summary lines
  if (selected.length > 1) {
    linesHTML += `
      <div class="quote-line" style="font-weight:600;border-top:1px solid rgba(212,160,23,0.25);margin-top:4px;padding-top:8px">
        <span class="quote-line-label">Services Subtotal</span>
        <span class="quote-line-value">$${serviceSubtotal.toFixed(2)}</span>
      </div>`;
  }

  if (multiplier !== 1.0) {
    linesHTML += `
      <div class="quote-line">
        <span class="quote-line-label">Difficulty Adjustment (${CONFIG.DIFFICULTY[difficulty].label}, ×${multiplier})</span>
        <span class="quote-line-value">+$${diffExtra.toFixed(2)}</span>
      </div>`;
  }

  if (distSurcharge > 0) {
    linesHTML += `
      <div class="quote-line">
        <span class="quote-line-label">Distance Surcharge (${currentMiles.toFixed(1)} mi driving)</span>
        <span class="quote-line-value">+$${distSurcharge.toFixed(2)}</span>
      </div>`;
  }

  linesHTML += `
    <div class="quote-line">
      <span class="quote-line-label">Labor & Equipment (${Math.round(CONFIG.LABOR_RATE * 100)}%)</span>
      <span class="quote-line-value">+$${labor.toFixed(2)}</span>
    </div>`;

  quoteLines.innerHTML = linesHTML;
  animateValue(totalDisplay, total);
}

function animateValue(el, value) {
  el.textContent = `$${value.toFixed(2)}`;
  el.classList.remove('updated');
  void el.offsetWidth; // force reflow
  el.classList.add('updated');
  setTimeout(() => el.classList.remove('updated'), 600);
}

// ── Error UI ──────────────────────────────────────────────────────────────────
function showCalcError(msg) {
  const el = document.getElementById('calc-error');
  if (el) { el.textContent = msg; el.classList.add('visible'); }
}

function hideCalcError() {
  const el = document.getElementById('calc-error');
  if (el) el.classList.remove('visible');
}
