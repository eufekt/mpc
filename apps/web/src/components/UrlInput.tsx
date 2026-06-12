import { FormEvent, useState } from "react";

type Props = {
  onLoad: (url: string) => void;
  disabled?: boolean;
};

export function UrlInput({ onLoad, disabled }: Props) {
  const [url, setUrl] = useState("");

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    onLoad(trimmed);
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="youtube url"
        disabled={disabled}
        spellCheck={false}
      />{" "}
      <button type="submit" disabled={disabled}>
        LOAD
      </button>
    </form>
  );
}
