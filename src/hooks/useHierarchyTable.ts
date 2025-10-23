import { useState, useEffect, useCallback } from 'react';
import { createHierarchy, flattenTree } from '../../utils/hierarchy';

interface UseHierarchyTableParams {
  data: any[];
  maxDepth: number;
  accountNameMap?: Map<string, string>;
}

interface HierarchyHookResult {
  hierarchicalData: any[];
  displayedData: any[];
  setDisplayedData: (rows: any[]) => void;
  toggleNode: (path: string, isDataGroup?: boolean) => void;
  resetExpansion: () => void;
}

export function useHierarchyTable({
  data,
  maxDepth,
  accountNameMap,
}: UseHierarchyTableParams): HierarchyHookResult {
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [hierarchicalData, setHierarchicalData] = useState<any[]>([]);
  const [displayedData, setDisplayedData] = useState<any[]>([]);

  useEffect(() => {
    if (!Array.isArray(data) || data.length === 0) {
      setHierarchicalData([]);
      setDisplayedData([]);
      return;
    }

    const hierarchy = createHierarchy(data.slice(0, 100));
    const applyExpansion = (nodes: any[], currentLevel = 0): any[] =>
      nodes.map(node => {
        const shouldExpand = currentLevel < maxDepth - 1;
        const isExpanded = expandedNodes[node.fullPath] ?? shouldExpand;
        const childNodes = applyExpansion(Object.values(node.children), currentLevel + 1);
        return { ...node, isExpanded, children: childNodes };
      });

    const processedHierarchy = applyExpansion(hierarchy);
    const flatData = flattenTree(processedHierarchy, { accountNameMap });
    setHierarchicalData(flatData);
    setDisplayedData(flatData);
  }, [data, expandedNodes, maxDepth, accountNameMap]);

  const toggleNode = useCallback((path: string, isDataGroup = false) => {
    setExpandedNodes(prev => ({
      ...prev,
      [path]: !prev[path],
      ...(isDataGroup ? { [`${path}-data`]: !prev[path] } : {}),
    }));
  }, []);

  const resetExpansion = useCallback(() => {
    setExpandedNodes({});
  }, []);

  return {
    hierarchicalData,
    displayedData,
    setDisplayedData,
    toggleNode,
    resetExpansion,
  };
}
