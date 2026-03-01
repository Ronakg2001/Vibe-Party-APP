(function () {
      const form = document.getElementById("custom-location-form");
      const input = document.getElementById("location-name");
      const clearBtn = document.getElementById("clear-location");
      const mapsError = document.getElementById("maps-error");
      const suggestionsEl = document.getElementById("location-suggestions");
      const centerText = document.getElementById("map-center-text");
      const bboxText = document.getElementById("map-bbox-text");
      const next = new URLSearchParams(window.location.search).get("next") || "/home/?tab=home";
      const nameKey = "vibe_custom_location_name";
      const centerKey = "vibe_custom_location_center";
      const boundsKey = "vibe_custom_location_bounds";

      let map = null;
      let marker = null;
      let selectedCenter = null;
      let selectedBounds = null;
      let searchDebounceTimer = null;
      let searchAbortController = null;

      function formatCoord(value) {
        return Number(value).toFixed(6);
      }

      function setCenterAndBoundsFromMap() {
        if (!map) return;
        const center = map.getCenter();
        const bounds = map.getBounds();
        if (!center || !bounds) return;

        const ne = bounds.getNorthEast();
        const sw = bounds.getSouthWest();

        selectedCenter = {
          lat: center.lat(),
          lng: center.lng(),
        };
        selectedBounds = {
          north: ne.lat(),
          east: ne.lng(),
          south: sw.lat(),
          west: sw.lng(),
        };

        centerText.textContent = `${formatCoord(selectedCenter.lat)}, ${formatCoord(selectedCenter.lng)}`;
        bboxText.textContent = `N:${formatCoord(selectedBounds.north)} E:${formatCoord(selectedBounds.east)} S:${formatCoord(selectedBounds.south)} W:${formatCoord(selectedBounds.west)}`;
      }

      function setMarker(latLng) {
        if (!marker) return;
        marker.setLatLng(latLng);
      }

      function getLocalityLabel(address) {
        if (!address) return "";
        const city = address.city || address.town || address.village || "";
        const area = address.road || address.suburb || address.neighbourhood || address.city_district || "";
        const state = address.state || "";
        if (area && city) return `${area}, ${city}`;
        if (city && state) return `${city}, ${state}`;
        return area || city || state || "";
      }

      function hideSuggestions() {
        suggestionsEl.innerHTML = "";
        suggestionsEl.classList.add("hidden");
      }

      function renderSuggestions(items) {
        if (!items || items.length === 0) {
          hideSuggestions();
          return;
        }
        suggestionsEl.innerHTML = items
          .map((item, idx) => {
            const label = getLocalityLabel(item.address) || item.display_name;
            return `<button type="button" data-idx="${idx}" class="w-full text-left px-3 py-2 hover:bg-white/10 transition-colors">
              <div class="text-sm text-white">${label}</div>
              <div class="text-[11px] text-gray-400 truncate">${item.display_name}</div>
            </button>`;
          })
          .join("");
        suggestionsEl.classList.remove("hidden");
      }

      async function reverseGeocodeLocation(lat, lon) {
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&addressdetails=1`
          );
          if (!response.ok) return;
          const data = await response.json();
          const locality = getLocalityLabel(data.address);
          if (locality) {
            input.value = locality;
          } else if (data.display_name) {
            input.value = data.display_name.split(",")[0];
          }
        } catch (error) {
        }
      }

      function applySearchResult(best) {
        if (!best) return;
        const lat = Number(best.lat);
        const lon = Number(best.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

        const latLng = L.latLng(lat, lon);
        if (best.boundingbox && best.boundingbox.length === 4) {
          const south = Number(best.boundingbox[0]);
          const north = Number(best.boundingbox[1]);
          const west = Number(best.boundingbox[2]);
          const east = Number(best.boundingbox[3]);
          if ([south, north, west, east].every(Number.isFinite)) {
            const bounds = L.latLngBounds([south, west], [north, east]);
            map.fitBounds(bounds, { padding: [20, 20] });
          } else {
            map.setView(latLng, 14);
          }
        } else {
          map.setView(latLng, 14);
        }

        const locality = getLocalityLabel(best.address);
        if (locality) {
          input.value = locality;
        }

        setMarker(latLng);
        setCenterAndBoundsFromMap();
        hideSuggestions();
      }

      async function geocodeLocationText(text, limit = 1) {
        if (!map || !text) return [];
        try {
          if (searchAbortController) {
            searchAbortController.abort();
          }
          searchAbortController = new AbortController();
          const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&countrycodes=in&limit=${limit}&q=${encodeURIComponent(text)}`,
            { signal: searchAbortController.signal }
          );
          if (!response.ok) return [];
          const results = await response.json();
          if (!Array.isArray(results) || results.length === 0) return [];
          return results;
        } catch (error) {
          if (error.name !== "AbortError") {
            mapsError.textContent = "Location search failed. Try again.";
            mapsError.classList.remove("hidden");
          }
          return [];
        }
      }

      function initMap() {
        const defaultCenter = [20.5937, 78.9629];
        map = L.map("map-canvas", {
          center: defaultCenter,
          zoom: 5,
          zoomControl: true,
        });

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "&copy; OpenStreetMap contributors",
        }).addTo(map);

        marker = L.marker(defaultCenter, {
          draggable: true,
        }).addTo(map);

        const storedCenter = localStorage.getItem(centerKey);
        const storedBounds = localStorage.getItem(boundsKey);
        try {
          if (storedBounds) {
            const b = JSON.parse(storedBounds);
            if (b && typeof b.north === "number" && typeof b.east === "number" && typeof b.south === "number" && typeof b.west === "number") {
              map.fitBounds([[b.south, b.west], [b.north, b.east]], { padding: [20, 20] });
            }
          } else if (storedCenter) {
            const c = JSON.parse(storedCenter);
            if (c && typeof c.lat === "number" && typeof c.lng === "number") {
              map.setView([c.lat, c.lng], 14);
              marker.setLatLng([c.lat, c.lng]);
            }
          }
        } catch (err) {
        }

        map.on("moveend", setCenterAndBoundsFromMap);
        map.on("click", (event) => {
          if (!event.latlng) return;
          setMarker(event.latlng);
          map.panTo(event.latlng);
          setCenterAndBoundsFromMap();
          reverseGeocodeLocation(event.latlng.lat, event.latlng.lng);
          hideSuggestions();
        });
        marker.on("dragend", () => {
          const p = marker.getLatLng();
          if (!p) return;
          map.panTo(p);
          setCenterAndBoundsFromMap();
          reverseGeocodeLocation(p.lat, p.lng);
          hideSuggestions();
        });

        setTimeout(setCenterAndBoundsFromMap, 350);
      }

      input.value = localStorage.getItem(nameKey) || "";
      initMap();

      input.addEventListener("change", function () {
        geocodeLocationText(input.value.trim(), 1).then((results) => {
          if (results.length > 0) {
            applySearchResult(results[0]);
          }
        });
      });
      input.addEventListener("blur", function () {
        setTimeout(hideSuggestions, 150);
      });
      input.addEventListener("input", function () {
        const text = input.value.trim();
        mapsError.classList.add("hidden");
        if (!text) {
          hideSuggestions();
          return;
        }
        if (searchDebounceTimer) {
          clearTimeout(searchDebounceTimer);
        }
        searchDebounceTimer = setTimeout(async () => {
          const results = await geocodeLocationText(text, 5);
          renderSuggestions(results);
          suggestionsEl.querySelectorAll("button[data-idx]").forEach((btn) => {
            btn.addEventListener("click", () => {
              const idx = Number(btn.getAttribute("data-idx"));
              if (Number.isFinite(idx) && results[idx]) {
                applySearchResult(results[idx]);
              }
            });
          });
        }, 220);
      });

      form.addEventListener("submit", function (event) {
        event.preventDefault();
        const value = input.value.trim();
        if (value) {
          localStorage.setItem(nameKey, value);
        } else {
          localStorage.removeItem(nameKey);
        }

        if (selectedCenter) {
          localStorage.setItem(centerKey, JSON.stringify(selectedCenter));
        } else {
          localStorage.removeItem(centerKey);
        }
        if (selectedBounds) {
          localStorage.setItem(boundsKey, JSON.stringify(selectedBounds));
        } else {
          localStorage.removeItem(boundsKey);
        }
        window.location.href = next;
      });

      clearBtn.addEventListener("click", function () {
        localStorage.removeItem(nameKey);
        localStorage.removeItem(centerKey);
        localStorage.removeItem(boundsKey);
        input.value = "";
        selectedCenter = null;
        selectedBounds = null;
        centerText.textContent = "--";
        bboxText.textContent = "--";
        mapsError.classList.add("hidden");
        if (map && marker) {
          const fallback = L.latLng(20.5937, 78.9629);
          map.setView(fallback, 5);
          marker.setLatLng(fallback);
          setCenterAndBoundsFromMap();
        }
      });
    })();
