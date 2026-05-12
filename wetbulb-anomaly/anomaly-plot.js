// ── DIMENSIONS ───────────────────────────────────────────────────────────────
const marginA = { top: 30, right: 40, bottom: 50, left: 65 };
const widthA  = 900 - marginA.left - marginA.right;
const heightA = 460 - marginA.top  - marginA.bottom;

// ── SVG ──────────────────────────────────────────────────────────────────────
const svgA = d3.select('#chart-a')
  .append('svg')
    .attr('width',  widthA  + marginA.left + marginA.right)
    .attr('height', heightA + marginA.top  + marginA.bottom)
  .append('g')
    .attr('transform', `translate(${marginA.left},${marginA.top})`);

svgA.append('defs').append('clipPath')
  .attr('id', 'clip-a')
  .append('rect')
    .attr('width', widthA)
    .attr('height', heightA);

const linesGA = svgA.append('g').attr('clip-path', 'url(#clip-a)');

// ── SCALES ───────────────────────────────────────────────────────────────────
const xScaleA = d3.scaleTime().range([0, widthA]);
const yScaleA = d3.scaleLinear().range([heightA, 0]);

// ── AXES ─────────────────────────────────────────────────────────────────────
const xAxisGA = svgA.append('g')
  .attr('class', 'axis')
  .attr('transform', `translate(0,${heightA})`);

const yAxisGA = svgA.append('g')
  .attr('class', 'axis');

svgA.append('text')
  .attr('class', 'axis-label')
  .attr('x', widthA / 2)
  .attr('y', heightA + 42)
  .attr('text-anchor', 'middle')
  .text('Year');

svgA.append('text')
  .attr('class', 'axis-label')
  .attr('transform', 'rotate(-90)')
  .attr('x', -heightA / 2)
  .attr('y', -58)
  .attr('text-anchor', 'middle')
  .text('Wet-Bulb Anomaly (°C above pre-industrial)');

// ── TOOLTIP ───────────────────────────────────────────────────────────────────
const tooltipA = d3.select('body')
  .append('div')
  .attr('class', 'tooltip');

// ── STATE ─────────────────────────────────────────────────────────────────────
let selectedCityA = null;
let allDataA      = [];

// ── LINE GENERATORS ───────────────────────────────────────────────────────────
const lineAnomaly = d3.line()
  .x(d => xScaleA(d.time))
  .y(d => yScaleA(d.wb_anomaly))
  .defined(d => d.wb_anomaly != null && !isNaN(d.wb_anomaly));

// area generator for uncertainty band between ssp245 and ssp585
const areaBand = d3.area()
  .x(d => xScaleA(d.time))
  .y0(d => yScaleA(d.ssp245))
  .y1(d => yScaleA(d.ssp585))
  .defined(d => d.ssp245 != null && d.ssp585 != null);

// ── HELPER: average models for one city+scenario ───────────────────────────
function getSeriesPoints(city, scenario) {
    const subset = allDataA
      .filter(d => {
        if (d.city !== city || d.scenario !== scenario) return false;
        // clip each scenario to its valid year range before smoothing
        const yr = d.time.getFullYear();
        if (scenario === 'historical') return yr <= 2014;
        return yr >= 2015;
      })
      .sort((a, b) => a.time - b.time);
  
    if (subset.length === 0) return [];
  
    // average wb_anomaly across models at each time step
    const byTime = d3.rollup(
      subset,
      v => d3.mean(v, d => d.wb_anomaly),
      d => d.time
    );
  
    const points = [...byTime.entries()]
      .map(([time, wb_anomaly]) => ({ time, wb_anomaly }))
      .sort((a, b) => a.time - b.time);
  
    // apply 12-point rolling mean
    const window = 12;
    return points.map((d, i) => {
      const start = Math.max(0, i - Math.floor(window / 2));
      const end   = Math.min(points.length, i + Math.ceil(window / 2));
      const slice = points.slice(start, end);
      return {
        time:       d.time,
        wb_anomaly: d3.mean(slice, p => p.wb_anomaly)
      };
    });
  }

// ── HELPER: build band data (paired ssp245 + ssp585 at same times) ─────────
function getBandPoints(city) {
    const s245 = getSeriesPoints(city, 'ssp245');
    const s585 = getSeriesPoints(city, 'ssp585');
  
    const s585map = new Map(s585.map(d => [d.time.getTime(), d.wb_anomaly]));
  
    return s245
      .filter(d => d.time.getFullYear() >= 2015)
      .map(d => ({
        time:   d.time,
        ssp245: d.wb_anomaly,
        ssp585: s585map.get(d.time.getTime()) ?? null
      }))
      .filter(d => d.ssp245 != null && d.ssp585 != null);
  }

// ── DRAW ──────────────────────────────────────────────────────────────────────
function drawAnomalyChart() {
    const cities = [...new Set(allDataA.map(d => d.city))].sort();
    const scenarios = ['historical', 'ssp245', 'ssp585'];
    const allSeries = [];
  
    cities.forEach(city => {
      scenarios.forEach(scenario => {
        const points = getSeriesPoints(city, scenario);
        if (points.length > 0) {
          allSeries.push({ city, scenario, points });
        }
      });
    });
  
    // ── SCALES ────────────────────────────────────────────────────────────────
    const allTimes = allDataA.map(d => d.time);
    xScaleA.domain(d3.extent(allTimes));
  
    const scenarioKeys = ['historical', 'ssp245', 'ssp585'];
    const citiesToCheck = selectedCityA
      ? [selectedCityA]
      : [...new Set(allDataA.map(d => d.city))];
  
    const smoothedVals = citiesToCheck
      .flatMap(city => scenarioKeys.flatMap(s => getSeriesPoints(city, s)))
      .map(d => d.wb_anomaly)
      .filter(v => v != null && !isNaN(v));
  
    const yMin = d3.min(smoothedVals);
    const yMax = d3.max(smoothedVals);
    const yPad = (yMax - yMin) * 0.05;
    yScaleA.domain([yMin - yPad, yMax + yPad]);
  
    // ── AXES ──────────────────────────────────────────────────────────────────
    xAxisGA.transition().duration(400)
      .call(d3.axisBottom(xScaleA).ticks(10).tickFormat(d3.timeFormat('%Y')));
  
    yAxisGA.transition().duration(400)
      .call(
        d3.axisLeft(yScaleA)
          .ticks(6)
          .tickFormat(d => (d >= 0 ? '+' : '') + d.toFixed(1) + '°')
      );
  
    // ── ZERO BASELINE ─────────────────────────────────────────────────────────
    linesGA.selectAll('.zero-line').remove();
    linesGA.append('line')
      .attr('class', 'zero-line')
      .attr('x1', 0).attr('x2', widthA)
      .attr('y1', yScaleA(0)).attr('y2', yScaleA(0))
      .attr('stroke', '#bbb')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '3,3');
  
      linesGA.selectAll('.zero-label').remove();
      linesGA.append('text')
        .attr('class', 'zero-label')
        .attr('x', widthA - 4)          // ← right side
        .attr('y', yScaleA(0) - 4)
        .attr('text-anchor', 'end')     // ← right aligned
        .attr('font-size', '10px')
        .attr('font-family', 'sans-serif')
        .attr('fill', '#aaa')
        .text('pre-industrial baseline');
  
    // ── 1.5°C PARIS TARGET LINE ───────────────────────────────────────────────
    linesGA.selectAll('.paris-line').remove();
    linesGA.append('line')
      .attr('class', 'paris-line')
      .attr('x1', 0).attr('x2', widthA)
      .attr('y1', yScaleA(1.5)).attr('y2', yScaleA(1.5))
      .attr('stroke', '#378ADD')
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '7,4');
  
    linesGA.selectAll('.paris-label').remove();
    linesGA.append('text')
      .attr('class', 'paris-label')
      .attr('x', 4)
      .attr('y', yScaleA(1.5) - 6)
      .attr('text-anchor', 'start')
      .attr('font-size', '11px')
      .attr('font-family', 'sans-serif')
      .attr('fill', '#378ADD')
      .text('1.5°C Paris Agreement target');
  
    // ── UNCERTAINTY BANDS ─────────────────────────────────────────────────────
    linesGA.selectAll('.band')
      .data(cities, d => d)
      .join(
        enter => enter.append('path').attr('class', 'band uncertainty-band'),
        update => update,
        exit => exit.remove()
      )
      .attr('opacity', city => {
        if (!selectedCityA) return 0.15;
        return city === selectedCityA ? 0.25 : 0.02;
      })
      .attr('d', city => areaBand(getBandPoints(city)));
  
    // ── SCENARIO LINES ────────────────────────────────────────────────────────
    const scenarioColor = {
      historical: '#888888',
      ssp245:     '#c4740a',
      ssp585:     '#a32d2d'
    };
  
    linesGA.selectAll('.anomaly-line')
      .data(allSeries, d => `${d.city}||${d.scenario}`)
      .join(
        enter => enter.append('path')
          .attr('class', 'anomaly-line')
          .attr('fill', 'none'),
        update => update,
        exit => exit.remove()
      )
      .transition().duration(400)
      .attr('d', d => {
        const clipped = d.points.filter(p => {
          const yr = p.time.getFullYear();
          if (d.scenario === 'historical') return yr <= 2014;
          return yr >= 2015;
        });
        return lineAnomaly(clipped);
      })
      .attr('stroke', d => scenarioColor[d.scenario])
      .attr('stroke-width', d => {
        if (!selectedCityA) return 1.5;
        return d.city === selectedCityA ? 2.5 : 1;
      })
      .attr('opacity', d => {
        if (!selectedCityA) return 0.3;
        return d.city === selectedCityA ? 1.0 : 0.05;
      });
  
    // ── CITY END LABELS ───────────────────────────────────────────────────────
    linesGA.selectAll('.city-label-a').remove();
  
    cities.forEach(city => {
      const s585 = getSeriesPoints(city, 'ssp585');
      if (s585.length === 0) return;
      const last = s585[s585.length - 1];
      const isActive = !selectedCityA || city === selectedCityA;
  
      linesGA.append('text')
        .attr('class', 'city-label-a')
        .attr('x', xScaleA(last.time) + 4)
        .attr('y', yScaleA(last.wb_anomaly))
        .attr('dy', '0.35em')
        .attr('font-size', '10px')
        .attr('font-family', 'sans-serif')
        .attr('fill', '#333')
        .attr('opacity', isActive ? 1 : 0.08)
        .text(city);
    });
  
    // ── TOOLTIP OVERLAY ───────────────────────────────────────────────────────
    svgA.selectAll('.overlay-a').remove();
    svgA.append('rect')
      .attr('class', 'overlay-a')
      .attr('width', widthA)
      .attr('height', heightA)
      .attr('fill', 'none')
      .attr('pointer-events', 'all')
      .on('mousemove', function(event) {
        const [mx] = d3.pointer(event, this);
        const hoveredTime = xScaleA.invert(mx);
        const targetCity = selectedCityA || cities[0];
        const hoveredYear = hoveredTime.getFullYear();
    
        // pick the right scenario's series as reference based on year
        const refScenario = hoveredYear <= 2014 ? 'historical' : 'ssp585';
        const refSeries = getSeriesPoints(targetCity, refScenario);
        if (refSeries.length === 0) return;
    
        const bisect = d3.bisector(d => d.time).left;
        const idx = Math.min(bisect(refSeries, hoveredTime, 1), refSeries.length - 1);
        const nearest = refSeries[idx];
        if (!nearest) return;
    
        const getAnomaly = scenario => {
          const pts = getSeriesPoints(targetCity, scenario);
          if (pts.length === 0) return null;
          const i = Math.min(bisect(pts, nearest.time, 1), pts.length - 1);
          return pts[i] ? pts[i].wb_anomaly : null;
        };
    
        const hist = getAnomaly('historical');
        const s245 = getAnomaly('ssp245');
        const s585 = getAnomaly('ssp585');
        const yr = d3.timeFormat('%Y')(nearest.time);
        const fmt = v => v != null ? (v >= 0 ? '+' : '') + v.toFixed(2) + '°C' : '—';
    
        // tooltip dimensions for smart positioning
        const tooltipWidth  = 180;
        const tooltipHeight = 90;
        const pageWidth     = window.innerWidth;
        const pageHeight    = window.innerHeight;
    
        // flip left if near right edge, flip up if near bottom edge
        const left = event.pageX + 14 + tooltipWidth > pageWidth
          ? event.pageX - tooltipWidth - 10
          : event.pageX + 14;
    
        const top = event.pageY + tooltipHeight > pageHeight
          ? event.pageY - tooltipHeight - 10
          : event.pageY - 28;
    
        tooltipA
          .style('opacity', 1)
          .style('left', left + 'px')
          .style('top',  top  + 'px')
          .html(`
            <strong>${targetCity} — ${yr}</strong><br>
            Historical: ${fmt(hist)}<br>
            SSP2-4.5: ${fmt(s245)}<br>
            SSP5-8.5: ${fmt(s585)}
          `);
      })
      .on('mouseleave', () => tooltipA.style('opacity', 0));
  }

// ── LOAD DATA ─────────────────────────────────────────────────────────────────
d3.csv('../data/city_wet_bulb.csv', d => ({
  city:        d.city,
  model:       d.model,
  scenario:    d.scenario,
  time:        d3.timeParse('%Y-%m')(d.time),
  wb_anomaly:  +d.wb_anomaly,
  wet_bulb:    +d.wet_bulb,
  wb_rolling:  +d.wb_rolling
})).then(data => {

  allDataA = data;

  // ── CITY TOGGLE BUTTONS ──────────────────────────────────────────────────
  const cities = [...new Set(data.map(d => d.city))].sort();

  d3.select('#city-toggles-a')
    .selectAll('.city-btn-a')
    .data(cities)
    .join('button')
      .attr('class', 'city-btn-a')
      .text(d => d)
      .on('click', function(event, city) {
        if (selectedCityA === city) {
          selectedCityA = null;
          d3.selectAll('.city-btn-a').classed('active', false);
        } else {
          selectedCityA = city;
          d3.selectAll('.city-btn-a').classed('active', false);
          d3.select(this).classed('active', true);
        }
        drawAnomalyChart();
      });

  drawAnomalyChart();

}).catch(err => {
  console.error('Failed to load city_wet_bulb.csv:', err);
  document.getElementById('chart-a').textContent =
    'Error loading data. Check that ../data/city_wet_bulb.csv exists.';
});