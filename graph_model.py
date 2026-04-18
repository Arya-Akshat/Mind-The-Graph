import networkx as nx
import numpy as np

def build_metro_graph() -> nx.DiGraph:
    G = nx.DiGraph()

    # Define nodes with layer, type, capacity, position
    
    # Street Level (y=0.1)
    G.add_node("exit_n", name="Exit North", layer="street", type="exit", capacity=50, position=(0.2, 0.1))
    G.add_node("exit_s", name="Exit South", layer="street", type="exit", capacity=50, position=(0.8, 0.1))
    G.add_node("exit_e", name="Exit East",  layer="street", type="exit", capacity=50, position=(0.5, 0.1))
    G.add_node("stair_top_1", name="Stair Top 1", layer="street", type="stair", capacity=30, position=(0.35, 0.15))
    G.add_node("stair_top_2", name="Stair Top 2", layer="street", type="stair", capacity=30, position=(0.65, 0.15))

    # Concourse Level (y=0.5)
    G.add_node("corridor_a", name="Corridor A", layer="concourse", type="corridor", capacity=40, position=(0.2, 0.5))
    G.add_node("corridor_b", name="Corridor B", layer="concourse", type="corridor", capacity=40, position=(0.4, 0.5))
    G.add_node("corridor_c", name="Corridor C", layer="concourse", type="corridor", capacity=40, position=(0.6, 0.5))
    G.add_node("corridor_d", name="Corridor D", layer="concourse", type="corridor", capacity=40, position=(0.8, 0.5))
    G.add_node("gate_1", name="Gate 1", layer="concourse", type="gate", capacity=20, position=(0.25, 0.45))
    G.add_node("gate_2", name="Gate 2", layer="concourse", type="gate", capacity=20, position=(0.5, 0.45))
    G.add_node("gate_3", name="Gate 3", layer="concourse", type="gate", capacity=20, position=(0.75, 0.45))
    G.add_node("ticket_1", name="Ticket 1", layer="concourse", type="ticket_counter", capacity=15, position=(0.1, 0.5))
    G.add_node("escalator_top_1", name="Esc Top 1", layer="concourse", type="escalator", capacity=25, position=(0.35, 0.55))
    G.add_node("escalator_top_2", name="Esc Top 2", layer="concourse", type="escalator", capacity=25, position=(0.65, 0.55))

    # Platform Level (y=0.9)
    G.add_node("platform_a", name="Platform A", layer="platform", type="platform_seg", capacity=60, position=(0.3, 0.9))
    G.add_node("platform_b", name="Platform B", layer="platform", type="platform_seg", capacity=60, position=(0.5, 0.9))
    G.add_node("platform_c", name="Platform C", layer="platform", type="platform_seg", capacity=60, position=(0.7, 0.9))
    G.add_node("stair_bot_1", name="Stair Bot 1", layer="platform", type="stair", capacity=30, position=(0.35, 0.85))
    G.add_node("stair_bot_2", name="Stair Bot 2", layer="platform", type="stair", capacity=30, position=(0.65, 0.85))
    G.add_node("esc_bot_1", name="Esc Bot 1", layer="platform", type="escalator", capacity=25, position=(0.4, 0.85))
    G.add_node("esc_bot_2", name="Esc Bot 2", layer="platform", type="escalator", capacity=25, position=(0.6, 0.85))

    # Additionally missing entry nodes to spawn at? Wait, ticket_1 could be entry, or let's add two entries in concourse
    G.add_node("entry_1", name="Entry 1", layer="concourse", type="entry", capacity=100, position=(0.05, 0.5))
    G.add_node("entry_2", name="Entry 2", layer="concourse", type="entry", capacity=100, position=(0.95, 0.5))

    # Build Edges (src, target, weight, capacity)
    # Entry to concourse
    G.add_edge("entry_1", "ticket_1", weight=1.0, capacity=20)
    G.add_edge("entry_2", "gate_3", weight=1.0, capacity=20)
    G.add_edge("ticket_1", "gate_1", weight=2.0, capacity=20)

    # Concourse flow
    G.add_edge("gate_1", "corridor_a", weight=1.5, capacity=30)
    G.add_edge("gate_2", "corridor_b", weight=1.0, capacity=30)
    G.add_edge("gate_3", "corridor_d", weight=1.5, capacity=30)
    
    G.add_edge("corridor_a", "corridor_b", weight=2.0, capacity=40)
    G.add_edge("corridor_b", "corridor_a", weight=2.0, capacity=40)
    G.add_edge("corridor_b", "corridor_c", weight=2.0, capacity=40)
    G.add_edge("corridor_c", "corridor_b", weight=2.0, capacity=40)
    G.add_edge("corridor_c", "corridor_d", weight=2.0, capacity=40)
    G.add_edge("corridor_d", "corridor_c", weight=2.0, capacity=40)
    
    # Concourse down to platform (Inter-layer) via stairs/escalators
    G.add_edge("corridor_b", "escalator_top_1", weight=1.0, capacity=25)
    G.add_edge("escalator_top_1", "esc_bot_1", weight=4.0, capacity=25)
    G.add_edge("esc_bot_1", "platform_b", weight=1.0, capacity=30)
    
    G.add_edge("corridor_c", "escalator_top_2", weight=1.0, capacity=25)
    G.add_edge("escalator_top_2", "esc_bot_2", weight=4.0, capacity=25)
    G.add_edge("esc_bot_2", "platform_c", weight=1.0, capacity=30)
    
    # Platform upward loops
    G.add_edge("platform_a", "stair_bot_1", weight=1.5, capacity=30)
    G.add_edge("stair_bot_1", "stair_top_1", weight=5.0, capacity=30)
    G.add_edge("stair_top_1", "exit_n", weight=1.5, capacity=40)
    
    G.add_edge("platform_c", "stair_bot_2", weight=1.5, capacity=30)
    G.add_edge("stair_bot_2", "stair_top_2", weight=5.0, capacity=30)
    G.add_edge("stair_top_2", "exit_s", weight=1.5, capacity=40)

    # Cross platform
    G.add_edge("platform_a", "platform_b", weight=2.0, capacity=60)
    G.add_edge("platform_b", "platform_a", weight=2.0, capacity=60)
    G.add_edge("platform_b", "platform_c", weight=2.0, capacity=60)
    G.add_edge("platform_c", "platform_b", weight=2.0, capacity=60)

    # Some extra routes to ensure 30+ edges and connectedness
    G.add_edge("esc_bot_1", "stair_bot_1", weight=3.0, capacity=20)
    G.add_edge("esc_bot_2", "stair_bot_2", weight=3.0, capacity=20)
    G.add_edge("stair_top_1", "exit_e", weight=2.0, capacity=40)
    G.add_edge("stair_top_2", "exit_e", weight=2.0, capacity=40)
    G.add_edge("gate_1", "stair_top_1", weight=3.0, capacity=30)
    G.add_edge("gate_3", "stair_top_2", weight=3.0, capacity=30)
    G.add_edge("exit_n", "entry_1", weight=10.0, capacity=10) # arbitrary loopback to keep strong component if needed
    G.add_edge("exit_s", "entry_2", weight=10.0, capacity=10)
    G.add_edge("exit_e", "entry_1", weight=10.0, capacity=10)
    
    # Assign default attributes 
    for u, v, d in G.edges(data=True):
        if 'attractiveness' not in d:
            d['attractiveness'] = 1.0
        if 'congestion_factor' not in d:
            d['congestion_factor'] = 1.0

    return G

def adjacency_matrix(G: nx.DiGraph) -> np.ndarray:
    return nx.to_numpy_array(G, weight=None)

def weighted_adjacency_matrix(G: nx.DiGraph) -> np.ndarray:
    return nx.to_numpy_array(G, weight='weight')

def capacity_matrix(G: nx.DiGraph) -> np.ndarray:
    return nx.to_numpy_array(G, weight='capacity')

def get_layer_nodes(G: nx.DiGraph, layer: str) -> list:
    return [n for n, d in G.nodes(data=True) if d.get('layer') == layer]

def inter_layer_edges(G: nx.DiGraph) -> list:
    return [(u, v) for u, v, d in G.edges(data=True) if G.nodes[u].get('layer') != G.nodes[v].get('layer')]

def shortest_path(G: nx.DiGraph, src: str, tgt: str) -> list:
    try:
        return nx.shortest_path(G, source=src, target=tgt, weight='weight')
    except nx.NetworkXNoPath:
        return []

def graph_to_dict(G: nx.DiGraph) -> dict:
    nodes = []
    for n, d in G.nodes(data=True):
        nodes.append({
            "id": str(n),
            "name": d.get("name", str(n)),
            "layer": d.get("layer", "street"),
            "type": d.get("type", "corridor"),
            "capacity": d.get("capacity", 20),
            "px": d.get("position", (0.5, 0.5))[0],
            "py": d.get("position", (0.5, 0.5))[1]
        })
    edges = []
    for u, v, d in G.edges(data=True):
        edges.append({
            "source": str(u),
            "target": str(v),
            "weight": d.get("weight", 1.0),
            "capacity": d.get("capacity", 20),
            "attractiveness": d.get("attractiveness", 1.0)
        })
    return {"nodes": nodes, "edges": edges}
