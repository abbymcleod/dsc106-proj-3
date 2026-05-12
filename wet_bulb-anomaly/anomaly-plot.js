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

const tooltipG = svgA.append('g')
  .attr('class', 'tooltip-g')
  .style('display', 'none');

const tooltipRect = tooltipG.append('rect')
  .attr('rx', 4)
  .attr('ry', 4)
  .attr('fill', 'white')
  .attr('stroke', '#ddd')
  .attr('stroke-width', 0.5);

const tooltipLines = [0, 1, 2, 3].map(i =>
  tooltipG.append('text')
    .attr('font-size', '12px')
    .attr('font-family', 'sans-serif')
    .attr('fill', '#333')
    .attr('x', 10)
    .attr('y', 20 + i * 18)
);

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
        enter => enter.append('path').attr('class', 'band'),
        update => update,
        exit => exit.remove()
        )
        .attr('fill', '#c4740a')
        .attr('stroke', 'none')
        .attr('opacity', city => {
        if (!selectedCityA) return 0.12;
        return city === selectedCityA ? 0.22 : 0.01;
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
        const [mx, my] = d3.pointer(event, this);
        const hoveredTime = xScaleA.invert(mx);
        const targetCity = selectedCityA || cities[0];
        const hoveredYear = hoveredTime.getFullYear();

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
        const yr   = d3.timeFormat('%Y')(nearest.time);
        const fmt  = v => v != null ? (v >= 0 ? '+' : '') + v.toFixed(2) + '°C' : '—';

        // update text lines
        const lines = [
        `${targetCity} — ${yr}`,
        `Historical: ${fmt(hist)}`,
        `SSP2-4.5:   ${fmt(s245)}`,
        `SSP5-8.5:   ${fmt(s585)}`
        ];

        tooltipLines.forEach((t, i) => {
        t.text(lines[i])
        .attr('font-weight', i === 0 ? '600' : '400');
        });

        // size the box to fit text
        const boxWidth  = 170;
        const boxHeight = 90;

        tooltipRect
        .attr('width',  boxWidth)
        .attr('height', boxHeight);

        // position: follow cursor, flip if near edges
        const flipX = mx + boxWidth + 20 > widthA;
        const flipY = my - boxHeight - 10 < 0;

        const tx = flipX ? mx - boxWidth - 10 : mx + 14;
        const ty = flipY ? my + 10 : my - boxHeight - 10;

        tooltipG
        .attr('transform', `translate(${tx},${ty})`)
        .style('display', null);
    })
    .on('mouseleave', () => tooltipG.style('display', 'none'));
  }

  function getCityFacts(city) {
    const s245 = getSeriesPoints(city, 'ssp245');
    const s585 = getSeriesPoints(city, 'ssp585');
    const hist = getSeriesPoints(city, 'historical');
  
    const facts = [];
  
    // ── Fact 1: max scenario gap ──────────────────────────────────────────────
    if (s245.length > 0 && s585.length > 0) {
      const s245map = new Map(s245.map(d => [d.time.getTime(), d.wb_anomaly]));
      let maxGap = 0;
      let maxYear = null;
  
      s585.forEach(d => {
        const v = s245map.get(d.time.getTime());
        if (v == null) return;
        const gap = d.wb_anomaly - v;
        if (gap > maxGap) { maxGap = gap; maxYear = d.time; }
      });
  
      if (maxYear) {
        facts.push({
          label: 'Emissions impact',
          text: `Reducing fossil fuels could avoid up to <strong>+${maxGap.toFixed(2)}°C</strong> of wet-bulb warming in ${city} by <strong>${d3.timeFormat('%Y')(maxYear)}</strong> — the difference between the SSP2-4.5 and SSP5-8.5 scenarios.`
        });
      }
    }
  
    // ── Fact 2: year Paris target crossed under ssp585 ────────────────────────
    if (s585.length > 0) {
      const crossed = s585.find(d => d.wb_anomaly >= 1.5);
      if (crossed) {
        facts.push({
          label: 'Paris target crossed',
          text: `Under worst-case emissions (SSP5-8.5), ${city} is projected to exceed the <strong>1.5°C Paris Agreement target</strong> for wet-bulb heat by <strong>${d3.timeFormat('%Y')(crossed.time)}</strong>.`
        });
      } else {
        facts.push({
          label: 'Paris target',
          text: `Under worst-case emissions (SSP5-8.5), ${city} does not exceed the 1.5°C Paris Agreement target for wet-bulb heat by 2100.`
        });
      }
    }
  
    // ── Fact 3: total warming by 2100 under each scenario ────────────────────
    if (s245.length > 0 && s585.length > 0) {
      const last245 = s245[s245.length - 1].wb_anomaly;
      const last585 = s585[s585.length - 1].wb_anomaly;
      facts.push({
        label: 'Warming by 2100',
        text: `By 2100, ${city}'s wet-bulb temperature is projected to be <strong>+${last245.toFixed(2)}°C</strong> above pre-industrial under moderate emissions, and <strong>+${last585.toFixed(2)}°C</strong> under worst-case emissions.`
      });
    }
  
    // ── Fact 4: warming already observed ─────────────────────────────────────
    if (hist.length > 0) {
      const lastHist = hist[hist.length - 1].wb_anomaly;
      facts.push({
        label: 'Warming already observed',
        text: `By the end of the historical record (2014), ${city} had already warmed <strong>+${lastHist.toFixed(2)}°C</strong> above its pre-industrial wet-bulb baseline.`
      });
    }
  
    return facts;
  }

  function updateFactPanel(city) {
    const container = document.getElementById('fact-buttons');
    const panel     = document.getElementById('fact-panel');
  
    // clear old buttons
    container.innerHTML = '';
    panel.style.display = 'none';
    panel.innerHTML     = '';
  
    if (!city) return;
  
    const facts = getCityFacts(city);
  
    facts.forEach((fact, i) => {
      const btn = document.createElement('button');
      btn.className   = 'fact-btn';
      btn.textContent = fact.label;
  
      btn.addEventListener('click', () => {
        // toggle off if already active
        if (btn.classList.contains('active')) {
          btn.classList.remove('active');
          panel.style.display = 'none';
          return;
        }
        document.querySelectorAll('.fact-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        panel.innerHTML     = fact.text;
        panel.style.display = 'block';
      });
  
      container.appendChild(btn);
    });
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
          updateFactPanel(city);
        }
        drawAnomalyChart();
      });

  drawAnomalyChart();

}).catch(err => {
  console.error('Failed to load city_wet_bulb.csv:', err);
  document.getElementById('chart-a').textContent =
    'Error loading data. Check that ../data/city_wet_bulb.csv exists.';
});