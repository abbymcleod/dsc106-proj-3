// map-plot.js
const US_ATLAS = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";
const MAP_W = 960, MAP_H = 600;

const MAP_SCENARIOS = [
    { id: "ssp126", label: "SSP1-2.6 — Best",      color: "#2196F3" },
    { id: "ssp245", label: "SSP2-4.5 — Moderate", color: "#FF9800" },
    { id: "ssp370", label: "SSP3-7.0 — High",     color: "#E91E63" },
    { id: "ssp585", label: "SSP5-8.5 — Worst",    color: "#7B1FA2" },
];

const colorScale = d3.scaleThreshold()
    .domain([1, 2, 3, 5])
    .range(["#fef0d9", "#fdcc8a", "#fc8d59", "#e34a33", "#b30000"]);

const binLabels = ["< 1°C", "1–2°C", "2–3°C", "3–5°C", "> 5°C"];

const ANNOTATIONS = [
    {
        city: "Anchorage",
        text: "Anchorage warms 2× faster than most U.S. cities — Arctic amplification in action.",
        dx: 30, dy: -40,
    },
    {
        city: "Las Vegas",  // anchor to Las Vegas as geographic center of Southwest cluster
        text: "Desert Southwest cities warm least in winter, but start from already warm baselines.",
        dx: 50, dy: -20,
        noLine: true,       // regional annotation, no leader line
    },
    {
    city: "Washington DC",
    text: "East Coast cities warm 2–3× more than West Coast cities under the same scenario.",
    dx: -100, dy: -120,
    noLine: true,
},
];

let warmingData, seasonalData;
let activeScenario = "ssp245";
let selectedCity = null;
let hoverCity = null;

const projection = d3.geoAlbersUsa()
    .scale(1300)
    .translate([MAP_W / 2, MAP_H / 2]);
const path = d3.geoPath().projection(projection);

// ── Layout ─────────────────────────────────────────────────────────────────
const mapContainer = d3.select("body").append("div").attr("id", "map-section");

mapContainer.append("h1").text("Projected Winter Warming Across U.S. Cities");
mapContainer.append("p").attr("class", "subtitle")
    .text("Dot color shows projected winter warming (2070–2100 vs 1980–2014 baseline). Hover a city to preview, click to pin.");

// Scenario toggle
const toggleDiv = mapContainer.append("div").attr("id", "map-controls");
toggleDiv.append("label").attr("class", "group-label").text("Emissions Case Scenario");
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
            const displayed = selectedCity || hoverCity;
            if (displayed) showTooltip(displayed);
        });
});
function getSpread(city) {
    const ssp126 = warmingData.find(w => w.city === city && w.scenario === "ssp126");
    const ssp585 = warmingData.find(w => w.city === city && w.scenario === "ssp585");
    if (!ssp126 || !ssp585) return null;
    return (ssp585.winter_warming - ssp126.winter_warming).toFixed(1);
}

// Map SVG + flex wrapper
const mapFlex = mapContainer.append("div").attr("id", "map-flex");
const svg = mapFlex.append("svg").attr("width", MAP_W).attr("height", MAP_H);
const statesG = svg.append("g").attr("class", "states");
const citiesG = svg.append("g").attr("class", "cities");
const annotationsG = svg.append("g").attr("class", "annotations");

// Legend
function updateLegend() {
    d3.select("#map-legend").selectAll("*").remove();
    const legendDiv = d3.select("#map-legend");
    legendDiv.append("span").attr("class", "group-label").text("Winter warming by 2100:  ");
    colorScale.range().forEach((color, i) => {
        const item = legendDiv.append("span").attr("class", "legend-item");
        item.append("span")
            .style("display", "inline-block")
            .style("width", "40px").style("height", "12px")
            .style("background", color).style("border", "1px solid #ccc")
            .style("vertical-align", "middle").style("margin-right", "3px");
        item.append("span").text(binLabels[i] + "  ");
    });
}

// Tooltip
const rightCol = mapFlex.append("div").attr("id", "map-right-col");
const tooltip = rightCol.append("div").attr("id", "map-tooltip");
const ttTitle = tooltip.append("h3");
const ttSvg = tooltip.append("svg");
const ttAnnotation = tooltip.append("div").attr("id", "tt-annotation");

rightCol.append("div").attr("id", "map-legend");
updateLegend();
// ── Load data ──────────────────────────────────────────────────────────────
Promise.all([
    d3.json(US_ATLAS),
    d3.csv("./data/city_warming.csv", d => ({
        city:           d.city,
        scenario:       d.scenario,
        winter_warming: +d.winter_warming,
        summer_warming: +d.summer_warming,
        lat:            +d.lat,
        lon:            +d.lon,
    })),
    d3.csv("./data/seasonal_temps.csv", d => ({
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
        .attr("cx", d => { const p = projection([d.lon, d.lat]); return p ? p[0] : null; })
        .attr("cy", d => { const p = projection([d.lon, d.lat]); return p ? p[1] : null; })
        .attr("r", 7)
        .attr("cursor", "pointer")
        .on("mouseover", (event, d) => {
            hoverCity = d.city;
            if (!selectedCity) showTooltip(d.city);
            d3.select(event.currentTarget).attr("r", 10);
        })
        .on("mouseout", (event, d) => {
            hoverCity = null;
            if (!selectedCity) tooltip.style("display", "none");
            if (selectedCity !== d.city) d3.select(event.currentTarget).attr("r", 7);
        })
        .on("click", (event, d) => {
            // If clicking the already-selected city, deselect it
            if (selectedCity === d.city) {
                selectedCity = null;
                tooltip.style("display", "none");
                citiesG.selectAll("circle").attr("r", 7);
            } else {
                selectedCity = d.city;
                citiesG.selectAll("circle").attr("r", d2 => d2.city === selectedCity ? 10 : 7);
                showTooltip(d.city);
            }
        })
        .call(sel => updateDots(sel));

    // Draw annotations
    ANNOTATIONS.forEach(ann => {
    const cityRow = cities.find(c => c.city === ann.city);
    if (!cityRow) return;
    const p = projection([cityRow.lon, cityRow.lat]);
    if (!p) return;

    const ag = annotationsG.append("g").attr("class", "annotation");

    if (!ann.noLine) {
        ag.append("line")
            .attr("x1", p[0]).attr("y1", p[1])
            .attr("x2", p[0] + ann.dx * 0.8).attr("y2", p[1] + ann.dy * 0.8)
            .attr("stroke", "#555").attr("stroke-width", 1)
            .attr("stroke-dasharray", "2,2");
    }

    const fo = ag.append("foreignObject")
        .attr("x", p[0] + ann.dx)
        .attr("y", p[1] + ann.dy - 10)
        .attr("width", 160).attr("height", 70);

    fo.append("xhtml:div")
        .style("font-size", "11px")
        .style("line-height", "1.3")
        .style("color", "#333")
        .style("background", "rgba(255,255,255,0.85)")
        .style("padding", "4px 6px")
        .style("border-radius", "3px")
        .style("border", "1px solid #ddd")
        .text(ann.text);
});
});

// ── Update dot colors ──────────────────────────────────────────────────────
function updateDots(sel) {
    (sel || citiesG.selectAll("circle"))
        .transition().duration(400)
        .attr("fill", d => {
            const row = warmingData.find(w => w.city === d.city && w.scenario === activeScenario);
            if (!row) return "#ccc";
            return colorScale(row.winter_warming);
        });
}

// ── Tooltip mini chart ─────────────────────────────────────────────────────
function showTooltip(city) {
    const ttMargin = { top: 40, right: 20, bottom: 28, left: 44 };
    const ttW = 340, ttH = 200;
    const ttInnerW = ttW - ttMargin.left - ttMargin.right;
    const ttInnerH = ttH - ttMargin.top - ttMargin.bottom;

    const activeScenarioObj = MAP_SCENARIOS.find(s => s.id === activeScenario);

    // Use all scenarios + historical for y-domain so axis doesn't jump when toggling
    const cityData = seasonalData.filter(d => d.city === city && d.season === "winter");

    ttTitle.text(`${city} — Annual Winter (DJF) Mean Temperature`);

    ttSvg.attr("width", ttW).attr("height", ttH).selectAll("*").remove();
    const g = ttSvg.append("g").attr("transform", `translate(${ttMargin.left},${ttMargin.top})`);

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
    
    g.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -ttInnerH / 2)
    .attr("y", -36)
    .attr("text-anchor", "middle")
    .attr("font-size", 10)
    .attr("fill", "#242424")
    .text("Temp (°C)");

g.append("text")
    .attr("x", ttInnerW / 2)
    .attr("y", ttInnerH + 28)
    .attr("text-anchor", "middle")
    .attr("font-size", 10)
    .attr("fill", "#242424")
    .text("Year");
    // if (spread) {
    // g.append("text")
    //     .attr("class", "spread-label")
    //     .attr("x", ttInnerW)
    //     .attr("y", -8)
    //     .attr("text-anchor", "end")
    //     .attr("font-size", 10)
    //     .attr("fill", "#555")
    //     .text(`Scenario spread: ${spread}°C (low → worst)`);
    const spread = getSpread(city);
    const activeScenarioSpread = (() => {
    const row126 = warmingData.find(w => w.city === city && w.scenario === "ssp126");
    const row585 = warmingData.find(w => w.city === city && w.scenario === "ssp585");
    if (!row126 || !row585) return null;
    return {
        low: row126.winter_warming.toFixed(1),
        high: row585.winter_warming.toFixed(1),
        spread: spread,
    };
})();

d3.select("#tt-annotation").html(
    activeScenarioSpread
        ? `<strong>Emissions scenario impact:</strong> Under the most optimistic scenario, 
           ${city} is projected to warm <strong>${activeScenarioSpread.low}°C</strong> in winter by 2100. 
           Under the worst case, that rises to <strong>${activeScenarioSpread.high}°C</strong> — 
           a difference of <strong>${activeScenarioSpread.spread}°C</strong> depending on the path we take.`
        : ""
);
    // Historical divider
    g.append("line")
        .attr("x1", x(2015)).attr("x2", x(2015))
        .attr("y1", 0).attr("y2", ttInnerH)
        .attr("stroke", "#ccc").attr("stroke-dasharray", "3,2");

    // Historical line — always drawn first, full opacity
    const histData = cityData.filter(d => d.scenario === "historical");
    if (histData.length) {
        g.append("path")
            .datum(histData)
            .attr("fill", "none")
            .attr("stroke", "#999")
            .attr("stroke-width", 1.5)
            .attr("d", d3.line().x(d => x(d.year)).y(d => y(d.temp_c)).curve(d3.curveCatmullRom)(histData));
    }

    // Non-selected scenario lines — faint
    MAP_SCENARIOS.filter(s => s.id !== activeScenario).forEach(s => {
        const lineData = cityData.filter(d => d.scenario === s.id);
        if (!lineData.length) return;
        g.append("path")
            .datum(lineData)
            .attr("fill", "none")
            .attr("stroke", s.color)
            .attr("stroke-width", 1)
            .attr("opacity", 0.3)
            .attr("d", d3.line().x(d => x(d.year)).y(d => y(d.temp_c)).curve(d3.curveCatmullRom)(lineData));
    });

    // Active scenario line — bold, drawn last so it's on top
    const activeData = cityData.filter(d => d.scenario === activeScenario);
    if (activeData.length) {
        g.append("path")
            .datum(activeData)
            .attr("fill", "none")
            .attr("stroke", activeScenarioObj?.color)
            .attr("stroke-width", 1.5)
            .attr("opacity", 1)
            .attr("d", d3.line().x(d => x(d.year)).y(d => y(d.temp_c)).curve(d3.curveCatmullRom)(activeData));
    }

    // Legend in top-right margin — all four scenarios + historical
    const legendItems = [
        { label: "Historical", color: "#999", opacity: 1,   width: 1.5 },
        ...MAP_SCENARIOS.map(s => ({
            label: s.id === activeScenario ? s.label + " ★" : s.label,
            color: s.color,
            opacity: s.id === activeScenario ? 1 : 0.55,
            width: s.id === activeScenario ? 1.5 : 1,
        })),
    ];

    legendItems.forEach((item, i) => {
        const legendG = g.append("g").attr("transform", `translate(5, ${-ttMargin.top + 4 + i * 14})`);
        legendG.append("line")
            .attr("x1", 0).attr("y1", 5).attr("x2", 16).attr("y2", 5)
            .attr("stroke", item.color)
            .attr("stroke-width", item.width)
            .attr("opacity", item.opacity);
        legendG.append("text")
            .attr("x", 20).attr("y", 9)
            .attr("font-size", 9.5)
            .attr("fill", item.opacity < 0.7 ? "#aaa" : "#333")
            .text(item.label);
    });

    tooltip.style("display", "block");
}