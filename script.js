import { state } from "./src/state.js";
import { checkApiStatus, fetchTradePartners } from "./src/api.js";
import { createStatusBar, setStatus, updateList, showLoading, showError } from "./src/ui.js";
import { initGlobe, processFeatures } from "./src/globe.js";

const GEOJSON_URL =
  "https://raw.githubusercontent.com/vasturiano/globe.gl/master/example/datasets/ne_110m_admin_0_countries.geojson";

// ===== DOM =====
const infoPanel = document.getElementById("info-panel");
const countryNameEl = document.getElementById("country-name");
const partnerListEl = document.getElementById("partner-list");
const globeContainer = document.getElementById("globe-container");

// 👇 NEW toggle elements
const exportsBtn = document.getElementById("exports-btn");
const importsBtn = document.getElementById("imports-btn");

// ===== STATUS BAR =====
const { dot, text, btn } = createStatusBar(infoPanel);

// ===== API STATUS =====
async function checkApi() {
  setStatus(text, dot, "Connecting...", "orange");

  state.apiOnline = await checkApiStatus();

  if (state.apiOnline) {
    setStatus(text, dot, "API Online", "limegreen");
  } else {
    setStatus(text, dot, "API Offline", "red");
  }
}

btn.onclick = checkApi;
checkApi();


// ===== MODE TOGGLE =====
function setMode(mode) {
  state.tradeMode = mode;

  // update button styles
  exportsBtn.classList.toggle("active", mode === "exports");
  importsBtn.classList.toggle("active", mode === "imports");

  // update header text
  document.querySelector("#header p").textContent =
    mode === "exports"
      ? "Click a country to see its export partners"
      : "Click a country to see its import partners";

  // 🔁 if country already selected → re-fetch
  if (state.lastClicked) {
    const polygon = state.lastClicked;
    const iso = polygon.properties.ISO_A3;

    showLoading(partnerListEl);

    if (state.currentRequest) {
      state.currentRequest.abort();
    }

    const controller = new AbortController();
    state.currentRequest = controller;

    fetchTradePartners(iso, state.tradeMode, controller.signal)
      .then(data => {

        state.tradePartners = {};

        data.forEach(p => {
          if (p.value > 0.05) {
            state.tradePartners[p.country] = p.value;
          }
        });

        updateList(partnerListEl, data);

        // 🔥 FORCE GLOBE RECOLOR
        if (state.world) {
          state.world.polygonCapColor(state.world.polygonCapColor());
        }
      })
      .catch(err => {
        if (err.name === "AbortError") return;
        showError(partnerListEl);
      });
  }
}

// button events
exportsBtn.onclick = () => setMode("exports");
importsBtn.onclick = () => setMode("imports");


// ===== LOAD GLOBE =====
fetch(GEOJSON_URL)
  .then(res => res.json())
  .then(countries => {

    const features = processFeatures(countries);

    const world = initGlobe({
      container: globeContainer,
      features,
      state,

      // ===== COUNTRY CLICK =====
      async onCountryClick(polygon, world) {

        if (!state.apiOnline) {
          countryNameEl.textContent = "API Offline";
          showError(partnerListEl, "Start server to load data");
          return;
        }

        const iso = polygon.properties.ISO_A3;

        state.lastClicked = polygon;

        countryNameEl.textContent = polygon.properties.ADMIN;
        showLoading(partnerListEl);

        if (state.currentRequest) {
          state.currentRequest.abort();
        }

        const controller = new AbortController();
        state.currentRequest = controller;

        try {
          const data = await fetchTradePartners(
            iso,
            state.tradeMode, // 👈 USE MODE
            controller.signal
          );

          state.tradePartners = {};

          data.forEach(p => {
            if (p.value > 0.05) {
              state.tradePartners[p.country] = p.value;
            }
          });

          updateList(partnerListEl, data);

          // 🔥 recolor globe
          world.polygonCapColor(world.polygonCapColor());

        } catch (err) {
          if (err.name === "AbortError") return;

          console.error(err);

          state.apiOnline = false;
          setStatus(text, dot, "API Offline", "red");

          showError(partnerListEl);
        }
      },

      // ===== RESET =====
      onReset(world) {
        state.tradePartners = {};
        state.lastClicked = null;

        countryNameEl.textContent = "Select a country";
        partnerListEl.innerHTML = "";

        world.polygonCapColor(world.polygonCapColor());
        world.pointOfView({ altitude: 2.5 }, 1000);
      }
    });

    // 👇 SAVE WORLD GLOBALLY
    state.world = world;

  })
  .catch(err => {
    console.error("Failed to load GeoJSON:", err);
  });