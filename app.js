/* ═══════════════════════════════════════════════════════
   ROS Energy Abundance Index — Interactive Application
   ═══════════════════════════════════════════════════════ */

(function() {
  'use strict';

  // ── Utility Functions ──
  function fmt(n, decimals) {
    if (n == null) return '—';
    if (decimals === undefined) decimals = 0;
    return Number(n).toLocaleString('en-US', { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
  }

  function fmtCompact(n) {
    if (n == null) return '—';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return n.toFixed(0);
  }

  function scoreColor(score) {
    if (score == null) return '#666';
    if (score >= 75) return '#22c55e';
    if (score >= 50) return '#84cc16';
    if (score >= 25) return '#f59e0b';
    return '#ef4444';
  }

  function scoreClass(score) {
    if (score == null) return '';
    if (score >= 75) return 'score-excellent';
    if (score >= 50) return 'score-good';
    if (score >= 25) return 'score-fair';
    return 'score-poor';
  }

  function getRegion(iso3) {
    return (typeof REGION_MAP !== 'undefined' && REGION_MAP[iso3]) || 'Other';
  }

  const REGION_COLORS = {
    'Europe': '#60a5fa',
    'Asia': '#f472b6',
    'Africa': '#fbbf24',
    'North America': '#34d399',
    'South America': '#a78bfa',
    'Oceania': '#38bdf8',
    'Middle East': '#fb923c',
    'Central Asia': '#e879f9',
    'Other': '#888'
  };

  // ── Mobile Menu ──
  const menuBtn = document.getElementById('mobile-menu-btn');
  const mobileMenu = document.getElementById('mobile-menu');
  if (menuBtn) {
    menuBtn.addEventListener('click', function() {
      mobileMenu.classList.toggle('active');
    });
    mobileMenu.querySelectorAll('.mobile-link').forEach(function(link) {
      link.addEventListener('click', function() {
        mobileMenu.classList.remove('active');
      });
    });
  }

  // ── Quick Glance Lists ──
  function buildGlanceLists() {
    var top10 = EAI_DATA.slice(0, 10);
    var bottom10 = EAI_DATA.slice(-10).reverse();
    var majorISO = ['USA','FRA','JPN','DEU','RUS','CHN','GBR','BRA','IND','NGA'];
    var majors = majorISO.map(function(iso) {
      return EAI_DATA.find(function(d) { return d.iso3 === iso; });
    }).filter(Boolean);

    function renderList(el, items) {
      el.innerHTML = items.map(function(c) {
        return '<div class="glance-row">' +
          '<span class="glance-rank">#' + c.rank + '</span>' +
          '<span class="glance-name" data-iso="' + c.iso3 + '">' + c.country + '</span>' +
          '<span class="glance-score ' + scoreClass(c.score) + '">' + (c.score != null ? c.score.toFixed(1) : '—') + '</span>' +
        '</div>';
      }).join('');

      el.querySelectorAll('.glance-name').forEach(function(nameEl) {
        nameEl.addEventListener('click', function() {
          openCountryModal(nameEl.getAttribute('data-iso'));
        });
      });
    }

    renderList(document.getElementById('top-10-list'), top10);
    renderList(document.getElementById('bottom-10-list'), bottom10);
    renderList(document.getElementById('major-economies-list'), majors);
  }

  // ── World Map (Leaflet + GeoJSON choropleth) ──
  var worldMap = null;
  var geoLayer = null;

  function initMap() {
    worldMap = L.map('world-map', {
      center: [20, 0],
      zoom: 2,
      minZoom: 2,
      maxZoom: 7,
      zoomControl: true,
      attributionControl: false,
      worldCopyJump: true
    });

    // Dark tile layer (base)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 19
    }).addTo(worldMap);

    // Create a custom pane for labels so they render above the choropleth
    worldMap.createPane('labels');
    worldMap.getPane('labels').style.zIndex = 450;
    worldMap.getPane('labels').style.pointerEvents = 'none';

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 19,
      pane: 'labels'
    }).addTo(worldMap);

    // Load GeoJSON
    loadGeoJSON();
  }

  // ISO numeric to ISO3 mapping for TopoJSON country IDs
  var NUM_TO_ISO3 = {
    '004':'AFG','008':'ALB','012':'DZA','016':'ASM','020':'AND','024':'AGO','028':'ATG',
    '031':'AZE','032':'ARG','036':'AUS','040':'AUT','044':'BHS','048':'BHR','050':'BGD',
    '051':'ARM','052':'BRB','056':'BEL','064':'BTN','068':'BOL','070':'BIH','072':'BWA',
    '076':'BRA','084':'BLZ','090':'SLB','092':'VGB','096':'BRN','100':'BGR','104':'MMR',
    '108':'BDI','112':'BLR','116':'KHM','120':'CMR','124':'CAN','132':'CPV','140':'CAF',
    '144':'LKA','148':'TCD','152':'CHL','156':'CHN','170':'COL','174':'COM','178':'COG',
    '180':'COD','184':'COK','188':'CRI','191':'HRV','192':'CUB','196':'CYP','203':'CZE',
    '204':'BEN','208':'DNK','214':'DOM','218':'ECU','222':'SLV','226':'GNQ','231':'ETH',
    '232':'ERI','233':'EST','242':'FJI','246':'FIN','250':'FRA','258':'PYF','262':'DJI',
    '266':'GAB','268':'GEO','270':'GMB','275':'PSE','276':'DEU','288':'GHA','292':'GIB',
    '296':'KIR','300':'GRC','304':'GRL','308':'GRD','316':'GUM','320':'GTM','324':'GIN',
    '328':'GUY','332':'HTI','340':'HND','344':'HKG','348':'HUN','352':'ISL','356':'IND',
    '360':'IDN','364':'IRN','368':'IRQ','372':'IRL','376':'ISR','380':'ITA','384':'CIV',
    '388':'JAM','392':'JPN','398':'KAZ','400':'JOR','404':'KEN','408':'PRK','410':'KOR',
    '414':'KWT','417':'KGZ','418':'LAO','422':'LBN','426':'LSO','428':'LVA','430':'LBR',
    '434':'LBY','438':'LIE','440':'LTU','442':'LUX','450':'MDG','454':'MWI','458':'MYS',
    '462':'MDV','466':'MLI','470':'MLT','478':'MRT','480':'MUS','484':'MEX','496':'MNG',
    '498':'MDA','499':'MNE','504':'MAR','508':'MOZ','512':'OMN','516':'NAM','520':'NRU',
    '524':'NPL','528':'NLD','540':'NCL','548':'VUT','554':'NZL','558':'NIC','562':'NER',
    '566':'NGA','570':'NIU','578':'NOR','586':'PAK','591':'PAN','598':'PNG','600':'PRY',
    '604':'PER','608':'PHL','616':'POL','620':'PRT','630':'PRI','634':'QAT','642':'ROU',
    '643':'RUS','646':'RWA','659':'KNA','662':'LCA','670':'VCT','674':'SMR',
    '678':'STP','682':'SAU','686':'SEN','688':'SRB','690':'SYC','694':'SLE','702':'SGP',
    '703':'SVK','704':'VNM','705':'SVN','706':'SOM','710':'ZAF','716':'ZWE','724':'ESP',
    '728':'SSD','729':'SDN','740':'SUR','748':'SWZ','752':'SWE','756':'CHE','760':'SYR',
    '762':'TJK','764':'THA','768':'TGO','776':'TON','780':'TTO','784':'ARE','788':'TUN',
    '792':'TUR','795':'TKM','798':'TUV','800':'UGA','804':'UKR','807':'MKD','818':'EGY',
    '826':'GBR','834':'TZA','840':'USA','854':'BFA','858':'URY','860':'UZB','862':'VEN',
    '882':'WSM','887':'YEM','894':'ZMB',
    '158':'TWN','-99':'CYP','732':'ESH',
    '010':'ATA','074':'BVT','162':'CXI','166':'CCK','238':'FLK','254':'GUF',
    '260':'GFS','312':'GLP','474':'MTQ','175':'MYT','533':'ABW','531':'CUW',
    '534':'SXM','535':'BES','796':'TCA','136':'CYM','060':'BMU',
    '580':'MNP','316':'GUM','850':'VIR','663':'MSR','654':'SHN',
    '234':'FRO','831':'GGY','832':'JEY','833':'IMN',
    '900':'XKX'
  };

  // Fix antimeridian-crossing polygons (Russia, Fiji, etc.)
  // Splits any ring that jumps >180 degrees longitude into separate polygons
  function fixAntimeridian(geojson) {
    var fixedFeatures = [];
    geojson.features.forEach(function(feature) {
      var geom = feature.geometry;
      if (!geom) { fixedFeatures.push(feature); return; }

      if (geom.type === 'Polygon') {
        var split = splitPolygonRings(geom.coordinates);
        if (split.length === 1) {
          fixedFeatures.push(feature);
        } else {
          // Convert to MultiPolygon
          fixedFeatures.push({
            type: 'Feature',
            id: feature.id,
            properties: feature.properties,
            geometry: { type: 'MultiPolygon', coordinates: split.map(function(r) { return [r]; }) }
          });
        }
      } else if (geom.type === 'MultiPolygon') {
        var allPolys = [];
        geom.coordinates.forEach(function(polygon) {
          var split = splitPolygonRings(polygon);
          split.forEach(function(ring) { allPolys.push([ring]); });
        });
        fixedFeatures.push({
          type: 'Feature',
          id: feature.id,
          properties: feature.properties,
          geometry: { type: 'MultiPolygon', coordinates: allPolys }
        });
      } else {
        fixedFeatures.push(feature);
      }
    });
    return { type: 'FeatureCollection', features: fixedFeatures };
  }

  function splitPolygonRings(rings) {
    // Only process the outer ring (index 0)
    var outer = rings[0];
    if (!outer || outer.length < 3) return [outer];

    // Check if this ring crosses the antimeridian
    var crosses = false;
    for (var i = 1; i < outer.length; i++) {
      if (Math.abs(outer[i][0] - outer[i-1][0]) > 180) {
        crosses = true;
        break;
      }
    }

    if (!crosses) return [outer];

    // Split into west (<0) and east (>0) segments
    var westRing = [];
    var eastRing = [];

    for (var i = 0; i < outer.length; i++) {
      var pt = outer[i];
      var lng = pt[0];
      var lat = pt[1];

      if (lng > 0) {
        eastRing.push([lng, lat]);
        // Add boundary point to west ring
        westRing.push([-180, lat]);
      } else {
        westRing.push([lng, lat]);
        // Add boundary point to east ring
        eastRing.push([180, lat]);
      }
    }

    // Close rings if needed
    var result = [];
    if (eastRing.length >= 3) {
      if (eastRing[0][0] !== eastRing[eastRing.length-1][0] || eastRing[0][1] !== eastRing[eastRing.length-1][1]) {
        eastRing.push(eastRing[0]);
      }
      result.push(eastRing);
    }
    if (westRing.length >= 3) {
      if (westRing[0][0] !== westRing[westRing.length-1][0] || westRing[0][1] !== westRing[westRing.length-1][1]) {
        westRing.push(westRing[0]);
      }
      result.push(westRing);
    }

    return result.length > 0 ? result : [outer];
  }

  function loadGeoJSON() {
    var url = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';
    fetch(url)
      .then(function(r) { return r.json(); })
      .then(function(topology) {
        // Use the proper topojson-client library to decode
        var geojson = topojson.feature(topology, topology.objects.countries);

        // Inject ISO3 codes from numeric IDs
        geojson.features.forEach(function(f) {
          var numId = String(f.id || (f.properties && f.properties.id) || '');
          f.properties = f.properties || {};
          f.properties.ISO_A3 = NUM_TO_ISO3[numId] || numId;
        });

        // Fix antimeridian-crossing countries (Russia, Fiji, etc.)
        geojson = fixAntimeridian(geojson);

        renderChoropleth(geojson);
        hideMapLoading();
      })
      .catch(function(err) {
        console.warn('TopoJSON load failed, trying GeoJSON fallback:', err);
        fetch('https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson')
          .then(function(r) { return r.json(); })
          .then(function(geojson) {
            geojson = fixAntimeridian(geojson);
            renderChoropleth(geojson);
            hideMapLoading();
          })
          .catch(function() {
            console.warn('Could not load map data.');
            hideMapLoading();
          });
      });
  }

  function getCountryColor(score) {
    if (score == null) return '#222';
    // Gradient: red (0) -> yellow (40) -> green (80+)
    if (score >= 80) {
      var t = Math.min((score - 80) / 20, 1);
      return lerpColor('#22c55e', '#15803d', t);
    }
    if (score >= 50) {
      var t = (score - 50) / 30;
      return lerpColor('#f59e0b', '#22c55e', t);
    }
    if (score >= 25) {
      var t = (score - 25) / 25;
      return lerpColor('#ef4444', '#f59e0b', t);
    }
    var t = score / 25;
    return lerpColor('#7f1d1d', '#ef4444', t);
  }

  function lerpColor(a, b, t) {
    var ar = parseInt(a.slice(1,3),16), ag = parseInt(a.slice(3,5),16), ab = parseInt(a.slice(5,7),16);
    var br = parseInt(b.slice(1,3),16), bg = parseInt(b.slice(3,5),16), bb = parseInt(b.slice(5,7),16);
    var r = Math.round(ar + (br-ar)*t).toString(16).padStart(2,'0');
    var g = Math.round(ag + (bg-ag)*t).toString(16).padStart(2,'0');
    var bl = Math.round(ab + (bb-ab)*t).toString(16).padStart(2,'0');
    return '#' + r + g + bl;
  }

  function findCountryData(iso3) {
    return EAI_DATA.find(function(d) { return d.iso3 === iso3; });
  }

  // Build a lookup by ISO3 for fast access
  var dataByISO = {};
  EAI_DATA.forEach(function(d) { dataByISO[d.iso3] = d; });

  function renderChoropleth(geojson) {
    geoLayer = L.geoJSON(geojson, {
      style: function(feature) {
        var iso = feature.properties.ISO_A3 || feature.properties.iso_a3 || feature.properties.ISO3 || '';
        var d = dataByISO[iso];
        return {
          fillColor: d ? getCountryColor(d.score) : '#1a1a1a',
          weight: 0.5,
          color: 'rgba(255,255,255,0.1)',
          fillOpacity: d ? 0.85 : 0.3
        };
      },
      onEachFeature: function(feature, layer) {
        var iso = feature.properties.ISO_A3 || feature.properties.iso_a3 || feature.properties.ISO3 || '';
        var d = dataByISO[iso];

        layer.on('mouseover', function(e) {
          layer.setStyle({ weight: 2, color: '#10b981', fillOpacity: 1 });
          layer.bringToFront();
          if (d) showMapTooltip(e, d);
        });

        layer.on('mousemove', function(e) {
          if (d) moveMapTooltip(e);
        });

        layer.on('mouseout', function() {
          geoLayer.resetStyle(layer);
          hideMapTooltip();
        });

        layer.on('click', function() {
          if (d) openCountryModal(d.iso3);
        });
      }
    }).addTo(worldMap);
  }

  function renderMarkers() {
    // Fallback: place circle markers for each country (needs lat/lng, skip for now)
    console.log('Marker fallback not implemented — map will show tiles only.');
  }

  var mapTooltip = document.getElementById('map-tooltip');

  function showMapTooltip(e, d) {
    mapTooltip.innerHTML =
      '<div class="tooltip-country">' + d.country + '</div>' +
      '<div class="tooltip-rank">Rank #' + d.rank + ' &mdash; Score ' + (d.score != null ? d.score.toFixed(1) : '—') + '</div>' +
      '<div class="tooltip-metrics">' +
        '<span class="tooltip-metric-label">Electricity</span><span class="tooltip-metric-value">' + fmt(d.electricityPerCapita) + ' kWh</span>' +
        '<span class="tooltip-metric-label">Primary Energy</span><span class="tooltip-metric-value">' + fmt(d.primaryEnergy) + ' kWh</span>' +
        '<span class="tooltip-metric-label">Electrification</span><span class="tooltip-metric-value">' + (d.electrificationRatio != null ? (d.electrificationRatio * 100).toFixed(1) + '%' : '—') + '</span>' +
        '<span class="tooltip-metric-label">Low-Carbon</span><span class="tooltip-metric-value">' + (d.lowCarbonShare != null ? d.lowCarbonShare.toFixed(1) + '%' : '—') + '</span>' +
      '</div>';
    mapTooltip.classList.add('active');
    moveMapTooltip(e);
  }

  function moveMapTooltip(e) {
    var mapRect = document.getElementById('world-map').getBoundingClientRect();
    var x = e.originalEvent.clientX - mapRect.left + 16;
    var y = e.originalEvent.clientY - mapRect.top - 10;
    // Keep in bounds
    if (x + 260 > mapRect.width) x = x - 280;
    if (y + 160 > mapRect.height) y = mapRect.height - 170;
    if (y < 10) y = 10;
    mapTooltip.style.left = x + 'px';
    mapTooltip.style.top = y + 'px';
  }

  function hideMapTooltip() {
    mapTooltip.classList.remove('active');
  }

  // ── Rankings Table ──
  var currentSort = 'rank-asc';
  var currentSearch = '';
  var currentRegion = 'all';

  function renderRankings() {
    var filtered = EAI_DATA.filter(function(d) {
      if (currentRegion !== 'all' && getRegion(d.iso3) !== currentRegion) return false;
      if (currentSearch) {
        var q = currentSearch.toLowerCase();
        var name = (d.country || '').toLowerCase();
        var iso = (d.iso3 || '').toLowerCase();
        return name.indexOf(q) !== -1 || iso.indexOf(q) !== -1;
      }
      return true;
    });

    // Sort
    var parts = currentSort.split('-');
    var field = parts[0];
    var dir = parts[1] === 'desc' ? -1 : 1;

    filtered.sort(function(a, b) {
      var va, vb;
      switch(field) {
        case 'rank': va = a.rank; vb = b.rank; break;
        case 'name': va = a.country; vb = b.country; return dir * va.localeCompare(vb);
        case 'electricity': va = a.electricityPerCapita || 0; vb = b.electricityPerCapita || 0; break;
        case 'energy': va = a.primaryEnergy || 0; vb = b.primaryEnergy || 0; break;
        case 'electrification': va = a.electrificationRatio || 0; vb = b.electrificationRatio || 0; break;
        case 'gdp': va = a.gdpPerCapita || 0; vb = b.gdpPerCapita || 0; break;
        case 'lowcarbon': va = a.lowCarbonShare || 0; vb = b.lowCarbonShare || 0; break;
        default: va = a.rank; vb = b.rank;
      }
      return dir * (va - vb);
    });

    var body = document.getElementById('rankings-body');
    body.innerHTML = filtered.map(function(d) {
      var barWidth = d.score != null ? Math.max(d.score, 1) : 0;
      return '<tr data-iso="' + d.iso3 + '">' +
        '<td class="td-rank">' + d.rank + '</td>' +
        '<td class="td-country">' + d.country + '</td>' +
        '<td class="td-score ' + scoreClass(d.score) + '">' + (d.score != null ? d.score.toFixed(1) : '—') + '</td>' +
        '<td class="score-bar-cell"><div class="score-bar"><div class="score-bar-fill" style="width:' + barWidth + '%;background:' + scoreColor(d.score) + '"></div></div></td>' +
        '<td class="td-metric">' + fmt(d.electricityPerCapita) + '</td>' +
        '<td class="td-metric">' + fmt(d.primaryEnergy) + '</td>' +
        '<td class="td-metric">' + (d.electrificationRatio != null ? (d.electrificationRatio * 100).toFixed(1) + '%' : '—') + '</td>' +
        '<td class="td-metric">$' + fmt(d.gdpPerCapita) + '</td>' +
        '<td class="td-metric">' + (d.lowCarbonShare != null ? d.lowCarbonShare.toFixed(1) + '%' : '—') + '</td>' +
      '</tr>';
    }).join('');

    document.getElementById('results-count').textContent = filtered.length + ' countries';

    // Row click
    body.querySelectorAll('tr').forEach(function(row) {
      row.addEventListener('click', function() {
        openCountryModal(row.getAttribute('data-iso'));
      });
    });
  }

  // Filter event listeners
  document.getElementById('search-input').addEventListener('input', function(e) {
    currentSearch = e.target.value;
    renderRankings();
  });

  document.getElementById('region-filter').addEventListener('change', function(e) {
    currentRegion = e.target.value;
    renderRankings();
  });

  document.getElementById('sort-select').addEventListener('change', function(e) {
    currentSort = e.target.value;
    renderRankings();
  });

  document.getElementById('reset-filters').addEventListener('click', function() {
    currentSearch = '';
    currentRegion = 'all';
    currentSort = 'rank-asc';
    document.getElementById('search-input').value = '';
    document.getElementById('region-filter').value = 'all';
    document.getElementById('sort-select').value = 'rank-asc';
    renderRankings();
  });

  // CSV Export
  document.getElementById('export-csv').addEventListener('click', function() {
    var csv = 'Rank,Country,ISO3,Score,System Score,Electricity (kWh/person),Primary Energy (kWh/person),Electrification Ratio,Low-Carbon Share (%),GDP per Capita ($),Region\n';
    EAI_DATA.forEach(function(d) {
      csv += [d.rank, '"' + d.country + '"', d.iso3, d.score, d.systemScore,
              d.electricityPerCapita, d.primaryEnergy, d.electrificationRatio,
              d.lowCarbonShare, d.gdpPerCapita, getRegion(d.iso3)].join(',') + '\n';
    });
    var blob = new Blob([csv], { type: 'text/csv' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'ROS_Energy_Abundance_Index.csv';
    a.click();
    URL.revokeObjectURL(url);
  });

  // ── Country Detail Modal ──
  var modalOverlay = document.getElementById('modal-overlay');
  var modalContent = document.getElementById('modal-content');

  function openCountryModal(iso3) {
    var d = dataByISO[iso3];
    if (!d) return;

    var sc = d.score != null ? d.score : 0;

    modalContent.innerHTML =
      '<div class="modal-country-name">' + d.country + '</div>' +
      '<div class="modal-rank-line">Rank #' + d.rank + ' of 217 &bull; System Rank #' + d.systemRank + ' &bull; Raw Energy Rank #' + d.rawEnergyRank + '</div>' +

      '<div class="modal-score-display">' +
        '<div class="modal-score-num ' + scoreClass(d.score) + '">' + (d.score != null ? d.score.toFixed(1) : '—') + '</div>' +
        '<div class="modal-score-details">' +
          '<div class="modal-score-bar"><div class="modal-score-bar-fill" style="width:' + sc + '%;background:' + scoreColor(d.score) + '"></div></div>' +
          '<div class="modal-score-label">ROS-EAI Lived Score (0-100)</div>' +
        '</div>' +
      '</div>' +

      '<div class="modal-metrics-grid">' +
        metricCard('Electricity/Person', fmt(d.electricityPerCapita), 'kWh/year') +
        metricCard('Primary Energy/Person', fmt(d.primaryEnergy), 'kWh/year') +
        metricCard('Electrification Ratio', d.electrificationRatio != null ? (d.electrificationRatio * 100).toFixed(1) + '%' : '—', 'elec/energy') +
        metricCard('Low-Carbon Share', d.lowCarbonShare != null ? d.lowCarbonShare.toFixed(1) + '%' : '—', 'of electricity') +
        metricCard('GDP per Capita', '$' + fmt(d.gdpPerCapita), 'current US$') +
        metricCard('Region', getRegion(d.iso3), '') +
      '</div>' +

      '<div class="modal-subscores">' +
        '<div class="modal-subscores-title">Component Subscores</div>' +
        subscoreRow('Electricity', d.electricitySubscore, '#60a5fa') +
        subscoreRow('Primary Energy', d.primaryEnergySubscore, '#f59e0b') +
        subscoreRow('Electrification', d.electrificationSubscore, '#22c55e') +
        subscoreRow('Low-Carbon (context)', d.lowCarbonSubscore, '#a78bfa') +
      '</div>';

    modalOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function metricCard(label, value, unit) {
    return '<div class="modal-metric-card">' +
      '<div class="modal-metric-label">' + label + '</div>' +
      '<div class="modal-metric-value">' + value + (unit ? ' <span class="modal-metric-unit">' + unit + '</span>' : '') + '</div>' +
    '</div>';
  }

  function subscoreRow(label, value, color) {
    var w = value != null ? Math.max(value, 1) : 0;
    return '<div class="modal-subscore-row">' +
      '<span class="modal-subscore-label">' + label + '</span>' +
      '<div class="modal-subscore-bar"><div class="modal-subscore-fill" style="width:' + w + '%;background:' + color + '"></div></div>' +
      '<span class="modal-subscore-val" style="color:' + color + '">' + (value != null ? value.toFixed(0) : '—') + '</span>' +
    '</div>';
  }

  function closeModal() {
    modalOverlay.classList.remove('active');
    document.body.style.overflow = '';
  }

  document.getElementById('modal-close').addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', function(e) {
    if (e.target === modalOverlay) closeModal();
  });
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeModal();
  });

  // ── Biggest Movers ──
  function buildMovers() {
    var drops = [
      { name: 'Falkland Islands', raw: 31, eai: 107 },
      { name: 'Turkmenistan', raw: 21, eai: 97 },
      { name: 'Luxembourg', raw: 24, eai: 90 },
      { name: 'Iran', raw: 39, eai: 104 },
      { name: 'Trinidad & Tobago', raw: 8, eai: 64 },
      { name: 'Singapore', raw: 2, eai: 31 },
      { name: 'Qatar', raw: 1, eai: 17 },
      { name: 'Brunei', raw: 6, eai: 27 }
    ];

    var rises = [
      { name: 'Paraguay', raw: 136, eai: 75 },
      { name: 'Uruguay', raw: 112, eai: 55 },
      { name: 'Albania', raw: 134, eai: 78 },
      { name: 'Montenegro', raw: 94, eai: 39 },
      { name: 'Israel', raw: 57, eai: 13 },
      { name: 'Costa Rica', raw: 127, eai: 73 },
      { name: 'Georgia', raw: 130, eai: 84 },
      { name: 'North Macedonia', raw: 110, eai: 70 }
    ];

    function renderMovers(el, items, isDrops) {
      el.innerHTML = items.map(function(m) {
        var delta = m.raw - m.eai;
        return '<div class="mover-row">' +
          '<span class="mover-name">' + m.name + '</span>' +
          '<span class="mover-ranks">#' + m.raw + ' → #' + m.eai + '</span>' +
          '<span class="mover-change ' + (isDrops ? 'down' : 'up') + '">' + (isDrops ? '↓' : '↑') + Math.abs(delta) + '</span>' +
        '</div>';
      }).join('');
    }

    renderMovers(document.getElementById('movers-drops'), drops, true);
    renderMovers(document.getElementById('movers-rises'), rises, false);
  }

  // ── Country Comparison Tool ──
  function initComparison() {
    // Populate all 4 selectors
    for (var i = 1; i <= 4; i++) {
      var sel = document.getElementById('compare-' + i);
      EAI_DATA.forEach(function(d) {
        var opt = document.createElement('option');
        opt.value = d.iso3;
        opt.textContent = '#' + d.rank + ' ' + d.country;
        sel.appendChild(opt);
      });
      sel.addEventListener('change', updateComparison);
    }

    // Set defaults
    document.getElementById('compare-1').value = 'USA';
    document.getElementById('compare-2').value = 'CHN';
    document.getElementById('compare-3').value = 'IND';
    document.getElementById('compare-4').value = 'NGA';
    updateComparison();
  }

  function updateComparison() {
    var results = document.getElementById('compare-results');
    var selected = [];
    for (var i = 1; i <= 4; i++) {
      var iso = document.getElementById('compare-' + i).value;
      if (iso) {
        var d = dataByISO[iso];
        if (d) selected.push(d);
      }
    }

    if (selected.length === 0) {
      results.innerHTML = '<div class="no-results"><p class="no-results-text">Select countries to compare.</p></div>';
      return;
    }

    results.innerHTML = selected.map(function(d) {
      var sc = d.score || 0;
      return '<div class="compare-card">' +
        '<div class="compare-country-name">' + d.country + '</div>' +
        '<div class="compare-rank-badge">#' + d.rank + '</div>' +
        '<div class="compare-score-big ' + scoreClass(d.score) + '">' + (d.score != null ? d.score.toFixed(1) : '—') + '</div>' +
        '<div class="compare-score-label">ROS-EAI Score</div>' +
        '<div class="compare-metrics">' +
          compareRow('Electricity/person', fmt(d.electricityPerCapita) + ' kWh') +
          compareRow('Primary energy/person', fmt(d.primaryEnergy) + ' kWh') +
          compareRow('Electrification ratio', d.electrificationRatio != null ? (d.electrificationRatio*100).toFixed(1)+'%' : '—') +
          compareRow('Low-carbon share', d.lowCarbonShare != null ? d.lowCarbonShare.toFixed(1)+'%' : '—') +
          compareRow('GDP per capita', '$' + fmt(d.gdpPerCapita)) +
        '</div>' +
        '<div class="compare-bar-wrapper">' +
          compareBar('Overall Score', sc, scoreColor(d.score)) +
          compareBar('Electricity', d.electricitySubscore, '#60a5fa') +
          compareBar('Energy', d.primaryEnergySubscore, '#f59e0b') +
          compareBar('Electrification', d.electrificationSubscore, '#22c55e') +
        '</div>' +
      '</div>';
    }).join('');
  }

  function compareRow(label, value) {
    return '<div class="compare-metric"><span class="compare-metric-label">' + label + '</span><span class="compare-metric-value">' + value + '</span></div>';
  }

  function compareBar(label, value, color) {
    var w = value != null ? Math.max(value, 1) : 0;
    return '<div class="compare-bar-label">' + label + ': ' + (value != null ? value.toFixed(0) : '—') + '</div>' +
      '<div class="compare-bar-track"><div class="compare-bar-fill" style="width:' + w + '%;background:' + color + '"></div></div>';
  }

  // ── Scatter Chart (Canvas) ──
  var scatterCanvas = document.getElementById('scatter-chart');
  var scatterCtx = scatterCanvas ? scatterCanvas.getContext('2d') : null;
  var chartTooltip = document.getElementById('chart-tooltip');
  var hoveredPoint = null;

  var FIELD_LABELS = {
    score: 'ROS-EAI Score',
    gdpPerCapita: 'GDP per Capita ($)',
    primaryEnergy: 'Primary Energy (kWh/person)',
    electricityPerCapita: 'Electricity (kWh/person)',
    electrificationRatio: 'Electrification Ratio',
    lowCarbonShare: 'Low-Carbon Share (%)'
  };

  function drawScatter() {
    if (!scatterCtx) return;

    var xField = document.getElementById('chart-x').value;
    var yField = document.getElementById('chart-y').value;
    var colorBy = document.getElementById('chart-color').value;

    var dpr = window.devicePixelRatio || 1;
    var rect = scatterCanvas.parentElement.getBoundingClientRect();
    var w = rect.width - 48; // account for padding
    var h = 500;
    scatterCanvas.width = w * dpr;
    scatterCanvas.height = h * dpr;
    scatterCanvas.style.width = w + 'px';
    scatterCanvas.style.height = h + 'px';
    scatterCtx.scale(dpr, dpr);

    var pad = { top: 30, right: 30, bottom: 50, left: 70 };
    var plotW = w - pad.left - pad.right;
    var plotH = h - pad.top - pad.bottom;

    // Get data points
    var points = [];
    EAI_DATA.forEach(function(d) {
      var xv = d[xField];
      var yv = d[yField];
      if (xv != null && yv != null) {
        points.push({ d: d, x: xv, y: yv });
      }
    });

    if (points.length === 0) return;

    // Scales (with log option for energy/GDP)
    var useLogX = (xField === 'gdpPerCapita' || xField === 'primaryEnergy' || xField === 'electricityPerCapita');
    var useLogY = (yField === 'gdpPerCapita' || yField === 'primaryEnergy' || yField === 'electricityPerCapita');

    var xVals = points.map(function(p) { return useLogX ? Math.log10(Math.max(p.x, 1)) : p.x; });
    var yVals = points.map(function(p) { return useLogY ? Math.log10(Math.max(p.y, 1)) : p.y; });

    var xMin = Math.min.apply(null, xVals);
    var xMax = Math.max.apply(null, xVals);
    var yMin = Math.min.apply(null, yVals);
    var yMax = Math.max.apply(null, yVals);
    var xRange = xMax - xMin || 1;
    var yRange = yMax - yMin || 1;
    xMin -= xRange * 0.05; xMax += xRange * 0.05;
    yMin -= yRange * 0.05; yMax += yRange * 0.05;
    xRange = xMax - xMin;
    yRange = yMax - yMin;

    function sx(v) { return pad.left + ((useLogX ? Math.log10(Math.max(v,1)) : v) - xMin) / xRange * plotW; }
    function sy(v) { return pad.top + plotH - ((useLogY ? Math.log10(Math.max(v,1)) : v) - yMin) / yRange * plotH; }

    // Clear
    scatterCtx.clearRect(0, 0, w, h);

    // Grid
    scatterCtx.strokeStyle = 'rgba(255,255,255,0.06)';
    scatterCtx.lineWidth = 1;
    for (var i = 0; i <= 5; i++) {
      var gx = pad.left + (plotW / 5) * i;
      var gy = pad.top + (plotH / 5) * i;
      scatterCtx.beginPath(); scatterCtx.moveTo(gx, pad.top); scatterCtx.lineTo(gx, pad.top + plotH); scatterCtx.stroke();
      scatterCtx.beginPath(); scatterCtx.moveTo(pad.left, gy); scatterCtx.lineTo(pad.left + plotW, gy); scatterCtx.stroke();
    }

    // Axis labels
    scatterCtx.fillStyle = 'rgba(240,240,250,0.4)';
    scatterCtx.font = '12px Inter, sans-serif';
    scatterCtx.textAlign = 'center';
    scatterCtx.fillText(FIELD_LABELS[xField] || xField, pad.left + plotW/2, h - 8);
    scatterCtx.save();
    scatterCtx.translate(14, pad.top + plotH/2);
    scatterCtx.rotate(-Math.PI/2);
    scatterCtx.fillText(FIELD_LABELS[yField] || yField, 0, 0);
    scatterCtx.restore();

    // Points with stored positions for hover
    var drawnPoints = [];
    points.forEach(function(p) {
      var px = sx(p.x);
      var py = sy(p.y);
      var color;

      if (colorBy === 'region') {
        color = REGION_COLORS[getRegion(p.d.iso3)] || '#888';
      } else if (colorBy === 'score') {
        color = scoreColor(p.d.score);
      } else if (colorBy === 'lowCarbonShare') {
        var lc = p.d.lowCarbonShare || 0;
        color = lerpColor('#ef4444', '#22c55e', lc / 100);
      } else {
        color = '#10b981';
      }

      scatterCtx.globalAlpha = 0.75;
      scatterCtx.fillStyle = color;
      scatterCtx.beginPath();
      scatterCtx.arc(px, py, 5, 0, Math.PI * 2);
      scatterCtx.fill();

      drawnPoints.push({ px: px, py: py, d: p.d, color: color });
    });
    scatterCtx.globalAlpha = 1;

    // Store for hover
    scatterCanvas._points = drawnPoints;

    // Legend
    updateChartLegend(colorBy);
  }

  function updateChartLegend(colorBy) {
    var legend = document.getElementById('chart-legend');
    if (colorBy === 'region') {
      legend.innerHTML = Object.keys(REGION_COLORS).map(function(r) {
        return '<div class="chart-legend-item"><span class="chart-legend-dot" style="background:' + REGION_COLORS[r] + '"></span>' + r + '</div>';
      }).join('');
    } else if (colorBy === 'score') {
      legend.innerHTML = '<div class="chart-legend-item"><span class="chart-legend-dot" style="background:#22c55e"></span>75+</div>' +
        '<div class="chart-legend-item"><span class="chart-legend-dot" style="background:#84cc16"></span>50-75</div>' +
        '<div class="chart-legend-item"><span class="chart-legend-dot" style="background:#f59e0b"></span>25-50</div>' +
        '<div class="chart-legend-item"><span class="chart-legend-dot" style="background:#ef4444"></span>&lt;25</div>';
    } else {
      legend.innerHTML = '<div class="chart-legend-item"><span class="chart-legend-dot" style="background:#ef4444"></span>0%</div>' +
        '<div class="chart-legend-item"><span class="chart-legend-dot" style="background:#22c55e"></span>100%</div>';
    }
  }

  // Chart hover
  if (scatterCanvas) {
    function findClosestPoint(e, threshold) {
      if (!scatterCanvas._points) return null;
      var rect = scatterCanvas.getBoundingClientRect();
      var scaleX = scatterCanvas.width / rect.width;
      var scaleY = scatterCanvas.height / rect.height;
      // Mouse position in CSS pixels (matches our drawing coordinates)
      var mx = (e.clientX - rect.left);
      var my = (e.clientY - rect.top);
      var closest = null;
      var closestDist = threshold || 20;

      scatterCanvas._points.forEach(function(p) {
        var dx = mx - p.px;
        var dy = my - p.py;
        var dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < closestDist) {
          closestDist = dist;
          closest = p;
        }
      });
      return closest;
    }

    scatterCanvas.addEventListener('mousemove', function(e) {
      var closest = findClosestPoint(e, 20);

      if (closest) {
        var d = closest.d;
        chartTooltip.innerHTML =
          '<strong>' + d.country + '</strong> (#' + d.rank + ')<br>' +
          'Score: ' + (d.score != null ? d.score.toFixed(1) : '—') + '<br>' +
          'Region: ' + getRegion(d.iso3);
        chartTooltip.classList.add('active');
        var ttLeft = e.clientX - scatterCanvas.parentElement.getBoundingClientRect().left + 16;
        var ttTop = e.clientY - scatterCanvas.parentElement.getBoundingClientRect().top - 10;
        chartTooltip.style.left = ttLeft + 'px';
        chartTooltip.style.top = ttTop + 'px';
        scatterCanvas.style.cursor = 'pointer';
      } else {
        chartTooltip.classList.remove('active');
        scatterCanvas.style.cursor = 'default';
      }
    });

    scatterCanvas.addEventListener('mouseleave', function() {
      chartTooltip.classList.remove('active');
    });

    scatterCanvas.addEventListener('click', function(e) {
      var closest = findClosestPoint(e, 20);
      if (closest) openCountryModal(closest.d.iso3);
    });

    // Redraw on axis change
    document.getElementById('chart-x').addEventListener('change', drawScatter);
    document.getElementById('chart-y').addEventListener('change', drawScatter);
    document.getElementById('chart-color').addEventListener('change', drawScatter);
  }

  // ── Regional Breakdown ──
  function buildRegional() {
    var regions = {};
    EAI_DATA.forEach(function(d) {
      var r = getRegion(d.iso3);
      if (!regions[r]) regions[r] = { countries: [], totalScore: 0, totalElec: 0, totalEnergy: 0, count: 0 };
      regions[r].countries.push(d);
      if (d.score != null) { regions[r].totalScore += d.score; regions[r].count++; }
      if (d.electricityPerCapita != null) regions[r].totalElec += d.electricityPerCapita;
      if (d.primaryEnergy != null) regions[r].totalEnergy += d.primaryEnergy;
    });

    var regionNames = Object.keys(regions).sort(function(a, b) {
      var avgA = regions[a].count ? regions[a].totalScore / regions[a].count : 0;
      var avgB = regions[b].count ? regions[b].totalScore / regions[b].count : 0;
      return avgB - avgA;
    });

    var grid = document.getElementById('regional-grid');
    grid.innerHTML = regionNames.map(function(r) {
      var data = regions[r];
      var avg = data.count ? data.totalScore / data.count : 0;
      var avgElec = data.countries.length ? data.totalElec / data.countries.length : 0;
      var avgEnergy = data.countries.length ? data.totalEnergy / data.countries.length : 0;
      var best = data.countries.reduce(function(a, b) { return (a.score||0) > (b.score||0) ? a : b; });
      var worst = data.countries.reduce(function(a, b) { return (a.score||0) < (b.score||0) ? a : b; });
      var color = REGION_COLORS[r] || '#888';

      return '<div class="regional-card">' +
        '<div class="regional-card-header">' +
          '<span class="regional-name" style="color:' + color + '">' + r + '</span>' +
          '<span class="regional-count">' + data.countries.length + ' countries</span>' +
        '</div>' +
        '<div class="regional-avg-score ' + scoreClass(avg) + '">' + avg.toFixed(1) + '</div>' +
        '<div class="regional-avg-label">Average Score</div>' +
        '<div class="regional-stat-row"><span class="regional-stat-label">Avg Electricity</span><span class="regional-stat-value">' + fmt(avgElec) + ' kWh</span></div>' +
        '<div class="regional-stat-row"><span class="regional-stat-label">Avg Primary Energy</span><span class="regional-stat-value">' + fmt(avgEnergy) + ' kWh</span></div>' +
        '<div class="regional-best">Best: <strong>' + best.country + '</strong> (' + (best.score != null ? best.score.toFixed(1) : '—') + ') &bull; Lowest: <strong>' + worst.country + '</strong> (' + (worst.score != null ? worst.score.toFixed(1) : '—') + ')</div>' +
      '</div>';
    }).join('');
  }

  // ── Scroll-Triggered Animations ──
  function initScrollAnimations() {
    // Add animation classes to sections
    var sections = document.querySelectorAll('.section-header, .glance-card, .insight-card, .method-card, .zone-card, .regional-card, .about-text, .about-callouts, .method-formula');
    sections.forEach(function(el) {
      el.classList.add('animate-on-scroll');
    });

    // Add stagger to grids
    var grids = document.querySelectorAll('.zones-grid, .insights-grid, .method-grid');
    grids.forEach(function(el) {
      el.classList.add('animate-stagger');
    });

    var observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

    document.querySelectorAll('.animate-on-scroll, .animate-stagger').forEach(function(el) {
      observer.observe(el);
    });
  }

  // ── Counter Animation ──
  function animateCounters() {
    var stats = document.querySelectorAll('.stat-number');
    var observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting && !entry.target.dataset.animated) {
          entry.target.dataset.animated = 'true';
          var text = entry.target.textContent;
          // Only animate pure numbers
          var num = parseInt(text.replace(/,/g, ''));
          if (!isNaN(num) && num > 0 && text.indexOf('x') === -1 && text.indexOf('r') === -1) {
            var start = 0;
            var duration = 1200;
            var startTime = null;
            function step(ts) {
              if (!startTime) startTime = ts;
              var progress = Math.min((ts - startTime) / duration, 1);
              var eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
              var current = Math.round(start + (num - start) * eased);
              entry.target.textContent = current.toLocaleString('en-US');
              if (progress < 1) requestAnimationFrame(step);
            }
            requestAnimationFrame(step);
          }
        }
      });
    }, { threshold: 0.5 });

    stats.forEach(function(el) { observer.observe(el); });
  }

  // ── Reading Progress Bar ──
  function initReadingProgress() {
    var bar = document.getElementById('reading-progress');
    if (!bar) return;
    window.addEventListener('scroll', function() {
      var h = document.documentElement.scrollHeight - window.innerHeight;
      var pct = h > 0 ? (window.scrollY / h) * 100 : 0;
      bar.style.width = pct + '%';
    }, { passive: true });
  }

  // ── Back to Top ──
  function initBackToTop() {
    var btn = document.getElementById('back-to-top');
    if (!btn) return;
    window.addEventListener('scroll', function() {
      if (window.scrollY > 600) {
        btn.classList.add('visible');
      } else {
        btn.classList.remove('visible');
      }
    }, { passive: true });
    btn.addEventListener('click', function() {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // ── Map Loading State ──
  function hideMapLoading() {
    var loader = document.getElementById('map-loading');
    if (loader) {
      loader.style.opacity = '0';
      loader.style.transition = 'opacity 0.3s ease';
      setTimeout(function() { loader.style.display = 'none'; }, 300);
    }
  }

  // ── Initialization ──
  function init() {
    buildGlanceLists();
    initMap();
    renderRankings();
    buildMovers();
    initComparison();
    buildRegional();
    initReadingProgress();
    initBackToTop();

    // Delay scatter chart to ensure canvas is ready
    setTimeout(drawScatter, 300);

    // Delay animations to avoid flash
    setTimeout(function() {
      initScrollAnimations();
      animateCounters();
    }, 100);

    // Redraw chart on resize
    var resizeTimer;
    window.addEventListener('resize', function() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(drawScatter, 200);
    });
  }

  // Run
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
