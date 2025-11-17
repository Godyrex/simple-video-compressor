import React from "react";
import DragDropArea from "./DragDropArea";

interface AddPanelProps {
  title: string;
  className: string;
  onFiles: (files: FileList | null) => void;
  onClick: () => void;
  inputRef: React.RefObject<HTMLInputElement>;
}

const AddPanel: React.FC<AddPanelProps> = ({
  title,
  className,
  onFiles,
  onClick,
  inputRef,
}) => (
  <div className={className}>
    <h2 className="text-xl font-semibold text-gray-900 mb-4">{title}</h2>
    <div className="mb-4">
      <DragDropArea onFiles={onFiles} onClick={onClick} />
    </div>
    <input
      ref={inputRef}
      type="file"
      multiple
      accept="video/*"
      onChange={(ev) => onFiles(ev.target.files)}
      className="hidden"
    />
  </div>
);

export default AddPanel;
