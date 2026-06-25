import { OrgNode } from '../types';

export interface Position {
  x: number;
  y: number;
}

export function calculateLayout(
  nodes: OrgNode[],
  horizontalSpacing = 280,
  verticalSpacing = 160
): Record<string, Position> {
  const result: Record<string, Position> = {};
  if (!nodes || nodes.length === 0) return result;

  // 1. Identify all roots (nodes with parentId null or parentId not present in the nodes list)
  const nodeIds = new Set(nodes.map(n => n.id));
  const roots = nodes.filter(n => !n.parentId || !nodeIds.has(n.parentId));

  if (roots.length === 0) {
    // Fallback: use first node as root
    roots.push(nodes[0]);
  }

  // 2. Build adjacency list for fast children fetch
  const childrenMap: Record<string, OrgNode[]> = {};
  nodes.forEach(n => {
    if (n.parentId) {
      if (!childrenMap[n.parentId]) {
        childrenMap[n.parentId] = [];
      }
      childrenMap[n.parentId].push(n);
    }
  });

  // Next horizontal position available for a leaf node at each level of depth
  const nextXByDepth: Record<number, number> = {};
  const visitedTraversal = new Set<string>();

  // Recursive post-order positioning
  function traverse(node: OrgNode, depth: number): Position {
    if (visitedTraversal.has(node.id)) {
      return result[node.id] || { x: 0, y: 0 };
    }
    visitedTraversal.add(node.id);

    const children = (childrenMap[node.id] || []).filter(c => !visitedTraversal.has(c.id));
    const y = depth * verticalSpacing + 80; // Starting Y coordinate with 80px top padding
    let x = 0;

    if (children.length === 0) {
      // Leaf node: place at the next available horizontal position for its depth
      const currentNextX = nextXByDepth[depth] || 0;
      x = currentNextX;
      nextXByDepth[depth] = currentNextX + horizontalSpacing;
    } else {
      // Branch node: place all children first
      const childPositions = children.map(child => {
        return { child, pos: traverse(child, depth + 1) };
      });

      // Center this node above its children
      const firstChildX = childPositions[0].pos.x;
      const lastChildX = childPositions[childPositions.length - 1].pos.x;
      const idealX = (firstChildX + lastChildX) / 2;

      // Ensure we don't overlap with existing nodes at this depth
      const depthNextX = nextXByDepth[depth] || 0;
      if (idealX < depthNextX) {
        // Shift this node and its entire subtree to the right to resolve overlap
        const shiftAmount = depthNextX - idealX;
        
        // Helper to shift subtree recursively
        const shiftSubtree = (nId: string, amount: number, visitedShifts = new Set<string>()) => {
          if (visitedShifts.has(nId)) return;
          visitedShifts.add(nId);
          if (result[nId]) {
            result[nId].x += amount;
          }
          const subs = childrenMap[nId] || [];
          subs.forEach(s => shiftSubtree(s.id, amount, visitedShifts));
        };

        // Shift already calculated children subtrees
        children.forEach(child => shiftSubtree(child.id, shiftAmount));
        
        // Adjust ideal X to the resolved position
        x = idealX + shiftAmount;
      } else {
        x = idealX;
      }

      // Update the next available pointer for this depth
      nextXByDepth[depth] = x + horizontalSpacing;
    }

    const pos = { x, y };
    result[node.id] = pos;
    return pos;
  }

  // Position all roots
  let rootOffset = 0;
  roots.forEach((root, idx) => {
    // Keep a buffer between separate root trees
    traverse(root, 0);

    // Find custom bounding box of this root subtree
    const subtreeNodes = getSubtreeIds(root.id, childrenMap);
    const xs = subtreeNodes.map(id => result[id]?.x || 0);
    const minSubtreeX = xs.length > 0 ? Math.min(...xs) : 0;
    const maxSubtreeX = xs.length > 0 ? Math.max(...xs) : 0;

    // Shift subtree to sit nicely to the right of former roots
    if (idx > 0) {
      const shiftAmount = rootOffset - minSubtreeX + 300;
      subtreeNodes.forEach(id => {
        if (result[id]) result[id].x += shiftAmount;
      });
      rootOffset = maxSubtreeX + shiftAmount;
    } else {
      rootOffset = maxSubtreeX;
    }

    // Clear nextXByDepth for next tree so we can pack tightly horizontally
    Object.keys(nextXByDepth).forEach(k => {
      nextXByDepth[Number(k)] = (nextXByDepth[Number(k)] || 0) + 300;
    });
  });

  // Final layout normalization to center or bound left
  const allXs = Object.values(result).map(pos => pos.x);
  const minX = allXs.length > 0 ? Math.min(...allXs) : 0;
  
  // Shift everything so the leftmost element starts at x = 50
  Object.keys(result).forEach(id => {
    result[id].x = result[id].x - minX + 50;
  });

  return result;
}

// Get list of node IDs in a subtree recursively
function getSubtreeIds(
  rootId: string,
  childrenMap: Record<string, OrgNode[]>,
  visitedSet = new Set<string>()
): string[] {
  if (visitedSet.has(rootId)) return [];
  visitedSet.add(rootId);
  const list: string[] = [rootId];
  const children = childrenMap[rootId] || [];
  children.forEach(c => {
    list.push(...getSubtreeIds(c.id, childrenMap, visitedSet));
  });
  return list;
}
