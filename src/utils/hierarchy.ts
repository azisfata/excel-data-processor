// Type for our tree node
export interface TreeNode {
  id: string;
  name: string;
  fullPath: string;
  children: Record<string, TreeNode>;
  data: any[]; // This will hold the actual row data for leaf nodes
  level: number;
  isExpanded: boolean;
}

// Creates a hierarchical tree structure from flat data
export function createHierarchy(data: any[]): TreeNode[] {
  const root: TreeNode = {
    id: 'root',
    name: 'root',
    fullPath: '',
    children: {},
    data: [],
    level: -1,
    isExpanded: true
  };

  data.forEach(row => {
    const kode = row[0]; // Assuming kode is the first column
    if (!kode || typeof kode !== 'string') return;

    const parts = kode.split('.');
    let currentNode = root;
    let currentPath = '';

    parts.forEach((part, index) => {
      const isLeaf = index === parts.length - 1;
      currentPath = currentPath ? `${currentPath}.${part}` : part;
      
      if (!currentNode.children[part]) {
        currentNode.children[part] = {
          id: currentPath,
          name: part,
          fullPath: currentPath,
          children: {},
          data: isLeaf ? [row] : [],
          level: index,
          isExpanded: index < 5 // Auto-expand first 6 levels by default
        };
      } else if (isLeaf) {
        // If it's a leaf node and already exists, add the row to its data
        currentNode.children[part].data.push(row);
      }
      
      currentNode = currentNode.children[part];
    });
  });

  // Convert the children objects to arrays and sort them
  function processNode(node: TreeNode): TreeNode[] {
    const children = Object.values(node.children);
    return children.sort((a, b) => a.name.localeCompare(b.name));
  }

  return processNode(root);
}

// Flattens the tree for rendering with proper indentation
interface FlattenTreeOptions {
  accountNameMap?: Map<string, string>;
}

export function flattenTree(nodes: TreeNode[], options: FlattenTreeOptions = {}): any[] {
  const result: any[] = [];
  const { accountNameMap } = options;

  const resolveGroupName = (node: TreeNode): string => {
    if (!node.fullPath) {
      return `[${node.name}]`;
    }

    const lastSegment = node.fullPath.split('.').pop() || node.name;
    return accountNameMap?.get(lastSegment) ?? `[${node.name}]`;
  };

  const walk = (nodesToProcess: TreeNode[], parentExpanded = true, level = 0): void => {
    nodesToProcess.forEach(node => {
      const isVisible = level === 0 || parentExpanded;
      const hasChildren = Object.keys(node.children).length > 0;
      const hasMultipleData = node.data.length > 1;
      const isLeaf = !hasChildren && !hasMultipleData;

      if (isLeaf) {
        result.push({
          ...node.data[0],
          __level: node.level,
          __isVisible: isVisible,
          __isLeaf: true,
          __path: node.fullPath,
          __hasChildren: false
        });
        return;
      }

      if (hasMultipleData) {
        const totalPaguRevisi = node.data.reduce((sum: number, row: any) => sum + (Number(row[2]) || 0), 0);
        const totalRealisasi = node.data.reduce((sum: number, row: any) => sum + (Number(row[6]) || 0), 0);
        const persentaseRealisasi = totalPaguRevisi > 0
          ? (totalRealisasi / totalPaguRevisi) * 100
          : 0;
        const sisaAnggaran = totalPaguRevisi - totalRealisasi;
        const groupName = resolveGroupName(node);

        result.push({
          [0]: node.fullPath,
          [1]: groupName,
          [2]: totalPaguRevisi,
          [6]: totalRealisasi,
          __paguRevisi: totalPaguRevisi,
          __realisasi: totalRealisasi,
          __persentaseRealisasi: persentaseRealisasi,
          __sisaAnggaran: sisaAnggaran,
          __level: node.level,
          __isVisible: isVisible,
          __isLeaf: false,
          __isExpanded: node.isExpanded,
          __path: node.fullPath,
          __hasChildren: true,
          __isDataGroup: true,
          __dataCount: node.data.length
        });

        if (node.isExpanded) {
          node.data.forEach((row: any, index: number) => {
            result.push({
              ...row,
              __level: node.level + 1,
              __isVisible: isVisible && node.isExpanded,
              __isLeaf: true,
              __path: `${node.fullPath}-${index}`,
              __hasChildren: false
            });
          });
        }
        return;
      }

      const childNodes = Object.values(node.children);
      const calculateTotals = (nodesForTotals: TreeNode[]) => {
        let totalPaguRevisi = 0;
        let totalRealisasi = 0;

        nodesForTotals.forEach(child => {
          if (child.data && child.data.length > 0) {
            child.data.forEach((row: any) => {
              totalPaguRevisi += Number(row[2]) || 0;
              totalRealisasi += Number(row[6]) || 0;
            });
          } else {
            const childTotals = calculateTotals(Object.values(child.children));
            totalPaguRevisi += childTotals.totalPaguRevisi;
            totalRealisasi += childTotals.totalRealisasi;
          }
        });

        return { totalPaguRevisi, totalRealisasi };
      };

      const { totalPaguRevisi, totalRealisasi } = calculateTotals(childNodes);
      const persentaseRealisasi = totalPaguRevisi > 0
        ? (totalRealisasi / totalPaguRevisi) * 100
        : 0;
      const sisaAnggaran = totalPaguRevisi - totalRealisasi;
      const groupName = resolveGroupName(node);

      result.push({
        [0]: node.fullPath,
        [1]: groupName,
        [2]: totalPaguRevisi,
        [6]: totalRealisasi,
        __paguRevisi: totalPaguRevisi,
        __realisasi: totalRealisasi,
        __persentaseRealisasi: persentaseRealisasi,
        __sisaAnggaran: sisaAnggaran,
        __level: node.level,
        __isVisible: isVisible,
        __isLeaf: false,
        __isExpanded: node.isExpanded,
        __path: node.fullPath,
        __hasChildren: true
      });

      if (node.isExpanded) {
        walk(childNodes, isVisible && node.isExpanded, level + 1);
      }
    });
  };

  walk(nodes);
  return result;
}
