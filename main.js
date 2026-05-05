// ── 1. DIMENSIONS ──────────────────────────────────────────────
const margin = { top: 40, right: 30, bottom: 50, left: 60 };
const width  = 900 - margin.left - margin.right;
const height = 450 - margin.top  - margin.bottom;

// ── 2. CREATE SVG ──────────────────────────────────────────────
// D3 selects the #chart div and appends an SVG into it
const svg = d3.select("#chart")
  .append("svg")
    .attr("width",  width  + margin.left + margin.right)
    .attr("height", height + margin.top  + margin.bottom)
  .append("g")  // <g> is a group element — lets us apply the margin offset once
    .attr("transform", `translate(${margin.left},${margin.top})`);

// ── 3. SCALES ──────────────────────────────────────────────────
// Scales map data values → pixel positions
const xScale = d3.scaleTime().range([0, width]);
const yScale = d3.scaleLinear().range([height, 0]);  // note: SVG y is flipped

// ── 4. AXES ────────────────────────────────────────────────────
const xAxis = svg.append("g")
  .attr("class", "axis")
  .attr("transform", `translate(0, ${height})`);  // move x-axis to bottom

const yAxis = svg.append("g")
  .attr("class", "axis");

// Axis labels
svg.append("text")
  .attr("x", width / 2)
  .attr("y", height + 40)
  .attr("text-anchor", "middle")
  .text("Year");

svg.append("text")
  .attr("transform", "rotate(-90)")
  .attr("x", -height / 2)
  .attr("y", -45)
  .attr("text-anchor", "middle")
  .text("Temperature (°C)");

// ── 5. LINE GENERATORS ─────────────────────────────────────────
// A line generator takes an array of data objects and produces an SVG path string
const lineRolling = d3.line()
  .x(d => xScale(d.time))
  .y(d => yScale(d.rolling_mean))
  .defined(d => d.rolling_mean != null);  // skip NaN gaps just in case

const lineMonthly = d3.line()
  .x(d => xScale(d.time))
  .y(d => yScale(d.tas_c));

// ── 6. LOAD DATA ───────────────────────────────────────────────
// d3.csv() fetches and parses your CSV automatically
d3.csv("data/city_heat_stress.csv", d => ({
  city:            d.city,
  model:           d.model,
  time:            d3.timeParse("%Y-%m")(d.time),  // string → Date object
  tas_c:           +d.tas_c,           // + coerces string → number
  rolling_mean:    +d.rolling_mean,
  anomaly:         +d.anomaly,
  anomaly_rolling: +d.anomaly_rolling
})).then(data => {

  // ── 7. POPULATE DROPDOWN ─────────────────────────────────────
  const cities = [...new Set(data.map(d => d.city))].sort();

  d3.select("#city-select")
    .selectAll("option")
    .data(cities)
    .join("option")
      .attr("value", d => d)
      .text(d => d);

  // ── 8. DRAW FUNCTION (called on load + every dropdown change) ─
  function drawChart(selectedCity) {
    const filtered = data.filter(d => d.city === selectedCity);

    // Update scales based on filtered data
    xScale.domain(d3.extent(filtered, d => d.time));
    yScale.domain([
      d3.min(filtered, d => d.tas_c) - 1,
      d3.max(filtered, d => d.tas_c) + 1
    ]);

    // Redraw axes with transition
    xAxis.transition().duration(500).call(d3.axisBottom(xScale));
    yAxis.transition().duration(500).call(d3.axisLeft(yScale));

    // Group data by model for multi-line rendering
    const byModel = d3.group(filtered, d => d.model);

    // Color scale for different models
    const colorScale = d3.scaleOrdinal()
      .domain([...byModel.keys()])
      .range(["steelblue", "tomato", "seagreen"]);

    // Draw one rolling mean line per model
    // .join() handles enter/update/exit automatically
    svg.selectAll(".line-rolling")
      .data([...byModel.values()])
      .join(
        enter => enter.append("path").attr("class", "line-rolling"),
        update => update,
        exit => exit.remove()
      )
      .transition().duration(500)
      .attr("d", lineRolling)
      .attr("stroke", (d, i) => colorScale([...byModel.keys()][i]));

    // ── 9. THRESHOLD LINE (the compelling question) ───────────
    // Historical summer mean (Jun–Aug, years 1850–1900)
    const historicalSummer = filtered.filter(d =>
      d.time.getFullYear() <= 1900 &&
      [5, 6, 7].includes(d.time.getMonth())  // JS months are 0-indexed
    );
    const summerBaseline = d3.mean(historicalSummer, d => d.tas_c);

    // Remove old threshold line if it exists
    svg.selectAll(".threshold-line").remove();
    svg.selectAll(".threshold-label").remove();

    if (summerBaseline) {
      svg.append("line")
        .attr("class", "threshold-line")
        .attr("x1", 0).attr("x2", width)
        .attr("y1", yScale(summerBaseline))
        .attr("y2", yScale(summerBaseline));

      svg.append("text")
        .attr("class", "threshold-label")
        .attr("x", width - 5)
        .attr("y", yScale(summerBaseline) - 5)
        .attr("text-anchor", "end")
        .attr("font-size", "11px")
        .attr("fill", "orange")
        .text(`Historical summer avg: ${summerBaseline.toFixed(1)}°C`);
    }
  }

  // ── 10. WIRE UP DROPDOWN ─────────────────────────────────────
  // Draw on first load
  drawChart(cities[0]);

  // Redraw whenever user changes selection
  d3.select("#city-select").on("change", function() {
    drawChart(this.value);
  });
});