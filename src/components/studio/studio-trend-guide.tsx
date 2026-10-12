const comparisonRows = [
  ['Starting point', 'One photo', 'Photo, video or text prompt'],
  ['Scene setup', 'Already prepared', 'You create it yourself'],
  ['Prompt writing', 'Not required', 'Usually required'],
  [
    'Motion setup',
    'Built into the template',
    'Must be described or referenced',
  ],
  ['Editing', 'Minimal setup', 'May require multiple attempts'],
  [
    'Best for',
    'Making the Burning Bridges trend',
    'Creating custom video concepts',
  ],
] as const;

export function StudioTrendGuide() {
  return (
    <section
      className="bb-story-section bb-shell"
      aria-labelledby="trend-title"
    >
      <div className="bb-story-grid">
        <header className="bb-content-heading">
          <span className="bb-section-kicker">THE TREND</span>
          <h2 id="trend-title">What Is Burning Bridges AI?</h2>
        </header>
        <div className="bb-story-copy">
          <p>
            Burning Bridges AI refers to AI-generated versions of the viral
            party-video trend associated with Drake’s “Burning Bridges.” Instead
            of filming the performance yourself, you use a photo of a person or
            pet and generate a new video with that subject in the lead role.
          </p>
          <p>
            That is why searches such as “Burning Bridges AI,” “Burning Bridges
            AI Drake,” “Drake Burning Bridges AI video” and “Burning Bridges AI
            video generator” often refer to the same trend: people want to
            recreate the recognizable video moment with a different main
            character.
          </p>
          <p>
            BurningBridgesAI.cc is built specifically for that task. The scene
            and motion are already prepared, so you do not have to reconstruct
            the idea inside a general-purpose AI video generator.
          </p>
        </div>
      </div>
      <aside className="bb-quick-answer" aria-labelledby="quick-answer-title">
        <h3 id="quick-answer-title">Quick answer</h3>
        <p>
          Burning Bridges AI is a photo-to-video trend generator: upload one
          photo, choose a Burning Bridges scene, and generate a personalized AI
          version of the viral video format.
        </p>
      </aside>
    </section>
  );
}

export function StudioVideoComparison() {
  return (
    <section
      className="bb-comparison-section bb-shell"
      aria-labelledby="comparison-title"
    >
      <header className="bb-content-heading">
        <h2 id="comparison-title">
          Burning Bridges AI Generator vs. a General AI Video Generator
        </h2>
        <p>
          A general AI video model gives you more freedom, but it also makes you
          build the scene yourself. A dedicated Burning Bridges AI generator is
          designed for one specific result.
        </p>
      </header>
      <div className="bb-comparison-table">
        <table aria-labelledby="comparison-title">
          <thead>
            <tr>
              <td />
              <th scope="col">Burning Bridges AI Generator</th>
              <th scope="col">General AI Video Generator</th>
            </tr>
          </thead>
          <tbody>
            {comparisonRows.map(([label, dedicated, general]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td>{dedicated}</td>
                <td>{general}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="bb-section-note">
        If your goal is specifically to make the Burning Bridges AI trend, the
        dedicated workflow removes most of the setup. If you want to invent a
        completely different scene, a general AI video generator gives you more
        creative control.
      </p>
    </section>
  );
}

export function StudioSongGuide() {
  return (
    <section className="bb-song-section" aria-labelledby="song-title">
      <div className="bb-shell bb-story-grid">
        <header className="bb-content-heading">
          <span className="bb-section-kicker">THE SONG</span>
          <h2 id="song-title">
            What Song Is the Burning Bridges AI Trend From?
          </h2>
        </header>
        <div className="bb-story-copy">
          <p>
            The Burning Bridges AI trend is associated with Drake’s “Burning
            Bridges.” After seeing the party-style AI videos online, people
            often search for terms such as “Burning Bridges AI music,” “Burning
            Bridges AI Drake” and “Drake Burning Bridges AI video” to find the
            song or learn how the videos are made.
          </p>
          <p>
            If you add or publish music with your video, use audio you have the
            right to use or an official sound made available by the social
            platform where you post it.
          </p>
          <p>
            BurningBridgesAI.cc is an independent AI video tool and is not
            affiliated with or endorsed by Drake, his label, or the rights
            holders of the original song or video.
          </p>
        </div>
      </div>
    </section>
  );
}
