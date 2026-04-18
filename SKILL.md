---
name: crowd-simulation-advanced
description: >
  Build or upgrade a mathematically rigorous crowd movement simulation (Markov chains, multi-layer
  graph, queueing theory, spectral analysis, selfish routing) with a production-grade animated
  dark-theme dashboard. Trigger this skill whenever the user mentions crowd simulation, metro
  station flow, Markov chain movement, random walks, graph-based simulation, queueing models,
  spectral graph analysis, selfish or optimized routing, simulation dashboards, or wants to fix,
  upgrade, or test a simulation visualization project. Also trigger when the user reports UI bugs
  like cluttered graph nodes, broken layouts, boxes spread across screen, or panels not rendering
  correctly in a simulation or data dashboard context. Trigger aggressively.
---

# Advanced Crowd Movement Simulation — Skill

This skill governs both the mathematical backend and the frontend dashboard. It also mandates a
live server test at the end. Do not skip any section.

---

## Critical UI Bugs to Fix (Read Before Writing Any Code)

These are the known failure modes from previous attempts. Every implementation must actively
prevent them.

### Bug 1 — Graph nodes cluttered / invisible / not in view

**Root cause**: SVG `width`/`height` not bound to container at runtime; force simulation stops
before nodes spread out; no zoom/pan; layer Y-bands too narrow.

**Fix — implement exactly this pattern:**

```javascript
// ALWAYS get container dimensions at runtime, not hardcoded
const container = document.getElementById('graph-container');
const W = container.clientWidth;
const H = container.clientHeight;  // container must have explicit CSS height

const svg = d3.select('#graph-container')
    .append('svg')
    .attr('width', W)
    .attr('height', H);

// Add zoom/pan — users can always navigate regardless of node count
const zoomLayer = svg.append('g').attr('class', 'zoom-layer');
svg.call(d3.zoom()
    .scaleExtent([0.2, 4])
    .on('zoom', e => zoomLayer.attr('transform', e.transform))
);

// Layer Y positions spread across FULL height with padding
const LAYER_Y = {
    street:    H * 0.12,
    concourse: H * 0.50,
    platform:  H * 0.88,
};

// Force simulation: high alpha decay, strong layerY, strong collision
const forceSim = d3.forceSimulation(nodes)
    .force('link',    d3.forceLink(edges).id(d => d.id).distance(60).strength(0.3))
    .force('charge',  d3.forceManyBody().strength(-400))
    .force('layerY',  d3.forceY(d => LAYER_Y[d.layer] ?? H/2).strength(1.2))
    .force('spreadX', d3.forceX(W / 2).strength(0.05))
    .force('collide', d3.forceCollide(32))
    .alphaDecay(0.02)
    .velocityDecay(0.4);

// After simulation stabilises, auto-fit ALL nodes into view
forceSim.on('end', () => fitGraphToView(svg, zoomLayer, nodes, W, H));

function fitGraphToView(svg, layer, nodes, W, H) {
    const xs = nodes.map(d => d.x);
    const ys = nodes.map(d => d.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const pad = 60;
    const scaleX = (W - pad*2) / (maxX - minX || 1);
    const scaleY = (H - pad*2) / (maxY - minY || 1);
    const scale  = Math.min(scaleX, scaleY, 1.5);
    const tx = W/2 - scale*(minX + maxX)/2;
    const ty = H/2 - scale*(minY + maxY)/2;
    svg.transition().duration(600)
       .call(d3.zoom().transform,
             d3.zoomIdentity.translate(tx, ty).scale(scale));
}
```

**Also add a "Fit View" button** that calls `fitGraphToView` on click.

### Bug 2 — Boxes/panels spread all over the screen

**Root cause**: Missing explicit row heights in grid, panels using `min-height` instead of fixed
height, or `height: 100vh` on inner panels instead of the body.

**Fix — use this exact layout CSS:**

```css
/* ALWAYS set box-sizing globally */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
    width: 100vw;
    min-height: 100vh;
    background: #080C14;
    overflow-x: hidden;
    display: flex;
    flex-direction: column;
}

.app-shell {
    display: grid;
    grid-template-rows: 56px auto 1fr auto;
    /* header | metrics-bar | main-content | comparison-footer */
    grid-template-areas:
        "header"
        "metrics"
        "main"
        "footer";
    width: 100%;
    max-width: 1600px;
    margin: 0 auto;
    min-height: 100vh;
    padding: 0 16px;
    gap: 12px;
}

.main-content {
    grid-area: main;
    display: grid;
    grid-template-columns: 1fr 360px;
    grid-template-rows: 520px 280px;
    /* graph + sidebar top row; charts bottom row */
    gap: 12px;
}

/* Graph panel: fixed height, no overflow leaking */
#graph-container {
    grid-column: 1;
    grid-row: 1;
    height: 520px;
    background: #0F1624;
    border: 1px solid rgba(99,179,237,0.12);
    border-radius: 12px;
    overflow: hidden;       /* ← CRITICAL: clips SVG, stops overflow */
    position: relative;
}
/* SVG fills container exactly */
#graph-container svg {
    width: 100%;
    height: 100%;
    display: block;
}

.sidebar {
    grid-column: 2;
    grid-row: 1;
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow: hidden;
}

.charts-row {
    grid-column: 1 / -1;
    grid-row: 2;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    height: 280px;
}
.chart-panel {
    height: 280px;
    background: #0F1624;
    border: 1px solid rgba(99,179,237,0.12);
    border-radius: 12px;
    padding: 16px;
    overflow: hidden;
}
.chart-panel canvas {
    width: 100% !important;
    height: calc(100% - 28px) !important;
}
```

### Bug 3 — JSON loads fail (CORS / file:// protocol)

**Always serve from an HTTP server, never open index.html as a file.**

The test step at the end of this skill mandates running `python -m http.server 8080` and making
a real HTTP request to verify. The dashboard's JS must use a relative path:

```javascript
const DATA_URL = './data/simulation_output.json';
```

Not an absolute path. Not `../outputs/`. Copy the JSON to `dashboard/data/` in `main.py`.

### Bug 4 — Charts overflow or have zero height

Chart.js canvases need their container to have a real pixel height. Always wrap in a panel with
fixed height and set `maintainAspectRatio: false`:

```javascript
new Chart(ctx, {
    options: {
        responsive: true,
        maintainAspectRatio: false,  // ← REQUIRED
        ...
    }
});
```

---

## 1. Project File Structure

Extend the existing project. Add only what does not exist.

```
project_root/
├── config.py
├── graph_model.py
├── markov_model.py
├── queue_model.py
├── routing_model.py
├── game_theory.py
├── spectral_analysis.py
├── simulation.py
├── optimization.py
├── visualization.py
├── verify.py
├── main.py
├── outputs/
│   ├── simulation_output.json   ← copied to dashboard/data/ by main.py
│   └── *.png
└── dashboard/
    ├── index.html
    ├── styles.css
    ├── app.js
    └── data/
        └── simulation_output.json   ← copy of outputs/
```

---

## 2. Backend Modules

### `config.py` — all tunables in one place

```python
SEED             = 42
N_STEPS          = 200
ARRIVAL_RATE     = 2.5       # agents spawned per step at each entry node

# Queue params
CONGESTION_ALPHA = 0.7       # service slowdown sensitivity (0=none, 1=full)

# Biased random walk weights
W_SHORTEST_PATH  = 1.2
W_EXIT_PULL      = 0.8
W_CONGESTION     = 1.5
W_ATTRACTIVENESS = 0.6
W_QUEUE_DELAY    = 1.0

# Game theory
SELFISH_ITER     = 50
SELFISH_TOL      = 1e-4
LAYER_PENALTY    = 2.0       # cost added per layer transition

# Optimization
REBALANCE_THRESH = 0.75      # rebalance above this utilization
REBALANCE_STEP   = 0.10

OUTPUT_DIR       = "outputs/"
DASHBOARD_DATA   = "dashboard/data/"
```

### `graph_model.py`

Build a directed weighted multi-layer DiGraph using NetworkX.

**Node attributes** (set via `G.add_node(id, **attrs)`):
```
name, layer, type, capacity, service_rate, position=(x,y)
```
Types: `platform_seg`, `corridor`, `gate`, `stair`, `escalator`, `exit`, `ticket_counter`, `entry`

**Edge attributes**:
```
weight (travel_time), capacity, direction, congestion_factor=1.0, attractiveness=1.0
```

**Station layout** — minimum 22 nodes:
```
Layer "street"    (5 nodes): exit_n, exit_s, exit_e, stair_top_1, stair_top_2
Layer "concourse" (10 nodes): corridor_a..d, gate_1..3, ticket_1, escalator_top_1, escalator_top_2
Layer "platform"  (7 nodes): platform_a..c, stair_bot_1, stair_bot_2, esc_bot_1, esc_bot_2
```

Provide `position=(x, y)` hints on every node so D3 has a starting layout. Use a grid:
- street:    y=0.1, x spread 0.1..0.9
- concourse: y=0.5, x spread 0.05..0.95
- platform:  y=0.9, x spread 0.15..0.85
(These are fractional; multiply by W/H in JS.)

**Required functions**:
```python
def build_metro_graph() -> nx.DiGraph: ...
def adjacency_matrix(G) -> np.ndarray: ...
def weighted_adjacency_matrix(G) -> np.ndarray: ...
def capacity_matrix(G) -> np.ndarray: ...
def get_layer_nodes(G, layer: str) -> list: ...
def inter_layer_edges(G) -> list: ...
def shortest_path(G, src, tgt) -> list: ...
def graph_to_dict(G) -> dict: ...   # serializable for JSON output
```

### `queue_model.py`

```python
@dataclass
class QueueNode:
    node_id: str
    service_rate: float      # μ
    capacity: int            # K
    arrival_rate: float = 0.0
    queue_length: float = 0.0
    waiting_time: float = 0.0
    utilization: float  = 0.0
    departures: int     = 0

    def update(self, new_arrival_rate: float, congestion_alpha: float):
        """
        M/M/1/K update step.

        rho = lambda / mu  (utilization)

        If rho < 0.99 and K is large:
            Lq = rho^2 / (1 - rho)          [M/M/1 mean queue length]
            Wq = Lq / lambda                  [Little's Law: waiting time]

        Finite capacity (always safe):
            If rho != 1:
                P0  = (1-rho) / (1 - rho^(K+1))
                L   = rho/(1-rho) - (K+1)*rho^(K+1)/(1-rho^(K+1))
            Else:
                L   = K/2

        Service slowdown:
            mu_eff = mu * max(0.2, 1 - alpha * (Lq / K))
        Recalculate with mu_eff to get final values.
        """
```

Queue nodes: all gates, stairs, escalators, ticket counters, exits.

### `markov_model.py`

Transition score from node `i` to neighbor `j`:

```
score(i→j) = w_sp   * (1 / (1 + sp_dist[j][destination]))
           + w_exit * (1 / (1 + dist_nearest_exit[j]))
           + w_cong * (1 - utilization[j])
           + w_attr * edge_attractiveness(i,j)
           + w_q    * (1 / (1 + waiting_time[j]))

P(i→j) = softmax(scores over out-neighbors of i)
```

Use `scipy.special.softmax`. Never roll your own exp — overflow risk.

Provide these four functions, each returning an `(n×n)` row-stochastic `np.ndarray`:

1. `baseline_transition_matrix(G)` — uniform 1/out_degree
2. `biased_transition_matrix(G, dest_node, occupancy, queue_metrics, weights)` — full formula
3. `congestion_adjusted_matrix(G, occupancy)` — bias by congestion only
4. `layered_transition_matrix(G)` — biased within each layer; inter-layer edges use `weight`

End every function with:
```python
assert np.allclose(P.sum(axis=1), 1.0, atol=1e-6), "Transition matrix not row-stochastic"
return P
```

### `spectral_analysis.py`

```python
def compute_spectral_metrics(G: nx.DiGraph) -> dict:
    """
    spectral_gap    = 1 - |λ₂| of the transition matrix P
                      High gap → random walk mixes quickly.
                      Near 0   → bottleneck exists (Cheeger inequality).

    mixing_time     ≈ ceil(log(100) / spectral_gap)   [ε=0.01 bound]

    stationary_dist = left eigenvector of P for λ=1   [satisfies πP = π]

    bottleneck_nodes: nodes with highest eigenvector centrality
                      (disproportionate influence on flow)
    """
```

Return a dict with keys: `spectral_gap`, `mixing_time`, `top_eigenvalues` (list of 5),
`stationary_dist` (dict node→prob), `eigenvector_centrality` (dict), `bottleneck_nodes` (list of 3).

Clamp `spectral_gap` to `max(1e-6, gap)` to avoid division by zero.

### `game_theory.py`

```python
def path_cost(G, path: list, flows: dict, queue_metrics: dict) -> float:
    """
    cost = sum over edges e in path of:
             travel_time(e) * (1 + beta * flow(e) / capacity(e))
           + sum over nodes v in path of:
             waiting_time(v)
           + n_layer_transitions * LAYER_PENALTY
    """

def selfish_routing_equilibrium(G, od_demands: dict, n_iter=50) -> dict:
    """
    Wardrop user equilibrium via iterative best-response.
    od_demands = {(origin, destination): demand_flow}

    Each iteration:
      1. For each OD pair, find cheapest path given current flows (Dijkstra on cost)
      2. Step size = 1 / (iteration + 1)
      3. Shift `step` fraction of flow toward cheapest path
    Stop when max flow change < SELFISH_TOL or n_iter reached.
    Returns: flow assignment dict keyed by (u,v) edge tuples.
    """

def social_optimum_routing(G, od_demands: dict) -> dict:
    """
    Minimize total_cost = sum_e flow(e) * cost_function(e, flow(e))
    using scipy.optimize.minimize (method='SLSQP').
    Returns: optimal flow assignment dict.
    """

def price_of_anarchy(selfish_cost: float, optimal_cost: float) -> float:
    """PoA = selfish_cost / optimal_cost. Returns 1.0 if optimal_cost is 0."""
```

### `simulation.py`

```python
@dataclass
class SimResult:
    mode: str
    node_occupancy:  dict   # node_id → list[float] length n_steps
    edge_flows:      dict   # "src→tgt" → list[float]
    queue_lengths:   dict   # node_id → list[float]
    avg_travel_time: float
    avg_wait_time:   float
    peak_queue:      int
    throughput:      float
    path_usage:      dict
    transition_matrix: list  # serializable 2d list

class CrowdSimulation:
    def __init__(self, G, mode, n_steps=200, seed=42): ...
    def run(self) -> SimResult: ...
```

Simulation loop per step:
1. Poisson-spawn agents at `entry` nodes (λ = `ARRIVAL_RATE`, use `rng.poisson`)
2. Move each agent: sample next node from transition matrix row
3. If target node at capacity → agent stays (counts as wait)
4. Update queue nodes (call `queue.update()`)
5. Remove agents at `exit` nodes (record travel time)
6. Record all metrics

Use `rng = np.random.default_rng(seed)` — never `np.random.seed()`.

### `optimization.py`

```python
def rebalance_flows(G, occupancy, P, alpha=0.1) -> np.ndarray:
    """
    For each node v where occupancy[v] / capacity[v] > REBALANCE_THRESH:
      For each node u that has P[u,v] > 0:
        Reduce P[u,v] by REBALANCE_STEP * P[u,v]
        Redistribute to least-congested neighbor of u
    Re-normalize rows after each adjustment.
    """

def find_critical_edges(G) -> list:
    """
    Returns top-5 edges by: betweenness_centrality(e) / capacity(e)
    High score = structurally critical AND low capacity = likely bottleneck.
    """
```

### `main.py`

```python
import shutil, json, os
from pathlib import Path

def main():
    G = build_metro_graph()
    Path(OUTPUT_DIR).mkdir(exist_ok=True)
    Path(DASHBOARD_DATA).mkdir(parents=True, exist_ok=True)

    results = {}
    for mode in ["baseline", "biased", "selfish", "optimized"]:
        sim = CrowdSimulation(G, mode=mode, n_steps=N_STEPS, seed=SEED)
        results[mode] = sim.run()

    spectral = compute_spectral_metrics(G)
    output   = build_output_json(G, results, spectral)

    # Save to outputs/ AND copy to dashboard/data/
    json_path = Path(OUTPUT_DIR) / "simulation_output.json"
    with open(json_path, "w") as f:
        json.dump(output, f, indent=2)
    shutil.copy(json_path, Path(DASHBOARD_DATA) / "simulation_output.json")

    generate_all_plots(G, results, spectral)
    print_console_summary(G, results, spectral)
    run_verification(G, results, spectral)

if __name__ == "__main__":
    main()
```

### `verify.py`

All checks must pass before the project is considered done.

```python
def run_verification(G, results, spectral):
    failures = []

    def check(name, condition):
        if not condition:
            failures.append(name)
        else:
            print(f"  ✓  {name}")

    print("\n── Verification ──────────────────────────")

    # Matrix checks
    for mode, res in results.items():
        P = np.array(res.transition_matrix)
        check(f"{mode}: rows sum to 1",
              np.allclose(P.sum(axis=1), 1.0, atol=1e-5))

    # Graph integrity
    for u, v in G.edges():
        check(f"edge ({u},{v}) nodes exist", u in G.nodes and v in G.nodes)
    for n, d in G.nodes(data=True):
        check(f"node {n} capacity >= 0", d.get('capacity', 0) >= 0)

    # Spectral sanity
    check("spectral_gap finite and > 0",
          np.isfinite(spectral['spectral_gap']) and spectral['spectral_gap'] > 0)

    # Routing produces different results
    check("selfish != baseline (travel time)",
          abs(results['selfish'].avg_travel_time
              - results['baseline'].avg_travel_time) > 0.01)

    # Optimization improves something
    check("optimized beats baseline (wait time OR throughput)",
          results['optimized'].avg_wait_time < results['baseline'].avg_wait_time
          or results['optimized'].throughput  > results['baseline'].throughput)

    # Reproducibility
    r1 = CrowdSimulation(G, "baseline", 200, 42).run()
    r2 = CrowdSimulation(G, "baseline", 200, 42).run()
    check("reproducible with same seed",
          abs(r1.avg_travel_time - r2.avg_travel_time) < 1e-9)

    # JSON output exists and is loadable
    import json
    from pathlib import Path
    p = Path(OUTPUT_DIR) / "simulation_output.json"
    check("simulation_output.json exists", p.exists())
    if p.exists():
        with open(p) as f:
            data = json.load(f)
        check("JSON has all 4 modes",
              all(m in data['modes'] for m in ["baseline","biased","selfish","optimized"]))

    if failures:
        print(f"\n  ✗  {len(failures)} check(s) FAILED: {failures}")
        raise AssertionError(f"Verification failed: {failures}")
    else:
        print("  All checks passed ✓\n")
```

---

## 3. JSON Output Schema

`simulation_output.json` must match this exactly (the dashboard depends on it):

```json
{
  "metadata": {
    "n_nodes": 22,
    "n_edges": 36,
    "n_layers": 3,
    "seed": 42,
    "n_steps": 200
  },
  "graph": {
    "nodes": [
      { "id": "gate_1", "name": "Gate 1", "layer": "concourse",
        "type": "gate", "capacity": 20, "px": 0.25, "py": 0.50 }
    ],
    "edges": [
      { "source": "gate_1", "target": "corridor_a",
        "weight": 2.0, "capacity": 30, "attractiveness": 1.0 }
    ]
  },
  "modes": {
    "baseline": {
      "avg_travel_time": 42.3,
      "avg_wait_time":    8.2,
      "peak_queue":      12,
      "throughput":      18.2,
      "price_of_anarchy": null,
      "node_occupancy":  { "gate_1": [0,1,2,1,...] },
      "queue_lengths":   { "gate_1": [0,0,1,...] },
      "edge_flows":      { "gate_1→corridor_a": [0,1,...] }
    }
  },
  "spectral": {
    "spectral_gap": 0.42,
    "mixing_time": 7,
    "top_eigenvalues": [1.0, 0.58, 0.41, 0.29, 0.17],
    "stationary_dist": { "gate_1": 0.08 },
    "bottleneck_nodes": ["gate_2", "stair_1", "esc_top_1"]
  }
}
```

`px`, `py` are fractional positions (0–1). The dashboard multiplies by container W/H.

---

## 4. Dashboard — Complete Implementation

### `dashboard/index.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MetroFlow — Crowd Simulation</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="app-shell">

    <header class="app-header">
      <div class="brand">Metro<span class="accent">Flow</span></div>
      <nav class="mode-tabs" id="mode-tabs">
        <button class="tab active" data-mode="baseline">Baseline</button>
        <button class="tab" data-mode="biased">Biased Walk</button>
        <button class="tab" data-mode="selfish">Selfish</button>
        <button class="tab" data-mode="optimized">Optimized</button>
      </nav>
      <div class="header-controls">
        <select id="layer-select">
          <option value="all">All Layers</option>
          <option value="street">Street</option>
          <option value="concourse">Concourse</option>
          <option value="platform">Platform</option>
        </select>
      </div>
    </header>

    <section class="metrics-bar" id="metrics-bar">
      <div class="metric-card" data-key="avg_travel_time" data-unit="s" data-lower-better="true">
        <span class="metric-label">Avg Travel Time</span>
        <span class="metric-value" id="m-travel">—</span>
        <span class="metric-delta" id="d-travel"></span>
      </div>
      <div class="metric-card" data-key="avg_wait_time" data-unit="s" data-lower-better="true">
        <span class="metric-label">Avg Wait Time</span>
        <span class="metric-value" id="m-wait">—</span>
        <span class="metric-delta" id="d-wait"></span>
      </div>
      <div class="metric-card" data-key="peak_queue" data-unit="" data-lower-better="true">
        <span class="metric-label">Peak Queue</span>
        <span class="metric-value" id="m-queue">—</span>
        <span class="metric-delta" id="d-queue"></span>
      </div>
      <div class="metric-card" data-key="throughput" data-unit=" p/s" data-lower-better="false">
        <span class="metric-label">Throughput</span>
        <span class="metric-value" id="m-thru">—</span>
        <span class="metric-delta" id="d-thru"></span>
      </div>
      <div class="metric-card spectral-card">
        <span class="metric-label">Spectral Gap</span>
        <span class="metric-value accent-cyan" id="m-gap">—</span>
        <span class="metric-delta" id="d-bottleneck"></span>
      </div>
    </section>

    <main class="main-content">

      <!-- Graph panel -->
      <div class="graph-panel panel" id="graph-panel">
        <div class="panel-header">
          <span>Station Graph</span>
          <div class="panel-actions">
            <button class="icon-btn" id="btn-fit" title="Fit to view">⊡</button>
            <span class="legend-pill green">Clear</span>
            <span class="legend-pill amber">Queued</span>
            <span class="legend-pill red">Congested</span>
          </div>
        </div>
        <div id="graph-container"></div>
        <div id="graph-tooltip" class="tooltip hidden"></div>
        <div id="graph-placeholder" class="placeholder">
          <code>$ python main.py</code>
          <p>Run the simulation to generate data</p>
        </div>
      </div>

      <!-- Sidebar -->
      <aside class="sidebar">
        <div class="sidebar-panel panel spectral-panel" id="spectral-panel">
          <div class="panel-header"><span>Spectral Metrics</span></div>
          <div class="spectral-content" id="spectral-content">
            <div class="spec-row"><span>Spectral Gap</span><span id="sp-gap">—</span></div>
            <div class="spec-row"><span>Mixing Time</span><span id="sp-mix">—</span></div>
            <div class="spec-row"><span>Bottlenecks</span><span id="sp-btn" class="red">—</span></div>
            <canvas id="eigenvalue-chart" height="80"></canvas>
          </div>
        </div>
        <div class="sidebar-panel panel sliders-panel">
          <div class="panel-header"><span>Parameters</span></div>
          <label>Congestion Sensitivity
            <input type="range" id="s-alpha" min="0" max="1" step="0.05" value="0.7">
            <span class="slider-val">0.70</span>
          </label>
          <label>Route Bias Strength
            <input type="range" id="s-bias" min="0" max="2" step="0.1" value="1.0">
            <span class="slider-val">1.00</span>
          </label>
          <label>Capacity Scale
            <input type="range" id="s-cap" min="0.5" max="2" step="0.1" value="1.0">
            <span class="slider-val">1.00</span>
          </label>
        </div>
      </aside>

      <!-- Charts row -->
      <div class="charts-row">
        <div class="chart-panel panel">
          <div class="panel-header"><span>Node Occupancy Over Time</span></div>
          <canvas id="occ-chart"></canvas>
        </div>
        <div class="chart-panel panel">
          <div class="panel-header"><span>Queue Lengths Over Time</span></div>
          <canvas id="queue-chart"></canvas>
        </div>
      </div>

    </main>

    <footer class="comparison-footer panel" id="comparison-footer">
      <div class="panel-header"><span>Mode Comparison</span></div>
      <div class="table-wrapper">
        <table class="comparison-table" id="comparison-table">
          <thead>
            <tr>
              <th>Metric</th>
              <th>Baseline</th>
              <th>Biased Walk</th>
              <th>Selfish</th>
              <th>Optimized</th>
            </tr>
          </thead>
          <tbody id="comparison-tbody"></tbody>
        </table>
      </div>
    </footer>

  </div>
  <script src="app.js"></script>
</body>
</html>
```

---

## 5. `dashboard/styles.css` — Complete

```css
/* ── Reset ──────────────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

/* ── Design Tokens ──────────────────────────────────────── */
:root {
  --bg:          #080C14;
  --surface:     #0F1624;
  --elevated:    #162033;
  --border:      rgba(99,179,237,0.12);
  --cyan:        #38BDF8;
  --amber:       #FCD34D;
  --red:         #F87171;
  --green:       #4ADE80;
  --text:        #E2E8F0;
  --muted:       #64748B;
  --font-d:      'Space Mono', monospace;
  --font-b:      'DM Sans', sans-serif;
  --font-m:      'JetBrains Mono', monospace;
  --radius:      12px;
  --panel-pad:   16px;
}

body {
  font-family: var(--font-b);
  background: var(--bg);
  color: var(--text);
  width: 100vw;
  min-height: 100vh;
  overflow-x: hidden;
}

/* ── App Shell ───────────────────────────────────────────── */
.app-shell {
  display: grid;
  grid-template-rows: 56px auto 1fr auto;
  grid-template-areas: "header" "metrics" "main" "footer";
  max-width: 1600px;
  margin: 0 auto;
  min-height: 100vh;
  padding: 8px 16px 16px;
  gap: 10px;
}

/* ── Header ─────────────────────────────────────────────── */
.app-header {
  grid-area: header;
  display: flex;
  align-items: center;
  gap: 24px;
  height: 56px;
}
.brand {
  font: 700 1.25rem var(--font-d);
  color: var(--text);
  white-space: nowrap;
}
.brand .accent { color: var(--cyan); }
.mode-tabs { display: flex; gap: 4px; }
.tab {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--muted);
  font: 500 0.8rem var(--font-b);
  padding: 6px 14px;
  border-radius: 8px;
  cursor: pointer;
  position: relative;
  transition: color 0.2s, border-color 0.2s;
}
.tab.active {
  color: var(--cyan);
  border-color: rgba(56,189,248,0.4);
  background: rgba(56,189,248,0.06);
}
.tab.active::after {
  content: '';
  position: absolute;
  bottom: -1px; left: 20%; right: 20%; height: 2px;
  background: var(--cyan);
  border-radius: 2px;
  animation: tabLine 0.25s ease forwards;
}
@keyframes tabLine { from { transform: scaleX(0); } to { transform: scaleX(1); } }

.header-controls { margin-left: auto; }
select {
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
  font: 0.8rem var(--font-b);
  padding: 6px 10px;
  border-radius: 8px;
  cursor: pointer;
}

/* ── Metrics Bar ─────────────────────────────────────────── */
.metrics-bar {
  grid-area: metrics;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 10px;
  height: auto;
}
.metric-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  position: relative;
  overflow: hidden;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.metric-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, var(--cyan) 0%, transparent 55%);
  opacity: 0.03;
  pointer-events: none;
}
.metric-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 24px rgba(56,189,248,0.14);
}
.metric-label { font: 0.72rem var(--font-b); color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
.metric-value {
  font: 700 1.8rem var(--font-m);
  color: var(--cyan);
  line-height: 1;
  transition: color 0.3s;
}
.metric-value.warn  { color: var(--amber); }
.metric-value.crit  { color: var(--red);   text-shadow: 0 0 8px var(--red); }
.metric-value.good  { color: var(--green); }
.metric-delta { font: 0.72rem var(--font-m); color: var(--muted); }
.metric-delta.better { color: var(--green); }
.metric-delta.worse  { color: var(--red); }

/* ── Main Content Grid ───────────────────────────────────── */
.main-content {
  grid-area: main;
  display: grid;
  grid-template-columns: 1fr 340px;
  grid-template-rows: 500px 260px;
  gap: 10px;
}

/* ── Panel Base ──────────────────────────────────────────── */
.panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  animation: slideUp 0.4s cubic-bezier(0.22,1,0.36,1) both;
}
@keyframes slideUp {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px var(--panel-pad);
  border-bottom: 1px solid var(--border);
  font: 600 0.8rem var(--font-b);
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  flex-shrink: 0;
}
.panel-actions { display: flex; align-items: center; gap: 8px; }
.icon-btn {
  background: var(--elevated);
  border: 1px solid var(--border);
  color: var(--muted);
  width: 26px; height: 26px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  display: flex; align-items: center; justify-content: center;
  transition: color 0.2s, border-color 0.2s;
}
.icon-btn:hover { color: var(--cyan); border-color: rgba(56,189,248,0.4); }
.legend-pill {
  font: 0.65rem var(--font-m);
  padding: 2px 7px;
  border-radius: 4px;
  background: rgba(255,255,255,0.05);
}
.legend-pill.green  { color: var(--green); }
.legend-pill.amber  { color: var(--amber); }
.legend-pill.red    { color: var(--red); }

/* ── Graph Panel ─────────────────────────────────────────── */
.graph-panel {
  grid-column: 1; grid-row: 1;
  display: flex;
  flex-direction: column;
  height: 500px;
}
#graph-container {
  flex: 1;
  overflow: hidden;  /* CRITICAL */
  position: relative;
  cursor: grab;
}
#graph-container:active { cursor: grabbing; }
#graph-container svg { width: 100%; height: 100%; display: block; }

/* Node animations */
.node-congested { animation: pulseRed   1.4s ease-in-out infinite; }
.node-queue     { animation: pulseAmber 2.0s ease-in-out infinite; }
@keyframes pulseRed {
  0%,100% { filter: drop-shadow(0 0 4px #F87171); }
  50%     { filter: drop-shadow(0 0 14px #F87171); }
}
@keyframes pulseAmber {
  0%,100% { filter: drop-shadow(0 0 3px #FCD34D); }
  50%     { filter: drop-shadow(0 0 10px #FCD34D); }
}

/* Tooltip */
.tooltip {
  position: fixed;
  background: var(--elevated);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 14px;
  font: 0.78rem var(--font-m);
  color: var(--text);
  pointer-events: none;
  z-index: 1000;
  min-width: 160px;
  transition: opacity 0.15s;
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
}
.tooltip.hidden { opacity: 0; }
.tt-title { color: var(--cyan); font-weight: 700; margin-bottom: 6px; font-size: 0.85rem; }
.tt-row { display: flex; justify-content: space-between; gap: 16px; color: var(--muted); margin-top: 3px; }
.tt-row span:last-child { color: var(--text); }

/* Placeholder */
.placeholder {
  position: absolute; inset: 0;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 12px; color: var(--muted);
  background: var(--surface);
  z-index: 10;
}
.placeholder code {
  font: 0.9rem var(--font-m);
  color: var(--cyan);
  background: var(--elevated);
  padding: 8px 16px;
  border-radius: 6px;
  border: 1px solid var(--border);
}
.placeholder.hidden { display: none; }

/* ── Sidebar ─────────────────────────────────────────────── */
.sidebar {
  grid-column: 2; grid-row: 1;
  display: flex; flex-direction: column; gap: 10px;
  overflow: hidden;
  height: 500px;
}
.sidebar-panel { flex: 1; display: flex; flex-direction: column; }
.spectral-panel { position: relative; overflow: hidden; }
.spectral-panel::after {
  content: '';
  position: absolute;
  top: 0; left: -100%; right: -100%; height: 2px;
  background: linear-gradient(90deg, transparent, var(--cyan), transparent);
  animation: scan 3.5s linear infinite;
}
@keyframes scan { from { transform: translateX(0); } to { transform: translateX(200%); } }
.spectral-content { padding: var(--panel-pad); display: flex; flex-direction: column; gap: 8px; flex: 1; }
.spec-row { display: flex; justify-content: space-between; font: 0.78rem var(--font-m); }
.spec-row span:first-child { color: var(--muted); }
.spec-row .red { color: var(--red); }
.sliders-panel { }
.sliders-panel label {
  display: flex; flex-direction: column; gap: 4px;
  font: 0.75rem var(--font-b); color: var(--muted);
  padding: 8px var(--panel-pad) 0;
}
input[type=range] { width: 100%; accent-color: var(--cyan); cursor: pointer; }
.slider-val { font: 0.72rem var(--font-m); color: var(--cyan); align-self: flex-end; }

/* ── Charts Row ──────────────────────────────────────────── */
.charts-row {
  grid-column: 1 / -1; grid-row: 2;
  display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
  height: 260px;
}
.chart-panel {
  display: flex; flex-direction: column;
  height: 260px; overflow: hidden;
}
.chart-panel canvas {
  flex: 1;
  min-height: 0;   /* CRITICAL: allows canvas to shrink inside flex */
}

/* ── Comparison Footer ───────────────────────────────────── */
.comparison-footer {
  grid-area: footer;
  display: flex; flex-direction: column;
}
.table-wrapper { overflow-x: auto; flex: 1; }
.comparison-table {
  width: 100%; border-collapse: collapse;
  font: 0.8rem var(--font-m);
}
.comparison-table th {
  padding: 8px 16px; text-align: left;
  color: var(--muted); font-weight: 600;
  border-bottom: 1px solid var(--border);
  background: var(--elevated);
}
.comparison-table td {
  padding: 8px 16px;
  border-bottom: 1px solid rgba(99,179,237,0.06);
  transition: background 0.15s;
}
.comparison-table tr:hover td { background: rgba(56,189,248,0.04); }
.comparison-table td:first-child { color: var(--muted); }
td.cell-better { color: var(--green); }
td.cell-worse  { color: var(--red); }
td.cell-neutral { color: var(--text); }
```

---

## 6. `dashboard/app.js` — Complete Logic

```javascript
// ── State ──────────────────────────────────────────────────
let DATA = null;
let currentMode = 'baseline';
let currentLayer = 'all';
let occChart = null;
let queueChart = null;
let eigenChart = null;
let graphSim = null;
let svgRef = null;
let zoomRef = null;
let zoomLayerRef = null;

// ── Boot ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    bindUI();
    staggerPanels();
});

async function loadData() {
    try {
        const res = await fetch('./data/simulation_output.json');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        DATA = await res.json();
        document.getElementById('graph-placeholder').classList.add('hidden');
        initDashboard();
    } catch (e) {
        console.warn('Could not load simulation data:', e.message);
        // placeholder stays visible
    }
}

function initDashboard() {
    renderGraph();
    renderMetrics();
    renderCharts();
    renderSpectral();
    renderComparisonTable();
}

// ── UI Bindings ────────────────────────────────────────────
function bindUI() {
    document.getElementById('mode-tabs').addEventListener('click', e => {
        const tab = e.target.closest('.tab');
        if (!tab) return;
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentMode = tab.dataset.mode;
        if (DATA) switchMode();
    });

    document.getElementById('layer-select').addEventListener('change', e => {
        currentLayer = e.target.value;
        if (DATA) renderGraph();
    });

    document.getElementById('btn-fit').addEventListener('click', () => {
        if (DATA) fitGraph();
    });

    document.querySelectorAll('input[type=range]').forEach(inp => {
        const valEl = inp.nextElementSibling;
        inp.addEventListener('input', () => {
            valEl.textContent = parseFloat(inp.value).toFixed(2);
        });
    });
}

function switchMode() {
    const panels = document.querySelectorAll('.metric-card, .chart-panel');
    panels.forEach(p => {
        p.style.transition = 'opacity 0.16s ease, filter 0.16s ease';
        p.style.opacity = '0';
        p.style.filter = 'blur(3px)';
    });
    setTimeout(() => {
        renderMetrics();
        updateCharts();
        updateGraphCongestion();
        panels.forEach((p, i) => {
            setTimeout(() => {
                p.style.opacity = '';
                p.style.filter = '';
            }, i * 40);
        });
    }, 160);
}

function staggerPanels() {
    document.querySelectorAll('.panel').forEach((p, i) => {
        p.style.animationDelay = i * 70 + 'ms';
    });
}

// ── Metric Cards ───────────────────────────────────────────
function renderMetrics() {
    if (!DATA) return;
    const m = DATA.modes[currentMode];
    const b = DATA.modes['baseline'];

    const map = [
        { id: 'm-travel', did: 'd-travel', key: 'avg_travel_time', unit: 's', lb: true  },
        { id: 'm-wait',   did: 'd-wait',   key: 'avg_wait_time',   unit: 's', lb: true  },
        { id: 'm-queue',  did: 'd-queue',  key: 'peak_queue',      unit: '',  lb: true  },
        { id: 'm-thru',   did: 'd-thru',   key: 'throughput',      unit: ' p/s', lb: false },
    ];
    map.forEach(({ id, did, key, unit, lb }) => {
        const el = document.getElementById(id);
        const del = document.getElementById(did);
        const from = parseFloat(el.textContent) || 0;
        const to = m[key];
        animateCounter(el, from, to, unit);
        colorMetric(el, to, b[key], lb);
        renderDelta(del, to, b[key], lb, unit);
    });

    // Spectral gap
    const gapEl = document.getElementById('m-gap');
    const gap = DATA.spectral.spectral_gap;
    animateCounter(gapEl, 0, gap, '');
    document.getElementById('d-bottleneck').textContent =
        'Mix ~' + DATA.spectral.mixing_time + ' steps';
}

function animateCounter(el, from, to, unit, duration = 700) {
    const start = performance.now();
    const fn = now => {
        const t = Math.min((now - start) / duration, 1);
        const e = 1 - Math.pow(1 - t, 3);
        const val = from + (to - from) * e;
        el.textContent = Number.isInteger(to) ? Math.round(val) + unit
                                              : val.toFixed(1) + unit;
        if (t < 1) requestAnimationFrame(fn);
    };
    requestAnimationFrame(fn);
}

function colorMetric(el, val, baseline, lowerIsBetter) {
    el.className = 'metric-value';
    if (currentMode === 'baseline') return;
    const better = lowerIsBetter ? val < baseline : val > baseline;
    el.classList.add(better ? 'good' : 'warn');
}

function renderDelta(el, val, baseline, lowerIsBetter, unit) {
    if (currentMode === 'baseline') { el.textContent = 'baseline'; return; }
    const diff = val - baseline;
    const pct  = baseline !== 0 ? (diff / baseline * 100).toFixed(1) : '—';
    const better = lowerIsBetter ? diff < 0 : diff > 0;
    el.textContent = (diff > 0 ? '+' : '') + diff.toFixed(1) + unit + ' (' + pct + '%)';
    el.className = 'metric-delta ' + (better ? 'better' : 'worse');
}

// ── D3 Graph ───────────────────────────────────────────────
function renderGraph() {
    if (!DATA) return;
    const container = document.getElementById('graph-container');
    container.innerHTML = '';

    const W = container.clientWidth  || 700;
    const H = container.clientHeight || 430;

    // Filter nodes by layer
    let nodes = DATA.graph.nodes.filter(d =>
        currentLayer === 'all' || d.layer === currentLayer
    );
    const nodeIds = new Set(nodes.map(d => d.id));
    let edges = DATA.graph.edges.filter(d =>
        nodeIds.has(d.source) && nodeIds.has(d.target)
    );

    // Deep-copy nodes so D3 can mutate x/y
    nodes = nodes.map(d => ({
        ...d,
        x: d.px * W,
        y: d.py * H,
    }));
    edges = edges.map(d => ({ ...d }));

    const LAYER_Y = { street: H * 0.12, concourse: H * 0.50, platform: H * 0.88 };

    const svg = d3.select(container).append('svg')
        .attr('width', W).attr('height', H);

    // Zoom/pan
    const zoomLayer = svg.append('g');
    const zoom = d3.zoom().scaleExtent([0.15, 5])
        .on('zoom', e => zoomLayer.attr('transform', e.transform));
    svg.call(zoom);
    svgRef = svg; zoomRef = zoom; zoomLayerRef = zoomLayer;

    // Arrowhead markers
    const defs = svg.append('defs');
    ['flow','congested'].forEach(id => {
        defs.append('marker')
            .attr('id', `arrow-${id}`)
            .attr('viewBox', '0 -5 10 10')
            .attr('refX', 22).attr('refY', 0)
            .attr('markerWidth', 5).attr('markerHeight', 5)
            .attr('orient', 'auto')
            .append('path').attr('d', 'M0,-5L10,0L0,5')
            .attr('fill', id === 'congested' ? '#F87171' : '#38BDF8')
            .attr('opacity', 0.7);
    });

    // Layer band labels
    Object.entries(LAYER_Y).forEach(([layer, y]) => {
        if (currentLayer !== 'all' && layer !== currentLayer) return;
        zoomLayer.append('text')
            .attr('x', 12).attr('y', y)
            .text(layer.toUpperCase())
            .attr('fill', '#334155')
            .attr('font-family', 'JetBrains Mono, monospace')
            .attr('font-size', '10px')
            .attr('alignment-baseline', 'middle');
    });

    // Draw edges
    const edgeSel = zoomLayer.append('g').selectAll('line')
        .data(edges).join('line')
        .attr('stroke', d => edgeColor(d))
        .attr('stroke-width', 1.5)
        .attr('opacity', 0.6)
        .attr('marker-end', d => `url(#arrow-flow)`);

    // Draw nodes
    const nodeSel = zoomLayer.append('g').selectAll('circle')
        .data(nodes).join('circle')
        .attr('r', d => nodeRadius(d))
        .attr('fill', d => nodeColor(d))
        .attr('fill-opacity', 0.85)
        .attr('stroke', '#0F1624')
        .attr('stroke-width', 1.5)
        .style('cursor', 'pointer')
        .call(d3.drag()
            .on('start', (e, d) => { if (!e.active) forceSim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
            .on('drag',  (e, d) => { d.fx = e.x; d.fy = e.y; })
            .on('end',   (e, d) => { if (!e.active) forceSim.alphaTarget(0); d.fx = null; d.fy = null; })
        )
        .on('mousemove', showTooltip)
        .on('mouseleave', hideTooltip);

    // Node labels
    const labelSel = zoomLayer.append('g').selectAll('text')
        .data(nodes).join('text')
        .text(d => d.name.length > 10 ? d.name.slice(0, 10) + '…' : d.name)
        .attr('fill', '#94A3B8')
        .attr('font-family', 'JetBrains Mono, monospace')
        .attr('font-size', '9px')
        .attr('text-anchor', 'middle')
        .attr('dy', d => nodeRadius(d) + 11)
        .style('pointer-events', 'none');

    // Force simulation
    const forceSim = d3.forceSimulation(nodes)
        .force('link',    d3.forceLink(edges).id(d => d.id).distance(70).strength(0.25))
        .force('charge',  d3.forceManyBody().strength(-350))
        .force('layerY',  d3.forceY(d => LAYER_Y[d.layer] ?? H/2).strength(1.0))
        .force('spreadX', d3.forceX(W / 2).strength(0.04))
        .force('collide', d3.forceCollide(d => nodeRadius(d) + 12))
        .alphaDecay(0.025)
        .velocityDecay(0.45);

    forceSim.on('tick', () => {
        edgeSel
            .attr('x1', d => (typeof d.source === 'object' ? d.source.x : 0))
            .attr('y1', d => (typeof d.source === 'object' ? d.source.y : 0))
            .attr('x2', d => (typeof d.target === 'object' ? d.target.x : 0))
            .attr('y2', d => (typeof d.target === 'object' ? d.target.y : 0));
        nodeSel.attr('cx', d => d.x).attr('cy', d => d.y);
        labelSel.attr('x', d => d.x).attr('y', d => d.y);
    });

    forceSim.on('end', () => autoFitGraph(svg, zoom, zoomLayer, nodes, W, H));
}

function nodeColor(d) {
    if (!DATA) return '#38BDF8';
    const occ  = DATA.modes[currentMode].node_occupancy[d.id];
    const last = occ ? occ[occ.length - 1] : 0;
    const util = last / (d.capacity || 1);
    if (util > 0.85) return '#F87171';
    if (util > 0.6)  return '#FCD34D';
    return '#4ADE80';
}

function nodeRadius(d) {
    if (!DATA) return 10;
    const q = DATA.modes[currentMode].queue_lengths[d.id];
    const ql = q ? q[q.length - 1] : 0;
    return Math.max(8, Math.min(22, 9 + ql * 1.2));
}

function edgeColor(d) {
    if (!DATA) return '#38BDF8';
    const flow = DATA.modes[currentMode].edge_flows[`${d.source}→${d.target}`];
    const last = flow ? flow[flow.length - 1] : 0;
    const util = last / (d.capacity || 1);
    return d3.interpolateRgb('#4ADE80', '#F87171')(Math.min(util, 1));
}

function autoFitGraph(svg, zoom, layer, nodes, W, H) {
    if (!nodes.length) return;
    const xs = nodes.map(d => d.x).filter(isFinite);
    const ys = nodes.map(d => d.y).filter(isFinite);
    if (!xs.length) return;
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const pad = 60;
    const sx = (W - pad*2) / ((maxX - minX) || 1);
    const sy = (H - pad*2) / ((maxY - minY) || 1);
    const scale = Math.min(sx, sy, 1.8);
    const tx = W/2 - scale*(minX + maxX)/2;
    const ty = H/2 - scale*(minY + maxY)/2;
    svg.transition().duration(700)
       .call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
}

function fitGraph() {
    // Re-trigger fit from current node positions
    if (!svgRef || !zoomRef || !zoomLayerRef) return;
    const container = document.getElementById('graph-container');
    const W = container.clientWidth;
    const H = container.clientHeight;
    const nodes = zoomLayerRef.selectAll('circle').data();
    autoFitGraph(svgRef, zoomRef, zoomLayerRef, nodes, W, H);
}

function updateGraphCongestion() {
    if (!zoomLayerRef) { renderGraph(); return; }
    zoomLayerRef.selectAll('circle')
        .attr('fill', d => nodeColor(d))
        .attr('r',    d => nodeRadius(d))
        .classed('node-congested', d => {
            const occ = DATA.modes[currentMode].node_occupancy[d.id];
            return occ && (occ[occ.length-1] / d.capacity) > 0.85;
        })
        .classed('node-queue', d => {
            const q = DATA.modes[currentMode].queue_lengths[d.id];
            return q && q[q.length-1] > 4;
        });
}

// ── Tooltip ────────────────────────────────────────────────
function showTooltip(event, d) {
    const tip = document.getElementById('graph-tooltip');
    const occ = DATA.modes[currentMode].node_occupancy[d.id];
    const q   = DATA.modes[currentMode].queue_lengths[d.id];
    const last_occ = occ ? occ[occ.length-1] : 0;
    const last_q   = q   ? q[q.length-1]   : 0;
    tip.innerHTML = `
        <div class="tt-title">${d.name}</div>
        <div class="tt-row"><span>Type</span><span>${d.type}</span></div>
        <div class="tt-row"><span>Layer</span><span>${d.layer}</span></div>
        <div class="tt-row"><span>Occupancy</span><span>${last_occ.toFixed(0)} / ${d.capacity}</span></div>
        <div class="tt-row"><span>Queue</span><span>${last_q.toFixed(1)}</span></div>
        <div class="tt-row"><span>Util%</span><span>${(last_occ/d.capacity*100).toFixed(0)}%</span></div>
    `;
    tip.classList.remove('hidden');
    tip.style.left = (event.clientX + 14) + 'px';
    tip.style.top  = (event.clientY - 10) + 'px';
}
function hideTooltip() {
    document.getElementById('graph-tooltip').classList.add('hidden');
}

// ── Charts ─────────────────────────────────────────────────
const CHART_DEFAULTS = {
    responsive: true,
    maintainAspectRatio: false,    // REQUIRED
    animation: { duration: 500 },
    plugins: {
        legend: { labels: { color: '#94A3B8', font: { family: 'JetBrains Mono', size: 10 }, boxWidth: 12 }},
    },
    scales: {
        x: { ticks: { color: '#475569', maxTicksLimit: 10, font: { size: 9 } },
             grid: { color: 'rgba(99,179,237,0.07)' }},
        y: { ticks: { color: '#475569', font: { size: 9 } },
             grid: { color: 'rgba(99,179,237,0.07)' }},
    },
};

function TOP_NODES(mode, n = 4) {
    const occ = DATA.modes[mode].node_occupancy;
    return Object.entries(occ)
        .map(([id, vals]) => ({ id, max: Math.max(...vals) }))
        .sort((a,b) => b.max - a.max).slice(0, n).map(x => x.id);
}
function TOP_QUEUES(mode, n = 4) {
    const q = DATA.modes[mode].queue_lengths;
    return Object.entries(q)
        .map(([id, vals]) => ({ id, max: Math.max(...vals) }))
        .sort((a,b) => b.max - a.max).slice(0, n).map(x => x.id);
}

const COLORS = ['#38BDF8','#4ADE80','#FCD34D','#F87171','#A78BFA'];

function renderCharts() {
    if (!DATA) return;
    const steps = Array.from({ length: DATA.metadata.n_steps }, (_, i) => i);
    const topN = TOP_NODES(currentMode);
    const topQ = TOP_QUEUES(currentMode);

    occChart = new Chart(document.getElementById('occ-chart'), {
        type: 'line',
        data: {
            labels: steps,
            datasets: topN.map((id, i) => ({
                label: id,
                data: DATA.modes[currentMode].node_occupancy[id],
                borderColor: COLORS[i],
                backgroundColor: COLORS[i] + '18',
                borderWidth: 1.5,
                pointRadius: 0,
                tension: 0.4,
                fill: false,
            })),
        },
        options: { ...CHART_DEFAULTS },
    });

    queueChart = new Chart(document.getElementById('queue-chart'), {
        type: 'line',
        data: {
            labels: steps,
            datasets: topQ.map((id, i) => ({
                label: id,
                data: DATA.modes[currentMode].queue_lengths[id],
                borderColor: COLORS[i],
                backgroundColor: COLORS[i] + '18',
                borderWidth: 1.5,
                pointRadius: 0,
                tension: 0.3,
                fill: true,
            })),
        },
        options: { ...CHART_DEFAULTS },
    });
}

function updateCharts() {
    if (!occChart || !queueChart || !DATA) return;
    const topN = TOP_NODES(currentMode);
    const topQ = TOP_QUEUES(currentMode);
    occChart.data.datasets = topN.map((id, i) => ({
        label: id,
        data: DATA.modes[currentMode].node_occupancy[id],
        borderColor: COLORS[i], backgroundColor: COLORS[i]+'18',
        borderWidth: 1.5, pointRadius: 0, tension: 0.4, fill: false,
    }));
    queueChart.data.datasets = topQ.map((id, i) => ({
        label: id,
        data: DATA.modes[currentMode].queue_lengths[id],
        borderColor: COLORS[i], backgroundColor: COLORS[i]+'18',
        borderWidth: 1.5, pointRadius: 0, tension: 0.3, fill: true,
    }));
    occChart.update();
    queueChart.update();
}

// ── Spectral Panel ─────────────────────────────────────────
function renderSpectral() {
    if (!DATA) return;
    const s = DATA.spectral;
    document.getElementById('sp-gap').textContent = s.spectral_gap.toFixed(3);
    document.getElementById('sp-mix').textContent = '~' + s.mixing_time + ' steps';
    document.getElementById('sp-btn').textContent = s.bottleneck_nodes.join(', ');

    if (eigenChart) eigenChart.destroy();
    eigenChart = new Chart(document.getElementById('eigenvalue-chart'), {
        type: 'bar',
        data: {
            labels: s.top_eigenvalues.map((_, i) => 'λ' + (i+1)),
            datasets: [{ data: s.top_eigenvalues, backgroundColor: '#38BDF840', borderColor: '#38BDF8', borderWidth: 1 }],
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }},
            scales: {
                x: { ticks: { color: '#475569', font: { size: 8 }}, grid: { display: false }},
                y: { ticks: { color: '#475569', font: { size: 8 }, maxTicksLimit: 4 },
                     grid: { color: 'rgba(99,179,237,0.07)' }, min: 0, max: 1.1 },
            },
        },
    });
}

// ── Comparison Table ───────────────────────────────────────
function renderComparisonTable() {
    if (!DATA) return;
    const MODES = ['baseline','biased','selfish','optimized'];
    const METRICS = [
        { key: 'avg_travel_time', label: 'Avg Travel Time (s)', lb: true  },
        { key: 'avg_wait_time',   label: 'Avg Wait Time (s)',   lb: true  },
        { key: 'peak_queue',      label: 'Peak Queue Length',   lb: true  },
        { key: 'throughput',      label: 'Throughput (p/s)',    lb: false },
    ];
    const body = document.getElementById('comparison-tbody');
    body.innerHTML = METRICS.map(m => {
        const base = DATA.modes.baseline[m.key];
        return `<tr><td>${m.label}</td>${MODES.map(mode => {
            const v = DATA.modes[mode][m.key];
            if (mode === 'baseline') return `<td class="cell-neutral">${v.toFixed(1)}</td>`;
            const better = m.lb ? v < base : v > base;
            const arrow  = m.lb ? (v < base ? ' ↓' : ' ↑') : (v > base ? ' ↑' : ' ↓');
            return `<td class="${better ? 'cell-better' : 'cell-worse'}">${v.toFixed(1)}${arrow}</td>`;
        }).join('')}</tr>`;
    }).join('');
}
```

---

## 7. Mandatory Testing Protocol

After all code is written, execute these steps **in order**. Do not skip.

### Step 1 — Run backend
```bash
cd <project_root>
python main.py
```
Must exit with code 0. Check:
- `outputs/simulation_output.json` exists and is valid JSON
- `dashboard/data/simulation_output.json` exists (copy)
- At least 5 `.png` files in `outputs/`
- Verification block prints all `✓` lines
- Console summary table appears with all 4 modes

### Step 2 — Start HTTP server
```bash
cd dashboard
python -m http.server 8080
```
Or if port 8080 is taken: `python -m http.server 8081`

### Step 3 — Verify data endpoint
```bash
curl -s http://localhost:8080/data/simulation_output.json | python -c "
import sys, json
data = json.load(sys.stdin)
assert 'metadata' in data, 'missing metadata'
assert 'graph'    in data, 'missing graph'
assert 'modes'    in data, 'missing modes'
assert all(m in data['modes'] for m in ['baseline','biased','selfish','optimized']), 'missing mode'
assert 'spectral' in data, 'missing spectral'
assert len(data['graph']['nodes']) >= 20, 'too few nodes'
assert len(data['graph']['edges']) >= 30, 'too few edges'
print('JSON structure: OK')
print('Nodes:', len(data['graph']['nodes']))
print('Edges:', len(data['graph']['edges']))
print('Modes:', list(data['modes'].keys()))
print('Spectral gap:', data['spectral']['spectral_gap'])
"
```

### Step 4 — Verify HTML loads
```bash
curl -s http://localhost:8080/ | grep -c 'MetroFlow'
# should print 1
curl -s http://localhost:8080/ | grep -c 'chart.umd.min.js'
# should print 1
curl -s http://localhost:8080/ | grep -c 'd3.min.js'
# should print 1
```

### Step 5 — Report

Print a final status block:
```
══════════════════════════════════════
  SYSTEM STATUS
══════════════════════════════════════
  Backend:       ✓ main.py runs clean
  JSON output:   ✓ all 4 modes present
  Dashboard copy:✓ dashboard/data/ OK
  HTTP server:   ✓ serving on :8080
  Data endpoint: ✓ JSON valid + complete
  HTML page:     ✓ loads correctly
  Verification:  ✓ all checks pass
══════════════════════════════════════
  Open: http://localhost:8080
══════════════════════════════════════
```

If any step fails, fix it before reporting success. Do not mark the task done with failing checks.

---

## 8. Common Failure Guards

| Problem | Guard |
|---|---|
| Graph nodes invisible | `overflow: hidden` on `#graph-container`; SVG `width/height` bound at runtime |
| Nodes all pile up center | `layerY` force strength ≥ 1.0; `collide` force with radius + padding |
| Canvas height = 0 | `maintainAspectRatio: false`; chart panel uses `flex-direction: column`; canvas `flex: 1; min-height: 0` |
| JSON 404 | Copy to `dashboard/data/` in `main.py`; serve via HTTP not `file://` |
| ρ ≥ 1 in M/M/1 | Clamp: `rho = min(λ/μ, 0.999)` before open-form formula |
| Row sums ≠ 1 | `P[i] /= P[i].sum()` after every operation; assert at function end |
| Selfish = Baseline | Cost function must use current flow values, not static edge weights |
| Boxes overflow screen | `max-width: 1600px; margin: 0 auto` on `.app-shell`; no `height: 100vh` on inner panels |