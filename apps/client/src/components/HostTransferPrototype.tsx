export function HostTransferPrototype() {
  return (
    <section
      className="panel transfer-panel"
      aria-labelledby="host-transfer-title"
    >
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Demonstration control</span>
          <h2 id="host-transfer-title">Pass the host role</h2>
        </div>
      </div>
      <label htmlFor="host-candidate">Choose a connected player</label>
      <div className="transfer-controls">
        <select id="host-candidate" defaultValue="player-two">
          <option value="player-two">Player Two</option>
          <option value="player-three">Player Three</option>
        </select>
        <button className="button button--secondary" type="button" disabled>
          Make Host
        </button>
      </div>
      <p className="field-note">
        The real server will verify that only the current host can do this.
      </p>
    </section>
  );
}
