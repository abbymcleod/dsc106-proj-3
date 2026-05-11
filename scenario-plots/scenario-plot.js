// scenario-plot.js

const SCENARIOS = [
    { id: "ssp126", label: "SSP1-2.6 — Low",      color: "#2196F3" },
    { id: "ssp245", label: "SSP2-4.5 — Moderate", color: "#FF9800" },
    { id: "ssp370", label: "SSP3-7.0 — High",     color: "#E91E63" },
    { id: "ssp585", label: "SSP5-8.5 — Worst",    color: "#7B1FA2" },
];
const HIST_COLOR = "#999";
const CITIES_DEFAULT = ["San Diego", "Chicago", "Miami"];
const SCENARIOS_DEFAULT = ["ssp245", "ssp585"];

const margin = { top: 10, right: 20, bottom: 30, left: 42 };
const W = 340, H = 220;
const innerW = W - margin.left - margin.right;
const innerH = H - margin.top - margin.bottom;

let allData, activeCities, activeScenarios, perCityScale;
let globalYDomain;

// ── State ──────────────────────────────────────────────────────────────────
activeCities    = new Set(CITIES_DEFAULT);
activeScenarios = new Set(SCENARIOS_DEFAULT);
perCityScale    = false;

// ── Load ───────────────────────────────────────────────────────────────────
d3.csv("../data/seasonal_temps.csv", d => ({
    city:     d.city,
    scenario: d.scenario,
    year:     +d.year,
    season:   d.season,
    temp_c:   +d.temp_c,
})).then(data => {
    allData = data;

    const cities = [...new Set(data.map(d => d.city))].sort();
    globalYDomain = [
        d3.min(data, d => d.temp_c),
        d3.max(data, d => d.temp_c),
    ];

    buildControls(cities);
    buildLegend();
    render();
});

// ── Controls ───────────────────────────────────────────────────────────────
function buildControls(cities) {
    // City buttons
    d3.select("#city-btns").selectAll("button")
        .data(cities).join("button")
        .text(d => d)
        .classed("active", d => activeCities.has(d))
        .on("click", function(event, d) {
            activeCities.has(d) ? activeCities.delete(d) : activeCities.add(d);
            d3.select(this).classed("active", activeCities.has(d));
            render();
        });

    // Scenario buttons
    d3.select("#scenario-btns").selectAll("button")
        .data(SCENARIOS).join("button")
        .text(d => d.label)
        .style("--btn-color", d => d.color)
        .classed("active", d => activeScenarios.has(d.id))
        .on("click", function(event, d) {
            activeScenarios.has(d.id) ? activeScenarios.delete(d.id) : activeScenarios.add(d.id);
            d3.select(this).classed("active", activeScenarios.has(d.id));
            render();
        });

    // Scale toggle
    d3.select("#normalize-cb").on("change", function() {
        perCityScale = this.checked;
        render();
    });
}

function buildLegend() {
    const items = [
        { label: "Historical", color: HIST_COLOR, dashed: false },
        { label: "Summer (JJA)", color: "#333", dashed: false },
        { label: "Winter (DJF)", color: "#333", dashed: true },
    ];
    const legend = d3.select("#legend");
    items.forEach(item => {
        const div = legend.append("div").attr("class", "legend-item");
        const svg = div.append("svg").attr("width", 28).attr("height", 10);
        svg.append("line")
            .attr("x1", 0).attr("y1", 5).attr("x2", 28).attr("y2", 5)
            .attr("stroke", item.color).attr("stroke-width", 2)
            .attr("stroke-dasharray", item.dashed ? "4,3" : null);
        div.append("span").text(item.label);
    });
}

// ── Render ─────────────────────────────────────────────────────────────────
function render() {
    const cityList = [...activeCities].sort();
    const area = d3.select("#chart-area");

    // Remove panels for deselected cities
    area.selectAll(".panel")
        .filter(function() {
            return !activeCities.has(d3.select(this).attr("data-city"));
        })
        .remove();

    cityList.forEach(city => {
        const cityData = allData.filter(d => d.city === city);
        const yDomain = perCityScale
            ? [d3.min(cityData, d => d.temp_c), d3.max(cityData, d => d.temp_c)]
            : globalYDomain;

        let panel = area.select(`.panel[data-city="${city}"]`);
        let svg, g;

        if (panel.empty()) {
            panel = area.append("div")
                .attr("class", "panel")
                .attr("data-city", city);
            panel.append("h3").text(city);
            svg = panel.append("svg")
                .attr("width", W).attr("height", H);
            g = svg.append("g")
                .attr("class", "inner")
                .attr("transform", `translate(${margin.left},${margin.top})`);
            g.append("g").attr("class", "x-axis").attr("transform", `translate(0,${innerH})`);
            g.append("g").attr("class", "y-axis");
            g.append("line").attr("class", "hist-divider")
                .attr("stroke", "#ccc").attr("stroke-dasharray", "3,2").attr("y1", 0).attr("y2", innerH);
        } else {
            svg = panel.select("svg");
            g = svg.select("g.inner");
        }

        // Scales
        const xDomain = [1850, 2100];
        const x = d3.scaleLinear().domain(xDomain).range([0, innerW]);
        const y = d3.scaleLinear().domain(yDomain).nice().range([innerH, 0]);

        // Axes
        g.select(".x-axis").transition().duration(300)
            .call(d3.axisBottom(x).tickFormat(d3.format("d")).ticks(6));
        g.select(".y-axis").transition().duration(300)
            .call(d3.axisLeft(y).ticks(5).tickFormat(d => `${d}°C`));

        // Historical divider at 2015
        g.select(".hist-divider")
            .attr("x1", x(2015)).attr("x2", x(2015));

        // Line generator
        const line = (season) => d3.line()
            .x(d => x(d.year))
            .y(d => y(d.temp_c))
            .defined(d => d.season === season)
            .curve(d3.curveCatmullRom);

        // Draw historical lines (always shown)
        ["summer", "winter"].forEach(season => {
            const histData = cityData.filter(d => d.scenario === "historical" && d.season === season);
            const key = `hist-${season}`;
            let path = g.select(`.line-${key}`);
            if (path.empty()) {
                path = g.append("path").attr("class", `line-${key}`).attr("fill", "none");
            }
            path.datum(histData)
                .transition().duration(300)
                .attr("stroke", HIST_COLOR)
                .attr("stroke-width", 1.5)
                .attr("stroke-dasharray", season === "winter" ? "4,3" : null)
                .attr("d", d3.line().x(d => x(d.year)).y(d => y(d.temp_c)).curve(d3.curveCatmullRom));
        });

        // Draw scenario lines
        SCENARIOS.forEach(scenario => {
            ["summer", "winter"].forEach(season => {
                const key = `${scenario.id}-${season}`;
                const scenData = cityData.filter(d => d.scenario === scenario.id && d.season === season);
                let path = g.select(`.line-${key}`);
                if (path.empty()) {
                    path = g.append("path").attr("class", `line-${key}`).attr("fill", "none");
                }
                const visible = activeScenarios.has(scenario.id) && scenData.length > 0;
                path.datum(scenData)
                    .transition().duration(300)
                    .attr("stroke", scenario.color)
                    .attr("stroke-width", visible ? 1.5 : 0)
                    .attr("stroke-dasharray", season === "winter" ? "4,3" : null)
                    .attr("d", d3.line().x(d => x(d.year)).y(d => y(d.temp_c)).curve(d3.curveCatmullRom));
            });
        });
    });
}