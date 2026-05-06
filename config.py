SEED             = 42
N_STEPS          = 200
ARRIVAL_RATE     = 15.0      # agents spawned per step at each entry node

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
RENDER_STEP_STRIDE = 5       # downsample steps by this factor in compact JSON

OUTPUT_DIR       = "outputs/"
DASHBOARD_DATA   = "dashboard/data/"
