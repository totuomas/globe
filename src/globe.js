export function processFeatures(countries) {
  return countries.features.map((f, i) => {
    f.__id = i;

    const d = f.properties;
    const geometry = f.geometry;

    if (d.LABEL_Y && d.LABEL_X) {
      f.__center = { lat: d.LABEL_Y, lng: d.LABEL_X };
    } else {
      const coords = geometry.type === "Polygon"
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
}

export function initGlobe({
  container,
  features,
  state,
  onCountryClick,
  onReset
}) {

  const world = Globe()(container)
    .backgroundImageUrl('https://unpkg.com/three-globe/example/img/night-sky.png')
    .showAtmosphere(true)
    .polygonsData(features)
    .polygonAltitude(0.01)

    .polygonCapColor(d => {
      const id = d.__id;

      // selected country
      if (id === state.lastClicked?.__id) {
        return "#00cc66";
      }

      const iso = d.properties.ISO_A3;

      // trade partners heat
      if (state.tradePartners[iso] !== undefined) {
        const p = state.tradePartners[iso];
        const intensity = Math.max(0.08, Math.min(1, Math.sqrt(p / 20)));
        const gb = Math.floor(255 * (1 - intensity));
        return `rgb(255, ${gb}, ${gb})`;
      }

      return "#e5e7eb";
    })

    .polygonSideColor(() => "#888")
    .polygonStrokeColor(() => "#111")

    .polygonLabel(({ properties }) => properties.ADMIN)

    .onPolygonHover(hoverD => {
      world.polygonAltitude(d =>
        d === hoverD || d === state.lastClicked ? 0.02 : 0.01
      );
    })

    .onPolygonClick(polygon => {
      const { lat, lng } = polygon.__center;

      const controls = world.controls();
      controls.enabled = false;

      world.pointOfView({ lat, lng, altitude: 1.5 }, 1000);

      setTimeout(() => {
        controls.enabled = true;
      }, 1000);

      onCountryClick(polygon, world);
    })

    .onGlobeClick(() => {
      onReset(world);
    })

    .polygonsTransitionDuration(200);

  // globe styling
  world.globeMaterial().color.set("#0b1e2d");
  world.globeMaterial().emissive.set("#112244");
  world.globeMaterial().emissiveIntensity = 0.2;

  world.pointOfView({ altitude: 2.5 });

  const controls = world.controls();
  controls.minDistance = 120;
  controls.maxDistance = 400;
  controls.enableDamping = true;

  return world;
}