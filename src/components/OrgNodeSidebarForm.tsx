import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { 
  User, 
  Briefcase, 
  Building2, 
  Mail, 
  Phone, 
  HelpCircle, 
  Check, 
  X 
} from 'lucide-react';
import { OrgNode } from '../types';

interface OrgNodeSidebarFormProps {
  selectedNode: OrgNode;
  nodes: OrgNode[];
  onUpdateNode: (node: OrgNode) => void;
  onClose: () => void;
  isDescendant: (nodesList: OrgNode[], potentialDescendantId: string, ancestorId: string) => boolean;
  showCustomAlert: (title: string, message: string) => void;
}

export const OrgNodeSidebarForm: React.FC<OrgNodeSidebarFormProps> = ({
  selectedNode,
  nodes,
  onUpdateNode,
  onClose,
  isDescendant,
  showCustomAlert,
}) => {
  // Local state for snappy, lag-free typing
  const [localNode, setLocalNode] = useState<OrgNode>(selectedNode);
  const localNodeRef = useRef<OrgNode>(selectedNode);

  // Keep ref up to date
  useEffect(() => {
    localNodeRef.current = localNode;
  }, [localNode]);

  // Sync state if selectedNode changes externally (e.g., user selects another card)
  useEffect(() => {
    setLocalNode(selectedNode);
  }, [selectedNode.id]); // only re-sync on actual ID changes to prevent wiping local typing

  // Debounced parent state updates (200ms for responsiveness on canvas without typing lag)
  useEffect(() => {
    if (JSON.stringify(localNode) === JSON.stringify(selectedNode)) {
      return;
    }

    const timer = setTimeout(() => {
      onUpdateNode(localNode);
    }, 200);

    return () => clearTimeout(timer);
  }, [localNode, selectedNode, onUpdateNode]);

  // Immediate save helper to call before unmounting / blurring
  const handleImmediateSave = (updated: OrgNode) => {
    setLocalNode(updated);
    onUpdateNode(updated);
  };

  const handleFieldChange = (field: keyof OrgNode, value: any) => {
    const updated = { ...localNode, [field]: value };
    setLocalNode(updated);
  };

  const handleFinish = () => {
    onUpdateNode(localNodeRef.current);
    onClose();
  };

  return (
    <motion.aside
      initial={{ x: 350, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 350, opacity: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="w-96 bg-white border-l border-slate-200 shadow-2xl relative flex flex-col z-20 h-full"
    >
      {/* Sidebar Header */}
      <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-indigo-50 text-indigo-700 rounded-lg">
            <User className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">
              {localNode.name ? 'Editar Colaborador' : 'Novo Cargo Mapeado'}
            </h3>
            <p className="text-[10px] text-slate-500">Cadastre os dados de contato direto</p>
          </div>
        </div>
        <button
          onClick={handleFinish}
          className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
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
              value={localNode.name}
              placeholder="Ex: Dr. Carlos Eduardo Nogueira"
              onChange={(e) => handleFieldChange('name', e.target.value)}
              onBlur={() => handleImmediateSave(localNodeRef.current)}
              className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-indigo-500 py-2 pl-9 pr-4 rounded-xl text-xs outline-none transition-all text-slate-800"
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
              value={localNode.role}
              placeholder="Ex: Diretor de Tecnologia, Comprador"
              onChange={(e) => handleFieldChange('role', e.target.value)}
              onBlur={() => handleImmediateSave(localNodeRef.current)}
              className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-indigo-500 py-2 pl-9 pr-4 rounded-xl text-xs outline-none transition-all text-slate-800"
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
              value={localNode.department || ''}
              placeholder="Ex: Coca-Cola, Google, Empresa Exemplo"
              onChange={(e) => handleFieldChange('department', e.target.value)}
              onBlur={() => handleImmediateSave(localNodeRef.current)}
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
              value={localNode.email}
              placeholder="como_abordar@empresa.com"
              onChange={(e) => handleFieldChange('email', e.target.value)}
              onBlur={() => handleImmediateSave(localNodeRef.current)}
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
              value={localNode.phone}
              placeholder="(11) 98888-7777 ou ramal"
              onChange={(e) => handleFieldChange('phone', e.target.value)}
              onBlur={() => handleImmediateSave(localNodeRef.current)}
              className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-indigo-500 py-2 pl-9 pr-4 rounded-xl text-xs font-mono outline-none transition-all text-slate-800"
            />
          </div>
        </div>

        {/* Custom Color Selector */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Cor de Destaque do Card
            </label>
            {localNode.cardColor && (
              <button
                type="button"
                onClick={() => {
                  const updated = { ...localNode };
                  delete updated.cardColor;
                  delete updated.cardStyle;
                  handleImmediateSave(updated);
                }}
                className="text-[10px] font-semibold text-slate-400 hover:text-rose-600 transition-colors underline cursor-pointer"
              >
                Remover Cor
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2 items-center bg-slate-50/50 p-2.5 rounded-xl border border-slate-100">
            {[
              { hex: '#4f46e5', label: 'Indigo' },
              { hex: '#0284c7', label: 'Azul' },
              { hex: '#059669', label: 'Verde' },
              { hex: '#d97706', label: 'Laranja' },
              { hex: '#e11d48', label: 'Rosa' },
              { hex: '#7c3aed', label: 'Roxo' },
              { hex: '#0d9488', label: 'Teal' },
              { hex: '#475569', label: 'Slate' },
            ].map((preset) => (
              <button
                key={preset.hex}
                type="button"
                onClick={() => handleImmediateSave({ ...localNode, cardColor: preset.hex })}
                className={`w-6 h-6 rounded-full border transition-all cursor-pointer relative ${
                  localNode.cardColor === preset.hex 
                    ? 'ring-2 ring-indigo-500 scale-110 border-white shadow-sm' 
                    : 'border-slate-200 hover:scale-105'
                }`}
                style={{ backgroundColor: preset.hex }}
                title={preset.label}
              >
                {localNode.cardColor === preset.hex && (
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] text-white font-bold">✓</span>
                )}
              </button>
            ))}

            {/* Custom Picker */}
            <div className="flex items-center gap-1.5 ml-auto border border-slate-200 rounded-lg px-2 py-0.5 bg-white shadow-2xs">
              <input
                type="color"
                value={localNode.cardColor || '#4f46e5'}
                onChange={(e) => handleFieldChange('cardColor', e.target.value)}
                onBlur={() => handleImmediateSave(localNodeRef.current)}
                className="w-5 h-5 rounded cursor-pointer border-0 p-0 bg-transparent"
                title="Cor personalizada"
              />
              <input
                type="text"
                value={localNode.cardColor || ''}
                placeholder="#Hex"
                onChange={(e) => handleFieldChange('cardColor', e.target.value)}
                onBlur={() => handleImmediateSave(localNodeRef.current)}
                className="w-14 bg-transparent text-[9px] outline-none font-mono text-slate-700 uppercase"
              />
            </div>
          </div>

          {/* Card Style Selector - only visible when a custom color is active */}
          {localNode.cardColor && (
            <div className="pt-1.5 space-y-1">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                Estilo de Exibição da Cor
              </label>
              <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/60 gap-1">
                {[
                  { key: 'soft', label: 'Suave' },
                  { key: 'solid', label: 'Sólido' },
                  { key: 'border', label: 'Borda' }
                ].map((styleOpt) => (
                  <button
                    key={styleOpt.key}
                    type="button"
                    onClick={() => handleImmediateSave({ ...localNode, cardStyle: styleOpt.key as any })}
                    className={`flex-1 py-1 text-[11px] font-medium rounded-lg transition-all ${
                      (localNode.cardStyle || 'soft') === styleOpt.key
                        ? 'bg-white text-indigo-700 font-bold shadow-2xs border border-slate-200/50'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {styleOpt.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Notes for prospecting */}
        <div className="space-y-1">
          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block flex items-center justify-between">
            <span>Dicas de Abordagem / Notas</span>
            <span className="text-[9px] bg-indigo-50 text-indigo-700 font-medium px-1.5 py-0.5 rounded">
              Foco Comercial
            </span>
          </label>
          <textarea
            rows={4}
            value={localNode.notes || ''}
            placeholder="Adicione informações fundamentais de negócios. Quem ele responde? Qual o produto deles que podemos oferecer? Qual a dor dele que resolvemos?"
            onChange={(e) => handleFieldChange('notes', e.target.value)}
            onBlur={() => handleImmediateSave(localNodeRef.current)}
            className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:border-indigo-500 p-3 rounded-xl text-xs outline-none transition-all resize-none text-slate-700"
          />
        </div>

        <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 flex items-start gap-2.5 text-[10px] text-slate-500">
          <HelpCircle className="h-4 w-4 mt-0.5 text-slate-400 shrink-0" />
          <p className="leading-relaxed">
            Você pode conectar links de e-mails (`mailto`) ou celulares (`tel`) diretamente clicando nos ícones correspondentes no card para iniciar conversas rápidas.
          </p>
        </div>

        {/* Conexão & Hierarquia */}
        <div className="p-3.5 bg-slate-100/50 rounded-xl border border-slate-200/60 space-y-3">
          <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5 border-b border-slate-200/50 pb-1.5 uppercase tracking-wide">
            <span>🔗</span>
            Conexão & Hierarquia
          </h4>

          {/* Superior / Gestor Dropdown */}
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
              Gestor Superior (Líder)
            </label>
            <select
              value={localNode.parentId || ''}
              onChange={(e) => {
                const val = e.target.value;
                const newParentId = val === '' ? null : val;
                const updated = {
                  ...localNode,
                  parentId: newParentId,
                  parentPort: 'bottom' as const,
                  childPort: 'top' as const
                };
                
                handleImmediateSave(updated);
                
                if (newParentId === null) {
                  showCustomAlert("Conexão Atualizada 🌟", `"${localNode.name || 'Este colaborador'}" foi desconectado(a) e agora é um Líder Principal.`);
                } else {
                  const pName = nodes.find(n => n.id === newParentId)?.name || 'novo gestor';
                  showCustomAlert("Conexão Atualizada 🔗", `"${localNode.name || 'Este colaborador'}" agora responde a "${pName}".`);
                }
              }}
              className="w-full bg-white border border-slate-200 focus:border-indigo-500 p-2 rounded-xl text-xs outline-none transition-all text-slate-700 cursor-pointer"
            >
              <option value="">Nenhum (Tornar Líder Principal)</option>
              {nodes
                .filter(n => n.id !== localNode.id && !isDescendant(nodes, n.id, localNode.id))
                .map(n => (
                  <option key={n.id} value={n.id}>
                    {n.name || 'Sem nome'} ({n.role || 'Sem cargo'})
                  </option>
                ))
              }
            </select>
          </div>

          {/* Ports Configuration (Only show if there is a parent) */}
          {localNode.parentId && (
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="space-y-1">
                <label className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider block">
                  Porta Saída (Gestor)
                </label>
                <select
                  value={localNode.parentPort || 'bottom'}
                  onChange={(e) => handleImmediateSave({
                    ...localNode,
                    parentPort: e.target.value as any
                  })}
                  className="w-full bg-white border border-slate-200 focus:border-indigo-500 p-1.5 rounded-lg text-[11px] outline-none transition-all text-slate-700 cursor-pointer font-medium"
                >
                  <option value="bottom">Base (Inferior)</option>
                  <option value="top">Topo (Superior)</option>
                  <option value="left">Esquerda</option>
                  <option value="right">Direita</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider block">
                  Porta Entrada (Membro)
                </label>
                <select
                  value={localNode.childPort || 'top'}
                  onChange={(e) => handleImmediateSave({
                    ...localNode,
                    childPort: e.target.value as any
                  })}
                  className="w-full bg-white border border-slate-200 focus:border-indigo-500 p-1.5 rounded-lg text-[11px] outline-none transition-all text-slate-700 cursor-pointer font-medium"
                >
                  <option value="top">Topo (Superior)</option>
                  <option value="bottom">Base (Inferior)</option>
                  <option value="left">Esquerda</option>
                  <option value="right">Direita</option>
                </select>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Save Confirmation Button */}
      <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
        <button
          type="button"
          onClick={handleFinish}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-4 rounded-xl transition-colors text-xs text-center flex items-center justify-center gap-2 cursor-pointer shadow-sm"
        >
          <Check className="h-4 w-4" />
          <span>Concluir e Salvar</span>
        </button>
      </div>
    </motion.aside>
  );
};
