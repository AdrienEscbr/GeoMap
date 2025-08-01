// Initialisation de la carte Leaflet
const map = L.map('map',{zoomControl: false}).setView([48.8566, 2.3522], 2);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

// Structures pour stocker les points et polylines
let points = []; // Chaque élément : { id, desc, lat, lng, color, marker }
let nextId = 1;  // Pour générer un identifiant unique (sera recalculé au chargement)
let polylines = []; 
let circles = []; // tableau des cercles {circle, lat, lng, radius, color}
let currentEditableCircle = null;
let currentSelectedLine = null;

let editHandles = [];
let originalLatLngs = [];
// Chaque entrée : { id1, id2, line: L.polyline }

const distanceLabels = new Map(); // Clé = ligne Leaflet, valeur = label ajouté sur la carte


// Variable qui conserve la dernière couleur utilisée
let lastColor = '#3388ff';

const pointListEl = document.getElementById('point-list');
const select1 = document.getElementById('select-point1');
const select2 = document.getElementById('select-point2');
const connectBtn = document.getElementById('connect-btn');
const coordFeedback = document.getElementById('coord-feedback');
const distanceButton = document.getElementById('toggle-measure');
const circleConfigPanel = document.getElementById('circle-config-panel');

const lineConfigPanel = document.getElementById('line-config-panel');
const lineDistanceInput = document.getElementById('line-width');
const lineDeleteBtn = document.getElementById('line-delete-btn');
const lineCloseBtn = document.getElementById('line-close-btn');

const createPointBtn = document.getElementById('createPointModal');

const addPointBtn = document.getElementById('add-point-button');

let targetMode = false;


// Crée un élément pour afficher les coordonnées
const coordDisplay = document.createElement('div');
coordDisplay.id = 'cursor-coords';
coordDisplay.style.position = 'absolute';
coordDisplay.style.pointerEvents = 'none';
coordDisplay.style.padding = '4px 8px';
coordDisplay.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
coordDisplay.style.border = '1px solid #ccc';
coordDisplay.style.borderRadius = '4px';
coordDisplay.style.fontSize = '12px';
coordDisplay.style.zIndex = 999;
coordDisplay.style.display = 'none';
document.body.appendChild(coordDisplay);

let mouseMoveHandler;

addPointBtn.addEventListener('click', () => {
  const isActive = addPointBtn.classList.toggle('active');

  targetMode = isActive;

  if (isActive) {
    addPointBtn.style.backgroundColor = '#ddd';
    map.getContainer().style.cursor = 'crosshair';
    coordDisplay.style.display = 'block';

    // Met à jour la position et le contenu du tooltip
    mouseMoveHandler = function (e) {
      const containerPoint = map.mouseEventToContainerPoint(e.originalEvent);
      const latlng = map.containerPointToLatLng(containerPoint);
      coordDisplay.style.left = (e.originalEvent.pageX + 10) + 'px';
      coordDisplay.style.top = (e.originalEvent.pageY + 10) + 'px';
      coordDisplay.textContent = `${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`;
    };

    map.on('mousemove', mouseMoveHandler);
    // {lat: 40.27111551706457, lng: 0.48615813104221317}


  } else {
    addPointBtn.style.backgroundColor = '';
    map.getContainer().style.cursor = '';
    coordDisplay.style.display = 'none';

    if (mouseMoveHandler) {
      map.off('mousemove', mouseMoveHandler);
    }
  }
});

lineCloseBtn.addEventListener('click', () =>{
  removeHandlers();
})

function closeAllConfigMenus(){
  lineConfigPanel.classList.add('d-none');
  circleConfigPanel.classList.add('d-none');
}


map.on('contextmenu', function (e) {
  if (!targetMode) return;

  // console.log(`Clic droit aux coordonnées : ${e.latlng.lat}, ${e.latlng.lng}`);
  
  openPointCreationModal({ lat: e.latlng.lat, lng: e.latlng.lng }, (confirmed, pointDatas) => {
    if (confirmed) {
      const {desc, color, coord} = pointDatas;
      const id = nextId++;

      const marker = L.circleMarker(coord, {
        radius: 8,
        fillColor: color,
        color: '#000',
        weight: 1,
        fillOpacity: 0.9
      }).addTo(map).bindPopup(popupContent(desc, coord.lat.toFixed(5), coord.lng.toFixed(5)));

      points.push({ id, desc, lat: coord.lat, lng: coord.lng, color, marker });

      renderPointList();
      saveToLocalStorage();
    }
  });
});


// ---------------------------------------------
// FONCTIONS DE PERSISTENCE (localStorage)
// ---------------------------------------------

// Enregistre dans localStorage : points sans les markers, et polylines sans les objets L.polyline
function saveToLocalStorage() {
  // Points : on retire la référence `marker`
  const pointsData = points.map((p) => ({
    id: p.id,
    desc: p.desc,
    lat: p.lat,
    lng: p.lng,
    color: p.color,
  }));
  localStorage.setItem('mapPoints', JSON.stringify(pointsData));

  // Polylines : on ne stocke que { id1, id2 }
  const polylinesData = polylines.map((entry) => ({
    id1: entry.id1,
    id2: entry.id2,
  }));
  localStorage.setItem('mapPolylines', JSON.stringify(polylinesData));
}

// Charge depuis localStorage et reconstruit `points` et `polylines`
function loadFromLocalStorage() {
  const storedPoints = localStorage.getItem('mapPoints');
  const storedLines = localStorage.getItem('mapPolylines');

  if (storedPoints) {
    try {
      const arr = JSON.parse(storedPoints);
      // Pour déterminer nextId : prendre le max
      let maxId = 0;
      arr.forEach((pdata) => {
        // Créer le marker à la même position
        const marker = L.circleMarker([pdata.lat, pdata.lng], {
          radius: 8,
          fillColor: pdata.color,
          color: '#000',
          weight: 1,
          fillOpacity: 0.9,
        })
          .addTo(map)
          .bindPopup(popupContent(pdata.desc, pdata.lat.toFixed(5), pdata.lng.toFixed(5)));

        points.push({
          id: pdata.id,
          desc: pdata.desc,
          lat: pdata.lat,
          lng: pdata.lng,
          color: pdata.color,
          marker: marker,
        });
        if (pdata.id > maxId) maxId = pdata.id;
      });
      nextId = maxId + 1;
    } catch (e) {
      console.error('Erreur lors du parsing de mapPoints depuis localStorage', e);
    }
  }

  if (storedLines) {
    try {
      const arrL = JSON.parse(storedLines);
      arrL.forEach((ldata) => {
        const p1 = points.find((pt) => pt.id === ldata.id1);
        const p2 = points.find((pt) => pt.id === ldata.id2);
        if (p1 && p2) {
          const line = L.polyline(
            [
              [p1.lat, p1.lng],
              [p2.lat, p2.lng],
            ],
            { color: '#0000FF', weight: 3 }
          ).addTo(map);
          polylines.push({ id1: ldata.id1, id2: ldata.id2, line: line });

          if(distanceButton.checked){
            afficherDistanceLigne(line)
          }
        }
      });
    } catch (e) {
      console.error(
        'Erreur lors du parsing de mapPolylines depuis localStorage',
        e
      );
    }
  }

  loadCirclesFromLocalStorage();
}
// ---------------------------------------------
// FIN FONCTIONS DE PERSISTENCE
// ---------------------------------------------

// Replie le menu si on clique ailleur que dessus

// Récupère l’élément collapse et son instance Bootstrap
const navbarCollapseEl = document.getElementById('navbarNav');
const bsNavbarCollapse = new bootstrap.Collapse(navbarCollapseEl, { toggle: false });

// Lorsque n’importe où sur le document est cliqué…
document.addEventListener('click', (e) => {
  // Si le menu est ouvert…
  if (navbarCollapseEl.classList.contains('show')) {
    // …et que le clic n’a pas eu lieu DANS la navbar
    const clickedInside = e.target.closest('.navbar');
    if (!clickedInside) {
      bsNavbarCollapse.hide();
    }
  }
});


// Initialisation de Sortable pour la liste
Sortable.create(pointListEl, {
  handle: '.drag-handle',
  animation: 150,
  onEnd: function (evt) {
    // Mettre à jour l'ordre dans le tableau `points` selon l'ordre visuel
    const idsInOrder = Array.from(pointListEl.children).map((li) =>
      parseInt(li.getAttribute('data-id'))
    );
    points.sort(
      (a, b) => idsInOrder.indexOf(a.id) - idsInOrder.indexOf(b.id)
    );
  },
});

// Fonction de validation des coordonnées
function validerCoords(lat, lng) {
  if (isNaN(lat) || isNaN(lng)) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;
  return true;
}

// Désactive ou active le bouton Relier en fonction des sélections
function majBoutonRelier() {
  const id1 = parseInt(select1.value);
  const id2 = parseInt(select2.value);
  if (id1 && id2 && id1 !== id2) {
    connectBtn.removeAttribute('disabled');
  } else {
    connectBtn.setAttribute('disabled', 'true');
  }
}

// Met à jour dynamiquement les options de select1 et select2
function majOptionsSelects() {
  const sel1Value = parseInt(select1.value);
  const sel2Value = parseInt(select2.value);

  // On vide chaque select
  select1.innerHTML = '<option value="" disabled>Choisir...</option>';
  select2.innerHTML = '<option value="" disabled>Choisir...</option>';

  // Pour chaque point, on ajoute une option dans les deux selects,
  // sauf s'il correspond à la valeur déjà choisie de l'autre select.
  points.forEach((p) => {
    // Option pour select1 (on supprime si p.id === sel2Value)
    if (p.id !== sel2Value) {
      const opt1 = document.createElement('option');
      opt1.value = p.id;
      opt1.textContent = p.desc;
      if (p.id === sel1Value) opt1.selected = true;
      select1.appendChild(opt1);
    }
    // Option pour select2 (on supprime si p.id === sel1Value)
    if (p.id !== sel1Value) {
      const opt2 = document.createElement('option');
      opt2.value = p.id;
      opt2.textContent = p.desc;
      if (p.id === sel2Value) opt2.selected = true;
      select2.appendChild(opt2);
    }
  });

  // Après avoir reconstruit les options, on remet à jour le bouton Relier
  majBoutonRelier();
}

// Ajoute une option dans les deux selects pour relier (appelée après chaque render)
function mettreAJourSelects() {
  majOptionsSelects();
}

// Fonction pour afficher la liste des points dans la sidebar
function renderPointList() {
  pointListEl.innerHTML = '';
  points.forEach((p) => {
    const li = document.createElement('li');
    li.className = 'list-group-item d-flex align-items-center';
    li.setAttribute('data-id', p.id);

    // Poignée de déplacement
    const dragHandle = document.createElement('span');
    dragHandle.innerHTML = '☰';
    dragHandle.className = 'drag-handle';
    li.appendChild(dragHandle);

    // Boîte de couleur
    const colorBox = document.createElement('span');
    colorBox.className = 'color-box';
    colorBox.style.backgroundColor = p.color;
    li.appendChild(colorBox);

    // Description et coordonnées
    const infoDiv = document.createElement('div');
    infoDiv.className = 'flex-grow-1';
    infoDiv.innerHTML = `<strong>${p.desc}</strong><br>
      (${p.lat.toFixed(5)}, ${p.lng.toFixed(5)})`;
    li.appendChild(infoDiv);

    // Bouton modifier
    const btnEdit = document.createElement('button');
    btnEdit.className = 'btn btn-sm btn-warning me-2';
    btnEdit.textContent = 'Modifier';
    btnEdit.addEventListener('click', () => openEditModal(p.id));
    li.appendChild(btnEdit);

    // Bouton supprimer
    const btnDel = document.createElement('button');
    btnDel.className = 'btn btn-sm btn-danger';
    btnDel.textContent = 'Supprimer';
    btnDel.addEventListener('click', () => {
      deletePoint(p.id);
      reloadDistanceLabels();
      closeAllConfigMenus();
    });
    li.appendChild(btnDel);

    pointListEl.appendChild(li);
  });
  mettreAJourSelects();
}

// Ajoute un point (appelé lors de la validation du formulaire “add-point-form”)
document.getElementById('add-point-form').addEventListener('submit', (e) => {
  e.preventDefault();

  // Récupérer la description
  const desc = document.getElementById('new-desc').value.trim();

  // Récupérer la chaîne "latitude, longitude"
  const coordStr = document.getElementById('new-coords').value.trim();

  // Lire et conserver la couleur dans lastColor
  const color = document.getElementById('new-color').value;
  lastColor = color;

  // Nettoyer d'abord tout éventuel feedback précédent
  coordFeedback.innerHTML = '';

  // Vérifier qu'il y a bien une virgule et exactement deux parties
  const parts = coordStr.split(',');
  if (parts.length !== 2) {
    coordFeedback.innerHTML =
      '<div class="text-danger">Erreur : veuillez saisir “latitude, longitude” séparées par une virgule.</div>';
    return;
  }

  // Extraire, nettoyer et convertir en nombre
  const lat = parseFloat(parts[0].trim());
  const lng = parseFloat(parts[1].trim());

  // Valider les valeurs numériques
  if (!validerCoords(lat, lng)) {
    coordFeedback.innerHTML =
      '<div class="text-danger">Erreur : latitude doit être entre –90 et 90, longitude entre –180 et 180.</div>';
    return;
  }

  // Créer le marker
  const marker = L.circleMarker([lat, lng], {
    radius: 8,
    fillColor: color,
    color: '#000',
    weight: 1,
    fillOpacity: 0.9,
  })
    .addTo(map)
    .bindPopup(popupContent(desc, lat.toFixed(5), lng.toFixed(5)));

  // Ajouter au tableau interne
  const newPoint = {
    id: nextId++,
    desc,
    lat,
    lng,
    color,
    marker,
  };
  points.push(newPoint);

  // Sauvegarder l’état
  saveToLocalStorage();

  // Réinitialiser le formulaire APRÈS un court délai
  setTimeout(() => {
    document.getElementById('add-point-form').reset();
    coordFeedback.innerHTML = '';
    document.getElementById('new-color').value = lastColor;
    renderPointList();
  }, 100);
});

function popupContent(description, lat, long){

  const popupContent = `
  <div>
    <strong>${description}</strong>
    <br />
    (${lat}, ${long})
    <br /><br />
    <div class="d-flex flex-row align-items-center justify-content-center">
      <button class="popup-icon-btn w-100" onclick="handlePopupButtonClick('${description}')">
        <img src="./circle.png" alt="Action" />
      
      <p class="mx-2 p-0 ">Dessiner un cercle</p></button>
    </div>
  </div>
  `;
  return popupContent;
}


function handlePopupButtonClick(description) {
  const point = points.find(p => p.desc === description);
  
  if (!point) return;
  const lat = point.lat;
  const lng = point.lng;

  const circle = L.circle([lat, lng], {
    radius: 1000,
    color: '#ff0000',
    fillOpacity: 0.3,
  }).addTo(map);

  circles.push({ circle, lat, lng, radius: 1000, color: '#ff0000' });
  saveCirclesToLocalStorage();
  attachCircleEvent(circle);

  showCircleConfigPanel(circle);
}

function attachCircleEvent(circle) {
  circle.on('click', function () {
    showCircleConfigPanel(circle);
  });
}

function showCircleConfigPanel(circle) {
  closeAllConfigMenus();

  currentEditableCircle = circle;
  circleConfigPanel.classList.remove('d-none');

  document.getElementById('circle-radius').value = circle.getRadius();
  document.getElementById('circle-color').value = circle.options.color;
}

// Valider les modifications
document.getElementById('circle-validate-btn').addEventListener('click', () => {
  if (!currentEditableCircle) return;

  const newRadius = parseFloat(document.getElementById('circle-radius').value);
  const newColor = document.getElementById('circle-color').value;

  currentEditableCircle.setRadius(newRadius);
  currentEditableCircle.setStyle({ color: newColor });

  updateCircleInStorage(currentEditableCircle, newRadius, newColor);
  circleConfigPanel.classList.add('d-none');
});

// Supprimer le cercle
document.getElementById('circle-delete-btn').addEventListener('click', () => {
  if (!currentEditableCircle) return;

  map.removeLayer(currentEditableCircle);
  circles = circles.filter(obj => obj.circle !== currentEditableCircle);
  saveCirclesToLocalStorage();

  circleConfigPanel.classList.add('d-none');
  currentEditableCircle = null;
});

// Sauvegarde des cercles
function saveCirclesToLocalStorage() {
  const stored = circles.map(({ circle, lat, lng, radius, color }) => ({
    lat, lng, radius, color
  }));
  localStorage.setItem('circles', JSON.stringify(stored));
}

// Mise à jour d’un cercle dans le stockage
function updateCircleInStorage(circle, newRadius, newColor) {
  for (let c of circles) {
    if (c.circle === circle) {
      c.radius = newRadius;
      c.color = newColor;
      break;
    }
  }
  saveCirclesToLocalStorage();
}

// Chargement au démarrage
function loadCirclesFromLocalStorage() {
  const stored = JSON.parse(localStorage.getItem('circles')) || [];
  for (let data of stored) {
    const circle = L.circle([data.lat, data.lng], {
      radius: data.radius,
      color: data.color,
      fillOpacity: 0.3,
    }).addTo(map);
    attachCircleEvent(circle);
    circles.push({ circle, ...data });
  }
}


// Supprimer un point
function deletePoint(id) {
  const idx = points.findIndex((p) => p.id === id);
  if (idx === -1) return;

  // Retirer le marker de la carte
  map.removeLayer(points[idx].marker);

  // Retirer du tableau points
  points.splice(idx, 1);

  // Retirer toutes les lignes liées dans polylines et de la carte
  polylines.slice().forEach((entry, index) => {
    if (entry.id1 === id || entry.id2 === id) {
      map.removeLayer(entry.line);
      polylines.splice(index, 1);
    }
  });

  // Sauvegarder l’état
  saveToLocalStorage();

  renderPointList();
}

// Ouvrir le modal de modification avec données préremplies
function openEditModal(id) {
  const p = points.find((pt) => pt.id === id);
  if (!p) return;
  document.getElementById('edit-id').value = p.id;
  document.getElementById('edit-desc').value = p.desc;
  document.getElementById('edit-lat').value = p.lat;
  document.getElementById('edit-lng').value = p.lng;
  document.getElementById('edit-color').value = p.color;
  const editModal = new bootstrap.Modal(document.getElementById('editModal'));
  editModal.show();
}

// Enregistrer les modifications depuis le modal
document.getElementById('edit-point-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const id = parseInt(document.getElementById('edit-id').value);
  const desc = document.getElementById('edit-desc').value.trim();
  const lat = parseFloat(document.getElementById('edit-lat').value);
  const lng = parseFloat(document.getElementById('edit-lng').value);
  const color = document.getElementById('edit-color').value;

  if (!desc) {
    alert('La description est requise.');
    return;
  }
  if (!validerCoords(lat, lng)) {
    alert('Coordonnées invalides.');
    return;
  }

  const p = points.find((pt) => pt.id === id);
  if (!p) return;

  // Mettre à jour les données
  p.desc = desc;
  p.lat = lat;
  p.lng = lng;
  p.color = color;

  // Mettre à jour le marker sur la carte
  p.marker.setLatLng([lat, lng]);
  p.marker.setStyle({ fillColor: color });
  p.marker.setPopupContent(`<strong>${desc}</strong><br>(${lat.toFixed(5)}, ${lng.toFixed(5)})`);

  // Mettre à jour toutes les lignes connectées à ce point
  polylines.slice().forEach((entry, index) => {
    if (entry.id1 === id || entry.id2 === id) {
      // Supprimer l'ancienne ligne
      map.removeLayer(entry.line);
      // Retrouver l’autre point
      const otherId = entry.id1 === id ? entry.id2 : entry.id1;
      const otherPoint = points.find((pt) => pt.id === otherId);
      if (otherPoint) {
        // Créer une nouvelle ligne avec les coordonnées mises à jour
        const newLine = L.polyline(
          [
            [p.lat, p.lng],
            [otherPoint.lat, otherPoint.lng],
          ],
          { color: '#0000FF', weight: 3 }
        ).addTo(map);
        entry.line = newLine;
        if(distanceButton.checked){
          afficherDistanceLigne(newLine)
        }
      } else {
        // Si l’autre point n’existe plus, tout enlever
        polylines.splice(index, 1);
      }
    }
  });

  // Sauvegarder l’état
  saveToLocalStorage();

  renderPointList();
  // Fermer le modal
  bootstrap.Modal.getInstance(document.getElementById('editModal')).hide();
});

// Fonction pour relier deux points sélectionnés
connectBtn.addEventListener('click', () => {
  const id1 = parseInt(select1.value);
  const id2 = parseInt(select2.value);
  if (!id1 || !id2 || id1 === id2) {
    return; // Bouton désactivé sinon
  }
  const p1 = points.find((pt) => pt.id === id1);
  const p2 = points.find((pt) => pt.id === id2);
  if (!p1 || !p2) return;

  // Créer la ligne
  const line = L.polyline(
    [
      [p1.lat, p1.lng],
      [p2.lat, p2.lng],
    ],
    { color: '#0000FF', weight: 3 }
  ).addTo(map);

  if(distanceButton.checked){
    afficherDistanceLigne(line)
  }
  

  // Conserver la ligne avec les IDs
  polylines.push({ id1, id2, line });

  line.on('click', function () {
    showLineConfigPanel(line);
  });

  // Sauvegarder l’état
  saveToLocalStorage();

  // Centrer la carte sur la ligne
  const bounds = L.latLngBounds([p1.lat, p1.lng], [p2.lat, p2.lng]);
  map.fitBounds(bounds, { padding: [50, 50] });

  // Réinitialiser les selects et désactiver le bouton
  select1.value = '';
  select2.value = '';
  majOptionsSelects();
});

// Lorsque l’un des deux selects change, on met à jour l’autre
select1.addEventListener('change', () => {
  majOptionsSelects();
});
select2.addEventListener('change', () => {
  majOptionsSelects();
});

// Au démarrage, on désactive le bouton Relier
connectBtn.setAttribute('disabled', 'true');

// ---------------------------------------------
// CHARGEMENT INITIAL DE localStorage
// ---------------------------------------------
loadFromLocalStorage();
renderPointList();


// ------------------------
// Import/Export JSON
// ------------------------

const exportBtn = document.getElementById('export-btn');
const importBtn = document.getElementById('import-btn');
const ioArea = document.getElementById('import-export-area');
const ioFeedback = document.getElementById('import-feedback');
const clearAreaBtn = document.getElementById('clear-area-btn');

// Au chargement du modal, on active/désactive le bouton Export
const importExportModalEl = document.getElementById('importExportModal');
importExportModalEl.addEventListener('show.bs.modal', () => {
  // S'il n'y a pas de données sauvegardées, on garde Export désactivé
  const hasData = !!localStorage.getItem('mapPoints');
  exportBtn.disabled = !hasData;
  // Reset feedback et textarea
  ioArea.value = '';
  ioFeedback.innerHTML = '';
  importBtn.disabled = true;
});

// Lorsque la textarea change, on active/désactive Import
ioArea.addEventListener('input', () => {
  importBtn.disabled = ioArea.value.trim() === '';
});

// Effacer la textarea
clearAreaBtn.addEventListener('click', () => {
  ioArea.value = '';
  ioFeedback.innerHTML = '';
  importBtn.disabled = true;
});


/** Génére l’objet à exporter, sérialise et affiche dans la textarea */
exportBtn.addEventListener('click', () => {
  const data = {
    points: points.map(p => ({
      id: p.id, desc: p.desc, lat: p.lat, lng: p.lng, color: p.color
    })),
    lines: polylines.map(l => ({ id1: l.id1, id2: l.id2 })),
    circles: circles.map(c => ({
      lat: c.lat,
      lng: c.lng,
      radius: c.radius,
      color: c.color
    }))
  };
  const json = JSON.stringify(data, null, 2);
  ioArea.value = json;
  navigator.clipboard.writeText(json)
    .then(() => {
      ioFeedback.innerHTML = '<div class="text-success">Données copiées !</div>';
    })
    .catch(() => {
      ioFeedback.innerHTML = '<div class="text-danger">Échec copie.</div>';
    });
  // On peut importer immédiatement après export
  importBtn.disabled = false;
});

/** Importe les données depuis la textarea sans écraser l’existant */
importBtn.addEventListener('click', () => {
  ioFeedback.innerHTML = '';
  let data;
  try {
    data = JSON.parse(ioArea.value);
  } catch {
    ioFeedback.innerHTML = '<div class="text-danger">JSON invalide.</div>';
    return;
  }
  if (!data.points || !Array.isArray(data.points) ||
      !data.lines || !Array.isArray(data.lines)) {
    ioFeedback.innerHTML = '<div class="text-danger">Format attendu : { points: […], lines: […] }.</div>';
    return;
  }

  // Importer les points uniques
  let added = 0;
  data.points.forEach(pt => {
    if (
      typeof pt.id === 'number' &&
      typeof pt.desc === 'string' &&
      typeof pt.lat === 'number' &&
      typeof pt.lng === 'number' &&
      typeof pt.color === 'string' &&
      !points.some(existing => existing.id === pt.id)
    ) {
      // recréer marker
      const marker = L.circleMarker([pt.lat, pt.lng], {
        radius: 8, fillColor: pt.color, color: '#000', weight: 1, fillOpacity: 0.9
      }).addTo(map)
        .bindPopup(popupContent(pt.desc, pt.lat.toFixed(5), pt.lng.toFixed(5)));
      points.push({ id: pt.id, desc: pt.desc, lat: pt.lat, lng: pt.lng, color: pt.color, marker });
      added++;
      nextId = Math.max(nextId, pt.id + 1);
    }
  });

  // Importer les lignes uniques
  let addedLines = 0;
  data.lines.forEach(ln => {
    if (
      typeof ln.id1 === 'number' &&
      typeof ln.id2 === 'number' &&
      !polylines.some(e => (e.id1 === ln.id1 && e.id2 === ln.id2) || (e.id1 === ln.id2 && e.id2 === ln.id1))
    ) {
      const p1 = points.find(p => p.id === ln.id1);
      const p2 = points.find(p => p.id === ln.id2);
      if (p1 && p2) {
        const line = L.polyline([[p1.lat, p1.lng], [p2.lat, p2.lng]], { color: '#0000FF', weight: 3 })
          .addTo(map);
        polylines.push({ id1: ln.id1, id2: ln.id2, line });
        addedLines++;
        if(distanceButton.checked){
          afficherDistanceLigne(line)
        }        
      }
    }
  });

  // Importer les cercles
  let addedCircles = 0;
  if (Array.isArray(data.circles)) {
    data.circles.forEach(c => {
      if (
        typeof c.lat === 'number' &&
        typeof c.lng === 'number' &&
        typeof c.radius === 'number' &&
        typeof c.color === 'string'
      ) {
        const circle = L.circle([c.lat, c.lng], {
          radius: c.radius,
          color: c.color,
          fillOpacity: 0.3
        }).addTo(map);
        attachCircleEvent(circle); // pour permettre de configurer en cliquant dessus
        circles.push({
          circle,
          lat: c.lat,
          lng: c.lng,
          radius: c.radius,
          color: c.color
        });
        addedCircles++;
      }
    });
    saveCirclesToLocalStorage(); // mettre à jour le stockage
  }


  // Régénérer la liste et sauvegarder
  renderPointList();
  saveToLocalStorage();

  ioFeedback.innerHTML =
    `<div class="text-success">${added} point(s) et ${addedLines} tracé(s) et ${addedCircles} cercle(s) ajoutés.</div>`;
});


lineCloseBtn.addEventListener('click', () => {
  currentSelectedLine = null;
  lineConfigPanel.classList.add('d-none');
});

lineDeleteBtn.addEventListener('click', () => {
  if (!currentSelectedLine) return;

  // Retirer du tableau
  const index = polylines.findIndex(e => e.line === currentSelectedLine);
  if (index !== -1) {
    // Retirer du localStorage
    polylines.splice(index, 1);
    saveToLocalStorage(); // <- Mets à jour ici
  }

  // Retirer de la carte
  map.removeLayer(currentSelectedLine);

  reloadDistanceLabels();

  // Fermer panneau
  currentSelectedLine = null;
  lineConfigPanel.classList.add('d-none');
});

function showLineConfigPanel(line) {
  closeAllConfigMenus();

  const latlngs = line.getLatLngs();
  if (latlngs.length !== 2) return;

  const dist = calculateDistance(line);
  lineDistanceInput.value = Math.round(dist);

  currentSelectedLine = line;
  lineConfigPanel.classList.remove('d-none');
}




polylines.forEach((entry) => {
  entry.line.on('click', function () {
    showLineConfigPanel(entry.line);
  });
});


function supprimerLigne(ligne) {
  // Retirer la ligne de la carte
  map.removeLayer(ligne);

  if (distanceLabels.has(ligne)) {
    map.removeLayer(distanceLabels.get(ligne));
    distanceLabels.delete(ligne);
  }

  // Retirer la ligne de localStorage
  const updatedPolylines = polylines.filter(entry => entry.line !== ligne);
  const polylinesData = updatedPolylines.map(entry => ({
    id1: entry.id1,
    id2: entry.id2,
  }));
  localStorage.setItem('mapPolylines', JSON.stringify(polylinesData));

  // Mettre à jour le tableau des polylines
  polylines = updatedPolylines;
}

document.getElementById('line-edit-btn').addEventListener('click', () => {
  if (!currentSelectedLine) return;

  const latlngs = currentSelectedLine.getLatLngs();
  originalLatLngs = [...latlngs];

  editHandles.forEach(h => map.removeLayer(h));
  editHandles = [];

  latlngs.forEach((latlng, idx) => {
    const handle = L.circleMarker(latlng, {
      radius: 6,
      color: '#ff0000',
      weight: 2,
      fillColor: '#fff',
      fillOpacity: 1,
      draggable: true
    }).addTo(map);

    // Permet le drag manuellement (Leaflet ne le supporte pas nativement sur circleMarker)
    makeHandleDraggable(handle, idx);
    editHandles.push(handle);
  });
});

function makeHandleDraggable(handle, handleIndex) {
  let startPoint = null;
  let otherEnd = null;

  handle.on('mousedown', (e) => {
    map.dragging.disable();
    startPoint = e.latlng;
    const latlngs = currentSelectedLine.getLatLngs();
    otherEnd = latlngs[handleIndex === 0 ? 1 : 0];

    map.on('mousemove', onDrag);
    map.once('mouseup', onDrop);
  });

  function onDrag(e) {
    const movedPoint = e.latlng;

    // Calcule le vecteur original
    const dx = otherEnd.lng - startPoint.lng;
    const dy = otherEnd.lat - startPoint.lat;

    const length = Math.sqrt(dx * dx + dy * dy);
    if (length === 0) return;

    // Normalisation
    const unitX = dx / length;
    const unitY = dy / length;

    // Projection du mouvement sur le vecteur
    const proj = ((movedPoint.lng - otherEnd.lng) * unitX + (movedPoint.lat - otherEnd.lat) * unitY);

    const newLat = otherEnd.lat + proj * unitY;
    const newLng = otherEnd.lng + proj * unitX;
    const newPoint = L.latLng(newLat, newLng);

    const newLatLngs = handleIndex === 0 ? [newPoint, otherEnd] : [otherEnd, newPoint];
    currentSelectedLine.setLatLngs(newLatLngs);
    handle.setLatLng(newPoint);

    // Mise à jour de l’autre handle
    editHandles[handleIndex].setLatLng(newPoint);

    // Affiche la nouvelle distance
    const dist = map.distance(newLatLngs[0], newLatLngs[1]);
    lineDistanceInput.value = Math.round(dist);
  }

  function onDrop(e) {
    map.dragging.enable();
    map.off('mousemove', onDrag);

    const finalLatLngs = currentSelectedLine.getLatLngs();
    const newCoord = finalLatLngs[handleIndex];

    // Ouvre le modal de création de point
    openPointCreationModal(newCoord, (confirmed, pointData) => {
      if (confirmed) {
        createAndAttachPoint(pointData, handleIndex);
      } else {
        // Annulé : restaurer
        if(currentSelectedLine){
          currentSelectedLine.setLatLngs(originalLatLngs);
        }
      }

      // Nettoyer
      editHandles.forEach(h => map.removeLayer(h));
      editHandles = [];
    });
  }
}

function removeHandlers(){
  // Nettoyer
  editHandles.forEach(h => map.removeLayer(h));
  editHandles = [];
}

function openPointCreationModal(coord, callback) {
  const modal = new bootstrap.Modal(createPointBtn);
  modal.show();

  document.getElementById('pointDesc').value = '';
  document.getElementById('pointColor').value = '#ff0000';

  document.getElementById('validatePointBtn').onclick = () => {
    modal.hide();
    callback(true, {
      desc: document.getElementById('pointDesc').value,
      color: document.getElementById('pointColor').value,
      coord
    });
  };

  document.getElementById('cancelPointBtn').onclick = () => {
    callback(false);
  };
}

createPointBtn.addEventListener('hide.bs.modal', function (event) {
  removeHandlers();
  if(currentSelectedLine){
    currentSelectedLine.setLatLngs(originalLatLngs);
  }
});

function createAndAttachPoint({ desc, color, coord }, handleIndex) {
  const id = nextId++;
  const marker = L.circleMarker(coord, {
    radius: 8,
    fillColor: color,
    color: '#000',
    weight: 1,
    fillOpacity: 0.9
  }).addTo(map).bindPopup(popupContent(desc, coord.lat.toFixed(5), coord.lng.toFixed(5)));

  points.push({ id, desc, lat: coord.lat, lng: coord.lng, color, marker });

  // Mise à jour de la ligne
  const otherEnd = currentSelectedLine.getLatLngs()[handleIndex === 0 ? 1 : 0];
  const otherPoint = points.find(p => p.lat === otherEnd.lat && p.lng === otherEnd.lng);
  if (!otherPoint) return;

  // Supprimer la ligne actuelle du tableau polylines
  const oldIndex = polylines.findIndex(e => e.line === currentSelectedLine);
  if (oldIndex !== -1) {
    supprimerLigne(polylines[oldIndex].line)
    // map.removeLayer(polylines[oldIndex].line);
    // polylines.splice(oldIndex, 1);
  }

  const newLine = L.polyline([coord, otherEnd], { color: '#0000FF', weight: 3 }).addTo(map);
  newLine.on('click', () => showLineConfigPanel(newLine));
  polylines.push({
    id1: id,
    id2: otherPoint.id,
    line: newLine
  });

  // map.removeLayer(currentSelectedLine); // ancienne ligne supprimée

  if (distanceButton.checked) {
    afficherDistanceLigne(newLine);
  }

  currentSelectedLine = newLine;
  renderPointList();
  saveToLocalStorage();
}



function calculateDistance(line){
  let distance = 0;
  const latlngs = line.getLatLngs();
  if (latlngs.length !== 2) return distance;

  distance = latlngs[0].distanceTo(latlngs[1]);
  return distance;
}

function afficherDistanceLigne(line) {
  const latlngs = line.getLatLngs();
  if (latlngs.length !== 2) return;

  const midLat = (latlngs[0].lat + latlngs[1].lat) / 2;
  const midLng = (latlngs[0].lng + latlngs[1].lng) / 2;
  const midPoint = L.latLng(midLat, midLng);

  const distance = latlngs[0].distanceTo(latlngs[1]);

  label = createDistanceLabel(`${distance.toFixed(0)} m`, midPoint)

  distanceLabels.set(line, label);
}

function masquerToutesLesDistances() {
  distanceLabels.forEach((label, line) => {
    map.removeLayer(label);
  });
}

function createDistanceLabel(text, latlng) {
  // Créer un élément temporaire pour mesurer
  const tempDiv = document.createElement('div');
  tempDiv.className = 'distance-label';
  tempDiv.style.position = 'absolute';
  tempDiv.style.visibility = 'hidden';
  tempDiv.innerHTML = text;
  document.body.appendChild(tempDiv);

  // Obtenir la taille réelle du contenu
  const width = tempDiv.offsetWidth;
  const height = tempDiv.offsetHeight;
  document.body.removeChild(tempDiv);

  // Créer l'icône avec cette taille
  const icon = L.divIcon({
    className: 'distance-label',
    html: text,
    iconSize: [width, height],
    iconAnchor: [width / 2, height / 2], // centré
  });

  return L.marker(latlng, {
    icon,
    interactive: false,
  }).addTo(map);
}

function reloadDistanceLabels(){
  masquerToutesLesDistances();
  if (distanceButton.checked) {    
    polylines.forEach(entry => {
        afficherDistanceLigne(entry.line);
    });
  }
}


distanceButton.addEventListener('change', function () {
  if (this.checked) {    
    polylines.forEach(entry => {
        afficherDistanceLigne(entry.line);
    });
  } else {
    masquerToutesLesDistances();
  }
});
