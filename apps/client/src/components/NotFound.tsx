export function NotFound() {
  return (
    <section className="not-found">
      <span className="eyebrow">404</span>
      <h1>That word isn’t on this board.</h1>
      <p>The page you requested is not part of the current Words experience.</p>
      <a className="button button--primary" href="/">
        Return home
      </a>
    </section>
  );
}
