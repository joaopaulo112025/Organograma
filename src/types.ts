export interface OrgNode {
  id: string;
  parentId: string | null;
  name: string;
  role: string;          // Ex: "Diretor Executivo", "Gerente"
  department: string;    // Ex: "Comercial", "TI"
  phone: string;         // Ex: "(11) 98765-4321"
  email: string;         // Ex: "contato@empresa.com"
  notes?: string;        // Notas extras sobre como abordar/vender
  positionX?: number;    // Custom position X for free layout
  positionY?: number;    // Custom position Y for free layout
  parentPort?: 'top' | 'bottom' | 'left' | 'right';
  childPort?: 'top' | 'bottom' | 'left' | 'right';
}

export interface OrgProject {
  id: string;
  name: string;
  userId: string;
  nodes: OrgNode[];
  createdAt: any;        // Firestore Timestamp or IsoString/ms
  updatedAt: any;
}
