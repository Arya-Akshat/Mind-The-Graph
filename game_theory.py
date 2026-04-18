import networkx as nx
from scipy.optimize import minimize
import numpy as np

def path_cost(G: nx.DiGraph, path: list, flows: dict, queue_metrics: dict) -> float:
    from config import LAYER_PENALTY
    cost = 0.0
    beta = 0.15 # BPR curve exponent factor approximation
    n_layer_transitions = 0
    
    for i in range(len(path) - 1):
        u, v = path[i], path[i+1]
        
        # Edge cost (BPR delay cost)
        edge_data = G.edges[u, v]
        tt = edge_data.get('weight', 1.0)
        cap = max(1, edge_data.get('capacity', 20))
        flow = flows.get((u, v), 0.0)
        
        edge_cost = tt * (1.0 + beta * (flow / cap) ** 4)
        cost += edge_cost
        
        # Node queue waiting cost
        cost += queue_metrics.get(v, 0.0)
        
        # Layer penalty
        if G.nodes[u].get('layer') != G.nodes[v].get('layer'):
            n_layer_transitions += 1
            
    cost += n_layer_transitions * LAYER_PENALTY
    return cost


def selfish_routing_equilibrium(G: nx.DiGraph, od_demands: dict, n_iter=50) -> dict:
    from config import SELFISH_TOL
    
    # Initialize flows
    flows = {e: 0.0 for e in G.edges()}
    
    def get_path_edges(path):
        return [(path[i], path[i+1]) for i in range(len(path)-1)]
        
    for iteration in range(n_iter):
        new_flows = {e: 0.0 for e in G.edges()}
        max_change = 0.0
        
        # 1. Find cheapest path
        for (orig, dest), demand in od_demands.items():
            if demand <= 0: continue
            
            # Temporary graph with updated current weights for Dijkstra
            G_temp = G.copy()
            # We don't have queue_metrics inside here easily without simulation running,
            # so we approximate selfish routing solely on flow capacities
            for u, v, d in G_temp.edges(data=True):
                tt = d.get('weight', 1.0)
                cap = max(1, d.get('capacity', 20))
                f = flows.get((u, v), 0.0)
                # BPR curve
                G_temp[u][v]['current_cost'] = tt * (1.0 + 0.15 * (f / cap) ** 4)
                
            try:
                path = nx.shortest_path(G_temp, source=orig, target=dest, weight='current_cost')
                path_edges = get_path_edges(path)
                for e in path_edges:
                    new_flows[e] += demand
            except nx.NetworkXNoPath:
                pass
                
        # 2. Step size
        step = 1.0 / (iteration + 1)
        
        # 3. Shift flow
        for e in G.edges():
            shift = step * (new_flows[e] - flows[e])
            max_change = max(max_change, abs(shift))
            flows[e] = flows[e] + shift
            
        if max_change < SELFISH_TOL:
            break
            
    return flows


def social_optimum_routing(G: nx.DiGraph, od_demands: dict) -> dict:
    # Approximate social optimum utilizing a marginal cost graph for assignments
    # Since scipy.optimize is heavy for large networks, we use marginal cost MSA
    
    flows = {e: 0.0 for e in G.edges()}
    
    def get_path_edges(path):
        return [(path[i], path[i+1]) for i in range(len(path)-1)]
        
    for iteration in range(20):
        new_flows = {e: 0.0 for e in G.edges()}
        
        for (orig, dest), demand in od_demands.items():
            if demand <= 0: continue
            
            G_temp = G.copy()
            for u, v, d in G_temp.edges(data=True):
                tt = d.get('weight', 1.0)
                cap = max(1, d.get('capacity', 20))
                f = flows.get((u, v), 0.0)
                # Marginal cost = d(x * c(x)) / dx
                # x * (tt * (1 + 0.15 * (x/K)^4))
                # = tt * x + 0.15 * tt * x^5 / K^4
                # deriv = tt + 0.75 * tt * (f/K)^4
                G_temp[u][v]['marginal_cost'] = tt * (1.0 + 0.75 * (f / cap) ** 4)
                
            try:
                path = nx.shortest_path(G_temp, source=orig, target=dest, weight='marginal_cost')
                path_edges = get_path_edges(path)
                for e in path_edges:
                    new_flows[e] += demand
            except nx.NetworkXNoPath:
                pass
                
        step = 1.0 / (iteration + 1)
        for e in G.edges():
            flows[e] = flows[e] + step * (new_flows[e] - flows[e])
            
    return flows


def price_of_anarchy(selfish_cost: float, optimal_cost: float) -> float:
    if optimal_cost <= 0:
        return 1.0
    return selfish_cost / optimal_cost
