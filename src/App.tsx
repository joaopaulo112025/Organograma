/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Trash2, 
  Download, 
  Save, 
  FolderPlus, 
  Folder, 
  Search, 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  Laptop, 
  LogOut, 
  Users, 
  ChevronRight, 
  Settings, 
  Info, 
  X, 
  Check, 
  Phone, 
  Mail, 
  User, 
  Briefcase, 
  HelpCircle,
  TrendingUp,
  FileSpreadsheet,
  Cloud,
  CloudOff,
  LayoutGrid,
  Building2
} from 'lucide-react';

import { db, auth, loginWithGoogle, logoutUser, handleFirestoreError, OperationType } from './firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { collection, doc, setDoc, deleteDoc, onSnapshot, query, where, Timestamp } from 'firebase/firestore';
import { OrgNode, OrgProject } from './types';
import { calculateLayout, Position } from './utils/layout';
import OrgChartNodeCard from './components/OrgChartNodeCard';
import { exportToPDF } from './utils/pdfExport';

const LOCAL_STORAGE_PROJECTS_KEY = 'organograma_projetos';
const LOCAL_STORAGE_ACTIVE_ID_KEY = 'organograma_ativo_id';

export default function App() {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  
  // Projects State
  const [projects, setProjects] = useState<OrgProject[]>([]);
  const [activeProject, setActiveProject] = useState<OrgProject | null>(null);
  const activeProjectIdRef = useRef<string | null>(null);

  useEffect(() => {
    activeProjectIdRef.current = activeProject ? activeProject.id : null;
  }, [activeProject]);

  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Selection & UI State
  const [selectedNode, setSelectedNode] = useState<OrgNode | null>(null);
  const [isProjectsSidebarOpen, setIsProjectsSidebarOpen] = useState<boolean>(false);
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState<boolean>(false);
  const [newProjectName, setNewProjectName] = useState<string>('');
  const [pdfStatus, setPdfStatus] = useState<'idle' | 'generating' | 'success' | 'error'>('idle');
  const [showSyncSuccess, setShowSyncSuccess] = useState<boolean>(false);
  const [syncWarning, setSyncWarning] = useState<boolean>(false);

  // Automatic saving states and refs
  const [savingStatus, setSavingStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const saveDebounceTimeoutRef = useRef<any>(null);
  const pendingSaveProjectRef = useRef<OrgProject | null>(null);

  // Dialog (Modal Confirmation/Alert) State
  const [dialogConfig, setDialogConfig] = useState<{
    isOpen: boolean;
    type: 'alert' | 'confirm';
    title: string;
    message: string;
    onConfirm?: () => void;
  } | null>(null);

  const showCustomAlert = (title: string, message: string) => {
    setDialogConfig({
      isOpen: true,
      type: 'alert',
      title,
      message
    });
  };

  const showCustomConfirm = (title: string, message: string, onConfirm: () => void) => {
    setDialogConfig({
      isOpen: true,
      type: 'confirm',
      title,
      message,
      onConfirm
    });
  };

  // Layout View State
  const [zoom, setZoom] = useState<number>(0.85);
  const [panX, setPanX] = useState<number>(50);
  const [panY, setPanY] = useState<number>(30);
  const isDraggingCanvas = useRef<boolean>(false);
  const dragStart = useRef<{ x: number, y: number }>({ x: 0, y: 0 });

  // Direct Drag-and-drop Connection System State
  const [connectingFrom, setConnectingFrom] = useState<{ nodeId: string; port: 'top' | 'bottom' | 'left' | 'right' } | null>(null);
  const [drawingMousePos, setDrawingMousePos] = useState<{ x: number; y: number } | null>(null);

  // Free Drag-and-drop Node Placement System State
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const dragNodeOffset = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // 0. Sanitize localStorage projects (rename old hardcoded default ID to prevent cloud collisions)
  useEffect(() => {
    const localData = localStorage.getItem(LOCAL_STORAGE_PROJECTS_KEY);
    if (localData) {
      try {
        let localProjects: OrgProject[] = JSON.parse(localData);
        let updated = false;
        localProjects = localProjects.map(proj => {
          if (proj.id === 'proj_default_id') {
            updated = true;
            const newUniqueId = `proj_default_${Math.random().toString(36).substring(2, 9)}`;
            
            // Sync with current active ID in storage
            const activeId = localStorage.getItem(LOCAL_STORAGE_ACTIVE_ID_KEY);
            if (activeId === 'proj_default_id') {
              localStorage.setItem(LOCAL_STORAGE_ACTIVE_ID_KEY, newUniqueId);
            }
            return { ...proj, id: newUniqueId };
          }
          return proj;
        });
        if (updated) {
          localStorage.setItem(LOCAL_STORAGE_PROJECTS_KEY, JSON.stringify(localProjects));
        }
      } catch (e) {
        console.error("Erro na sanitização de projetos locais:", e);
      }
    }
  }, []);

  // 1. Listen to Auth State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 2. Load Projects from Cloud Firestore or LocalStorage depending on Auth
  useEffect(() => {
    let unsubscribeFirestore: (() => void) | null = null;

    if (currentUser) {
      // Load from Firestore
      const path = 'projects';
      const q = query(
        collection(db, path),
        where('userId', '==', currentUser.uid)
      );

      unsubscribeFirestore = onSnapshot(
        q,
        (snapshot) => {
          const cloudProjects: OrgProject[] = [];
          snapshot.forEach((doc) => {
            const data = doc.data();
            cloudProjects.push({
              id: doc.id,
              name: data.name,
              userId: data.userId,
              nodes: data.nodes || [],
              createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : data.createdAt,
              updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : data.updatedAt,
            });
          });

          // Sort by updatedAt descending
          cloudProjects.sort((a, b) => {
            const d1 = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
            const d2 = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
            return d2 - d1;
          });

          setProjects(cloudProjects);

          // Handle selecting current active project
          const savedActiveId = localStorage.getItem(LOCAL_STORAGE_ACTIVE_ID_KEY);
          if (savedActiveId) {
            const foundInCloud = cloudProjects.find(p => p.id === savedActiveId);
            if (foundInCloud) {
              setActiveProject(foundInCloud);
            } else if (activeProjectIdRef.current === savedActiveId) {
              // Keep the current active project as-is since it is already active in local state (e.g. just created/modified)
            } else if (cloudProjects.length > 0) {
              setActiveProject(cloudProjects[0]);
            }
          } else if (cloudProjects.length > 0) {
            setActiveProject(cloudProjects[0]);
          } else {
            // First time auth, let's migrate any LocalStorage projects!
            migrateLocalProjectsToCloud(cloudProjects, currentUser.uid);
          }
        },
        (error) => {
          console.warn("Firestore loading failed or was blocked by rules, falling back to offline LocalStorage mode:", error);
          setSyncWarning(true);

          // Graceful fallback to LocalStorage projects
          const localData = localStorage.getItem(LOCAL_STORAGE_PROJECTS_KEY);
          let localProjects: OrgProject[] = [];
          if (localData) {
            try {
              localProjects = JSON.parse(localData);
            } catch (e) {
              console.error("Erro ao ler projetos locais:", e);
            }
          }

          // If absolutely no local projects exist, create a master initial welcoming project!
          if (localProjects.length === 0) {
            const rootId = 'node_root_ceo';
            const uniqueDefaultId = `proj_default_${Math.random().toString(36).substring(2, 9)}`;
            const defaultProj: OrgProject = {
              id: uniqueDefaultId,
              name: 'Organograma Exemplo Ltda',
              userId: 'guest',
              nodes: [
                {
                  id: rootId,
                  parentId: null,
                  name: 'Dr. Roberto Souza',
                  role: 'Presidente Executivo / CEO',
                  department: 'Organograma Exemplo Ltda',
                  phone: '(11) 98877-1122',
                  email: 'roberto.souza@empresaexemplo.com',
                  notes: 'Ponto focal da empresa para novos softwares. Costuma responder e-mails às terças.'
                },
                {
                  id: 'node_mkt_mngr',
                  parentId: rootId,
                  name: 'Mariana Lima',
                  role: 'Gerente Geral',
                  department: 'Organograma Exemplo Ltda',
                  phone: '(11) 97755-4433',
                  email: 'mariana.lima@empresaexemplo.com',
                  notes: 'Responsável direta pelas aquisições e budget comercial. Mostrar demonstração prática.'
                },
                {
                  id: 'node_tech_mngr',
                  parentId: rootId,
                  name: 'Thiago Nogueira',
                  role: 'Gerente Executivo de Tech',
                  department: 'Organograma Exemplo Ltda',
                  phone: '(21) 99881-2244',
                  email: 'thiago.n@empresaexemplo.com',
                  notes: 'Avalia a parte técnica e segurança de dados do nosso SaaS antes de aprovar.'
                }
              ],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };
            localProjects = [defaultProj];
            localStorage.setItem(LOCAL_STORAGE_PROJECTS_KEY, JSON.stringify(localProjects));
          }

          setProjects(localProjects);

          const savedActiveId = localStorage.getItem(LOCAL_STORAGE_ACTIVE_ID_KEY);
          if (savedActiveId && localProjects.some(p => p.id === savedActiveId)) {
            setActiveProject(localProjects.find(p => p.id === savedActiveId) || localProjects[0]);
          } else if (localProjects.length > 0) {
            setActiveProject(localProjects[0]);
          }
        }
      );
    } else {
      // Guest User: Load from LocalStorage
      const localData = localStorage.getItem(LOCAL_STORAGE_PROJECTS_KEY);
      let localProjects: OrgProject[] = [];
      if (localData) {
        try {
          localProjects = JSON.parse(localData);
        } catch (e) {
          console.error("Erro ao ler projetos locais:", e);
        }
      }

      // If absolutely no local projects exist, create a master initial welcoming project!
      if (localProjects.length === 0) {
        const rootId = 'node_root_ceo';
        const uniqueDefaultId = `proj_default_${Math.random().toString(36).substring(2, 9)}`;
        const defaultProj: OrgProject = {
          id: uniqueDefaultId,
          name: 'Organograma Exemplo Ltda',
          userId: 'guest',
          nodes: [
            {
              id: rootId,
              parentId: null,
              name: 'Dr. Roberto Souza',
              role: 'Presidente Executivo / CEO',
              department: 'Organograma Exemplo Ltda',
              phone: '(11) 98877-1122',
              email: 'roberto.souza@empresaexemplo.com',
              notes: 'Ponto focal da empresa para novos softwares. Costuma responder e-mails às terças.'
            },
            {
              id: 'node_mkt_mngr',
              parentId: rootId,
              name: 'Mariana Lima',
              role: 'Gerente Geral',
              department: 'Organograma Exemplo Ltda',
              phone: '(11) 97755-4433',
              email: 'mariana.lima@empresaexemplo.com',
              notes: 'Responsável direta pelas aquisições e budget comercial. Mostrar demonstração prática.'
            },
            {
              id: 'node_tech_mngr',
              parentId: rootId,
              name: 'Thiago Nogueira',
              role: 'Gerente Executivo de Tech',
              department: 'Organograma Exemplo Ltda',
              phone: '(21) 99881-2244',
              email: 'thiago.n@empresaexemplo.com',
              notes: 'Avalia a parte técnica e segurança de dados do nosso SaaS antes de aprovar.'
            }
          ],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        localProjects = [defaultProj];
        localStorage.setItem(LOCAL_STORAGE_PROJECTS_KEY, JSON.stringify(localProjects));
      }

      setProjects(localProjects);

      const savedActiveId = localStorage.getItem(LOCAL_STORAGE_ACTIVE_ID_KEY);
      if (savedActiveId && localProjects.some(p => p.id === savedActiveId)) {
        setActiveProject(localProjects.find(p => p.id === savedActiveId) || localProjects[0]);
      } else if (localProjects.length > 0) {
        setActiveProject(localProjects[0]);
      }
    }

    return () => {
      if (unsubscribeFirestore) unsubscribeFirestore();
    };
  }, [currentUser]);

  // Save selected active project ID
  useEffect(() => {
    if (activeProject) {
      localStorage.setItem(LOCAL_STORAGE_ACTIVE_ID_KEY, activeProject.id);
    }
  }, [activeProject]);

  // Helper: Migrate local projects to cloud upon first login
  const migrateLocalProjectsToCloud = async (cloudList: OrgProject[], userId: string) => {
    const localData = localStorage.getItem(LOCAL_STORAGE_PROJECTS_KEY);
    if (!localData) return;

    try {
      const localProjects: OrgProject[] = JSON.parse(localData);
      if (localProjects.length === 0) return;

      const syncedProjects: OrgProject[] = [...cloudList];

      for (const localProj of localProjects) {
        // Skip migrating hardcoded placeholder project ID
        if (localProj.id === 'proj_default_id') continue;

        // Avoid duplicate ID sync
        if (cloudList.some(p => p.id === localProj.id)) continue;

        const updatedProj = {
          ...localProj,
          userId: userId,
          updatedAt: new Date()
        };

        const path = 'projects';
        try {
          await setDoc(doc(db, path, localProj.id), cleanUndefinedValues({
            ...updatedProj,
            createdAt: Timestamp.fromDate(new Date(localProj.createdAt || new Date())),
            updatedAt: Timestamp.fromDate(new Date())
          }));
        } catch (err) {
          console.error("Erro ao migrar projeto local:", err);
        }
      }

      // Clear local storage reference so it doesn't prompt again
      localStorage.removeItem(LOCAL_STORAGE_PROJECTS_KEY);
      setShowSyncSuccess(true);
      setTimeout(() => setShowSyncSuccess(false), 5000);

    } catch (e) {
      console.error("Erro na migração:", e);
    }
  };

  // Helper to deep sanitize undefined values for Firestore
  const isPlainObject = (val: any): boolean => {
    if (typeof val !== 'object' || val === null) return false;
    const proto = Object.getPrototypeOf(val);
    return proto === null || proto === Object.prototype;
  };

  const cleanUndefinedValues = (obj: any): any => {
    if (Array.isArray(obj)) {
      return obj.map(cleanUndefinedValues);
    }
    if (isPlainObject(obj)) {
      const cleaned: any = {};
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          const val = obj[key];
          if (val !== undefined) {
            cleaned[key] = cleanUndefinedValues(val);
          }
        }
      }
      return cleaned;
    }
    return obj;
  };

  // Helper: Save Project immediately without debouncing
  const saveProjectToDbImmediately = async (updatedProject: OrgProject) => {
    // Clear any pending timeout
    if (saveDebounceTimeoutRef.current) {
      clearTimeout(saveDebounceTimeoutRef.current);
      saveDebounceTimeoutRef.current = null;
    }
    pendingSaveProjectRef.current = null;

    setSavingStatus('saving');

    if (currentUser) {
      const path = 'projects';
      try {
        const finalProject = {
          ...updatedProject,
          userId: currentUser.uid
        };
        await setDoc(doc(db, path, finalProject.id), cleanUndefinedValues({
          ...finalProject,
          // Convert date to Firestore Timestamp
          createdAt: Timestamp.fromDate(new Date(finalProject.createdAt || new Date())),
          updatedAt: Timestamp.fromDate(new Date())
        }));
        setSavingStatus('saved');
        // Clear backup since it succeeded
        try {
          localStorage.removeItem(`backup_pending_${finalProject.id}`);
        } catch (e) {}
      } catch (error) {
        console.error("Erro ao salvar projeto:", error);
        setSavingStatus('error');
        handleFirestoreError(error, OperationType.WRITE, `${path}/${updatedProject.id}`);
      }
    } else {
      // Guest local storage update
      const localData = localStorage.getItem(LOCAL_STORAGE_PROJECTS_KEY);
      if (localData) {
        try {
          const localList: OrgProject[] = JSON.parse(localData);
          const updatedList = localList.map(p => p.id === updatedProject.id ? { ...updatedProject, updatedAt: new Date().toISOString() } : p);
          localStorage.setItem(LOCAL_STORAGE_PROJECTS_KEY, JSON.stringify(updatedList));
          
          // Sync state list
          setProjects(updatedList);
          setSavingStatus('saved');
        } catch (e) {
          console.error("Erro ao salvar localmente:", e);
          setSavingStatus('error');
        }
      }
    }
  };

  // 3. Save / Update Active Project
  const updateProjectInStore = (updatedProject: OrgProject, forceImmediate = false) => {
    const finalProject = currentUser ? { ...updatedProject, userId: currentUser.uid } : updatedProject;
    setActiveProject(finalProject);

    // Update global list immediately for super snappy experience
    setProjects(prev => prev.map(p => p.id === finalProject.id ? finalProject : p));

    setSavingStatus('saving');
    pendingSaveProjectRef.current = finalProject;

    // Debounce actual save
    if (saveDebounceTimeoutRef.current) {
      clearTimeout(saveDebounceTimeoutRef.current);
    }

    if (forceImmediate) {
      saveProjectToDbImmediately(finalProject);
    } else {
      saveDebounceTimeoutRef.current = setTimeout(() => {
        saveProjectToDbImmediately(finalProject);
      }, 1000); // 1 second debounce
    }
  };

  // Hook up tab closing and window blur to auto-save immediately
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (pendingSaveProjectRef.current) {
        const proj = pendingSaveProjectRef.current;
        if (!currentUser) {
          const localData = localStorage.getItem(LOCAL_STORAGE_PROJECTS_KEY);
          if (localData) {
            try {
              const localList: OrgProject[] = JSON.parse(localData);
              const updatedList = localList.map(p => p.id === proj.id ? { ...proj, updatedAt: new Date().toISOString() } : p);
              localStorage.setItem(LOCAL_STORAGE_PROJECTS_KEY, JSON.stringify(updatedList));
            } catch (e) {
              console.error(e);
            }
          }
        } else {
          // Logged in: write quick local backup in case of network/tab close interrupt
          try {
            localStorage.setItem(`backup_pending_${proj.id}`, JSON.stringify(proj));
          } catch (e) {
            console.error(e);
          }
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [currentUser]);

  // Check and upload any unsaved backup on startup
  useEffect(() => {
    if (currentUser && projects.length > 0) {
      projects.forEach(async (proj) => {
        const backupData = localStorage.getItem(`backup_pending_${proj.id}`);
        if (backupData) {
          try {
            const backedProj: OrgProject = JSON.parse(backupData);
            // If the backup has more nodes or is newer, upload it
            const path = 'projects';
            await setDoc(doc(db, path, backedProj.id), cleanUndefinedValues({
              ...backedProj,
              userId: currentUser.uid,
              createdAt: Timestamp.fromDate(new Date(backedProj.createdAt || new Date())),
              updatedAt: Timestamp.fromDate(new Date())
            }));
            localStorage.removeItem(`backup_pending_${proj.id}`);
          } catch (e) {
            console.error("Erro ao sincronizar backup pendente:", e);
          }
        }
      });
    }
  }, [currentUser, projects]);

  // Node Actions
  const handleAddChildNode = (parentId: string) => {
    if (!activeProject) return;

    const newNodeId = `node_${Date.now()}`;
    const newNode: OrgNode = {
      id: newNodeId,
      parentId: parentId,
      name: '',
      role: '',
      department: activeProject.name, // default to active company name
      phone: '',
      email: '',
      notes: ''
    };

    const updatedNodes = [...activeProject.nodes, newNode];
    const updatedProj = {
      ...activeProject,
      nodes: updatedNodes,
      updatedAt: new Date().toISOString()
    };

    updateProjectInStore(updatedProj, true); // save immediately on creation
    setSelectedNode(newNode); // opens immediate side-editor for the newly created child!
  };

  const handleUpdateNode = (updatedNode: OrgNode) => {
    if (!activeProject) return;

    const updatedNodes = activeProject.nodes.map(n => n.id === updatedNode.id ? updatedNode : n);
    const updatedProj = {
      ...activeProject,
      nodes: updatedNodes,
      updatedAt: new Date().toISOString()
    };

    updateProjectInStore(updatedProj, false); // debounced for smooth typing
    setSelectedNode(updatedNode);
  };

  const handleDeleteNode = (nodeId: string) => {
    if (!activeProject) return;

    // Check if it's the root node
    const nodeToDelete = activeProject.nodes.find(n => n.id === nodeId);
    if (!nodeToDelete || nodeToDelete.parentId === null) {
      showCustomAlert("Ação Bloqueada 🚫", "Não é possível deletar o cargo líder principal do organograma corporativo.");
      return;
    }

    showCustomConfirm(
      "Confirmar Remoção 🗑️",
      `Deseja realmente remover o colaborador "${nodeToDelete.name || 'este colaborador'}"? Seus subordinados passarão a responder diretamente ao gestor superior dele.`,
      () => {
        const parentOfDeleted = nodeToDelete.parentId;

        const updatedNodes = activeProject.nodes
          .filter(n => n.id !== nodeId)
          .map(n => {
            if (n.parentId === nodeId) {
              return { 
                ...n, 
                parentId: parentOfDeleted,
                parentPort: n.parentPort || 'bottom',
                childPort: n.childPort || 'top'
              };
            }
            return n;
          });

        const updatedProj = {
          ...activeProject,
          nodes: updatedNodes,
          updatedAt: new Date().toISOString()
        };

        updateProjectInStore(updatedProj, true);
        if (selectedNode?.id === nodeId) {
          setSelectedNode(null);
        } else if (selectedNode && selectedNode.parentId === nodeId) {
          setSelectedNode({
            ...selectedNode,
            parentId: parentOfDeleted
          });
        }
      }
    );
  };

  const handleDeleteConnection = (childNodeId: string) => {
    if (!activeProject) return;

    const childNode = activeProject.nodes.find(n => n.id === childNodeId);
    if (!childNode) return;

    showCustomConfirm(
      "Excluir Linha de Conexão? ✂️",
      `Deseja realmente remover a conexão de reporte? O colaborador "${childNode.name || 'este colaborador'}" passará a ficar sem gestor direto (cargo flutuante).`,
      () => {
        const updatedNodes = activeProject.nodes.map(n => {
          if (n.id === childNodeId) {
            return { 
              ...n, 
              parentId: null,
              parentPort: undefined,
              childPort: undefined
            };
          }
          return n;
        });

        const updatedProj = {
          ...activeProject,
          nodes: updatedNodes,
          updatedAt: new Date().toISOString()
        };

        updateProjectInStore(updatedProj, true);
        if (selectedNode && selectedNode.id === childNodeId) {
          setSelectedNode({
            ...selectedNode,
            parentId: null,
            parentPort: undefined,
            childPort: undefined
          });
        }
      }
    );
  };

    // Project Level Actions
  const handleCreateNewProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    const rootId = `node_${Date.now()}_root`;
    const newProj: OrgProject = {
      id: `proj_${Date.now()}`,
      name: newProjectName.trim(),
      userId: currentUser ? currentUser.uid : 'guest',
      nodes: [
        {
          id: rootId,
          parentId: null,
          name: 'Nome do Diretor / Líder',
          role: 'Diretor / CEO',
          department: newProjectName.trim(), // default to company name
          phone: '',
          email: '',
          notes: 'Ponto focal para apresentação de produtos.'
        }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Store active ID immediately to prevent onSnapshot override race condition
    localStorage.setItem(LOCAL_STORAGE_ACTIVE_ID_KEY, newProj.id);
    activeProjectIdRef.current = newProj.id;

    // Update local state immediately for snappy real-time feedback
    setProjects(prev => [newProj, ...prev]);
    setActiveProject(newProj);
    setSelectedNode(newProj.nodes[0]);

    if (currentUser) {
      const path = 'projects';
      setDoc(doc(db, path, newProj.id), cleanUndefinedValues({
        ...newProj,
        userId: currentUser.uid,
        createdAt: Timestamp.fromDate(new Date()),
        updatedAt: Timestamp.fromDate(new Date())
      })).catch(err => {
        handleFirestoreError(err, OperationType.CREATE, path);
      });
    } else {
      const localData = localStorage.getItem(LOCAL_STORAGE_PROJECTS_KEY);
      const localList: OrgProject[] = localData ? JSON.parse(localData) : [];
      const updatedList = [newProj, ...localList];
      localStorage.setItem(LOCAL_STORAGE_PROJECTS_KEY, JSON.stringify(updatedList));
    }

    setNewProjectName('');
    setIsNewProjectModalOpen(false);
  };

  const handleDeleteProject = async (projId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    
    const projToDelete = projects.find(p => p.id === projId);
    const projName = projToDelete ? projToDelete.name : 'este';

    showCustomConfirm(
      "Excluir Projeto 📁",
      `Deseja realmente excluir o organograma da empresa "${projName}" permanentemente de forma irreversível?`,
      async () => {
        if (currentUser) {
          const path = 'projects';
          try {
            // Immediately transition active project to another one before deletion to avoid glitches
            if (activeProject?.id === projId) {
              const remaining = projects.filter(p => p.id !== projId);
              const nextActive = remaining[0] || null;
              setActiveProject(nextActive);
              activeProjectIdRef.current = nextActive ? nextActive.id : null;
              if (nextActive) {
                localStorage.setItem(LOCAL_STORAGE_ACTIVE_ID_KEY, nextActive.id);
              } else {
                localStorage.removeItem(LOCAL_STORAGE_ACTIVE_ID_KEY);
              }
              setSelectedNode(null);
            }
            await deleteDoc(doc(db, path, projId));
          } catch (err) {
            handleFirestoreError(err, OperationType.DELETE, `${path}/${projId}`);
          }
        } else {
          const localData = localStorage.getItem(LOCAL_STORAGE_PROJECTS_KEY);
          if (localData) {
            const localList: OrgProject[] = JSON.parse(localData);
            const updatedList = localList.filter(p => p.id !== projId);
            localStorage.setItem(LOCAL_STORAGE_PROJECTS_KEY, JSON.stringify(updatedList));
            setProjects(updatedList);
            if (activeProject?.id === projId) {
              const nextActive = updatedList[0] || null;
              setActiveProject(nextActive);
              activeProjectIdRef.current = nextActive ? nextActive.id : null;
              if (nextActive) {
                localStorage.setItem(LOCAL_STORAGE_ACTIVE_ID_KEY, nextActive.id);
              } else {
                localStorage.removeItem(LOCAL_STORAGE_ACTIVE_ID_KEY);
              }
              setSelectedNode(null);
            }
          }
        }
      }
    );
  };

  const handleExportPDF = () => {
    if (!activeProject) return;
    exportToPDF('organograma-viewport-area', activeProject.name, (status) => {
      setPdfStatus(status);
      if (status === 'success' || status === 'error') {
        setTimeout(() => setPdfStatus('idle'), 4000);
      }
    });
  };

  // Check if target is a descendant of the source (prevent cycles)
  const isDescendant = (nodesList: OrgNode[], potentialDescendantId: string, ancestorId: string): boolean => {
    const visited = new Set<string>();
    let current = nodesList.find(n => n.id === potentialDescendantId);
    while (current && current.parentId) {
      if (visited.has(current.id)) {
        return false;
      }
      visited.add(current.id);
      if (current.parentId === ancestorId) {
        return true;
      }
      current = nodesList.find(n => n.id === current.parentId);
    }
    return false;
  };

  const handleStartConnect = (nodeId: string, port: 'top' | 'bottom' | 'left' | 'right', e: React.MouseEvent) => {
    setConnectingFrom({ nodeId, port });
    const rect = document.getElementById('organograma-viewport-area')?.getBoundingClientRect();
    if (rect) {
      const rx = e.clientX - rect.left;
      const ry = e.clientY - rect.top;
      setDrawingMousePos({
        x: rx / zoom - panX,
        y: ry / zoom - panY
      });
    }
  };

  // Node Drag and Drop Movement Handler
  const handleNodeMouseDown = (nodeId: string, e: React.MouseEvent) => {
    // If we click on interactive items inside card, ignore dragging card
    const target = e.target as HTMLElement;
    if (
      target.closest('button') || 
      target.closest('[data-port-name]') || 
      target.closest('input') || 
      target.closest('textarea') || 
      target.closest('.no-drag')
    ) {
      return;
    }
    
    e.stopPropagation();
    
    if (!coords[nodeId]) return;

    setDraggingNodeId(nodeId);
    
    const rect = document.getElementById('organograma-viewport-area')?.getBoundingClientRect();
    if (rect) {
      const mouseCanvasX = (e.clientX - rect.left) / zoom - panX;
      const mouseCanvasY = (e.clientY - rect.top) / zoom - panY;
      
      dragNodeOffset.current = {
        x: mouseCanvasX - coords[nodeId].x,
        y: mouseCanvasY - coords[nodeId].y,
      };
    }
  };

  // Canvas Mouse Pan Dragging
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    // If we click on interactive items, don't drag the workspace root
    if ((e.target as HTMLElement).closest('.pointer-events-auto')) return;
    
    isDraggingCanvas.current = true;
    dragStart.current = { x: e.clientX - panX, y: e.clientY - panY };
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    // 1. Connection line dragging
    if (connectingFrom) {
      const rect = document.getElementById('organograma-viewport-area')?.getBoundingClientRect();
      if (rect) {
        const rx = e.clientX - rect.left;
        const ry = e.clientY - rect.top;
        setDrawingMousePos({
          x: rx / zoom - panX,
          y: ry / zoom - panY
        });
      }
      return;
    }

    // 2. Node movement dragging
    if (draggingNodeId && activeProject) {
      const rect = document.getElementById('organograma-viewport-area')?.getBoundingClientRect();
      if (rect) {
        const mouseCanvasX = (e.clientX - rect.left) / zoom - panX;
        const mouseCanvasY = (e.clientY - rect.top) / zoom - panY;
        
        const newX = Math.round(mouseCanvasX - dragNodeOffset.current.x);
        const newY = Math.round(mouseCanvasY - dragNodeOffset.current.y);

        // Responsive instantaneous state rendering
        const updatedNodes = activeProject.nodes.map(n => {
          if (n.id === draggingNodeId) {
            return {
              ...n,
              positionX: newX,
              positionY: newY
            };
          }
          return n;
        });

        setActiveProject({
          ...activeProject,
          nodes: updatedNodes
        });
      }
      return;
    }

    // 3. Canvas panning
    if (!isDraggingCanvas.current) return;
    setPanX(e.clientX - dragStart.current.x);
    setPanY(e.clientY - dragStart.current.y);
  };

  const handleCanvasMouseUp = (e: React.MouseEvent) => {
    // 1. If we just finished moving a node, write to Firestore/localStorage
    if (draggingNodeId && activeProject) {
      updateProjectInStore(activeProject);
      setDraggingNodeId(null);
      isDraggingCanvas.current = false;
      return;
    }

    // 2. If connecting ports together
    if (connectingFrom) {
      // Find element under mouse at release moment
      const elementUnderMouse = document.elementFromPoint(e.clientX, e.clientY);
      const portElement = elementUnderMouse?.closest('[data-port-name]');
      const cardElement = elementUnderMouse?.closest('[data-node-id]');

      const targetId = portElement?.getAttribute('data-node-id') || cardElement?.getAttribute('data-node-id');
      const targetPort = portElement?.getAttribute('data-port-name') as 'top' | 'bottom' | 'left' | 'right' | null || 'top';

      if (targetId && targetId !== connectingFrom.nodeId && activeProject) {
        // Relink target id to have connectingFrom.nodeId as parent (completely free hierarchy/connections)
        const updatedNodes = activeProject.nodes.map(n => {
          if (n.id === targetId) {
            return {
              ...n,
              parentId: connectingFrom.nodeId,
              parentPort: connectingFrom.port,
              childPort: targetPort
            };
          }
          return n;
        });

        updateProjectInStore({
          ...activeProject,
          nodes: updatedNodes,
          updatedAt: new Date().toISOString()
        });

        // Show a discrete notification alert of success
        const sourceName = activeProject.nodes.find(n => n.id === connectingFrom.nodeId)?.name || 'Colaborador';
        const targetName = activeProject.nodes.find(n => n.id === targetId)?.name || 'Colaborador';
        showCustomAlert("Linha Criada! 🔗", `"${targetName}" foi conectado(a) sob a liderança de "${sourceName}".`);
      }
      
      setConnectingFrom(null);
      setDrawingMousePos(null);
    }
    isDraggingCanvas.current = false;
  };

  const handleResetCanvas = () => {
    setZoom(0.8);
    setPanX(100);
    setPanY(50);
  };

  // Reset custom positioning and auto organize layout
  const handleAutoOrganize = () => {
    if (!activeProject) return;
    showCustomConfirm(
      "Auto-Organizar Layout? 📐",
      "Isso removerá as posições manuais de todos os colaboradores deste organograma e os reposicionará usando o algoritmo de diagramação inteligente padrão. Confirmar?",
      () => {
        const cleanedNodes = activeProject.nodes.map(n => {
          const { positionX, positionY, ...rest } = n;
          return {
            ...rest
          };
        });
        updateProjectInStore({
          ...activeProject,
          nodes: cleanedNodes,
          updatedAt: new Date().toISOString()
        });
        showCustomAlert("Layout Harmonizado! ✨", "Os colaboradores foram reagrupados na diagramação inteligente padrão.");
      }
    );
  };

  // Calculate layout coordinates for rendering (prefer user custom drag coords, fallback to auto layout)
  const nodes = activeProject?.nodes || [];
  const autoCoords = calculateLayout(nodes, 310, 240);
  const coords: Record<string, { x: number; y: number }> = {};
  nodes.forEach(node => {
    if (node.positionX !== undefined && node.positionY !== undefined) {
      coords[node.id] = { x: node.positionX, y: node.positionY };
    } else {
      coords[node.id] = autoCoords[node.id] || { x: 50, y: 50 };
    }
  });

  // Search filter
  const isNodeSearched = (node: OrgNode) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      node.name?.toLowerCase().includes(q) ||
      node.role?.toLowerCase().includes(q) ||
      node.department?.toLowerCase().includes(q) ||
      node.email?.toLowerCase().includes(q) ||
      node.phone?.includes(q) ||
      node.notes?.toLowerCase().includes(q)
    );
  };

  // Build SVG path lines connecting parent-children
  const svgLines: React.ReactNode[] = [];
  
  // Coordinates mapper helper for card ports
  const getPortCoords = (pos: { x: number, y: number }, port: 'top' | 'bottom' | 'left' | 'right') => {
    const cardW = 260;
    const cardH = 195; // realistic full height
    switch (port) {
      case 'top':    return { x: pos.x + cardW / 2, y: pos.y };
      case 'bottom': return { x: pos.x + cardW / 2, y: pos.y + cardH };
      case 'left':   return { x: pos.x,             y: pos.y + cardH / 2 };
      case 'right':  return { x: pos.x + cardW,     y: pos.y + cardH / 2 };
      default:       return { x: pos.x + cardW / 2, y: pos.y + cardH };
    }
  };

  const getPortDirection = (port: 'top' | 'bottom' | 'left' | 'right') => {
    switch (port) {
      case 'top': return { dx: 0, dy: -1 };
      case 'bottom': return { dx: 0, dy: 1 };
      case 'left': return { dx: -1, dy: 0 };
      case 'right': return { dx: 1, dy: 0 };
      default: return { dx: 0, dy: 1 };
    }
  };

  nodes.forEach(node => {
    if (node.parentId && coords[node.parentId] && coords[node.id]) {
      const parentPos = coords[node.parentId];
      const childPos = coords[node.id];

      // Use specific port connections or default to bottom-to-top
      const parentPort = node.parentPort || 'bottom';
      const childPort = node.childPort || 'top';

      const start = getPortCoords(parentPos, parentPort);
      const end = getPortCoords(childPos, childPort);

      const p1Dir = getPortDirection(parentPort);
      const p2Dir = getPortDirection(childPort);

      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const h = Math.max(45, Math.min(125, distance * 0.45));

      const cx1 = start.x + p1Dir.dx * h;
      const cy1 = start.y + p1Dir.dy * h;
      const cx2 = end.x + p2Dir.dx * h;
      const cy2 = end.y + p2Dir.dy * h;

      const pathD = `M ${start.x} ${start.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${end.x} ${end.y}`;

      // Calculate Bezier middle point at t = 0.5 for placing the delete line button
      const getBezierMiddle = (
        p0: { x: number; y: number },
        p1: { x: number; y: number },
        p2: { x: number; y: number },
        p3: { x: number; y: number }
      ) => {
        const t = 0.5;
        const mt = 1 - t;
        const mt2 = mt * mt;
        const mt3 = mt2 * mt;
        const t2 = t * t;
        const t3 = t2 * t;

        return {
          x: mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x,
          y: mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y,
        };
      };

      const mid = getBezierMiddle(
        start,
        { x: cx1, y: cy1 },
        { x: cx2, y: cy2 },
        end
      );

      svgLines.push(
        <g key={`link-${node.parentId}-${node.id}`}>
          {/* Glowing back highlight on hover */}
          <path
            d={pathD}
            fill="none"
            stroke="transparent"
            strokeWidth="12"
            strokeLinecap="round"
            className="hover:stroke-indigo-100/40 cursor-pointer transition-all duration-200"
          />
          {/* Main line path */}
          <path
            d={pathD}
            fill="none"
            stroke="#cbd5e1"
            strokeWidth="3"
            strokeLinecap="round"
            className="transition-all duration-300 hover:stroke-indigo-400 cursor-pointer"
          />
          {/* Bullet joints */}
          <circle cx={start.x} cy={start.y} r="4.5" fill="#6366f1" className="ring-2 ring-white" />
          <circle cx={end.x} cy={end.y} r="4.5" fill="#6366f1" className="ring-2 ring-white" />

          {/* Delete connection button (Scissors/X) right in the middle */}
          <g 
            className="group/link-btn cursor-pointer pointer-events-auto opacity-70 hover:opacity-100 transition-opacity duration-200"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteConnection(node.id);
            }}
          >
            <circle 
              cx={mid.x} 
              cy={mid.y} 
              r="10" 
              fill="#ffffff" 
              stroke="#f43f5e" 
              strokeWidth="2" 
              className="transition-all duration-200 group-hover/link-btn:scale-125 group-hover/link-btn:fill-rose-50 shadow-sm"
            />
            {/* Tiny sleek X */}
            <line x1={mid.x - 3} y1={mid.y - 3} x2={mid.x + 3} y2={mid.y + 3} stroke="#e11d48" strokeWidth="2" strokeLinecap="round" />
            <line x1={mid.x + 3} y1={mid.y - 3} x2={mid.x - 3} y2={mid.y + 3} stroke="#e11d48" strokeWidth="2" strokeLinecap="round" />
            <title>Excluir esta linha (Desconectar colaborador)</title>
          </g>
        </g>
      );
    }
  });

  // Dynamic dashed line when user is actively dragging one
  if (connectingFrom && drawingMousePos) {
    const parentNode = nodes.find(n => n.id === connectingFrom.nodeId);
    if (parentNode && coords[connectingFrom.nodeId]) {
      const parentPos = coords[connectingFrom.nodeId];
      const start = getPortCoords(parentPos, connectingFrom.port);
      const end = drawingMousePos;

      const p1Dir = getPortDirection(connectingFrom.port);
      const p2Dir = { dx: -p1Dir.dx, dy: -p1Dir.dy }; // Opposite direction for curve balance

      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const h = Math.max(45, Math.min(125, distance * 0.45));

      const cx1 = start.x + p1Dir.dx * h;
      const cy1 = start.y + p1Dir.dy * h;
      const cx2 = end.x + p2Dir.dx * h;
      const cy2 = end.y + p2Dir.dy * h;

      const dragPathD = `M ${start.x} ${start.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${end.x} ${end.y}`;

      svgLines.push(
        <g key="drag-connecting-link">
          <path
            d={dragPathD}
            fill="none"
            stroke="#6366f1"
            strokeWidth="3.5"
            className="animate-dash"
          />
          <circle cx={start.x} cy={start.y} r="5.5" fill="#4f46e5" />
          <circle cx={end.x} cy={end.y} r="5.5" fill="#4f46e5" />
        </g>
      );
    }
  }

  // Count nodes to display project summary info
  const totalCollaborators = nodes.length;
  const loggedContacts = nodes.filter(n => n.email || n.phone).length;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800 antialiased overflow-hidden select-none">
      
      {/* Toast Notification for Sync Success */}
      <AnimatePresence>
        {showSyncSuccess && (
          <motion.div 
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-xl flex items-center gap-3 border border-emerald-500 font-medium"
          >
            <Check className="h-5 w-5 bg-white/20 rounded-full p-0.5 shrink-0" />
            <span>Seus organogramas locais foram sincronizados e salvos na Nuvem! ☁️</span>
          </motion.div>
        )}
      </AnimatePresence>



      {/* HEADER BAR */}
      <header className="bg-white border-b border-slate-200 h-16 shrink-0 px-6 flex items-center justify-between z-10 shadow-sm">
        
        {/* Left Side: Brand Logo & Title */}
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 text-white p-2.5 rounded-xl shadow-md flex items-center justify-center">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
              OrganoMap
              <span className="text-[10px] bg-indigo-50 text-indigo-700 font-semibold px-2 py-0.5 rounded-full border border-indigo-100">
                B2B Prospector
              </span>
            </h1>
            <p className="text-xs text-slate-500">Mapeador de decisores para prospecção de vendas</p>
          </div>
        </div>

        {/* Middle Area: Active Project Controls */}
        <div className="hidden md:flex items-center gap-3 bg-slate-50 border border-slate-200 py-1.5 px-3.5 rounded-xl">
          <Folder className="h-4 w-4 text-slate-400" />
          <span className="text-sm font-semibold text-slate-700 max-w-[200px] truncate">
            {activeProject ? activeProject.name : 'Selecione um projeto'}
          </span>
          
          {/* Auto Saving Status indicators */}
          {activeProject && (
            <>
              {savingStatus === 'saving' && (
                <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 font-bold px-2 py-0.5 rounded-full flex items-center gap-1.5 animate-pulse" title="Sincronizando alterações...">
                  <CloudOff className="h-3.5 w-3.5 text-amber-500" />
                  <span>Salvando...</span>
                </span>
              )}
              {savingStatus === 'saved' && (
                <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold px-2 py-0.5 rounded-full flex items-center gap-1.5" title="Alterações salvas automaticamente">
                  <Cloud className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Salvo</span>
                </span>
              )}
              {savingStatus === 'error' && (
                <span className="text-[10px] bg-rose-50 text-rose-700 border border-rose-200 font-bold px-2 py-0.5 rounded-full flex items-center gap-1.5" title="Erro ao salvar alteração">
                  <CloudOff className="h-3.5 w-3.5 text-rose-600" />
                  <span>Erro</span>
                </span>
              )}
            </>
          )}

          <button
            onClick={() => setIsProjectsSidebarOpen(true)}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer flex items-center gap-1 border-l border-slate-200 pl-2 ml-1"
          >
            Ver Todos
            <ChevronRight className="h-3 w-3" />
          </button>

          <button
            onClick={() => setIsNewProjectModalOpen(true)}
            className="text-xs text-indigo-700 bg-indigo-50/60 hover:bg-indigo-100/80 border border-indigo-100 hover:border-indigo-200 font-bold px-2.5 py-1 rounded-lg cursor-pointer flex items-center gap-1 ml-1 transition-all"
            title="Mapear uma nova empresa"
          >
            <Plus className="h-3.5 w-3.5 shrink-0" />
            <span>Mapear Nova Empresa</span>
          </button>

          {activeProject && (
            <button
              onClick={(e) => handleDeleteProject(activeProject.id, e)}
              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-all cursor-pointer border-l border-slate-200 pl-2 ml-1"
              title="Excluir este organograma permanentemente"
            >
              <Trash2 className="h-3.5 w-3.5 shrink-0" />
            </button>
          )}
        </div>

        {/* Right Side: Search, PDF and Auth Controls */}
        <div className="flex items-center gap-3">
          
          {/* Quick Search across hierarchy */}
          <div className="relative hidden lg:block w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar colaborador ou setor..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-100 border-0 focus:bg-white text-xs py-2 pl-9 pr-4 rounded-xl focus:ring-2 focus:ring-indigo-500 text-slate-800 transition-all outline-none"
            />
          </div>

          {/* Export PDF Button with loader */}
          <button
            onClick={handleExportPDF}
            disabled={pdfStatus === 'generating' || !activeProject}
            className={`cursor-pointer max-xs:p-2 flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-xl transition-all shadow-sm ${
              pdfStatus === 'generating' 
              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
              : pdfStatus === 'success'
              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
              : pdfStatus === 'error'
              ? 'bg-rose-600 text-white hover:bg-rose-700'
              : 'bg-slate-900 border border-slate-800 text-white hover:bg-slate-800'
            }`}
          >
            <Download className="h-4 w-4 animate-pulse shrink-0" />
            <span className="hidden sm:inline">
              {pdfStatus === 'generating' ? 'Gerando PDF...' : pdfStatus === 'success' ? 'PDF Baixado! ✅' : pdfStatus === 'error' ? 'Erro! ❌' : 'Exportar PDF'}
            </span>
          </button>

          {/* Sign In with Google Controls */}
          {authLoading ? (
            <div className="h-8 w-8 rounded-full bg-slate-100 animate-pulse" />
          ) : currentUser ? (
            <div className="flex items-center gap-2">
              <img
                src={currentUser.photoURL || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80'}
                alt={currentUser.displayName || 'User'}
                referrerPolicy="no-referrer"
                className="h-8 w-8 rounded-full border border-indigo-200"
                title={`${currentUser.displayName} (${currentUser.email})`}
              />
              <button
                onClick={logoutUser}
                className="p-1 px-1.5 rounded-lg bg-slate-50 border border-slate-200 hover:bg-rose-50 hover:text-rose-600 text-slate-500 transition-all text-xs"
                title="Sair da conta"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={loginWithGoogle}
              className="cursor-pointer border border-indigo-200 hover:border-indigo-300 text-indigo-700 hover:bg-indigo-50/50 bg-white text-xs font-semibold px-3 py-2 rounded-xl transition-all flex items-center gap-2"
            >
              <Users className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">Nuvem / Login</span>
            </button>
          )}
        </div>
      </header>

      {/* SUBBAR FOR GUESTS TO NOTICE SECURE STORAGE */}
      {!currentUser && !authLoading && (
        <div className="bg-slate-900 text-white px-6 py-2.5 text-xs flex items-center justify-between z-10 gap-4 flex-wrap shrink-0">
          <p className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-purple-400 animate-ping" />
            <span>Modo Visitante: Seus organogramas estão salvos localmente neste navegador. Faça login com o Google para salvar de forma segura na nuvem e compartilhar com seu time!</span>
          </p>
          <button 
            onClick={loginWithGoogle}
            className="cursor-pointer bg-white text-slate-900 hover:bg-slate-100 px-3 py-1 rounded font-bold text-[11px] whitespace-nowrap"
          >
            Conectar Conta Google ☁️
          </button>
        </div>
      )}

      {/* MAIN LAYOUT WRAPPER */}
      <div className="flex-1 flex overflow-hidden relative">

        {/* MIDDLE WORKSPACE: THE ORGANOGRAM CANVAS */}
        <main className="flex-1 overflow-hidden relative bg-[#f9fafb] flex flex-col">
          
          {/* SEARCH FOR SMALL SCREEN MOBILE AND STATS */}
          <div className="p-4 bg-white border-b border-slate-200/60 flex items-center justify-between flex-wrap gap-3 shrink-0">
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5 text-slate-500">
                <Users className="h-4 w-4 text-indigo-500 shrink-0" />
                <span className="font-semibold text-slate-700">{totalCollaborators}</span> cargos mapeados
              </div>
              <div className="flex items-center gap-1.5 text-slate-500 border-l border-slate-200 pl-4">
                <Phone className="h-4 w-4 text-indigo-500 shrink-0" />
                <span className="font-semibold text-slate-700">{loggedContacts}</span> com contatos diretos
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative block lg:hidden w-48">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar colaborador..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-100 border-0 text-xs py-1.5 pl-8 pr-3 rounded-lg text-slate-800"
                />
              </div>

              {/* Auto-Organize Layout */}
              <button
                onClick={handleAutoOrganize}
                className="p-1 px-2.5 text-xs border border-slate-200 hover:bg-slate-50 bg-white rounded-lg flex items-center gap-1 text-slate-600 transition-colors cursor-pointer"
                title="Reposicionar todos os cards no layout inteligente padrão"
              >
                <LayoutGrid className="h-3.5 w-3.5 text-indigo-500" />
                <span>Auto-Organizar Layout</span>
              </button>

              {/* Reset view control */}
              <button
                onClick={handleResetCanvas}
                className="p-1 px-2.5 text-xs border border-slate-200 hover:bg-slate-50 bg-white rounded-lg flex items-center gap-1 text-slate-600 transition-colors cursor-pointer"
                title="Restaurar Visão Inicial"
              >
                <Maximize2 className="h-3.5 w-3.5" />
                <span>Reset Zoom</span>
              </button>
            </div>
          </div>



          {/* ZOOM PANEL CORNER CONTROL */}
          <div className="absolute bottom-6 left-6 z-10 bg-white border border-slate-200 p-2 rounded-xl shadow-md flex items-center gap-1.5 pointer-events-auto">
            <button
              onClick={() => setZoom(prev => Math.max(0.4, prev - 0.1))}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer"
              title="Afastar"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <span className="text-xs font-mono font-bold text-slate-700 min-w-[40px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom(prev => Math.min(1.5, prev + 0.1))}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer"
              title="Aproximar"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
          </div>

          {/* WATERMARK WITH CURRENT CHOSEN PROJECT */}
          <div className="absolute bottom-6 right-6 z-10 text-right pointer-events-none select-none">
            <span className="font-mono text-xs uppercase tracking-widest text-slate-400 font-bold block">
              {activeProject ? activeProject.name : 'ORGANOGRAMA'}
            </span>
            <span className="text-[10px] text-slate-300">OrganoMap Prospecções B2B</span>
          </div>

          {/* MAIN DRAGGABLE VIEWPORT CONTAINER */}
          {!activeProject ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50/60 relative z-10">
              <div className="max-w-md bg-white p-8 rounded-2xl shadow-xl border border-slate-100 space-y-5">
                <div className="mx-auto w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center shadow-inner animate-bounce">
                  <Building2 className="h-8 w-8" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-lg font-bold text-slate-800 text-center">OrganoMap B2B</h2>
                  <p className="text-xs text-slate-500 leading-relaxed text-center">
                    Crie um organograma corporativo para mapear cargos, influenciadores e decisores chave (C-level, Diretores) para impulsionar suas vendas e prospecções B2B.
                  </p>
                </div>
                <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
                  <button
                    onClick={() => setIsNewProjectModalOpen(true)}
                    className="cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2.5 px-5 rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Mapear Nova Empresa</span>
                  </button>
                  <button
                    onClick={() => setIsProjectsSidebarOpen(true)}
                    className="cursor-pointer bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold py-2.5 px-5 rounded-xl transition-all flex items-center justify-center gap-1.5"
                  >
                    <span>Ver Seus Organogramas</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div
              id="organograma-viewport-area"
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={handleCanvasMouseUp}
              className="flex-1 overflow-auto relative cursor-grab active:cursor-grabbing select-none outline-none"
            >
              
              {/* The scaled visual board */}
              <div 
                style={{
                  transform: `scale(${zoom}) translate(${panX}px, ${panY}px)`,
                  transformOrigin: '0 0',
                  transition: isDraggingCanvas.current ? 'none' : 'transform 0.15s cubic-bezier(0.2, 0.8, 0.2, 1)',
                  width: '5000px',
                  height: '3500px',
                }}
                className="absolute left-0 top-0 pointer-events-none"
              >
                {/* Dynamic Connecting Orthogonal Lines SVG Layer */}
                <svg 
                  className="absolute inset-0 w-full h-full"
                  style={{ zIndex: 0 }}
                >
                  {svgLines}
                </svg>

                {/* CSS Grid Card Nodes Placement Loop */}
                {nodes.map(node => {
                  const pos = coords[node.id] || { x: 50, y: 50 };
                  const searched = isNodeSearched(node);

                  return (
                    <div
                      key={node.id}
                      onMouseDown={(e) => handleNodeMouseDown(node.id, e)}
                      style={{
                        position: 'absolute',
                        left: pos.x,
                        top: pos.y,
                        zIndex: (selectedNode?.id === node.id || draggingNodeId === node.id) ? 50 : 10,
                      }}
                      className={`transition-opacity duration-300 cursor-grab active:cursor-grabbing select-none ${searched ? 'opacity-100' : 'opacity-25'}`}
                    >
                      <OrgChartNodeCard
                        node={node}
                        isRoot={node.parentId === null}
                        onEdit={(n) => setSelectedNode(n)}
                        onAddChild={handleAddChildNode}
                        onDelete={handleDeleteNode}
                        onStartConnect={handleStartConnect}
                        connectingFromId={connectingFrom?.nodeId || null}
                      />
                    </div>
                  );
                })}

              </div>
            </div>
          )}

        </main>

        {/* RIGHT SIDEBAR PANEL: MEMBER CONTACT EDITOR (Pristine layout) */}
        <AnimatePresence>
          {selectedNode && (
            <motion.aside
              initial={{ x: 350, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 350, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="w-96 bg-white border-l border-slate-200 shadow-2xl relative flex flex-col z-20"
            >
              {/* Sidebar Header */}
              <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-indigo-50 text-indigo-700 rounded-lg">
                    <User className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">
                      {selectedNode.name ? 'Editar Colaborador' : 'Novo Cargo Mapeado'}
                    </h3>
                    <p className="text-[10px] text-slate-500">Cadastre os dados de contato direto</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Form Workspace */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                
                {/* Name */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                    Nome Completo
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      value={selectedNode.name}
                      placeholder="Ex: Dr. Carlos Eduardo Nogueira"
                      onChange={(e) => handleUpdateNode({ ...selectedNode, name: e.target.value })}
                      className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-indigo-500 py-2 pl-9 pr-4 rounded-xl text-xs outline-none transition-all"
                    />
                  </div>
                </div>

                {/* Role / Cargo */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                    Cargo / Função
                  </label>
                  <div className="relative">
                    <Briefcase className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      value={selectedNode.role}
                      placeholder="Ex: Diretor de Tecnologia, Comprador"
                      onChange={(e) => handleUpdateNode({ ...selectedNode, role: e.target.value })}
                      className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-indigo-500 py-2 pl-9 pr-4 rounded-xl text-xs outline-none transition-all"
                    />
                  </div>
                </div>

                {/* Company Section */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                    Nome da Empresa
                  </label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      value={selectedNode.department || ''}
                      placeholder="Ex: Coca-Cola, Google, Empresa Exemplo"
                      onChange={(e) => handleUpdateNode({ ...selectedNode, department: e.target.value })}
                      className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-indigo-500 py-2 pl-9 pr-4 rounded-xl text-xs outline-none transition-all text-slate-800"
                    />
                  </div>
                </div>

                {/* Email (Direct contact) */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                    E-mail do Decisor
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="email"
                      value={selectedNode.email}
                      placeholder="como_abordar@empresa.com"
                      onChange={(e) => handleUpdateNode({ ...selectedNode, email: e.target.value })}
                      className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-indigo-500 py-2 pl-9 pr-4 rounded-xl text-xs font-mono outline-none transition-all text-slate-800"
                    />
                  </div>
                </div>

                {/* Phone */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                    Telefone de Contato Direto
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      value={selectedNode.phone}
                      placeholder="(11) 98888-7777 ou ramal"
                      onChange={(e) => handleUpdateNode({ ...selectedNode, phone: e.target.value })}
                      className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-indigo-500 py-2 pl-9 pr-4 rounded-xl text-xs font-mono outline-none transition-all"
                    />
                  </div>
                </div>

                {/* Notes for prospecting (Extremely useful for selling B2B) */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block flex items-center justify-between">
                    <span>Dicas de Abordagem / Notas</span>
                    <span className="text-[9px] bg-indigo-50 text-indigo-700 font-medium px-1.5 py-0.5 rounded">
                      Foco Comercial
                    </span>
                  </label>
                  <textarea
                    rows={4}
                    value={selectedNode.notes || ''}
                    placeholder="Adicione informações fundamentais de negócios. Quem ele responde? Qual o produto deles que podemos oferecer? Qual a dor dele que resolvemos?"
                    onChange={(e) => handleUpdateNode({ ...selectedNode, notes: e.target.value })}
                    className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-indigo-500 p-3 rounded-xl text-xs outline-none transition-all resize-none text-slate-700"
                  />
                </div>

                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 flex items-start gap-2.5 text-[10px] text-slate-500">
                  <HelpCircle className="h-4 w-4 mt-0.5 text-slate-400 shrink-0" />
                  <p className="leading-relaxed">
                    Você pode conectar links de e-mails (`mailto`) ou celulares (`tel`) diretamente clicando nos ícones correspondentes no card para iniciar conversas rápidas.
                  </p>
                </div>

                {selectedNode.parentId !== null && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        const updated = {
                          ...selectedNode,
                          parentId: null,
                          parentPort: undefined,
                          childPort: undefined
                        };
                        handleUpdateNode(updated);
                        showCustomAlert(
                          "Líder Principal 🌟", 
                          `"${selectedNode.name || 'Colaborador'}" foi desconectado(a) de seu superior e agora é um Líder Principal no topo do organograma.`
                        );
                      }}
                      className="w-full bg-slate-100/80 hover:bg-slate-200 text-slate-700 hover:text-slate-950 font-bold py-2.5 px-3 rounded-xl transition-all text-[11px] text-center flex items-center justify-center gap-1.5 border border-slate-200 cursor-pointer shadow-2xs"
                    >
                      <span>Tornar Líder Principal (Desvincular Superior)</span>
                    </button>
                  </div>
                )}

              </div>

              {/* Save Confirmation Button */}
              <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setSelectedNode(null)}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-4 rounded-xl transition-colors text-xs text-center flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                >
                  <Check className="h-4 w-4" />
                  <span>Concluir e Salvar</span>
                </button>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* LEFT COLLAPSIBLE SIDEBAR: PROJECTS MANAGEMENT (SLIDE IN) */}
        <AnimatePresence>
          {isProjectsSidebarOpen && (
            <>
              {/* Translucent backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.4 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsProjectsSidebarOpen(false)}
                className="absolute inset-0 bg-black z-30 pointer-events-auto"
              />

              {/* Sidebar Content drawer */}
              <motion.nav
                initial={{ x: -280 }}
                animate={{ x: 0 }}
                exit={{ x: -280 }}
                transition={{ type: 'tween', duration: 0.2 }}
                className="absolute top-0 bottom-0 left-0 w-80 bg-white z-40 border-r border-slate-200 flex flex-col shadow-2xl pointer-events-auto"
              >
                
                {/* Header list */}
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Folder className="h-5 w-5 text-indigo-600" />
                    <div>
                      <h3 className="text-sm font-bold text-slate-800">Seus Organogramas</h3>
                      <p className="text-[10px] text-slate-500">Seus projetos e contas B2B</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsProjectsSidebarOpen(false)}
                    className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Subbar Button for creation */}
                <div className="p-3 border-b border-slate-100 bg-slate-50/50">
                  <button
                    onClick={() => {
                      setIsProjectsSidebarOpen(false);
                      setIsNewProjectModalOpen(true);
                    }}
                    className="w-full border border-dashed border-indigo-300 hover:border-indigo-400 text-indigo-700 hover:bg-indigo-50 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Mapear Nova Empresa</span>
                  </button>
                </div>

                {/* Projects Scroll Workspace */}
                <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                  {projects.length === 0 ? (
                    <div className="p-6 text-center text-slate-400 space-y-2">
                      <FolderPlus className="h-10 w-10 mx-auto opacity-30 text-slate-400" />
                      <p className="text-xs font-medium">Nenhum projeto de organograma disponível.</p>
                    </div>
                  ) : (
                    projects.map(proj => {
                      const isActive = activeProject?.id === proj.id;
                      return (
                        <div
                          key={proj.id}
                          onClick={() => {
                            setActiveProject(proj);
                            activeProjectIdRef.current = proj.id;
                            setSelectedNode(null);
                            setIsProjectsSidebarOpen(false);
                          }}
                          className={`p-3.5 flex items-center justify-between gap-3 hover:bg-slate-50 transition-all cursor-pointer ${
                            isActive ? 'bg-indigo-50/60 border-l-4 border-indigo-600' : ''
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <h4 className="text-xs font-bold text-slate-800 truncate" title={proj.name}>
                              {proj.name}
                            </h4>
                            <div className="flex items-center gap-3 text-[10px] text-slate-400 mt-1">
                              <span className="flex items-center gap-0.5 font-medium">
                                <Users className="h-3 w-3 shrink-0" />
                                {proj.nodes?.length} contatos
                              </span>
                              <span className="truncate">
                                Modificado: {proj.updatedAt ? new Date(proj.updatedAt).toLocaleDateString('pt-BR') : 'N/D'}
                              </span>
                            </div>
                          </div>

                          {/* Delete Project icon */}
                          <button
                            onClick={(e) => handleDeleteProject(proj.id, e)}
                            className="p-1 px-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-500 rounded transition-colors"
                            title="Deletar este mapeamento"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Auth profile quick link inside sidebar footer */}
                <div className="p-4 border-t border-slate-200 bg-slate-50 text-[11px] text-slate-500 space-y-2">
                  <div className="flex items-center gap-2">
                    <Laptop className="h-4 w-4 text-slate-400" />
                    <span>Dispositivo: Web browser offline-first</span>
                  </div>
                  {currentUser ? (
                    <div className="bg-white px-2.5 py-1.5 rounded border border-slate-200 flex items-center justify-between">
                      <span className="truncate max-w-[150px] font-mono font-medium text-slate-600 text-[10px]">
                        Conta: {currentUser.email}
                      </span>
                      <span className="text-[9px] bg-indigo-100 text-indigo-700 rounded font-medium px-1">NUVEM SINC</span>
                    </div>
                  ) : (
                    <p className="leading-relaxed">
                      Seus projetos estão salvos no armazenamento local. Para compartilhar, mude de computador ou colabore logando com o Google.
                    </p>
                  )}
                </div>

              </motion.nav>
            </>
          )}
        </AnimatePresence>

        {/* MODAL WINDOW: SAVE NEW COMPANY OR PROJECT */}
        <AnimatePresence>
          {isNewProjectModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              {/* Translucent overlay */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.5 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsNewProjectModalOpen(false)}
                className="absolute inset-0 bg-slate-900 pointer-events-auto"
              />

              {/* Dialog Panel */}
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-6 relative z-10 border border-slate-100 pointer-events-auto"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="bg-indigo-50 text-indigo-600 p-2.5 rounded-xl">
                    <FolderPlus className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Mapear Nova Empresa</h3>
                    <p className="text-xs text-slate-500">Crie um novo organograma para prospectar contatos</p>
                  </div>
                </div>

                <form onSubmit={handleCreateNewProject} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                      Nome da Empresa / Projeto B2B
                    </label>
                    <input
                      type="text"
                      required
                      value={newProjectName}
                      placeholder="Ex: Coca Cola Brasil, Tech Corp S/A"
                      onChange={(e) => setNewProjectName(e.target.value)}
                      className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-indigo-500 py-2.5 px-4 rounded-xl text-xs outline-none transition-all"
                    />
                  </div>

                  {/* Preloaded Person validation */}
                  <div className="bg-indigo-50/50 rounded-xl p-3 border border-indigo-100 flex items-start gap-2.5">
                    <Building2 className="h-4 w-4 text-indigo-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[11px] font-bold text-indigo-800 text-left">Estrutura Inicial Ativada</p>
                      <p className="text-[10px] text-indigo-600 leading-relaxed text-left">
                        Ao criar, o primeiro colaborador (Líder / CEO) será criado automaticamente no centro do organograma com o nome da empresa, facilitando o início imediato do seu mapeamento.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2.5 justify-end pt-2">
                    <button
                      type="button"
                      onClick={() => setIsNewProjectModalOpen(false)}
                      className="px-4 py-2 hover:bg-slate-100 rounded-xl text-xs font-semibold text-slate-600 transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={!newProjectName.trim()}
                      className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-semibold px-4 py-2 rounded-xl text-xs transition-colors cursor-pointer shadow-sm flex items-center gap-1.5"
                    >
                      Criar Organograma
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* CUSTOM MODAL: ALERT & CONFIRM DIALOGS */}
        <AnimatePresence>
          {dialogConfig && dialogConfig.isOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              {/* Overlay */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.5 }}
                exit={{ opacity: 0 }}
                onClick={() => setDialogConfig(prev => prev ? { ...prev, isOpen: false } : null)}
                className="absolute inset-0 bg-slate-900 pointer-events-auto"
              />

              {/* Dialog bubble */}
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6 relative z-10 border border-slate-100 pointer-events-auto text-center"
              >
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-slate-50 border border-slate-100 mb-4 text-xl">
                  {dialogConfig.type === 'confirm' ? '❓' : '⚠️'}
                </div>

                <h3 className="text-sm font-bold text-slate-800 mb-2">
                  {dialogConfig.title}
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed mb-6">
                  {dialogConfig.message}
                </p>

                <div className="flex gap-2 justify-center">
                  {dialogConfig.type === 'confirm' && (
                    <button
                      type="button"
                      onClick={() => setDialogConfig(prev => prev ? { ...prev, isOpen: false } : null)}
                      className="px-4 py-2 hover:bg-slate-100 rounded-lg text-xs font-semibold text-slate-600 transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (dialogConfig.type === 'confirm' && dialogConfig.onConfirm) {
                        dialogConfig.onConfirm();
                      }
                      setDialogConfig(null);
                    }}
                    className={`font-semibold px-4 py-2 rounded-lg text-xs transition-colors cursor-pointer shadow-sm ${
                      dialogConfig.type === 'confirm'
                          ? 'bg-rose-600 hover:bg-rose-700 text-white'
                          : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                    }`}
                  >
                    {dialogConfig.type === 'confirm' ? 'Confirmar' : 'Entendido'}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
