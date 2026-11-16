interface MentionTextProps {
  children: string;
}

export function MentionText({ children }: MentionTextProps) {
  return (
    <>
      {children.split(/(@[a-zA-Z0-9_]{3,30})/g).map((part, index) =>
        /^@[a-zA-Z0-9_]{3,30}$/.test(part)
          ? <span key={index} className="font-semibold text-primary-300">{part}</span>
          : part
      )}
    </>
  );
}
