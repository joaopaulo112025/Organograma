import React from 'react';
import { OrgNode } from '../types';
import { Phone, Mail, User, Briefcase, Plus, Edit, Trash2, FileText, Building2 } from 'lucide-react';

interface OrgChartNodeCardProps {
  node: OrgNode;
  onEdit: (node: OrgNode) => void;
  onAddChild: (parentId: string) => void;
  onDelete: (nodeId: string) => void;
  isRoot: boolean;
  onStartConnect?: (nodeId: string, port: 'top' | 'bottom' | 'left' | 'right', event: React.MouseEvent) => void;
  connectingFromId?: string | null;
}

function getSoftBgColor(hex?: string) {
  if (!hex) return undefined;
  const cleanHex = hex.replace('#', '');
  if (cleanHex.length !== 6) return undefined;
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, 0.05)`;
}

function getSoftBorderColor(hex?: string) {
  if (!hex) return undefined;
  const cleanHex = hex.replace('#', '');
  if (cleanHex.length !== 6) return undefined;
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, 0.25)`;
}

export default function OrgChartNodeCard({
  node,
  onEdit,
  onAddChild,
  onDelete,
  isRoot,
  onStartConnect,
  connectingFromId
}: OrgChartNodeCardProps) {
  const customBg = getSoftBgColor(node.cardColor);
  const customBorder = getSoftBorderColor(node.cardColor);

  return (
    <div
      id={`org-node-card-${node.id}`}
      data-node-id={node.id}
      style={{
        backgroundColor: customBg || '#ffffff',
        borderColor: customBorder || undefined
      }}
      className={`rounded-xl shadow-md hover:shadow-xl border transition-all duration-300 w-[260px] p-4 flex flex-col justify-between relative group pointer-events-auto ${
        connectingFromId === node.id 
          ? 'ring-2 ring-indigo-500 scale-[1.02] border-indigo-200' 
          : connectingFromId 
            ? 'ring-2 ring-emerald-400 ring-dashed scale-[0.98] border-emerald-200 hover:ring-solid hover:ring-emerald-500 hover:scale-100' 
            : node.cardColor ? '' : 'border-slate-100'
      }`}
    >
      {/* Visual ports for drag to connect */}
      {onStartConnect && (
        <>
          {/* Top Port */}
          <div
            data-node-id={node.id}
            data-port-name="top"
            onMouseDown={(e) => {
              e.stopPropagation();
              onStartConnect(node.id, 'top', e);
            }}
            className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-indigo-600 hover:bg-indigo-700 active:scale-125 border-2 border-white shadow-md cursor-crosshair z-30 transition-all opacity-0 group-hover:opacity-100 flex items-center justify-center pointer-events-auto pdf-hide"
            title="Arraste para conectar o topo"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          </div>

          {/* Bottom Port */}
          <div
            data-node-id={node.id}
            data-port-name="bottom"
            onMouseDown={(e) => {
              e.stopPropagation();
              onStartConnect(node.id, 'bottom', e);
            }}
            className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-4 h-4 rounded-full bg-indigo-600 hover:bg-indigo-700 active:scale-125 border-2 border-white shadow-md cursor-crosshair z-30 transition-all opacity-0 group-hover:opacity-100 flex items-center justify-center pointer-events-auto pdf-hide"
            title="Arraste para conectar a base"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          </div>

          {/* Left Port */}
          <div
            data-node-id={node.id}
            data-port-name="left"
            onMouseDown={(e) => {
              e.stopPropagation();
              onStartConnect(node.id, 'left', e);
            }}
            className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-indigo-600 hover:bg-indigo-700 active:scale-125 border-2 border-white shadow-md cursor-crosshair z-30 transition-all opacity-0 group-hover:opacity-100 flex items-center justify-center pointer-events-auto pdf-hide"
            title="Arraste para conectar o lado esquerdo"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          </div>

          {/* Right Port */}
          <div
            data-node-id={node.id}
            data-port-name="right"
            onMouseDown={(e) => {
              e.stopPropagation();
              onStartConnect(node.id, 'right', e);
            }}
            className="absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-indigo-600 hover:bg-indigo-700 active:scale-125 border-2 border-white shadow-md cursor-crosshair z-30 transition-all opacity-0 group-hover:opacity-100 flex items-center justify-center pointer-events-auto pdf-hide"
            title="Arraste para conectar o lado direito"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          </div>
        </>
      )}

      {/* Upper Color bar */}
      <div 
        className="absolute top-0 left-0 right-0 h-1.5 rounded-t-xl opacity-80"
        style={{ backgroundColor: node.cardColor || (isRoot ? '#4f46e5' : '#94a3b8') }}
      />

      {/* Main Info */}
      <div className="flex flex-col gap-2 mt-1">
        {/* Company / Brand Badge */}
        {(node.department || isRoot) && (
          <div className="flex items-center justify-between min-h-[22px]">
            {node.department ? (
              <span 
                className="text-[10px] font-bold px-2 py-0.5 rounded-lg border bg-indigo-50 text-indigo-700 border-indigo-100 truncate max-w-[170px] flex items-center gap-1" 
                title={node.department}
                style={{
                  backgroundColor: customBg || undefined,
                  color: node.cardColor || undefined,
                  borderColor: customBorder || undefined
                }}
              >
                <Building2 
                  className="h-3 w-3 text-indigo-500 shrink-0" 
                  style={{ color: node.cardColor || undefined }}
                />
                {node.department}
              </span>
            ) : <div />}
            {isRoot && (
              <span className="text-[9px] bg-slate-900 text-white font-medium px-1.5 py-0.5 rounded shrink-0">
                LÍDER
              </span>
            )}
          </div>
        )}

        {/* Member Details */}
        <div className="flex items-start gap-2.5 mt-1">
          <div className="p-1.5 bg-slate-50 rounded-lg text-slate-400 shrink-0">
            <User className="h-4 w-4" />
          </div>
          <div className="overflow-hidden">
            <h4 className="text-sm font-semibold text-slate-800 break-words line-clamp-1 hover:line-clamp-none transition-all duration-300">
              {node.name || 'Nome do Colaborador'}
            </h4>
            <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-0.5">
              <Briefcase className="h-3 w-3 shrink-0" />
              <span className="truncate">{node.role || 'Cargo / Função'}</span>
            </div>
          </div>
        </div>

        {/* Contact Links */}
        <div className="border-t border-slate-100 pt-2.5 mt-1 flex flex-col gap-1.5">
          {/* Email */}
          <div className="flex items-center gap-2 text-xs text-slate-600 hover:text-indigo-600 transition-colors">
            <Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <a 
              href={node.email ? `mailto:${node.email}` : undefined} 
              onClick={(e) => !node.email && e.preventDefault()}
              className={`truncate font-mono ${node.email ? 'underline cursor-pointer' : 'text-slate-400 cursor-not-allowed'}`}
              title={node.email || 'Nenhum e-mail adicionado'}
            >
              {node.email || 'Sem e-mail'}
            </a>
          </div>

          {/* Phone */}
          <div className="flex items-center gap-2 text-xs text-slate-600 hover:text-indigo-600 transition-colors">
            <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <a 
              href={node.phone ? `tel:${node.phone}` : undefined} 
              onClick={(e) => !node.phone && e.preventDefault()}
              className={`truncate font-mono ${node.phone ? 'underline cursor-pointer' : 'text-slate-400 cursor-not-allowed'}`}
              title={node.phone || 'Nenhum telefone adicionado'}
            >
              {node.phone || 'Sem telefone'}
            </a>
          </div>

          {/* Notes summary badge if they exist */}
          {node.notes && (
            <div className="flex items-start gap-1.5 bg-slate-50 px-2 py-1 rounded mt-0.5 text-[10px] text-slate-500 line-clamp-2" title={node.notes}>
              <FileText className="h-3 w-3 mt-0.5 text-slate-400 shrink-0" />
              <span className="italic leading-normal">{node.notes}</span>
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons overlaying on hover, styled sleekly */}
      <div className="flex items-center justify-end gap-1.5 border-t border-slate-50 pt-2 mt-2 pdf-hide">
        {/* Edit Button */}
        <button
          onClick={() => onEdit(node)}
          className="p-1 px-1.5 rounded-md hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-all flex items-center gap-1 text-[11px]"
          title="Editar dados"
        >
          <Edit className="h-3.5 w-3.5" />
          <span>Editar</span>
        </button>

        {/* Add Subordinate Button */}
        <button
          onClick={() => onAddChild(node.id)}
          className="p-1 px-1.5 rounded-md hover:bg-indigo-50 text-indigo-500 hover:text-indigo-600 transition-all flex items-center gap-1 text-[11px]"
          title="Adicionar subordinado"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Adicionar</span>
        </button>

        {/* Delete button (block root delete) */}
        {!isRoot && (
          <button
            onClick={() => onDelete(node.id)}
            className="p-1 px-1.5 rounded-md hover:bg-rose-50 text-rose-400 hover:text-rose-600 transition-all flex items-center gap-1 text-[11px] ml-auto"
            title="Remover"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
