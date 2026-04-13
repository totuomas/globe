const GEOJSON_URL =
  'https://raw.githubusercontent.com/vasturiano/globe.gl/master/example/datasets/ne_110m_admin_0_countries.geojson';

// 🧠 Create UI elements dynamically
const infoPanel = document.getElementById("info-panel");

// ===== STATUS BAR =====
const statusContainer = document.createElement("div");
statusContainer.style.display = "flex";
statusContainer.style.alignItems = "center";
statusContainer.style.justifyContent = "space-between";
statusContainer.style.marginBottom = "8px";

const statusLeft = document.createElement("div");
statusLeft.style.display = "flex";
statusLeft.style.alignItems = "center";
statusLeft.style.gap = "6px";

const statusDot = document.createElement("div");
statusDot.style.width = "8px";
statusDot.style.height = "8px";
statusDot.style.borderRadius = "50%";
statusDot.style.background = "orange";

const apiStatusEl = document.createElement("div");
apiStatusEl.textContent = "Connecting...";
apiStatusEl.style.fontSize = "12px";

const restartBtn = document.createElement("button");
restartBtn.textContent = "↻";
restartBtn.style.background = "transparent";
restartBtn.style.border = "1px solid rgba(255,255,255,0.3)";
restartBtn.style.color = "white";
restartBtn.style.borderRadius = "6px";
restartBtn.style.cursor = "pointer";
restartBtn.style.fontSize = "12px";
restartBtn.style.padding = "2px 6px";

statusLeft.appendChild(statusDot);
statusLeft.appendChild(apiStatusEl);
statusContainer.appendChild(statusLeft);
statusContainer.appendChild(restartBtn);
infoPanel.prepend(statusContainer);

// ===== STATE =====
let apiOnline = false;
let currentRequest = null;

const countryNameEl = document.getElementById("country-name");
const partnerListEl = document.getElementById("partner-list");

// ===== HELPERS =====
function setStatus(text, color) {
  apiStatusEl.textContent = text;
  statusDot.style.background = color;
}

function updateList(data) {
  partnerListEl.innerHTML = "";

  if (data.length === 0) {
    const li = document.createElement("li");
    li.textContent = "No data available";
    partnerListEl.appendChild(li);
  } else {
    data.slice(0, 10).forEach(p => {
      const li = document.createElement("li");
      li.textContent = `${p.country} — ${p.value.toFixed(2)}%`;
      partnerListEl.appendChild(li);
    });
  }
}

// ===== API CHECK =====
async function checkApi() {
  try {
    const res = await fetch("http://localhost:3000/health");
    if (!res.ok) throw new Error();

    apiOnline = true;
    setStatus("API Online", "limegreen");

  } catch {
    apiOnline = false;
    setStatus("API Offline", "red");
  }
}

checkApi();

restartBtn.onclick = async () => {
  setStatus("Reconnecting...", "orange");
  await checkApi();
};

// ===== GLOBE =====
fetch(GEOJSON_URL)
  .then(res => res.json())
  .then(countries => {

    // ✅ ADD UNIQUE IDS + PRECOMPUTE CENTERS
    const features = countries.features.map((f, i) => {
      f.__id = i;

      const d = f.properties;
      const geometry = f.geometry;

      if (d.LABEL_Y && d.LABEL_X) {
        f.__center = { lat: d.LABEL_Y, lng: d.LABEL_X };
      } else {
        const coords = geometry.type === 'Polygon'
          ? geometry.coordinates[0]
          : geometry.coordinates[0][0];

        const lats = coords.map(c => c[1]);
        const lngs = coords.map(c => c[0]);

        f.__center = {
          lat: (Math.min(...lats) + Math.max(...lats)) / 2,
          lng: (Math.min(...lngs) + Math.max(...lngs)) / 2
        };
      }

      return f;
    });

    let lastClicked = null;
    let tradePartners = {};

    const world = Globe()(document.getElementById('globe-container'))
      .showAtmosphere(false)
      .polygonsData(features)
      .polygonAltitude(0.01)

      .polygonCapColor(d => {
        const id = d.__id;

        if (id === lastClicked?.__id) {
          return '#00cc66';
        }

        const iso = d.properties.ISO_A3;

        if (tradePartners[iso] !== undefined) {
          const p = tradePartners[iso];
          const intensity = Math.max(0.08, Math.min(1, Math.sqrt(p / 20)));
          const gb = Math.floor(255 * (1 - intensity));
          return `rgb(255, ${gb}, ${gb})`;
        }

        return '#e5e7eb';
      })

      .polygonSideColor(() => '#888')
      .polygonStrokeColor(() => '#111')

      .polygonLabel(({ properties: d }) => d.ADMIN)

      .onPolygonHover(hoverD => {
        world.polygonAltitude(d =>
          d === hoverD ? 0.05 :
          d === lastClicked ? 0.08 :
          0.01
        );
      })

      // 🚀 CLICK HANDLER
      .onPolygonClick((polygon) => {

        // ⚠️ API offline feedback
        if (!apiOnline) {
          countryNameEl.textContent = "API Offline";
          partnerListEl.innerHTML = "<li style='opacity:0.6'>Start server to load data</li>";
          return;
        }

        const iso = polygon.properties.ISO_A3;

        // 🎥 instant zoom
        const { lat, lng } = polygon.__center;

        const controls = world.controls();
        controls.enabled = false;

        lastClicked = polygon;

        world.pointOfView({ lat, lng, altitude: 1.5 }, 1000);

        setTimeout(() => {
          controls.enabled = true;
        }, 1000);

        // 🟡 loading UI
        countryNameEl.textContent = polygon.properties.ADMIN;
        partnerListEl.innerHTML = "<li style='opacity:0.6'>Loading...</li>";

        // 🛑 cancel previous request
        if (currentRequest) currentRequest.abort();

        const controller = new AbortController();
        currentRequest = controller;

        fetch(`http://localhost:3000/trade-partners?country=${iso}`, {
          signal: controller.signal
        })
          .then(res => {
            if (!res.ok) throw new Error();
            return res.json();
          })
          .then(data => {
            tradePartners = {};

            data.forEach(p => {
              if (p.value > 0.05) {
                tradePartners[p.country] = p.value;
              }
            });

            updateList(data);

            // ⚡ trigger color refresh only
            world.polygonCapColor(world.polygonCapColor());
          })
          .catch(err => {
            if (err.name === "AbortError") return;

            console.error(err);

            apiOnline = false;
            setStatus("API Offline", "red");

            partnerListEl.innerHTML = "<li style='color:#ff6b6b'>⚠️ Data unavailable</li>";
          });
      })

      .polygonsTransitionDuration(600);

    world.globeMaterial().color.set('#0b1e2d');
    world.globeMaterial().emissive.set('#112244');
    world.globeMaterial().emissiveIntensity = 0.2;

    world.pointOfView({ altitude: 2.5 });

    const controls = world.controls();
    controls.minDistance = 120;
    controls.maxDistance = 400;
    controls.enableDamping = true;

    // 🔄 reset
    world.onGlobeClick(() => {
      tradePartners = {};
      lastClicked = null;

      countryNameEl.textContent = "Select a country";
      partnerListEl.innerHTML = "";

      world.polygonCapColor(world.polygonCapColor());
      world.pointOfView({ altitude: 2.5 }, 1000);
    });

  });