import { useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  title: string;
  onClose: () => void;
  onSubmit?: () => void;
  submitLabel?: string;
  submitDisabled?: boolean;
  children: React.ReactNode;
}

export default function Modal({ title, onClose, onSubmit, submitLabel = 'Confirm', submitDisabled, children }: ModalProps) {
  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-white border border-gray-200 rounded-lg w-full max-w-lg mx-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-gray-900 font-semibold text-sm tracking-wide">{title}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {children}
        </div>

        {/* Footer */}
        {onSubmit && (
          <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-200">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors">
              Cancel
            </button>
            <button
              onClick={onSubmit}
              disabled={submitDisabled}
              className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-gray-900 rounded transition-colors"
            >
              {submitLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Shared form field helpers ────────────────────────────────────────────

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-gray-700 mb-1 uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full bg-gray-100 border border-gray-200 rounded px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-indigo-500 ${props.className ?? ''}`}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full bg-gray-100 border border-gray-200 rounded px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-indigo-500 ${props.className ?? ''}`}
    />
  );
}
