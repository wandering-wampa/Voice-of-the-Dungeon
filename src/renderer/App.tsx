import { useState } from 'react';

export default function App() {
  const [pong, setPong] = useState('');

  const handlePing = async () => {
    const response = await window.vod.ping('hello from renderer');
    setPong(response);
  };

  return (
    <div className="app">
      <header className="header">
        <h1>Voice of the Dungeon</h1>
        <p>Electron + Vite scaffold is ready. Next up: data layer, voice pipeline, and rules engine.</p>
      </header>

      <section className="panel">
        <button onClick={handlePing}>Ping Main</button>
        {pong ? <div className="pong">Main replied: {pong}</div> : null}
      </section>
    </div>
  );
}
