type PrototypeNoticeProps = {
  children: string;
};

export function PrototypeNotice({ children }: PrototypeNoticeProps) {
  return (
    <aside className="prototype-notice" aria-label="Prototype status">
      <span className="prototype-notice__signal" aria-hidden="true">
        i
      </span>
      <p>
        <strong>Prototype only.</strong> {children}
      </p>
    </aside>
  );
}
