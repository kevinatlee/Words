import { createDemoBoard } from '../utils/demoBoard';
import { LetterGrid } from './LetterGrid';
import { PrototypeNotice } from './PrototypeNotice';
import { RoomCode } from './RoomCode';

const submittedWords = [
  { word: 'TIDE', score: '+1', status: 'Accepted' },
  { word: 'STONE', score: '+2', status: 'Accepted' },
  { word: 'MINT', score: '—', status: 'Waiting' },
];

export function PlayerPrototype() {
  return (
    <div className="player-page">
      <section className="player-page__intro">
        <span className="eyebrow">Phone preview</span>
        <h1>Your board is ready.</h1>
        <p>
          This is how a player’s touch-friendly round screen could feel once
          live rooms are connected.
        </p>
      </section>

      <div className="phone-stage">
        <div className="phone-frame">
          <header className="phone-header">
            <div>
              <small>Playing as</small>
              <strong>Guest Finch</strong>
            </div>
            <RoomCode code="MINT 42" />
          </header>

          <div className="phone-controller">
            <span className="player-avatar" aria-hidden="true">
              H
            </span>
            <span>
              <small>Game host</small>
              <strong>Guest Finch</strong>
            </span>
            <span className="status-label status-label--controller">
              Controller
            </span>
          </div>

          <div className="player-timer" aria-label="Mock time remaining">
            <span>Time remaining</span>
            <strong>2:14</strong>
          </div>

          <LetterGrid
            letters={createDemoBoard(4)}
            size={4}
            label="Four by four touch board prototype"
            selectedIndices={[5, 6, 10, 14]}
            compact
          />

          <section className="word-entry" aria-labelledby="selected-word-title">
            <div>
              <small id="selected-word-title">Selected word</small>
              <strong className="selected-word">TIDE</strong>
            </div>
            <button className="button button--accent" type="button" disabled>
              Submit Word
            </button>
          </section>

          <section
            className="submitted-words"
            aria-labelledby="submitted-words-title"
          >
            <div className="submitted-words__heading">
              <h2 id="submitted-words-title">Your Words</h2>
              <strong>3 pts</strong>
            </div>
            <ul>
              {submittedWords.map((entry) => (
                <li key={entry.word}>
                  <span>
                    <strong>{entry.word}</strong>
                    <small>{entry.status}</small>
                  </span>
                  <strong>{entry.score}</strong>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <PrototypeNotice>
          This phone view is static. Touch tracing, submissions, scores, and
          reconnecting will depend on the future server.
        </PrototypeNotice>
      </div>
    </div>
  );
}
