// ── SEASON DEFINITIONS ───────────────────────────────────────────────────────
// JS Date months are 0-indexed (0 = Jan, 11 = Dec)
const SEASON_MONTHS = {
    all:    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    spring: [2, 3, 4],
    summer: [5, 6, 7],
    fall:   [8, 9, 10],
    winter: [11, 0, 1]
  };
  
  // ── STATE ────────────────────────────────────────────────────────────────────
  let currentCity   = null;
  let currentSeason = 'all';
  let allData       = [];
  
  // ── DIMENSIONS ───────────────────────────────────────────────────────────────
  const margin = { top: 30, right: 60, bottom: 50, left: 60 };
  const width  = 900 - margin.left - margin.right;
  const height = 420 - margin.top  - margin.bottom;
  
  // ── SVG SETUP ────────────────────────────────────────────────────────────────
  const svg = d3.select('#chart-2')
    .append('svg')
      .attr('width',  width  + margin.left + margin.right)
      .attr('height', height + margin.top  + margin.bottom)
    .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);
  
  // Axes groups (appended once, updated on each draw)
  const xAxisG = svg.append('g')
    .attr('class', 'axis')
    .attr('transform', `translate(0,${height})`);
  
  const yAxisG = svg.append('g')
    .attr('class', 'axis');
  
  // Axis labels (appended once)
  svg.append('text')
    .attr('class', 'axis-label')
    .attr('x', width / 2)
    .attr('y', height + 42)
    .attr('text-anchor', 'middle')
    .text('Year');
  
  svg.append('text')
    .attr('class', 'axis-label')
    .attr('transform', 'rotate(-90)')
    .attr('x', -height / 2)
    .attr('y', -46)
    .attr('text-anchor', 'middle')
    .text('Temperature (°C)');
  
  // Clip path so lines don't overflow the chart area
  svg.append('defs').append('clipPath')
    .attr('id', 'chart-clip')
    .append('rect')
      .attr('width', width)
      .attr('height', height);
  
  // Group that holds all lines (clipped)
  const linesG = svg.append('g').attr('clip-path', 'url(#chart-clip)');
  
  // Tooltip div (positioned absolutely over the page)
  const tooltip = d3.select('body').append('div').attr('class', 'tooltip');
  
  // Invisible overlay to capture mouse movement for tooltip
  const overlay = svg.append('rect')
    .attr('width', width)
    .attr('height', height)
    .attr('fill', 'none')
    .attr('pointer-events', 'all');
  
  // ── SCALES ───────────────────────────────────────────────────────────────────
  const xScale = d3.scaleTime().range([0, width]);
  const yScale = d3.scaleLinear().range([height, 0]);
  
  // ── LINE GENERATORS ──────────────────────────────────────────────────────────
  const lineMonthly = d3.line()
    .x(d => xScale(d.time))
    .y(d => yScale(d.tas_c))
    .defined(d => d.tas_c != null && !isNaN(d.tas_c));
  
  const lineRolling = d3.line()
    .x(d => xScale(d.time))
    .y(d => yScale(d.rolling_mean))
    .defined(d => d.rolling_mean != null && !isNaN(d.rolling_mean));
  
  // ── MAIN DRAW FUNCTION ───────────────────────────────────────────────────────
  function drawChart() {
    const seasonMonths = SEASON_MONTHS[currentSeason];
  
    // Filter by city and season
    const filtered = allData.filter(d =>
      d.city === currentCity &&
      seasonMonths.includes(d.time.getMonth())
    );
  
    if (filtered.length === 0) return;
  
    // ── UPDATE SCALES ──────────────────────────────────────────────────────────
    xScale.domain(d3.extent(filtered, d => d.time));
  
    const yMin = d3.min(filtered, d => d.tas_c);
    const yMax = d3.max(filtered, d => d.tas_c);
    const yPad = (yMax - yMin) * 0.08;
    yScale.domain([yMin - yPad, yMax + yPad]);
  
    // ── UPDATE AXES ────────────────────────────────────────────────────────────
    xAxisG.transition().duration(400).call(
      d3.axisBottom(xScale).ticks(8).tickFormat(d3.timeFormat('%Y'))
    );
    yAxisG.transition().duration(400).call(
      d3.axisLeft(yScale).ticks(6).tickFormat(d => d.toFixed(1) + '°')
    );
  
    // ── HISTORICAL SUMMER BASELINE ─────────────────────────────────────────────
    // Mean of Jun–Aug temperatures from 1850–1900 for the selected city
    const summerBaseline = d3.mean(
      allData.filter(d =>
        d.city === currentCity &&
        d.time.getFullYear() <= 1900 &&
        [5, 6, 7].includes(d.time.getMonth())
      ),
      d => d.tas_c
    );
  
    // ── DRAW LINES ─────────────────────────────────────────────────────────────
  
    // Monthly (faint)
    linesG.selectAll('.line-monthly')
      .data([filtered])
      .join('path')
        .attr('class', 'line-monthly')
        .transition().duration(400)
        .attr('d', lineMonthly);
  
    // 12-month rolling mean
    linesG.selectAll('.line-rolling')
      .data([filtered])
      .join('path')
        .attr('class', 'line-rolling')
        .transition().duration(400)
        .attr('d', lineRolling);
  
    // Threshold line (horizontal, spanning full x range)
    linesG.selectAll('.line-threshold')
      .data(summerBaseline ? [summerBaseline] : [])
      .join('line')
        .attr('class', 'line-threshold')
        .transition().duration(400)
        .attr('x1', 0)
        .attr('x2', width)
        .attr('y1', d => yScale(d))
        .attr('y2', d => yScale(d));
  
    // ── TOOLTIP ────────────────────────────────────────────────────────────────
    const bisect = d3.bisector(d => d.time).left;
  
    overlay
      .on('mousemove', function(event) {
        const [mx] = d3.pointer(event, this);
        const hoveredTime = xScale.invert(mx);
        const idx = bisect(filtered, hoveredTime, 1);
        const d = filtered[Math.min(idx, filtered.length - 1)];
        if (!d) return;
  
        tooltip
          .style('opacity', 1)
          .style('left', (event.pageX + 14) + 'px')
          .style('top',  (event.pageY - 28) + 'px')
          .html(`
            <strong>${d3.timeFormat('%b %Y')(d.time)}</strong><br>
            Monthly: ${d.tas_c.toFixed(2)}°C<br>
            Rolling mean: ${isNaN(d.rolling_mean) ? '—' : d.rolling_mean.toFixed(2) + '°C'}<br>
            ${summerBaseline ? 'Summer baseline: ' + summerBaseline.toFixed(2) + '°C' : ''}
          `);
      })
      .on('mouseleave', () => tooltip.style('opacity', 0));
  }
  
  // ── LOAD DATA ─────────────────────────────────────────────────────────────────
  d3.csv('data/city_heat_stress.csv', d => ({
    city:         d.city,
    model:        d.model,
    time:         d3.timeParse('%Y-%m')(d.time),
    tas_c:        +d.tas_c,
    rolling_mean: +d.rolling_mean,
    anomaly:      +d.anomaly,
    anomaly_rolling: +d.anomaly_rolling
  })).then(data => {
  
    allData = data;
  
    // ── POPULATE CITY DROPDOWN ──────────────────────────────────────────────────
    const cities = [...new Set(data.map(d => d.city))].sort();
    currentCity = cities[0];
  
    d3.select('#city-select')
      .selectAll('option')
      .data(cities)
      .join('option')
        .attr('value', d => d)
        .text(d => d);
  
    // ── WIRE UP CONTROLS ────────────────────────────────────────────────────────
    d3.select('#city-select').on('change', function() {
      currentCity = this.value;
      drawChart();
    });
  
    d3.selectAll('.pill').on('click', function() {
      d3.selectAll('.pill').classed('active', false);
      d3.select(this).classed('active', true);
      currentSeason = this.dataset.season;
      drawChart();
    });
  
    // Initial draw
    drawChart();
  
  }).catch(err => {
    console.error('Failed to load CSV:', err);
    document.getElementById('chart').textContent =
      'Error loading data. Check that data/city_heat_stress.csv exists.';
  });