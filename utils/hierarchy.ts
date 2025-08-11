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
export function flattenTree(nodes: TreeNode[], result: any[] = [], parentExpanded = true, level = 0): any[] {
  nodes.forEach(node => {
    const isVisible = level === 0 || parentExpanded;
    const hasChildren = Object.keys(node.children).length > 0;
    const hasMultipleData = node.data.length > 1;
    const isLeaf = !hasChildren && !hasMultipleData;
    
    // For leaf nodes with single data item
    if (isLeaf) {
      result.push({
        ...node.data[0],
        __level: node.level,
        __isVisible: isVisible,
        __isLeaf: true,
        __path: node.fullPath,
        __hasChildren: false
      });
    } 
    // For nodes with multiple data items (like 521211)
    else if (hasMultipleData) {
      const totalPaguRevisi = node.data.reduce((sum: number, row: any) => sum + (Number(row[2]) || 0), 0);
      const totalRealisasi = node.data.reduce((sum: number, row: any) => sum + (Number(row[6]) || 0), 0);
      const persentaseRealisasi = totalPaguRevisi > 0 
        ? (totalRealisasi / totalPaguRevisi) * 100 
        : 0;
      const sisaAnggaran = totalPaguRevisi - totalRealisasi;
      
      // Add parent row with financial data
      result.push({
        [0]: node.fullPath, // Kode
        [1]: `[${node.name}]`, // Uraian
        [2]: totalPaguRevisi, // Sum of Pagu Revisi
        [6]: totalRealisasi, // Sum of REALISASI
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

      // Add child rows if expanded
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
    }
    // For regular parent nodes
    else {
      // Calculate totals for this node
      const childNodes = Object.values(node.children);
      const calculateTotals = (nodes: TreeNode[]) => {
        let totalPaguRevisi = 0;
        let totalRealisasi = 0;
        
        nodes.forEach(child => {
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
      
      // For parent nodes, add a summary row with financial data
      result.push({
        [0]: node.fullPath, // Kode
        [1]: `[${node.name}]`, // Uraian
        [2]: totalPaguRevisi, // Pagu Revisi
        [6]: totalRealisasi, // REALISASI
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

      // Process children if expanded
      if (node.isExpanded) {
        const childNodes = Object.values(node.children);
        flattenTree(childNodes, result, isVisible && node.isExpanded, level + 1);
      }
    }
  });

  return result;
}
