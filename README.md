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

## Real-World Deployment (Digital Twin)

This mathematical model acts as a live "Digital Twin" for smart city operators. It can be integrated into physical transit hubs via three primary vectors:

1. **Live Sensors (Input)**: Instead of Poisson random generation, the system ingests live data via REST APIs from Automated Fare Collection Systems (ticket gates) and CCTV object detection (YOLO head-counting) to update network occupancy instantly.
2. **Dynamic Signage (Intervention)**: The Python Optimization matrix sends automated commands to physical station hardware. If a queue forms at an escalator, it automatically switches overhead digital signs and smart LED floor paths to route crowds to secondary staircases.
3. **Automated Safety Triggers (Protection)**: The Dashboard's Narrative Engine monitors the "Price of Anarchy" metric in real-time. If mathematical inefficiency crosses a critical threshold, it triggers emergency protocols like pre-recorded crowd dispersal announcements.

---

## Quick Start

### 1. Install Dependencies
Ensure you are using your virtual environment:
```bash
source venv/bin/activate
pip install -r requirements.txt
```

### 2. Configure Load (Optional)
Open `config.py` to toggle between Standard and Peak load simulations:
- `ARRIVAL_RATE = 2.5` : Standard, non-peak operational load.
- `ARRIVAL_RATE = 15.0` : Extreme peak rush-hour load (generates massive queues).

### 3. Run the Backend Simulation
Execute the Python orchestration script to generate the optimized transition matrices and JSON data payload:
```bash
venv/bin/python main.py
```

### 4. Launch the Interactive Dashboard
Start a local HTTP server in the dashboard directory to bypass CORS restrictions when loading the local JSON file:
```bash
cd dashboard
python3 -m http.server 8080
```
Then, open `http://localhost:8080` in your web browser.

---

## Authors
Mathematical Modelling EL — 2026
RVCE, Bangalore
