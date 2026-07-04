import { X } from "lucide-react";
import { StatusMessage } from "../shared/types";

interface StatusToastProps {
  message: StatusMessage;
  onClose: () => void;
}

export function StatusToast({ message, onClose }: StatusToastProps) {
  return (
    <div className={`toast-message ${message.kind}`} role="status">
      <span>{message.text}</span>
      <button className="toast-close" onClick={onClose} aria-label="Close message">
        <X size={14} />
      </button>
    </div>
  );
}
