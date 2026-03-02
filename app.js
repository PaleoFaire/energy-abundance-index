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
    var sections = document.querySelectorAll('.insight-card, .insight-featured, .method-card, .zone-segment, .regional-card, .about-text, .about-callouts, .method-formula, .movers-card, .highlight-quote, .calc-layout, .lcoe-chart-wrap, .lcoe-history-wrap, .conv-input-hero, .persp-compare, .persp-card');
    sections.forEach(function(el) {
      el.classList.add('animate-on-scroll');
    });

    // Add stagger to grids
    var grids = document.querySelectorAll('.zones-bar, .insights-duo, .method-grid, .movers-grid');
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

  // ── Household Energy Calculator ──
  var CALC_PRODUCTS = {
    lighting: {
      name: 'Lighting', icon: '\uD83D\uDCA1',
      items: [
        { id: 'led_bulb', name: 'LED Bulb (10W)', wattage: 10, inputType: 'hours', defaultValue: 5, unit: 'hrs' },
        { id: 'incandescent', name: 'Incandescent Bulb (60W)', wattage: 60, inputType: 'hours', defaultValue: 3, unit: 'hrs' },
        { id: 'fluorescent', name: 'Fluorescent Tube (36W)', wattage: 36, inputType: 'hours', defaultValue: 4, unit: 'hrs' },
        { id: 'desk_lamp', name: 'LED Desk Lamp', wattage: 10, inputType: 'hours', defaultValue: 4, unit: 'hrs' }
      ]
    },
    digital: {
      name: 'Home Office', icon: '\uD83D\uDCBB',
      items: [
        { id: 'laptop', name: 'Laptop', wattage: 50, inputType: 'hours', defaultValue: 6, unit: 'hrs' },
        { id: 'desktop', name: 'Desktop Computer', wattage: 200, inputType: 'hours', defaultValue: 4, unit: 'hrs' },
        { id: 'monitor', name: 'Monitor (27")', wattage: 30, inputType: 'hours', defaultValue: 8, unit: 'hrs' },
        { id: 'wifi', name: 'WiFi Router', wattage: null, inputType: 'fixed', defaultValue: 1, fixedWh: 240, unit: 'always on' },
        { id: 'phone_charge', name: 'Smartphone Charge', wattage: null, inputType: 'fixed', defaultValue: 1, fixedWh: 20, unit: 'per day' },
        { id: 'tablet_charge', name: 'Tablet Charge', wattage: null, inputType: 'fixed', defaultValue: 1, fixedWh: 15, unit: 'per day' },
        { id: 'printer', name: 'Inkjet Printer', wattage: 30, inputType: 'minutes', defaultValue: 10, unit: 'min' }
      ]
    },
    entertainment: {
      name: 'Entertainment', icon: '\uD83C\uDFAE',
      items: [
        { id: 'tv_led', name: 'LED TV (55")', wattage: 80, inputType: 'hours', defaultValue: 3, unit: 'hrs' },
        { id: 'gaming', name: 'Gaming Console', wattage: 180, inputType: 'hours', defaultValue: 2, unit: 'hrs' },
        { id: 'streaming_device', name: 'Streaming Device', wattage: 6, inputType: 'hours', defaultValue: 3, unit: 'hrs' },
        { id: 'soundbar', name: 'Soundbar', wattage: 30, inputType: 'hours', defaultValue: 3, unit: 'hrs' },
        { id: 'smart_speaker', name: 'Smart Speaker', wattage: null, inputType: 'fixed', defaultValue: 1, fixedWh: 72, unit: 'always on' }
      ]
    },
    kitchen: {
      name: 'Kitchen', icon: '\uD83C\uDF73',
      items: [
        { id: 'fridge', name: 'Refrigerator', wattage: null, inputType: 'fixed', defaultValue: 1, fixedWh: 1000, unit: 'always on' },
        { id: 'freezer', name: 'Chest Freezer', wattage: null, inputType: 'fixed', defaultValue: 1, fixedWh: 400, unit: 'always on' },
        { id: 'kettle', name: 'Electric Kettle', wattage: null, inputType: 'boils', defaultValue: 3, whPerUnit: 100, unit: 'boils' },
        { id: 'microwave', name: 'Microwave', wattage: 1000, inputType: 'minutes', defaultValue: 10, unit: 'min' },
        { id: 'oven', name: 'Electric Oven', wattage: 2500, inputType: 'minutes', defaultValue: 30, unit: 'min' },
        { id: 'toaster', name: 'Toaster', wattage: 1000, inputType: 'minutes', defaultValue: 4, unit: 'min' },
        { id: 'dishwasher', name: 'Dishwasher', wattage: null, inputType: 'cycles', defaultValue: 1, whPerUnit: 1500, unit: 'cycles' },
        { id: 'induction', name: 'Induction Cooktop', wattage: 2000, inputType: 'minutes', defaultValue: 20, unit: 'min' },
        { id: 'coffee', name: 'Coffee Maker', wattage: null, inputType: 'cycles', defaultValue: 2, whPerUnit: 25, unit: 'cups' },
        { id: 'air_fryer', name: 'Air Fryer', wattage: 1500, inputType: 'minutes', defaultValue: 15, unit: 'min' },
        { id: 'blender', name: 'Blender', wattage: 500, inputType: 'minutes', defaultValue: 3, unit: 'min' },
        { id: 'slow_cooker', name: 'Slow Cooker', wattage: 200, inputType: 'hours', defaultValue: 6, unit: 'hrs' },
        { id: 'rice_cooker', name: 'Rice Cooker', wattage: null, inputType: 'cycles', defaultValue: 1, whPerUnit: 200, unit: 'cycles' }
      ]
    },
    laundry: {
      name: 'Laundry & Cleaning', icon: '\uD83E\uDDFA',
      items: [
        { id: 'washer', name: 'Washing Machine', wattage: null, inputType: 'cycles', defaultValue: 1, whPerUnit: 500, unit: 'loads' },
        { id: 'dryer', name: 'Tumble Dryer', wattage: null, inputType: 'cycles', defaultValue: 1, whPerUnit: 2500, unit: 'loads' },
        { id: 'iron', name: 'Clothes Iron', wattage: 1200, inputType: 'minutes', defaultValue: 15, unit: 'min' },
        { id: 'vacuum', name: 'Vacuum Cleaner', wattage: 750, inputType: 'minutes', defaultValue: 20, unit: 'min' },
        { id: 'robot_vacuum', name: 'Robot Vacuum', wattage: null, inputType: 'fixed', defaultValue: 1, fixedWh: 30, unit: 'per day' }
      ]
    },
    personal: {
      name: 'Personal Care', icon: '\uD83D\uDEC1',
      items: [
        { id: 'hairdryer', name: 'Hairdryer', wattage: 1750, inputType: 'minutes', defaultValue: 5, unit: 'min' },
        { id: 'hair_straightener', name: 'Hair Straightener', wattage: 60, inputType: 'minutes', defaultValue: 10, unit: 'min' },
        { id: 'electric_shaver', name: 'Electric Shaver', wattage: 15, inputType: 'minutes', defaultValue: 5, unit: 'min' },
        { id: 'electric_toothbrush', name: 'Electric Toothbrush', wattage: null, inputType: 'fixed', defaultValue: 1, fixedWh: 2, unit: 'per day' }
      ]
    },
    climate: {
      name: 'Heating & Cooling', icon: '\uD83C\uDF21\uFE0F',
      items: [
        { id: 'ac', name: 'Air Conditioner', wattage: 1500, inputType: 'hours', defaultValue: 4, unit: 'hrs' },
        { id: 'heater', name: 'Space Heater', wattage: 1500, inputType: 'hours', defaultValue: 3, unit: 'hrs' },
        { id: 'heat_pump', name: 'Heat Pump', wattage: 1000, inputType: 'hours', defaultValue: 6, unit: 'hrs' },
        { id: 'fan', name: 'Ceiling Fan', wattage: 75, inputType: 'hours', defaultValue: 8, unit: 'hrs' },
        { id: 'water_heater', name: 'Electric Water Heater', wattage: 4000, inputType: 'hours', defaultValue: 3, unit: 'hrs' },
        { id: 'shower', name: 'Electric Shower', wattage: 9500, inputType: 'minutes', defaultValue: 8, unit: 'min' },
        { id: 'dehumidifier', name: 'Dehumidifier', wattage: 500, inputType: 'hours', defaultValue: 8, unit: 'hrs' },
        { id: 'humidifier', name: 'Humidifier', wattage: 40, inputType: 'hours', defaultValue: 8, unit: 'hrs' },
        { id: 'air_purifier', name: 'Air Purifier', wattage: null, inputType: 'fixed', defaultValue: 1, fixedWh: 600, unit: 'always on' },
        { id: 'electric_blanket', name: 'Electric Blanket', wattage: 100, inputType: 'hours', defaultValue: 2, unit: 'hrs' }
      ]
    },
    smarthome: {
      name: 'Smart Home & Security', icon: '\uD83C\uDFE0',
      items: [
        { id: 'security_camera', name: 'Security Camera', wattage: null, inputType: 'fixed', defaultValue: 1, fixedWh: 120, unit: 'always on' },
        { id: 'doorbell_cam', name: 'Video Doorbell', wattage: null, inputType: 'fixed', defaultValue: 1, fixedWh: 36, unit: 'always on' },
        { id: 'smart_display', name: 'Smart Display', wattage: null, inputType: 'fixed', defaultValue: 1, fixedWh: 96, unit: 'always on' },
        { id: 'set_top_box', name: 'Set-Top Box / DVR', wattage: null, inputType: 'fixed', defaultValue: 1, fixedWh: 360, unit: 'always on' }
      ]
    },
    transport: {
      name: 'Electric Transport', icon: '\uD83D\uDE97',
      items: [
        { id: 'ev', name: 'Electric Car (per 10 mi)', wattage: null, inputType: 'cycles', defaultValue: 3, whPerUnit: 3500, unit: '\u00D710mi' },
        { id: 'ebike', name: 'E-Bike Charge', wattage: null, inputType: 'cycles', defaultValue: 1, whPerUnit: 500, unit: 'charges' },
        { id: 'escooter', name: 'E-Scooter Charge', wattage: null, inputType: 'cycles', defaultValue: 1, whPerUnit: 250, unit: 'charges' }
      ]
    },
    fitness: {
      name: 'Fitness & Wellness', icon: '\uD83C\uDFCB\uFE0F',
      items: [
        { id: 'treadmill', name: 'Treadmill', wattage: 700, inputType: 'minutes', defaultValue: 30, unit: 'min' },
        { id: 'exercise_bike', name: 'Exercise Bike', wattage: 50, inputType: 'minutes', defaultValue: 30, unit: 'min' },
        { id: 'hot_tub', name: 'Hot Tub / Spa', wattage: 1500, inputType: 'hours', defaultValue: 2, unit: 'hrs' }
      ]
    },
    outdoor: {
      name: 'Outdoor & Garden', icon: '\uD83C\uDF3F',
      items: [
        { id: 'pool_pump', name: 'Pool Pump', wattage: 1500, inputType: 'hours', defaultValue: 6, unit: 'hrs' },
        { id: 'mower', name: 'Electric Lawn Mower', wattage: 1400, inputType: 'minutes', defaultValue: 30, unit: 'min' },
        { id: 'outdoor_lights', name: 'Outdoor Lights', wattage: 100, inputType: 'hours', defaultValue: 6, unit: 'hrs' },
        { id: 'pressure_washer', name: 'Pressure Washer', wattage: 1800, inputType: 'minutes', defaultValue: 15, unit: 'min' },
        { id: 'garage_door', name: 'Garage Door Opener', wattage: null, inputType: 'cycles', defaultValue: 4, whPerUnit: 5, unit: 'uses' }
      ]
    }
  };

  var CALC_PRICES = {
    USA: { price: 0.16, currency: '$', name: 'United States' },
    GBR: { price: 0.34, currency: '\u00A3', name: 'United Kingdom' },
    DEU: { price: 0.40, currency: '\u20AC', name: 'Germany' },
    FRA: { price: 0.25, currency: '\u20AC', name: 'France' },
    JPN: { price: 27, currency: '\u00A5', name: 'Japan' },
    AUS: { price: 0.30, currency: 'A$', name: 'Australia' },
    IND: { price: 6.5, currency: '\u20B9', name: 'India' },
    CHN: { price: 0.54, currency: '\u00A5', name: 'China' },
    BRA: { price: 0.80, currency: 'R$', name: 'Brazil' }
  };

  var calcState = {
    selections: {},
    view: 'energy',
    priceCountry: 'USA',
    maxSelections: 20
  };

  var CALC_COMPARE_COUNTRIES = [
    { iso: 'ISL', flag: '\uD83C\uDDEE\uD83C\uDDF8' },
    { iso: 'USA', flag: '\uD83C\uDDFA\uD83C\uDDF8' },
    { iso: 'DEU', flag: '\uD83C\uDDE9\uD83C\uDDEA' },
    { iso: 'CHN', flag: '\uD83C\uDDE8\uD83C\uDDF3' },
    { iso: 'IND', flag: '\uD83C\uDDEE\uD83C\uDDF3' },
    { iso: 'TCD', flag: '\uD83C\uDDF9\uD83C\uDDE9' }
  ];

  function findCalcProduct(id) {
    var found = null;
    Object.keys(CALC_PRODUCTS).some(function(catKey) {
      var p = CALC_PRODUCTS[catKey].items.find(function(item) { return item.id === id; });
      if (p) { found = p; return true; }
      return false;
    });
    return found;
  }

  function calcProductWh(id) {
    var product = findCalcProduct(id);
    if (!product || !calcState.selections[id]) return 0;
    var value = calcState.selections[id].value;

    switch (product.inputType) {
      case 'hours':
        return product.wattage * value;
      case 'minutes':
        return product.wattage * (value / 60);
      case 'fixed':
        return product.fixedWh;
      case 'boils':
      case 'cycles':
        return (product.whPerUnit || 0) * value;
      default:
        return 0;
    }
  }

  function calcTotalWh() {
    var total = 0;
    Object.keys(calcState.selections).forEach(function(id) {
      total += calcProductWh(id);
    });
    return total;
  }

  function initCalculator() {
    buildCalcCategories();
    bindCalcEvents();
    loadCalcFromURL();
  }

  function buildCalcCategories() {
    var container = document.getElementById('calc-categories');
    if (!container) return;
    var html = '';

    Object.keys(CALC_PRODUCTS).forEach(function(catKey) {
      var cat = CALC_PRODUCTS[catKey];
      html += '<div class="calc-category" data-category="' + catKey + '">' +
        '<div class="calc-category-header">' +
          '<span class="calc-category-name"><span class="calc-category-icon">' + cat.icon + '</span> ' + cat.name + '</span>' +
          '<svg class="calc-category-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>' +
        '</div>' +
        '<div class="calc-category-items">';

      cat.items.forEach(function(item) {
        var step = item.inputType === 'hours' ? '0.5' : '1';
        var isFixed = item.inputType === 'fixed';
        html += '<div class="calc-item" data-id="' + item.id + '">' +
          '<input type="checkbox" class="calc-item-checkbox" id="calc-cb-' + item.id + '">' +
          '<label class="calc-item-label" for="calc-cb-' + item.id + '">' + item.name + '</label>' +
          (isFixed ? '' : '<input type="number" class="calc-item-input" value="' + item.defaultValue + '" min="0" step="' + step + '">') +
          '<span class="calc-item-unit">' + item.unit + '</span>' +
        '</div>';
      });

      html += '</div></div>';
    });

    container.innerHTML = html;
  }

  function bindCalcEvents() {
    // Accordion toggle
    document.querySelectorAll('.calc-category-header').forEach(function(header) {
      header.addEventListener('click', function() {
        var cat = header.parentElement;
        var wasOpen = cat.classList.contains('open');
        document.querySelectorAll('.calc-category').forEach(function(c) {
          c.classList.remove('open');
          c.querySelector('.calc-category-header').classList.remove('active');
        });
        if (!wasOpen) {
          cat.classList.add('open');
          header.classList.add('active');
        }
      });
    });

    // Checkbox
    document.querySelectorAll('.calc-item-checkbox').forEach(function(cb) {
      cb.addEventListener('change', function() {
        var item = cb.closest('.calc-item');
        var id = item.getAttribute('data-id');
        var input = item.querySelector('.calc-item-input');

        if (cb.checked) {
          var count = Object.keys(calcState.selections).length;
          if (count >= calcState.maxSelections) {
            cb.checked = false;
            return;
          }
          var product = findCalcProduct(id);
          calcState.selections[id] = { value: input ? parseFloat(input.value) || product.defaultValue : 1 };
        } else {
          delete calcState.selections[id];
        }
        onCalcChanged();
      });
    });

    // Input changes
    document.querySelectorAll('.calc-item-input').forEach(function(input) {
      input.addEventListener('input', function() {
        var item = input.closest('.calc-item');
        var id = item.getAttribute('data-id');
        if (calcState.selections[id]) {
          calcState.selections[id].value = parseFloat(input.value) || 0;
          onCalcChanged();
        }
      });
    });

    // View toggle
    document.querySelectorAll('.calc-view-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.calc-view-btn').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        calcState.view = btn.getAttribute('data-view');
        drawCalcChart();
      });
    });

    // Price country
    var priceSelect = document.getElementById('calc-price-country');
    if (priceSelect) {
      priceSelect.addEventListener('change', function() {
        calcState.priceCountry = priceSelect.value;
        if (calcState.view === 'cost') drawCalcChart();
      });
    }

    // Clear
    document.getElementById('calc-clear').addEventListener('click', function() {
      calcState.selections = {};
      document.querySelectorAll('.calc-item-checkbox').forEach(function(cb) { cb.checked = false; });
      document.querySelectorAll('.calc-item').forEach(function(item) { item.classList.remove('disabled'); });
      onCalcChanged();
    });

    // Share
    document.getElementById('calc-share').addEventListener('click', shareCalc);

    // Download
    document.getElementById('calc-download').addEventListener('click', downloadCalcChart);
  }

  function onCalcChanged() {
    updateCalcCount();
    drawCalcChart();
    updateCalcComparison();
    updateCalcURL();
  }

  function updateCalcCount() {
    var count = Object.keys(calcState.selections).length;
    var countEl = document.getElementById('calc-count');
    if (countEl) countEl.textContent = count;

    // Disable unchecked items at max
    document.querySelectorAll('.calc-item').forEach(function(item) {
      var cb = item.querySelector('.calc-item-checkbox');
      if (count >= calcState.maxSelections && !cb.checked) {
        item.classList.add('disabled');
      } else {
        item.classList.remove('disabled');
      }
    });
  }

  function drawCalcChart() {
    var canvas = document.getElementById('calc-chart');
    var emptyState = document.getElementById('calc-chart-empty');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');

    // Gather items
    var items = [];
    Object.keys(calcState.selections).forEach(function(id) {
      var wh = calcProductWh(id);
      var product = findCalcProduct(id);
      if (product && wh > 0) {
        items.push({ id: id, name: product.name, wh: wh });
      }
    });
    items.sort(function(a, b) { return b.wh - a.wh; });

    // Update total
    var total = calcTotalWh();
    var totalEl = document.getElementById('calc-total');
    if (totalEl) totalEl.textContent = fmt(Math.round(total));

    // Show/hide empty state
    if (items.length === 0) {
      if (emptyState) emptyState.classList.remove('hidden');
      canvas.style.display = 'none';
      return;
    }
    if (emptyState) emptyState.classList.add('hidden');
    canvas.style.display = 'block';

    // Sizing
    var dpr = window.devicePixelRatio || 1;
    var container = document.getElementById('calc-chart-container');
    var cw = container.offsetWidth - 32;
    var barH = 28;
    var gap = 10;
    var padTop = 10;
    var padBottom = 10;
    var padLeft = 160;
    var padRight = 100;
    var ch = padTop + items.length * (barH + gap) + padBottom;

    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    canvas.style.width = cw + 'px';
    canvas.style.height = ch + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, cw, ch);

    // Convert for display
    var priceData = CALC_PRICES[calcState.priceCountry];
    var displayItems = items.map(function(item) {
      if (calcState.view === 'cost') {
        var cost = (item.wh / 1000) * priceData.price;
        return { name: item.name, value: cost, label: priceData.currency + cost.toFixed(2) };
      }
      return { name: item.name, value: item.wh, label: fmt(Math.round(item.wh)) + ' Wh' };
    });

    var maxVal = Math.max.apply(null, displayItems.map(function(d) { return d.value; }));
    if (maxVal === 0) maxVal = 1;
    var chartW = cw - padLeft - padRight;

    // Color palette
    var barColors = ['#10b981','#14b8a6','#06b6d4','#0891b2','#0e7490','#155e75','#164e63','#134e4a','#065f46','#047857','#059669','#10b981'];

    displayItems.forEach(function(item, i) {
      var y = padTop + i * (barH + gap);
      var bw = Math.max((item.value / maxVal) * chartW, 2);
      var color = barColors[i % barColors.length];

      // Bar with rounded corners
      ctx.fillStyle = color;
      ctx.beginPath();
      var r = 4;
      ctx.moveTo(padLeft + r, y);
      ctx.lineTo(padLeft + bw - r, y);
      ctx.quadraticCurveTo(padLeft + bw, y, padLeft + bw, y + r);
      ctx.lineTo(padLeft + bw, y + barH - r);
      ctx.quadraticCurveTo(padLeft + bw, y + barH, padLeft + bw - r, y + barH);
      ctx.lineTo(padLeft + r, y + barH);
      ctx.quadraticCurveTo(padLeft, y + barH, padLeft, y + barH - r);
      ctx.lineTo(padLeft, y + r);
      ctx.quadraticCurveTo(padLeft, y, padLeft + r, y);
      ctx.closePath();
      ctx.fill();

      // Label left
      ctx.fillStyle = '#1A1A2E';
      ctx.font = '12px Inter, -apple-system, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      var labelText = item.name.length > 22 ? item.name.substring(0, 21) + '\u2026' : item.name;
      ctx.fillText(labelText, padLeft - 10, y + barH / 2);

      // Value right of bar
      ctx.fillStyle = '#4A4A68';
      ctx.font = '600 12px Inter, -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(item.label, padLeft + bw + 8, y + barH / 2);
    });

    // Store bar positions for hover
    canvas._calcBars = displayItems.map(function(item, i) {
      var y = padTop + i * (barH + gap);
      var bw = Math.max((item.value / maxVal) * chartW, 2);
      return { x: padLeft, y: y, w: bw, h: barH, name: item.name, label: item.label };
    });
  }

  // Calculator chart hover
  (function() {
    var calcCanvas = document.getElementById('calc-chart');
    var calcTooltip = document.getElementById('calc-chart-tooltip');
    if (!calcCanvas || !calcTooltip) return;

    calcCanvas.addEventListener('mousemove', function(e) {
      if (!calcCanvas._calcBars) return;
      var rect = calcCanvas.getBoundingClientRect();
      var mx = e.clientX - rect.left;
      var my = e.clientY - rect.top;
      var found = null;

      calcCanvas._calcBars.forEach(function(bar) {
        if (mx >= bar.x && mx <= bar.x + bar.w + 100 && my >= bar.y && my <= bar.y + bar.h) {
          found = bar;
        }
      });

      if (found) {
        calcTooltip.innerHTML = '<strong>' + found.name + '</strong><br>' + found.label;
        calcTooltip.classList.add('active');
        calcTooltip.style.left = (mx + 16) + 'px';
        calcTooltip.style.top = (my - 10) + 'px';
        calcCanvas.style.cursor = 'pointer';
      } else {
        calcTooltip.classList.remove('active');
        calcCanvas.style.cursor = 'default';
      }
    });

    calcCanvas.addEventListener('mouseleave', function() {
      calcTooltip.classList.remove('active');
    });
  })();

  function updateCalcComparison() {
    var total = calcTotalWh();
    var compEl = document.getElementById('calc-comparison');
    var gridEl = document.getElementById('calc-comparison-grid');
    var dailyEl = document.getElementById('calc-user-daily');
    if (!compEl || !gridEl) return;

    if (total === 0) {
      compEl.style.display = 'none';
      return;
    }
    compEl.style.display = 'block';
    if (dailyEl) dailyEl.textContent = fmt(Math.round(total)) + ' Wh/day';

    var html = '';
    CALC_COMPARE_COUNTRIES.forEach(function(cc) {
      var d = dataByISO[cc.iso];
      if (!d || !d.electricityPerCapita) return;

      var countryDailyWh = (d.electricityPerCapita * 1000) / 365;
      var ratio = total / countryDailyWh;
      var ratioText = '';
      var ratioClass = '';

      if (ratio > 1.05) {
        ratioText = ratio.toFixed(1) + 'x more';
        ratioClass = 'more';
      } else if (ratio < 0.95) {
        ratioText = (1/ratio).toFixed(1) + 'x less';
        ratioClass = 'less';
      } else {
        ratioText = 'About equal';
        ratioClass = 'equal';
      }

      html += '<div class="calc-country-compare">' +
        '<div class="calc-cc-flag">' + cc.flag + '</div>' +
        '<div class="calc-cc-name">' + d.country + '</div>' +
        '<div class="calc-cc-value">' + fmtCompact(Math.round(countryDailyWh)) + '</div>' +
        '<div class="calc-cc-ratio ' + ratioClass + '">You: ' + ratioText + '</div>' +
      '</div>';
    });

    gridEl.innerHTML = html;
  }

  function updateCalcURL() {
    var parts = [];
    Object.keys(calcState.selections).forEach(function(id) {
      parts.push(id + ':' + calcState.selections[id].value);
    });
    if (parts.length === 0) return;

    try {
      var url = new URL(window.location.href);
      url.searchParams.set('calc', parts.join(','));
      window.history.replaceState({}, '', url);
    } catch(e) { /* ignore */ }
  }

  function loadCalcFromURL() {
    try {
      var params = new URLSearchParams(window.location.search);
      var calcParam = params.get('calc');
      if (!calcParam) return;

      calcParam.split(',').forEach(function(chunk) {
        var parts = chunk.split(':');
        if (parts.length >= 2) {
          var id = parts[0];
          var value = parseFloat(parts[1]);
          if (isNaN(value)) return;
          var product = findCalcProduct(id);
          if (!product) return;

          var cb = document.getElementById('calc-cb-' + id);
          var item = document.querySelector('.calc-item[data-id="' + id + '"]');
          var input = item ? item.querySelector('.calc-item-input') : null;
          if (cb) cb.checked = true;
          if (input) input.value = value;
          calcState.selections[id] = { value: value };
        }
      });

      onCalcChanged();
    } catch(e) { /* ignore */ }
  }

  function shareCalc() {
    var parts = [];
    Object.keys(calcState.selections).forEach(function(id) {
      parts.push(id + ':' + calcState.selections[id].value);
    });

    var url = window.location.origin + window.location.pathname + '?calc=' + parts.join(',') + '#calculator';

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function() {
        var btn = document.getElementById('calc-share');
        var orig = btn.innerHTML;
        btn.textContent = 'Copied!';
        setTimeout(function() { btn.innerHTML = orig; }, 2000);
      });
    } else {
      prompt('Copy this link:', url);
    }
  }

  function downloadCalcChart() {
    var canvas = document.getElementById('calc-chart');
    if (!canvas || !canvas._calcBars || canvas._calcBars.length === 0) return;

    var dlCanvas = document.createElement('canvas');
    var scale = 2;
    dlCanvas.width = canvas.width;
    dlCanvas.height = canvas.height + 80 * (window.devicePixelRatio || 1);
    var ctx = dlCanvas.getContext('2d');

    var dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var w = canvas.width / dpr;
    var h = dlCanvas.height / dpr;

    // White bg
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, w, h);

    // Title
    ctx.fillStyle = '#1A1A2E';
    ctx.font = 'bold 18px Playfair Display, Georgia, serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('Household Energy Use \u2014 ' + fmt(Math.round(calcTotalWh())) + ' Wh/day', 16, 12);

    // Draw chart below title
    ctx.drawImage(canvas, 0, 40 * dpr, canvas.width, canvas.height, 0, 40, canvas.width / dpr, canvas.height / dpr);

    // Watermark
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('ROS Energy Abundance Index \u2022 rationaloptimistsociety.com', w - 16, h - 12);

    dlCanvas.toBlob(function(blob) {
      var link = document.createElement('a');
      link.download = 'household-energy-calculator.png';
      link.href = URL.createObjectURL(blob);
      link.click();
      URL.revokeObjectURL(link.href);
    }, 'image/png');
  }

  // ── LCOE Comparison Tool ──
  var LCOE_DATA = [
    { tech: 'Solar PV (Utility)',    low: 24,  mid: 37,  high: 96,  color: '#FBBF24', category: 'renewable', co2: 0 },
    { tech: 'Solar PV (Rooftop)',    low: 67,  mid: 102, high: 180, color: '#F59E0B', category: 'renewable', co2: 0 },
    { tech: 'Onshore Wind',          low: 24,  mid: 38,  high: 75,  color: '#34D399', category: 'renewable', co2: 0 },
    { tech: 'Offshore Wind',         low: 72,  mid: 106, high: 140, color: '#6EE7B7', category: 'renewable', co2: 0 },
    { tech: 'Nuclear',               low: 88,  mid: 142, high: 221, color: '#A78BFA', category: 'firm',      co2: 0 },
    { tech: 'Natural Gas (CCGT)',    low: 39,  mid: 60,  high: 77,  color: '#60A5FA', category: 'fossil',    co2: 0.41 },
    { tech: 'Natural Gas (Peaking)', low: 115, mid: 177, high: 221, color: '#93C5FD', category: 'fossil',    co2: 0.55 },
    { tech: 'Coal',                  low: 68,  mid: 117, high: 166, color: '#9CA3AF', category: 'fossil',    co2: 0.95 },
    { tech: 'Battery Storage (4h)',  low: 92,  mid: 151, high: 227, color: '#FB923C', category: 'storage',   co2: 0 },
    { tech: 'Geothermal',            low: 57,  mid: 78,  high: 100, color: '#F87171', category: 'renewable', co2: 0 },
    { tech: 'Hydroelectric',         low: 26,  mid: 61,  high: 102, color: '#38BDF8', category: 'renewable', co2: 0 }
  ];

  var LCOE_HISTORY = {
    'Solar PV':  { color: '#FBBF24', data: [359,226,135,99,65,50,44,40,37,36,33,30,29,27,24] },
    'Onshore Wind': { color: '#34D399', data: [95,82,73,70,60,55,47,45,41,44,38,35,33,37,38] },
    'Battery':   { color: '#FB923C', data: [1100,900,700,550,400,350,280,210,170,150,140,132,151,151,92] },
    'Gas (CCGT)':{ color: '#60A5FA', data: [83,69,65,67,61,65,56,58,56,44,45,60,60,60,60] },
    'Nuclear':   { color: '#A78BFA', data: [123,114,112,115,118,117,148,151,155,155,163,167,142,142,142] },
    'Coal':      { color: '#9CA3AF', data: [111,105,97,100,95,95,102,99,96,109,108,112,117,117,117] }
  };
  var LCOE_YEARS = [];
  for (var y = 2010; y <= 2024; y++) LCOE_YEARS.push(y);

  var lcoeSort = 'mid';
  var lcoeCarbon = 0;

  function drawLcoeChart() {
    var canvas = document.getElementById('lcoe-chart');
    if (!canvas) return;
    var dpr = window.devicePixelRatio || 1;
    var wrap = canvas.parentElement;
    var W = wrap.clientWidth - 48;
    var barH = 34;
    var gap = 8;
    var labelW = 170;
    var rightPad = 60;
    var topPad = 10;
    var items = LCOE_DATA.slice();

    // Apply carbon price
    if (lcoeCarbon > 0) {
      items = items.map(function(d) {
        var add = d.co2 * lcoeCarbon;
        return { tech: d.tech, low: d.low + add, mid: d.mid + add, high: d.high + add, color: d.color, category: d.category, co2: d.co2, carbonAdd: add };
      });
    }

    // Sort
    if (lcoeSort === 'mid') items.sort(function(a,b){ return a.mid - b.mid; });
    else if (lcoeSort === 'low') items.sort(function(a,b){ return a.low - b.low; });
    else {
      var catOrder = { renewable: 0, firm: 1, storage: 2, fossil: 3 };
      items.sort(function(a,b){ return (catOrder[a.category]||0) - (catOrder[b.category]||0) || a.mid - b.mid; });
    }

    var H = topPad + items.length * (barH + gap) + 30;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    var maxVal = 0;
    items.forEach(function(d){ if (d.high > maxVal) maxVal = d.high; });
    maxVal = Math.ceil(maxVal / 50) * 50;
    var chartW = W - labelW - rightPad;

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (var g = 0; g <= maxVal; g += 50) {
      var gx = labelW + (g / maxVal) * chartW;
      ctx.beginPath(); ctx.moveTo(gx, topPad); ctx.lineTo(gx, H - 20); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('$' + g, gx, H - 6);
    }

    // Bars
    items.forEach(function(d, i) {
      var yy = topPad + i * (barH + gap);
      var x1 = labelW + (d.low / maxVal) * chartW;
      var x2 = labelW + (d.high / maxVal) * chartW;
      var xm = labelW + (d.mid / maxVal) * chartW;

      // Label
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = '13px Inter, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(d.tech, labelW - 12, yy + barH / 2);

      // Range bar (low to high)
      ctx.fillStyle = d.color + '33';
      var rh = barH * 0.6;
      var ry = yy + (barH - rh) / 2;
      var bw = x2 - x1;
      var r = Math.min(4, bw / 2);
      ctx.beginPath();
      ctx.moveTo(x1 + r, ry);
      ctx.lineTo(x1 + bw - r, ry);
      ctx.quadraticCurveTo(x1 + bw, ry, x1 + bw, ry + r);
      ctx.lineTo(x1 + bw, ry + rh - r);
      ctx.quadraticCurveTo(x1 + bw, ry + rh, x1 + bw - r, ry + rh);
      ctx.lineTo(x1 + r, ry + rh);
      ctx.quadraticCurveTo(x1, ry + rh, x1, ry + rh - r);
      ctx.lineTo(x1, ry + r);
      ctx.quadraticCurveTo(x1, ry, x1 + r, ry);
      ctx.fill();

      // Mid marker
      ctx.fillStyle = d.color;
      ctx.fillRect(xm - 2, yy + 4, 4, barH - 8);

      // Low and high ticks
      ctx.fillStyle = d.color + 'aa';
      ctx.fillRect(x1 - 1, yy + 6, 2, barH - 12);
      ctx.fillRect(x2 - 1, yy + 6, 2, barH - 12);

      // Value label (midpoint)
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '12px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('$' + Math.round(d.mid), x2 + 8, yy + barH / 2);
    });

    // Store items for hover
    canvas._lcoeItems = items;
    canvas._lcoeBarH = barH;
    canvas._lcoeGap = gap;
    canvas._lcoeTopPad = topPad;
    canvas._lcoeLabelW = labelW;
    canvas._lcoeChartW = chartW;
    canvas._lcoeMaxVal = maxVal;
  }

  function bindLcoeChartHover() {
    var canvas = document.getElementById('lcoe-chart');
    var tooltip = document.getElementById('lcoe-tooltip');
    if (!canvas || !tooltip) return;
    canvas.addEventListener('mousemove', function(e) {
      var rect = canvas.getBoundingClientRect();
      var x = e.clientX - rect.left;
      var y = e.clientY - rect.top;
      var items = canvas._lcoeItems;
      if (!items) return;
      var found = null;
      for (var i = 0; i < items.length; i++) {
        var yy = canvas._lcoeTopPad + i * (canvas._lcoeBarH + canvas._lcoeGap);
        if (y >= yy && y <= yy + canvas._lcoeBarH) { found = items[i]; break; }
      }
      if (found) {
        var html = '<strong>' + found.tech + '</strong><br>Low: $' + Math.round(found.low) + '/MWh &nbsp; Mid: $' + Math.round(found.mid) + '/MWh &nbsp; High: $' + Math.round(found.high) + '/MWh';
        if (found.carbonAdd) html += '<br><em>Includes $' + Math.round(found.carbonAdd) + ' carbon cost</em>';
        tooltip.innerHTML = html;
        tooltip.style.opacity = '1';
        tooltip.style.left = Math.min(x + 12, rect.width - 280) + 'px';
        tooltip.style.top = (y - 50) + 'px';
      } else {
        tooltip.style.opacity = '0';
      }
    });
    canvas.addEventListener('mouseleave', function() { tooltip.style.opacity = '0'; });
  }

  function drawLcoeHistory() {
    var canvas = document.getElementById('lcoe-history-chart');
    if (!canvas) return;
    var dpr = window.devicePixelRatio || 1;
    var wrap = canvas.parentElement;
    var W = wrap.clientWidth - 48;
    var H = 300;
    var padL = 55, padR = 20, padT = 20, padB = 40;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    var chartW = W - padL - padR;
    var chartH = H - padT - padB;

    // Find max
    var maxV = 0;
    Object.keys(LCOE_HISTORY).forEach(function(k) {
      LCOE_HISTORY[k].data.forEach(function(v) { if (v > maxV) maxV = v; });
    });
    maxV = Math.ceil(maxV / 100) * 100 + 100;

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (var g = 0; g <= maxV; g += 200) {
      var gy = padT + chartH - (g / maxV) * chartH;
      ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(W - padR, gy); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '11px Inter, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('$' + g, padL - 8, gy + 3);
    }

    // Year labels
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'center';
    LCOE_YEARS.forEach(function(yr, i) {
      if (i % 2 === 0 || i === LCOE_YEARS.length - 1) {
        var xx = padL + (i / (LCOE_YEARS.length - 1)) * chartW;
        ctx.fillText(yr, xx, H - padB + 20);
      }
    });

    // Draw lines
    Object.keys(LCOE_HISTORY).forEach(function(key) {
      var d = LCOE_HISTORY[key];
      ctx.strokeStyle = d.color;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      d.data.forEach(function(val, i) {
        var xx = padL + (i / (LCOE_YEARS.length - 1)) * chartW;
        var yy = padT + chartH - (val / maxV) * chartH;
        if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
      });
      ctx.stroke();

      // End dot + label
      var lastVal = d.data[d.data.length - 1];
      var ex = padL + chartW;
      var ey = padT + chartH - (lastVal / maxV) * chartH;
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.arc(ex, ey, 4, 0, Math.PI * 2);
      ctx.fill();
    });

    // Store for hover
    canvas._historyMaxV = maxV;
    canvas._historyChartW = chartW;
    canvas._historyChartH = chartH;
    canvas._historyPadL = padL;
    canvas._historyPadT = padT;
  }

  function bindLcoeHistoryHover() {
    var canvas = document.getElementById('lcoe-history-chart');
    var tooltip = document.getElementById('lcoe-history-tooltip');
    if (!canvas || !tooltip) return;
    canvas.addEventListener('mousemove', function(e) {
      var rect = canvas.getBoundingClientRect();
      var x = e.clientX - rect.left;
      var padL = canvas._historyPadL || 55;
      var chartW = canvas._historyChartW;
      if (!chartW) return;
      var relX = x - padL;
      if (relX < 0 || relX > chartW) { tooltip.style.opacity = '0'; return; }
      var idx = Math.round((relX / chartW) * (LCOE_YEARS.length - 1));
      idx = Math.max(0, Math.min(LCOE_YEARS.length - 1, idx));
      var yr = LCOE_YEARS[idx];
      var lines = '<strong>' + yr + '</strong>';
      Object.keys(LCOE_HISTORY).forEach(function(k) {
        var val = LCOE_HISTORY[k].data[idx];
        lines += '<br><span style="color:' + LCOE_HISTORY[k].color + '">■</span> ' + k + ': $' + val + '/MWh';
      });
      tooltip.innerHTML = lines;
      tooltip.style.opacity = '1';
      tooltip.style.left = Math.min(x + 12, rect.width - 220) + 'px';
      tooltip.style.top = '20px';
    });
    canvas.addEventListener('mouseleave', function() { tooltip.style.opacity = '0'; });
  }

  function buildLcoeLegend() {
    var el = document.getElementById('lcoe-legend');
    if (!el) return;
    var html = '';
    Object.keys(LCOE_HISTORY).forEach(function(k) {
      html += '<div class="lcoe-legend-item"><span class="lcoe-legend-swatch" style="background:' + LCOE_HISTORY[k].color + '"></span>' + k + '</div>';
    });
    el.innerHTML = html;
  }

  function initLcoe() {
    buildLcoeLegend();
    bindLcoeChartHover();
    bindLcoeHistoryHover();

    // Sort toggle
    var sortBtns = document.querySelectorAll('#lcoe-sort-toggle .lcoe-toggle-btn');
    sortBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        sortBtns.forEach(function(b){ b.classList.remove('active'); });
        btn.classList.add('active');
        lcoeSort = btn.getAttribute('data-sort');
        drawLcoeChart();
      });
    });

    // Carbon toggle
    var carbonBtns = document.querySelectorAll('#lcoe-carbon-toggle .lcoe-toggle-btn');
    carbonBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        carbonBtns.forEach(function(b){ b.classList.remove('active'); });
        btn.classList.add('active');
        lcoeCarbon = parseInt(btn.getAttribute('data-carbon'));
        drawLcoeChart();
      });
    });
  }

  // ── Energy Unit Converter ──
  var CONV_UNITS = [
    { id: 'Wh',     name: 'Watt-hours',    group: 'Electrical', factor: 1000 },
    { id: 'kWh',    name: 'Kilowatt-hours', group: 'Electrical', factor: 1 },
    { id: 'MWh',    name: 'Megawatt-hours', group: 'Electrical', factor: 0.001 },
    { id: 'GWh',    name: 'Gigawatt-hours', group: 'Electrical', factor: 0.000001 },
    { id: 'TWh',    name: 'Terawatt-hours', group: 'Electrical', factor: 0.000000001 },
    { id: 'BTU',    name: 'British Thermal Units', group: 'Thermal', factor: 3412.14 },
    { id: 'MMBTU',  name: 'Million BTU',    group: 'Thermal', factor: 0.00341214 },
    { id: 'Therms', name: 'Therms',         group: 'Thermal', factor: 0.034121 },
    { id: 'J',      name: 'Joules',         group: 'SI',       factor: 3600000 },
    { id: 'kJ',     name: 'Kilojoules',     group: 'SI',       factor: 3600 },
    { id: 'MJ',     name: 'Megajoules',     group: 'SI',       factor: 3.6 },
    { id: 'GJ',     name: 'Gigajoules',     group: 'SI',       factor: 0.0036 },
    { id: 'TJ',     name: 'Terajoules',     group: 'SI',       factor: 0.0000036 },
    { id: 'toe',    name: 'Tonnes of Oil Eq.', group: 'Fuel', factor: 0.0000861 },
    { id: 'boe',    name: 'Barrels of Oil Eq.', group: 'Fuel', factor: 0.000589 },
    { id: 'kcal',   name: 'Kilocalories',   group: 'Thermal', factor: 860.421 }
  ];

  var CONV_FUN = [
    { id: 'iphone',  icon: '📱', label: 'iPhone charges',      perKwh: 50,     unit: 'charges' },
    { id: 'tesla',   icon: '🚗', label: 'Tesla Model 3 charges', perKwh: 0.0133, unit: 'charges' },
    { id: 'homes',   icon: '🏠', label: 'US homes for a day',   perKwh: 0.0342, unit: 'home-days' },
    { id: 'flights', icon: '✈️', label: 'NY→London flights',    perKwh: 0.000432, unit: 'flights' },
    { id: 'showers', icon: '🚿', label: 'hot showers (8 min)',  perKwh: 0.79,   unit: 'showers' },
    { id: 'gasoline',icon: '⛽', label: 'gallons of gasoline',   perKwh: 0.0297, unit: 'gallons' },
    { id: 'coffee',  icon: '☕', label: 'pots of coffee',        perKwh: 6.67,   unit: 'pots' },
    { id: 'bulb',    icon: '💡', label: 'LED bulb-hours',        perKwh: 100,    unit: 'hours' }
  ];

  function convToKwh(value, unitId) {
    var u = CONV_UNITS.find(function(x){ return x.id === unitId; });
    if (!u) return value;
    return value / u.factor;
  }

  function formatConvValue(n) {
    if (n === 0) return '0';
    var abs = Math.abs(n);
    if (abs >= 1e12) return (n / 1e12).toPrecision(4) + ' T';
    if (abs >= 1e9) return (n / 1e9).toPrecision(4) + ' B';
    if (abs >= 1e6) return (n / 1e6).toPrecision(4) + ' M';
    if (abs >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (abs >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
    if (abs >= 0.001) return n.toPrecision(4);
    return n.toExponential(3);
  }

  function updateConverter() {
    var val = parseFloat(document.getElementById('conv-hero-value').value) || 0;
    var unit = document.getElementById('conv-hero-unit').value;
    var kwh = convToKwh(val, unit);

    // Update unit cards
    var grid = document.getElementById('conv-grid');
    var html = '';
    CONV_UNITS.forEach(function(u) {
      var converted = kwh * u.factor;
      html += '<div class="conv-card">' +
        '<button class="conv-card-copy" title="Copy" onclick="navigator.clipboard.writeText(\'' + converted + '\')">📋</button>' +
        '<div class="conv-card-value">' + formatConvValue(converted) + '</div>' +
        '<div class="conv-card-unit">' + u.id + ' <span style="opacity:0.5">(' + u.name + ')</span></div>' +
        '</div>';
    });
    grid.innerHTML = html;

    // Update fun equivalents
    var funGrid = document.getElementById('conv-fun-grid');
    var funHtml = '';
    CONV_FUN.forEach(function(f) {
      var equiv = kwh * f.perKwh;
      funHtml += '<div class="conv-fun-card">' +
        '<div class="conv-fun-icon">' + f.icon + '</div>' +
        '<div class="conv-fun-value">' + formatConvValue(equiv) + '</div>' +
        '<div class="conv-fun-label">' + f.label + '</div>' +
        '</div>';
    });
    funGrid.innerHTML = funHtml;
  }

  function initConverter() {
    var input = document.getElementById('conv-hero-value');
    var select = document.getElementById('conv-hero-unit');
    if (!input || !select) return;
    input.addEventListener('input', updateConverter);
    select.addEventListener('change', updateConverter);
    updateConverter();
  }

  // ── Energy in Perspective ──
  var PERSP_ITEMS = [
    { id: 'phone_charge',    name: '1 smartphone charge',         wh: 20,                category: 'Everyday' },
    { id: 'led_hour',        name: '1 LED bulb for 1 hour',       wh: 10,                category: 'Everyday' },
    { id: 'kettle_boil',     name: '1 kettle boil',               wh: 100,               category: 'Everyday' },
    { id: 'laptop_hour',     name: '1 hour of laptop use',        wh: 50,                category: 'Everyday' },
    { id: 'shower_8min',     name: '1 hot shower (8 min)',        wh: 1267,              category: 'Everyday' },
    { id: 'washing_load',    name: '1 washing machine load',      wh: 500,               category: 'Household' },
    { id: 'fridge_day',      name: 'Running a fridge for 1 day',  wh: 1000,              category: 'Household' },
    { id: 'us_home_day',     name: 'Average US home for 1 day',   wh: 29200,             category: 'Household' },
    { id: 'ev_full',         name: 'Fully charging a Tesla',      wh: 75000,             category: 'Transport' },
    { id: 'gallon_gas',      name: '1 gallon of gasoline',        wh: 33700,             category: 'Transport' },
    { id: 'barrel_oil',      name: '1 barrel of crude oil',       wh: 1700000,           category: 'Industry' },
    { id: 'ton_coal',        name: '1 ton of coal',               wh: 8141000,           category: 'Industry' },
    { id: 'lightning',       name: '1 lightning bolt',             wh: 1400000,           category: 'Nature' },
    { id: 'kg_uranium',      name: '1 kg of uranium (reactor)',   wh: 24000000000,       category: 'Nuclear' },
    { id: 'us_elec_day',     name: 'US electricity for 1 day',    wh: 11000000000000,    category: 'Country' },
    { id: 'iceland_year',    name: 'Iceland per capita / year',   wh: 51915000,          category: 'Country' },
    { id: 'chad_year',       name: 'Chad per capita / year',      wh: 21000,             category: 'Country' },
    { id: 'human_day',       name: 'Human body energy for 1 day', wh: 2400,              category: 'Human' },
    { id: 'marathon',        name: 'Running a marathon',          wh: 2600,              category: 'Human' },
    { id: 'hiroshima',       name: 'Hiroshima bomb yield',        wh: 15000000000,       category: 'Extreme' },
    { id: 'sun_earth_sec',   name: 'Sunlight hitting Earth / sec',wh: 48055555556,       category: 'Nature' },
    { id: 'spacex_launch',   name: 'SpaceX Falcon 9 launch fuel', wh: 511000000,         category: 'Transport' }
  ];

  var PERSP_CARDS_DATA = [
    { icon: '⛽', title: '1 gallon of gasoline', stat: '33.7 kWh', body: 'Enough to charge your smartphone every day for 4.6 years, or run a laptop for 674 hours straight.' },
    { icon: '⚡', title: 'A single lightning bolt', stat: '1.4 MWh', body: 'Could power an average US home for about 1.2 days — not as much as Hollywood would have you believe.' },
    { icon: '☢️', title: '1 kg of uranium', stat: '24,000 MWh', body: 'Contains more energy than 2,800 tons of coal. Could power ~2,200 US homes for an entire year.' },
    { icon: '🌍', title: 'The Iceland–Chad gap', stat: '2,472×', body: 'The average Icelander uses 51,915 kWh of electricity per year. The average Chadian uses just 21 kWh — less than a single smartphone charge per day.' },
    { icon: '🏃', title: 'Running a marathon', stat: '2.6 kWh', body: 'The total energy your body burns running 26.2 miles. An electric kettle uses that energy in about 26 boils.' },
    { icon: '🚗', title: 'Tesla full charge', stat: '75 kWh', body: 'Equivalent to ~2.2 gallons of gasoline in energy content, but an EV converts ~85% to motion vs ~30% for a gas engine.' },
    { icon: '☀️', title: 'Sunlight hitting Earth', stat: '173,000 TW', body: 'Every second, the Sun delivers more energy to Earth than all of human civilization uses in an entire day.' },
    { icon: '🚀', title: 'SpaceX Falcon 9 launch', stat: '511 MWh', body: 'The kerosene fuel in a single rocket launch contains enough energy to power 17 US homes for an entire year.' },
    { icon: '🏠', title: 'Average US home', stat: '29.2 kWh/day', body: 'About 10,657 kWh per year — 507× more electricity than the average person in Chad uses all year.' },
    { icon: '🧊', title: 'Your refrigerator', stat: '1 kWh/day', body: 'Runs 24/7 but uses less energy than a single 8-minute electric shower. The magic of insulation and efficient compressors.' }
  ];

  function initPerspective() {
    var sel = document.getElementById('persp-left');
    if (!sel) return;

    // Build dropdown grouped by category
    var cats = {};
    PERSP_ITEMS.forEach(function(item) {
      if (!cats[item.category]) cats[item.category] = [];
      cats[item.category].push(item);
    });
    var html = '';
    Object.keys(cats).forEach(function(cat) {
      html += '<optgroup label="' + cat + '">';
      cats[cat].forEach(function(item) {
        html += '<option value="' + item.id + '">' + item.name + '</option>';
      });
      html += '</optgroup>';
    });
    sel.innerHTML = html;
    sel.value = 'gallon_gas';

    sel.addEventListener('change', updatePerspective);
    updatePerspective();

    // Build cards
    var cardsEl = document.getElementById('persp-cards');
    if (cardsEl) {
      var cardsHtml = '';
      PERSP_CARDS_DATA.forEach(function(c) {
        cardsHtml += '<div class="persp-card">' +
          '<div class="persp-card-icon">' + c.icon + '</div>' +
          '<div class="persp-card-title">' + c.title + '</div>' +
          '<div class="persp-card-stat">' + c.stat + '</div>' +
          '<div class="persp-card-body">' + c.body + '</div>' +
          '</div>';
      });
      cardsEl.innerHTML = cardsHtml;
    }
  }

  function formatEnergy(wh) {
    if (wh >= 1e12) return (wh / 1e12).toFixed(1) + ' TWh';
    if (wh >= 1e9) return (wh / 1e9).toFixed(1) + ' GWh';
    if (wh >= 1e6) return (wh / 1e6).toFixed(1) + ' MWh';
    if (wh >= 1000) return (wh / 1000).toFixed(1) + ' kWh';
    return Math.round(wh) + ' Wh';
  }

  function updatePerspective() {
    var selId = document.getElementById('persp-left').value;
    var item = PERSP_ITEMS.find(function(x){ return x.id === selId; });
    if (!item) return;

    var leftVal = document.getElementById('persp-left-value');
    leftVal.textContent = formatEnergy(item.wh);

    // Calculate equivalents
    var result = document.getElementById('persp-result');
    var equivs = [];

    PERSP_ITEMS.forEach(function(other) {
      if (other.id === item.id) return;
      var ratio = item.wh / other.wh;
      if (ratio >= 1) {
        equivs.push({ name: other.name, ratio: ratio, wh: other.wh });
      }
    });

    // Sort by interest — pick a few diverse ones
    equivs.sort(function(a,b){ return b.ratio - a.ratio; });
    var top = equivs.slice(0, 3);

    if (top.length > 0) {
      var best = top[0];
      var ratioStr = best.ratio >= 1000 ? formatConvValue(best.ratio) : best.ratio.toFixed(1);
      result.innerHTML = '<div class="persp-result-number">' + ratioStr + '</div>' +
        '<div class="persp-result-label">' + best.name + (best.ratio > 1 ? 's' : '') + '</div>';

      // Update bars
      var barLeft = document.getElementById('persp-bar-left');
      var barRight = document.getElementById('persp-bar-right');
      var ratioEl = document.getElementById('persp-ratio');

      if (best.ratio > 1000) {
        barLeft.style.flex = '1000';
        barRight.style.flex = '1';
      } else {
        barLeft.style.flex = String(Math.round(best.ratio));
        barRight.style.flex = '1';
      }
      barLeft.textContent = item.name;
      barRight.textContent = '';
      ratioEl.textContent = ratioStr + '× more energy';
    } else {
      // Item is small — show what's bigger
      var bigger = [];
      PERSP_ITEMS.forEach(function(other) {
        if (other.id === item.id) return;
        var ratio = other.wh / item.wh;
        if (ratio >= 1) bigger.push({ name: other.name, ratio: ratio, wh: other.wh });
      });
      bigger.sort(function(a,b){ return a.ratio - b.ratio; });
      var pick = bigger.length > 0 ? bigger[0] : null;
      if (pick) {
        var r = pick.ratio >= 1000 ? formatConvValue(pick.ratio) : pick.ratio.toFixed(1);
        result.innerHTML = '<div class="persp-result-number">1/' + r + '</div>' +
          '<div class="persp-result-label">of ' + pick.name + '</div>';
        var barLeft = document.getElementById('persp-bar-left');
        var barRight = document.getElementById('persp-bar-right');
        var ratioEl = document.getElementById('persp-ratio');
        barLeft.style.flex = '1';
        barRight.style.flex = String(Math.min(Math.round(pick.ratio), 1000));
        barLeft.textContent = item.name;
        barRight.textContent = pick.name;
        ratioEl.textContent = r + '× less energy';
      }
    }
  }

  // ── Initialization ──
  function init() {
    buildGlanceLists();
    initMap();
    renderRankings();
    buildMovers();
    initComparison();
    initCalculator();
    initLcoe();
    initConverter();
    initPerspective();
    buildRegional();
    initReadingProgress();
    initBackToTop();

    // Delay scatter chart to ensure canvas is ready
    setTimeout(drawScatter, 300);

    // Delay calculator chart + LCOE charts
    setTimeout(function() { drawCalcChart(); updateCalcComparison(); }, 350);
    setTimeout(function() { drawLcoeChart(); drawLcoeHistory(); }, 400);

    // Delay animations to avoid flash
    setTimeout(function() {
      initScrollAnimations();
      animateCounters();
    }, 100);

    // Redraw charts on resize
    var resizeTimer;
    window.addEventListener('resize', function() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function() {
        drawScatter();
        drawCalcChart();
        drawLcoeChart();
        drawLcoeHistory();
      }, 200);
    });
  }

  // Run
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
