type PrototypeNoticeProps = {
  children: string;
  title?: string;
  ariaLabel?: string;
};

export function PrototypeNotice({
  children,
  title = 'Prototype only.',
  ariaLabel = 'Prototype status',
}: PrototypeNoticeProps) {
  return (
    <aside className="prototype-notice" aria-label={ariaLabel}>
      <span className="prototype-notice__signal" aria-hidden="true">
        i
      </span>
      <p>
        <strong>{title}</strong> {children}
      </p>
    </aside>
  );
}
