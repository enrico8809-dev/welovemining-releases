
/** Every view is a fixed header over a scrolling body — one place, one rule. */
export default function Screen({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <header className="topbar">
        <div>
          <h1>{title}</h1>
          {subtitle && <div className="sub">{subtitle}</div>}
        </div>
        <span className="spacer" />
        {actions}
      </header>
      <div className="content">{children}</div>
    </>
  );
}
