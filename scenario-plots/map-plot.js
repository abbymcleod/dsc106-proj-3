// map-plot.js
// TODO: add more cities?
const US_ATLAS = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";
const MAP_W = 960, MAP_H = 600;

const MAP_SCENARIOS = [
    { id: "ssp126", label: "SSP1-2.6 — Low",      color: "#2196F3" },
    { id: "ssp245", label: "SSP2-4.5 — Moderate", color: "#FF9800" },
    { id: "ssp370", label: "SSP3-7.0 — High",     color: "#E91E63" },
    { id: "ssp585", label: "SSP5-8.5 — Worst",    color: "#7B1FA2" },
];

const colorScale = d3.scaleThreshold()
    .domain([1, 2, 3, 5])
    .range(["#fef0d9", "#fdcc8a", "#fc8d59", "#e34a33", "#b30000"]);

const binLabels = ["< 1°C", "1–2°C", "2–3°C", "3–5°C", "> 5°C"];

let warmingData, seasonalData;
let activeScenario = "ssp245";

const projection = d3.geoAlbersUsa()
    .scale(1300)
    .translate([MAP_W / 2, MAP_H / 2]);
const path = d3.geoPath().projection(projection);

// ── Layout ─────────────────────────────────────────────────────────────────
const mapContainer = d3.select("body").append("div").attr("id", "map-section");

mapContainer.append("h1").text("Projected Winter Warming Across U.S. Cities");
mapContainer.append("p").attr("class", "subtitle")
    .text("Dot color shows projected winter warming (2070–2100 vs 1980–2014 baseline). Click a city to see its temperature trends.");

// Scenario toggle
const toggleDiv = mapContainer.append("div").attr("id", "map-controls");
toggleDiv.append("label").attr("class", "group-label").text("Emissions Scenario");
const scenBtns = toggleDiv.append("div").attr("class", "btn-group");
MAP_SCENARIOS.forEach(s => {
    scenBtns.append("button")
        .attr("class", s.id === activeScenario ? "active" : "")
        .style("--btn-color", s.color)
        .text(s.label)
        .on("click", function() {
            activeScenario = s.id;
            scenBtns.selectAll("button").classed("active", false);
            d3.select(this).classed("active", true);
            updateDots();
            if (selectedCity) showTooltip(selectedCity);
        });
});

// Season toggle
let activeSeason = "winter";
const seasonDiv = mapContainer.append("div").attr("id", "season-controls").style("margin-top", "8px");
seasonDiv.append("label").attr("class", "group-label").text("Season");
const seasonBtns = seasonDiv.append("div").attr("class", "btn-group");
[{ id: "winter", label: "Winter (DJF)" }, { id: "summer", label: "Summer (JJA)" }].forEach(s => {
    seasonBtns.append("button")
        .attr("class", s.id === activeSeason ? "active" : "")
        .style("--btn-color", "#555")
        .text(s.label)
        .on("click", function() {
            activeSeason = s.id;
            seasonBtns.selectAll("button").classed("active", false);
            d3.select(this).classed("active", true);
            updateLegend();
            updateDots();
            if (selectedCity) showTooltip(selectedCity);
        });
});

// Map SVG
const mapFlex = mapContainer.append("div").attr("id", "map-flex");

const svg = mapFlex.append("svg")
    .attr("width", MAP_W)
    .attr("height", MAP_H);


const statesG = svg.append("g").attr("class", "states");
const citiesG = svg.append("g").attr("class", "cities");

// Legend
function updateLegend() {
    const seasonLabel = activeSeason === "winter" ? "Winter" : "Summer";
    d3.select("#map-legend").selectAll("*").remove();
    const legendDiv = d3.select("#map-legend");
    legendDiv.append("span").attr("class", "group-label")
        .text(`${seasonLabel} warming by 2100:  `);
    colorScale.range().forEach((color, i) => {
        const item = legendDiv.append("span").attr("class", "legend-item");
        item.append("span")
            .style("display", "inline-block")
            .style("width", "40px")
            .style("height", "12px")
            .style("background", color)
            .style("border", "1px solid #ccc")
            .style("vertical-align", "middle")
            .style("margin-right", "3px");
        item.append("span").text(binLabels[i] + "  ");
    });
}
mapContainer.append("div").attr("id", "map-legend");
updateLegend();

// Tooltip container
const tooltip = mapFlex.append("div").attr("id", "map-tooltip");
const ttTitle = tooltip.append("h3");
const ttSvg = tooltip.append("svg");

let selectedCity = null;

// ── Load data ──────────────────────────────────────────────────────────────
Promise.all([
    d3.json(US_ATLAS),
    d3.csv("../data/city_warming.csv", d => ({
        city:           d.city,
        scenario:       d.scenario,
        winter_warming: +d.winter_warming,
        summer_warming: +d.summer_warming,
        lat:            +d.lat,
        lon:            +d.lon,
    })),
    d3.csv("../data/seasonal_temps.csv", d => ({
        city:     d.city,
        scenario: d.scenario,
        year:     +d.year,
        season:   d.season,
        temp_c:   +d.temp_c,
    })),
]).then(([us, warming, seasonal]) => {
    warmingData = warming;
    seasonalData = seasonal;

    // Draw states
    const states = topojson.feature(us, us.objects.states);
    statesG.selectAll("path")
        .data(states.features)
        .join("path")
        .attr("d", path)
        .attr("fill", "#e8e8e8")
        .attr("stroke", "#fff")
        .attr("stroke-width", 0.8);

    // Draw city dots
    const cities = [...new Map(warming.map(d => [d.city, d])).values()];
    citiesG.selectAll("circle")
        .data(cities)
        .join("circle")
        .attr("class", "city-dot")
        .attr("cx", d => {
            const p = projection([d.lon, d.lat]);
            return p ? p[0] : null;
        })
        .attr("cy", d => {
            const p = projection([d.lon, d.lat]);
            return p ? p[1] : null;
        })
        .attr("r", 7)
        // .attr("stroke", "#333")
        // .attr("stroke-width", 1)
        .attr("cursor", "pointer")
        .on("click", (event, d) => {
            selectedCity = d.city;
            citiesG.selectAll("circle").attr("r", 7);
            d3.select(event.currentTarget).attr("r", 10);
            showTooltip(d.city);
        })
        .call(sel => updateDots(sel));
});

// ── Update dot colors ──────────────────────────────────────────────────────
function updateDots(sel) {
    (sel || citiesG.selectAll("circle"))
        .transition().duration(400)
        .attr("fill", d => {
            const row = warmingData.find(w => w.city === d.city && w.scenario === activeScenario);
            if (!row) return "#ccc";
            const val = activeSeason === "winter" ? row.winter_warming : row.summer_warming;
            return colorScale(val);
        });
}

// ── Tooltip mini chart ─────────────────────────────────────────────────────
function showTooltip(city) {
    const ttMargin = { top: 16, right: 20, bottom: 28, left: 44 };
    const ttW = 340, ttH = 180;
    const ttInnerW = ttW - ttMargin.left - ttMargin.right;
    const ttInnerH = ttH - ttMargin.top - ttMargin.bottom;

    const cityData = seasonalData.filter(d => d.city === city && d.season === activeSeason);
    const activeScenarioObj = MAP_SCENARIOS.find(s => s.id === activeScenario);
    const seasonLabel = activeSeason === "winter" ? "Winter (DJF)" : "Summer (JJA)";

    ttTitle.text(`${city} — ${activeScenarioObj?.label}`);

    ttSvg.attr("width", ttW).attr("height", ttH).selectAll("*").remove();
    const g = ttSvg.append("g").attr("transform", `translate(${ttMargin.left},${ttMargin.top})`);

    // Season label above chart
    g.append("text")
        .attr("x", 0).attr("y", -4)
        .attr("font-size", 10).attr("fill", "#666")
        .text(seasonLabel);

    const x = d3.scaleLinear().domain([1850, 2100]).range([0, ttInnerW]);
    const y = d3.scaleLinear()
        .domain([
            d3.min(cityData, d => d.temp_c) - 0.5,
            d3.max(cityData, d => d.temp_c) + 0.5
        ])
        .range([ttInnerH, 0]);

    g.append("g").attr("transform", `translate(0,${ttInnerH})`)
        .call(d3.axisBottom(x).ticks(5).tickFormat(d3.format("d")));
    g.append("g")
        .call(d3.axisLeft(y).ticks(4).tickFormat(d => `${d}°C`));

    g.append("line")
        .attr("x1", x(2015)).attr("x2", x(2015))
        .attr("y1", 0).attr("y2", ttInnerH)
        .attr("stroke", "#ccc").attr("stroke-dasharray", "3,2");

    [
        { scenario: "historical", color: "#999" },
        { scenario: activeScenario, color: activeScenarioObj?.color },
    ].forEach(({ scenario, color }) => {
        const lineData = cityData.filter(d => d.scenario === scenario);
        if (!lineData.length) return;
        g.append("path")
            .datum(lineData)
            .attr("fill", "none")
            .attr("stroke", color)
            .attr("stroke-width", 1.5)
            .attr("d", d3.line()
                .x(d => x(d.year))
                .y(d => y(d.temp_c))
                .curve(d3.curveCatmullRom)(lineData));
    });

    // Legend in top-right margin
    [
        { label: "Historical", color: "#999" },
        { label: "Projected",  color: activeScenarioObj?.color },
    ].forEach((item, i) => {
        const legendG = g.append("g").attr("transform", `translate(${ttInnerW - 88}, ${-ttMargin.top - 1 + i * 16})`);
        legendG.append("line")
            .attr("x1", 0).attr("y1", 5).attr("x2", 16).attr("y2", 5)
            .attr("stroke", item.color).attr("stroke-width", 1.5);
        legendG.append("text")
            .attr("x", 20).attr("y", 9)
            .attr("font-size", 11).attr("fill", "#333")
            .text(item.label);
    });

    tooltip.style("display", "block");
}