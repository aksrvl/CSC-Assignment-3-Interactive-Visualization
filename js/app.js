let allData = [];
let selectedCountry = null;
let currentSort = "warming";
let currentView = "anomaly";
let searchQuery = "";

const MARGIN = { top: 30, right: 20, bottom: 40, left: 55 };
let svg, chartG, xScale, yScale;
let chartWidth, chartHeight;

function getColor(warming) {
  if (warming == null) return "#aaa";
  if (warming >= 1.8)  return "#d62728";
  if (warming >= 1.3)  return "#e07020";
  if (warming >= 0.8)  return "#e8a020";
  if (warming >= 0.3)  return "#74b8c8";
  return "#4393c3";
}

d3.csv("data/combined_temperature.csv").then(function(raw) {

  const byCountry = d3.group(raw, d => d.Code);

  byCountry.forEach(function(rows, code) {
    const country = rows[0].Country;

    const data = rows.map(r => ({
      year:   +r.Year,
      mean:   r["Annual Mean"] === "" ? null : +r["Annual Mean"],
      smooth: r["5-yr smooth"] === "" ? null : +r["5-yr smooth"]
    })).sort((a, b) => a.year - b.year);

    const baselineYears = data.filter(d => d.year >= 1901 && d.year <= 1930 && d.mean != null);
    const baseline = baselineYears.length > 0 ? d3.mean(baselineYears, d => d.mean) : null;

    const recentYears = data.filter(d => d.year >= 2000 && d.mean != null);
    const recentAvg = recentYears.length > 0 ? d3.mean(recentYears, d => d.mean) : null;

    const warming = (baseline != null && recentAvg != null) ? recentAvg - baseline : null;

    allData.push({ code, country, data, baseline, recentAvg, warming });
  });

  drawChart();
  updateRankings();
  clearInfoCard();
});

document.querySelectorAll("[data-sort]").forEach(btn => {
  btn.addEventListener("click", function() {
    currentSort = this.dataset.sort;
    document.querySelectorAll("[data-sort]").forEach(b => b.classList.remove("active"));
    this.classList.add("active");
    updateRankings();
    drawLines();
  });
});

document.querySelectorAll("[data-view]").forEach(btn => {
  btn.addEventListener("click", function() {
    currentView = this.dataset.view;
    document.querySelectorAll("[data-view]").forEach(b => b.classList.remove("active"));
    this.classList.add("active");
    drawLines();
  });
});

document.getElementById("search").addEventListener("input", function() {
  searchQuery = this.value.toLowerCase().trim();
  updateRankings();
  drawLines();
});

function drawChart() {
  const container = document.getElementById("chart-container");
  const rect = container.getBoundingClientRect();
  chartWidth  = rect.width  - MARGIN.left - MARGIN.right;
  chartHeight = rect.height - MARGIN.top  - MARGIN.bottom;

  svg = d3.select("#chart-container").append("svg")
    .attr("width",  "100%")
    .attr("height", "100%");

  chartG = svg.append("g")
    .attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

  xScale = d3.scaleLinear().domain([1901, 2022]).range([0, chartWidth]);
  yScale = d3.scaleLinear().range([chartHeight, 0]);

  chartG.append("g")
    .attr("class", "axis x-axis")
    .attr("transform", `translate(0,${chartHeight})`)
    .call(
      d3.axisBottom(xScale)
        .tickFormat(d3.format("d"))
        .ticks(8)
        .tickSize(-chartHeight)
    )
    .call(g => g.selectAll(".tick line").attr("class", "grid-line"))
    .call(g => g.select(".domain").attr("stroke", "#aaa"));

  chartG.append("g").attr("class", "axis y-axis");

  chartG.append("line")
    .attr("id", "zero-line")
    .attr("class", "zero-line")
    .attr("x1", 0).attr("x2", chartWidth)
    .attr("y1", 0).attr("y2", 0);

  chartG.append("text")
    .attr("class", "axis-label")
    .attr("id", "y-label")
    .attr("transform", "rotate(-90)")
    .attr("x", -chartHeight / 2)
    .attr("y", -42)
    .attr("text-anchor", "middle")
    .text("Temperature anomaly (°C)");

  chartG.append("g").attr("id", "lines-g");

  chartG.append("line")
    .attr("id", "crosshair")
    .attr("y1", 0).attr("y2", chartHeight)
    .attr("stroke", "#ccc").attr("stroke-width", 1)
    .attr("opacity", 0).attr("pointer-events", "none");

  chartG.append("circle")
    .attr("id", "hover-dot")
    .attr("r", 4).attr("fill", "#333")
    .attr("opacity", 0).attr("pointer-events", "none");

  chartG.append("rect")
    .attr("width", chartWidth).attr("height", chartHeight)
    .attr("fill", "transparent")
    .on("mousemove", onMouseMove)
    .on("mouseleave", onMouseLeave);

  drawLines(true); 
}

function drawLines(isInitial = false) {
  if (!svg) return;

  const isAnomaly = currentView === "anomaly";

  let visible = allData;
  if (searchQuery) {
    visible = allData.filter(d =>
      d.country.toLowerCase().includes(searchQuery) ||
      d.code.toLowerCase().includes(searchQuery)
    );
  }

  document.getElementById("count").textContent =
    visible.length + " countr" + (visible.length === 1 ? "y" : "ies");

  let allVals = [];
  visible.forEach(d => {
    d.data.forEach(pt => {
      if (pt.mean == null) return;
      const v = isAnomaly && d.baseline != null ? pt.mean - d.baseline : pt.mean;
      allVals.push(v);
    });
  });

  if (allVals.length === 0) return;
  const [minV, maxV] = d3.extent(allVals);
  const pad = (maxV - minV) * 0.08;
  yScale.domain([minV - pad, maxV + pad]);

  chartG.select(".y-axis")
    .transition().duration(400)
    .call(
      d3.axisLeft(yScale)
        .ticks(6)
        .tickFormat(d => (isAnomaly && d > 0 ? "+" : "") + d.toFixed(1) + "°")
    )
    .call(g => g.select(".domain").attr("stroke", "#aaa"))
    .call(g => g.selectAll(".tick line").attr("stroke", "transparent"));

  d3.select("#y-label")
    .text(isAnomaly ? "Temperature anomaly from 1901–1930 baseline (°C)" : "Mean annual temperature (°C)");

  d3.select("#zero-line")
    .transition().duration(400)
    .attr("y1", yScale(0)).attr("y2", yScale(0));

  const makeLine = d => d3.line()
    .defined(pt => pt.mean != null)
    .x(pt => xScale(pt.year))
    .y(pt => {
      const v = isAnomaly && d.baseline != null ? pt.mean - d.baseline : pt.mean;
      return yScale(v);
    })
    .curve(d3.curveCatmullRom.alpha(0.5));

  const paths = chartG.select("#lines-g")
    .selectAll(".line")
    .data(visible, d => d.code);

  paths.exit()
    .transition().duration(300)
    .style("opacity", 0)
    .remove();

  const entered = paths.enter()
    .append("path")
    .attr("class", "line")
    .attr("data-code", d => d.code)
    .on("click", (event, d) => onLineClick(d))
    .on("mouseenter", (event, d) => { if (!selectedCountry) showInfoCard(d); })
    .on("mouseleave", ()         => { if (!selectedCountry) clearInfoCard(); })
    .attr("stroke", d => getColor(d.warming))
    .attr("d", d => makeLine(d)(d.data));

  if (isInitial) {
    entered.each(function(d, i) {
      const path = d3.select(this);
      const totalLength = this.getTotalLength();
      path
        .attr("stroke-dasharray", totalLength + " " + totalLength)
        .attr("stroke-dashoffset", totalLength)
        .style("opacity", 0)
        .transition()
          .delay(i * 4)           
          .duration(1200)
          .ease(d3.easeCubicInOut)
          .style("opacity", null) 
          .attr("stroke-dashoffset", 0)
        .on("end", function() {
          d3.select(this)
            .attr("stroke-dasharray", null)
            .attr("stroke-dashoffset", null);
        });
    });
  } else {
    entered
      .style("opacity", 0)
      .transition().duration(400)
      .style("opacity", null);
  }

  const merged = entered.merge(paths);
  merged
    .attr("stroke", d => getColor(d.warming))
    .classed("selected", d => selectedCountry && d.code === selectedCountry)
    .classed("faded",    d => selectedCountry && d.code !== selectedCountry);

  if (!isInitial) {
    merged.transition().duration(400)
      .attr("d", d => makeLine(d)(d.data));
  } else {
    paths.transition().duration(400)
      .attr("d", d => makeLine(d)(d.data));
  }
}

function onMouseMove(event) {
  const [mx] = d3.pointer(event);
  const year = Math.round(xScale.invert(mx));
  if (year < 1901 || year > 2022) return;

  d3.select("#crosshair").attr("x1", mx).attr("x2", mx).attr("opacity", 1);

  if (!selectedCountry) return;

  const d = allData.find(r => r.code === selectedCountry);
  if (!d) return;

  const pt = d.data.find(r => r.year === year);
  if (!pt || pt.mean == null) return;

  const isAnomaly = currentView === "anomaly";
  const yVal = isAnomaly && d.baseline != null ? pt.mean - d.baseline : pt.mean;

  d3.select("#hover-dot")
    .attr("cx", xScale(year))
    .attr("cy", yScale(yVal))
    .attr("fill", getColor(d.warming))
    .attr("opacity", 1);

  const tt = document.getElementById("tooltip");
  tt.innerHTML = `<strong>${d.country}</strong>
    Year: ${year}<br>
    ${isAnomaly ? "Anomaly" : "Temp"}: ${yVal > 0 && isAnomaly ? "+" : ""}${yVal.toFixed(2)}°C`;
  tt.style.opacity = 1;
  tt.style.left = (event.clientX + 16) + "px";
  tt.style.top  = (event.clientY - 36) + "px";
}

function onMouseLeave() {
  d3.select("#crosshair").attr("opacity", 0);
  d3.select("#hover-dot").attr("opacity", 0);
  document.getElementById("tooltip").style.opacity = 0;
}

function onLineClick(d) {
  if (selectedCountry === d.code) {
    selectedCountry = null;
    clearInfoCard();
  } else {
    selectedCountry = d.code;
    showInfoCard(d);
  }
  drawLines();
  updateRankings();
}

function showInfoCard(d) {
  document.getElementById("info-name").textContent = d.country;
  document.getElementById("info-sub").textContent  = d.code;

  const w = d.warming;
  document.getElementById("info-stats").innerHTML = `
    <div class="stat-row"><span>Baseline avg (1901–1930)</span><span>${d.baseline != null ? d.baseline.toFixed(2) + "°C" : "—"}</span></div>
    <div class="stat-row"><span>Recent avg (2000–2022)</span><span>${d.recentAvg != null ? d.recentAvg.toFixed(2) + "°C" : "—"}</span></div>
    <div class="stat-row"><span>Warming</span><span style="color:${getColor(w)}">${w != null ? (w > 0 ? "+" : "") + w.toFixed(2) + "°C" : "—"}</span></div>
  `;
}

function clearInfoCard() {
  document.getElementById("info-name").textContent = "—";
  document.getElementById("info-sub").textContent  = "Click or hover a line";
  document.getElementById("info-stats").innerHTML  = "";
}

function updateRankings() {
  let list = allData.filter(d => d.warming != null);

  if (searchQuery) {
    list = list.filter(d =>
      d.country.toLowerCase().includes(searchQuery) ||
      d.code.toLowerCase().includes(searchQuery)
    );
  }

  if (currentSort === "warming") {
    list.sort((a, b) => b.warming - a.warming);
  } else if (currentSort === "baseline") {
    list.sort((a, b) => b.baseline - a.baseline);
  } else {
    list.sort((a, b) => a.country.localeCompare(b.country));
  }

  const ul = document.getElementById("rank-list");
  ul.innerHTML = "";

  list.forEach((d, i) => {
    const val = currentSort === "baseline" ? d.baseline : d.warming;
    const li  = document.createElement("li");
    li.className = "rank-item" + (selectedCountry === d.code ? " active" : "");
    li.innerHTML = `
      <span class="rank-num">${i + 1}</span>
      <span class="rank-name">${d.country}</span>
      <span class="rank-val" style="color:${getColor(d.warming)}">
        ${val > 0 && currentSort === "warming" ? "+" : ""}${val.toFixed(2)}°
      </span>
    `;
    li.addEventListener("click", () => onLineClick(d));
    ul.appendChild(li);
  });
}