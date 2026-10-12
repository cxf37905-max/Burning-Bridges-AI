import Image from 'next/image';

const moments = [
  {
    image: 'walk-up',
    time: '0–2 seconds',
    title: 'The walk-up',
    description: 'Step into the party and turn toward the camera.',
  },
  {
    image: 'grin',
    time: '2–6 seconds',
    title: 'The grin',
    description:
      'Lean toward the lens, smile, and bring a hand into the frame.',
  },
  {
    image: 'hype',
    time: '6–15 seconds',
    title: 'The hype',
    description: 'Open your arms, move with the track, and turn to the room.',
  },
  {
    image: 'where-she-at',
    time: '15–20 seconds',
    title: 'Where she at?',
    description:
      'Look across the crowd with a hand above your eyes, then point at the camera.',
  },
];

export function VideoMotionGuide() {
  return (
    <section
      className="bb-motion-section bb-shell"
      id="about"
      aria-labelledby="motion-title"
    >
      <header className="bb-content-heading">
        <h2 id="motion-title">What happens in your Burning Bridges AI video</h2>
        <p>
          Your photo becomes the lead in the same 20-second party performance.
          The template provides the movement and original soundtrack.
        </p>
      </header>
      <div className="bb-motion-grid">
        {moments.map((moment) => (
          <article key={moment.image}>
            <div className="bb-motion-frame">
              <Image
                src={`/studio/beats/${moment.image}.jpg`}
                alt={`Burning Bridges AI reference: ${moment.title}`}
                fill
                sizes="(max-width: 700px) 44vw, 260px"
              />
            </div>
            <span className="bb-motion-time">{moment.time}</span>
            <h3>{moment.title}</h3>
            <p>{moment.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
