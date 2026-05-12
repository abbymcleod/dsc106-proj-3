// ── CONFIG ───────────────────────────────────────────────────────────────────
const DANGER_THRESHOLD = 28;

const SCENARIO_COLOR = {
  historical: '#888888',
  ssp245:     '#c4740a',
  ssp585:     '#a32d2d'
};

const SCENARIO_OPACITY_GHOST  = 0.08;
const SCENARIO_OPACITY_ACTIVE = 1.0;

// ── DIMENSIONS ───────────────────────────────────────────────────────────────
const margin3 = { top: 30, right: 40, bottom: 50, left: 60 };
const width3  = 900 - margin3.left - margin3.right;
const height3 = 440 - margin3.top  - margin3.bottom;

// ── SVG ──────────────────────────────────────────────────────────────────────
const svg3 = d3.select('#chart-3')
  .append('svg')
    .attr('width',  width3  + margin3.left + margin3.right)
    .attr('height', height3 + margin3.top  + margin3.bottom)
  .append('g')
    .attr('transform', `translate(${margin3.left},${margin3.top})`);

svg3.append('defs').append('clipPath')
  .attr('id', 'clip-3')
  .append('rect')
    .attr('width', width3)
    .attr('height', height3);

const linesG3 = svg3.append('g').attr('clip-path', 'url(#clip-3)');

// ── AXES ─────────────────────────────────────────────────────────────────────
const xScale3 = d3.scaleTime().range([0, width3]);
const yScale3 = d3.scaleLinear().range([height3, 0]);

const xAxisG3 = svg3.append('g')
  .attr('class', 'axis')
  .attr('transform', `translate(0,${height3})`);

const yAxisG3 = svg3.append('g')
  .attr('class', 'axis');

svg3.append('text')
  .attr('class', 'axis-label')
  .attr('x', width3 / 2)
  .attr('y', height3 + 42)
  .attr('text-anchor', 'middle')
  .text('Year');

svg3.append('text')
  .attr('class', 'axis-label')
  .attr('transform', 'rotate(-90)')
  .attr('x', -height3 / 2)
  .attr('y', -50)
  .attr('text-anchor', 'middle')
  .text('Wet-Bulb Temperature (°C)');

// ── TOOLTIP ───────────────────────────────────────────────────────────────────
const tooltip3 = d3.select('body').append('div').attr('class', 'tooltip');

// ── STATE ─────────────────────────────────────────────────────────────────────
let selectedCity3 = null;
let allData3      = [];

// ── LINE GENERATOR ────────────────────────────────────────────────────────────
const lineWB = d3.line()
  .x(d => xScale3(d.time))
  .y(d => yScale3(d.wb_rolling))
  .defined(d => d.wb_rolling != null && !isNaN(d.wb_rolling));

// ── DRAW ──────────────────────────────────────────────────────────────────────
function drawChart3() {
  const cities    = [...new Set(allData3.map(d => d.city))].sort();
  const scenarios = ['historical', 'ssp245', 'ssp585'];

  // one series = one city + one scenario + one model averaged across models
  // average across models so we get one line per city/scenario combo
  const seriesMap = {};

  cities.forEach(city => {
    scenarios.forEach(scenario => {
      const subset = allData3.filter(d => d.city === city && d.scenario === scenario);
      if (subset.length === 0) return;

      // group by time, average wb_rolling across models
      const byTime = d3.rollup(subset, v => d3.mean(v, d => d.wb_rolling), d => d.time);
      const points = [...byTime.entries()]
        .map(([time, wb]) => ({ time, wb_rolling: wb }))
        .sort((a, b) => a.time - b.time);

      const key = `${city}||${scenario}`;
      seriesMap[key] = { city, scenario, points };
    });
  });

  const allSeries = Object.values(seriesMap);

  // ── SCALES ──────────────────────────────────────────────────────────────────
  const allTimes = allData3.map(d => d.time);
  xScale3.domain(d3.extent(allTimes));

  const allWB = allData3.map(d => d.wb_rolling).filter(v => !isNaN(v));
  const yPad  = 1;
  yScale3.domain([
    Math.min(d3.min(allWB) - yPad, DANGER_THRESHOLD - 2),
    Math.max(d3.max(allWB) + yPad, DANGER_THRESHOLD + 1)
  ]);

  // ── AXES ────────────────────────────────────────────────────────────────────
  xAxisG3.call(d3.axisBottom(xScale3).ticks(10).tickFormat(d3.timeFormat('%Y')));
  yAxisG3.call(d3.axisLeft(yScale3).ticks(6).tickFormat(d => d.toFixed(1) + '°'));

  // ── DANGER THRESHOLD LINE ───────────────────────────────────────────────────
  linesG3.selectAll('.threshold-3').remove();
  linesG3.append('line')
    .attr('class', 'threshold-3')
    .attr('x1', 0).attr('x2', width3)
    .attr('y1', yScale3(DANGER_THRESHOLD))
    .attr('y2', yScale3(DANGER_THRESHOLD))
    .attr('stroke', '#e24b4a')
    .attr('stroke-width', 1.5)
    .attr('stroke-dasharray', '7,4');

  linesG3.selectAll('.threshold-label-3').remove();
  linesG3.append('text')
    .attr('class', 'threshold-label-3')
    .attr('x', width3 - 4)
    .attr('y', yScale3(DANGER_THRESHOLD) - 5)
    .attr('text-anchor', 'end')
    .attr('font-size', '11px')
    .attr('font-family', 'sans-serif')
    .attr('fill', '#e24b4a')
    .text('28°C danger threshold');

  // ── LINES ───────────────────────────────────────────────────────────────────
  linesG3.selectAll('.wb-line')
    .data(allSeries, d => `${d.city}||${d.scenario}`)
    .join(
      enter => enter.append('path')
        .attr('class', 'wb-line')
        .attr('fill', 'none')
        .attr('stroke-width', 1.8),
      update => update,
      exit => exit.remove()
    )
    .attr('d', d => lineWB(d.points))
    .attr('stroke', d => SCENARIO_COLOR[d.scenario])
    .attr('opacity', d => {
      if (!selectedCity3) return 0.35;
      return d.city === selectedCity3 ? SCENARIO_OPACITY_ACTIVE : SCENARIO_OPACITY_GHOST;
    })
    .attr('stroke-width', d => {
      if (!selectedCity3) return 1.5;
      return d.city === selectedCity3 ? 2.5 : 1;
    });

  // ── CITY LABEL AT END OF ssp585 LINE ────────────────────────────────────────
  linesG3.selectAll('.city-end-label').remove();

  cities.forEach(city => {
    const series = seriesMap[`${city}||ssp585`];
    if (!series || series.points.length === 0) return;

    const lastPoint = series.points[series.points.length - 1];
    const isActive  = !selectedCity3 || city === selectedCity3;

    linesG3.append('text')
      .attr('class', 'city-end-label')
      .attr('x', xScale3(lastPoint.time) + 4)
      .attr('y', yScale3(lastPoint.wb_rolling))
      .attr('dy', '0.35em')
      .attr('font-size', '10px')
      .attr('font-family', 'sans-serif')
      .attr('fill', '#333')
      .attr('opacity', isActive ? 1 : 0.1)
      .text(city);
  });

  // ── TOOLTIP OVERLAY ──────────────────────────────────────────────────────────
  svg3.selectAll('.overlay-3').remove();
  svg3.append('rect')
    .attr('class', 'overlay-3')
    .attr('width', width3)
    .attr('height', height3)
    .attr('fill', 'none')
    .attr('pointer-events', 'all')
    .on('mousemove', function(event) {
      const [mx]       = d3.pointer(event, this);
      const hoveredTime = xScale3.invert(mx);

      // find the nearest time across selected city's series (or all if none selected)
      const targetCity = selectedCity3 || cities[0];
      const refSeries  = seriesMap[`${targetCity}||historical`]
                      || seriesMap[`${targetCity}||ssp245`];
      if (!refSeries) return;

      const bisect  = d3.bisector(d => d.time).left;
      const idx     = bisect(refSeries.points, hoveredTime, 1);
      const nearest = refSeries.points[Math.min(idx, refSeries.points.length - 1)];
      if (!nearest) return;

      // get wb values for all 3 scenarios at this time for the target city
      const getVal = scenario => {
        const s = seriesMap[`${targetCity}||${scenario}`];
        if (!s) return null;
        const i = bisect(s.points, nearest.time, 1);
        const p = s.points[Math.min(i, s.points.length - 1)];
        return p ? p.wb_rolling : null;
      };

      const hist  = getVal('historical');
      const s245  = getVal('ssp245');
      const s585  = getVal('ssp585');
      const yr    = d3.timeFormat('%Y')(nearest.time);

      tooltip3
        .style('opacity', 1)
        .style('left', (event.pageX + 14) + 'px')
        .style('top',  (event.pageY - 28) + 'px')
        .html(`
          <strong>${targetCity} — ${yr}</strong><br>
          Historical: ${hist  ? hist.toFixed(2)  + '°C' : '—'}<br>
          SSP2-4.5:  ${s245  ? s245.toFixed(2)  + '°C' : '—'}<br>
          SSP5-8.5:  ${s585  ? s585.toFixed(2)  + '°C' : '—'}
        `);
    })
    .on('mouseleave', () => tooltip3.style('opacity', 0));
}

// ── LOAD DATA ─────────────────────────────────────────────────────────────────
d3.csv('data/city_wet_bulb.csv', d => ({
  city:        d.city,
  model:       d.model,
  scenario:    d.scenario,
  time:        d3.timeParse('%Y-%m')(d.time),
  wb_rolling:  +d.wb_rolling,
  tas_c:       +d.tas_c,
  hurs:        +d.hurs,
  wet_bulb:    +d.wet_bulb
})).then(data => {

  allData3 = data;

  // ── BUILD CITY TOGGLE BUTTONS ───────────────────────────────────────────────
  const cities = [...new Set(data.map(d => d.city))].sort();

  d3.select('#city-toggles')
    .selectAll('.city-btn')
    .data(cities)
    .join('button')
      .attr('class', 'city-btn')
      .text(d => d)
      .on('click', function(event, city) {
        if (selectedCity3 === city) {
          // clicking active city deselects — show all
          selectedCity3 = null;
          d3.selectAll('.city-btn').classed('active', false);
        } else {
          selectedCity3 = city;
          d3.selectAll('.city-btn').classed('active', false);
          d3.select(this).classed('active', true);
        }
        drawChart3();
      });

  drawChart3();

}).catch(err => {
  console.error('Failed to load city_wet_bulb.csv:', err);
  document.getElementById('chart-3').textContent =
    'Error loading data. Check that data/city_wet_bulb.csv exists in your data/ folder.';
});