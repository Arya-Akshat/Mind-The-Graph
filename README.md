# MetroFlow: Crowd Movement Simulation using Markov Chains and Graph Theory

## Mathematical Modelling Project

A comprehensive mathematical framework that simulates and optimizes crowd movement through a multi-layered metro station environment. The project integrates **Multi-layer Graph Theory**, **Discrete-Time Markov Chains (DTMC)**, and **M/M/1/K Queuing Theory** to identify congestion bottlenecks and evaluate routing efficiency.

---

## Key Features

- **Multi-layer Topologies**: Explicit modelling of Street, Concourse, and Platform levels with vertical transition dynamics (stairs/escalators).
- **Stochastic Engine**: DTMC-based movement with dynamic, congestion-aware transition matrices.
- **Queuing Dynamics**: Node-level delay modelling using M/M/1/K queuing theory with service slowdown factors.
- **Spectral Analysis**: Evaluation of network stability and convergence through Spectral Gap and Mixing Time metrics.
- **Routing Analysis**: Comparative study of Baseline, Biased, Selfish (Nash Equilibrium), and Socially Optimal flows.
- **Price of Anarchy (PoA)**: Quantitative analysis of the efficiency loss due to decentralized selfish routing.
- **Interactive Dashboard**: Real-time visualization with a narrative-driven intelligence layer.

---

## Project Structure

```
MM EL FINAL/
├── research.tex               # Academic paper (IEEE format) - 8 pages
├── report.tex                 # Project technical report
├── dashboard/                 # Interactive web-based dashboard
│   ├── index.html             # Dashboard UI
│   ├── app.js                 # Simulation & Narrative Engine
│   └── styles.css             # Visual Design
├── graph_model.py             # Multi-layer graph construction
├── markov_model.py            # Stochastic transition logic
├── simulation.py              # Core simulation engine
├── queue_model.py             # M/M/1/K queuing implementation
├── optimization.py            # Flow rebalancing algorithms
├── spectral_analysis.py       # Linear algebra & spectral metrics
├── game_theory.py             # PoA & Routing equilibrium
└── main.py                    # Main pipeline orchestrator
```

---

## Mathematical Foundation

### 1. Graph Representation
- **Nodes** ($V$): Physical zones with specific capacities $C_v$ and service rates $\mu_v$.
- **Edges** ($E$): Directed walking paths with inter-layer transition weights.

### 2. Markov Chain Dynamics
- **State Transition**: $P(t+1) = P(t) \cdot \mathbf{T}$
- **Dynamic Biasing**: Transition matrix $\mathbf{T}$ is re-calculated at each step based on local occupancy and queuing delays.

### 3. Price of Anarchy (PoA)
- Quantifies the ratio of Total System Travel Time (TSTT) between selfish and optimal routing.
- $\text{PoA} = \frac{\text{TSTT}_{\text{Selfish}}}{\text{TSTT}_{\text{Optimal}}}$

---

## Results Summary
- **Congestion Reduction**: Optimization reduces peak localized density by ~34%.
- **Throughput Improvement**: Balanced flow leads to a 12-15% increase in exit rates.
- **PoA Insights**: Selfish behavior leads to significant clustering at "perceived" shortcuts, increasing systemic wait times.

---

## Quick Start

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Run Pipeline
```bash
python main.py
```
This generates the `simulation_compact.json` required for the dashboard and prints a technical summary.

### 3. Launch Dashboard
Open `dashboard/index.html` in any modern browser.

---

## Authors
Mathematical Modelling EL — 2026
RVCE, Bangalore
