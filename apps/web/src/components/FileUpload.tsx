type Props = {
  onFile: (file: File) => void;
  disabled?: boolean;
};

export function FileUpload({ onFile, disabled }: Props) {
  return (
    <input
      type="file"
      accept="audio/*,.mp3,.wav,.m4a,.ogg,.webm"
      disabled={disabled}
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) onFile(file);
        e.target.value = "";
      }}
    />
  );
}
