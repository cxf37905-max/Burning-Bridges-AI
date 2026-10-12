import { Clapperboard, Download, ImagePlus } from 'lucide-react';

const steps = [
  {
    icon: ImagePlus,
    title: 'Add one photo',
    description:
      'Upload a clear portrait with your head and upper body in view, then choose a template.',
  },
  {
    icon: Clapperboard,
    title: 'Generate your video',
    description:
      'Use 100 credits for an HD 720p Burning Bridges AI video. The motion and music are already included.',
  },
  {
    icon: Download,
    title: 'Download and share',
    description:
      'Find the finished MP4 in your studio, save it, and share your own version of the trend.',
  },
];

export function VideoHowTo() {
  return (
    <section className="bb-how-section" id="how-it-works">
      <div className="bb-shell">
        <header className="bb-content-heading">
          <h2>How to make a Burning Bridges AI video</h2>
          <p>One photo, a ready-made template, and no prompt to write.</p>
        </header>
        <div className="bb-steps">
          {steps.map(({ icon: Icon, title, description }, index) => (
            <article key={title}>
              <span className="bb-how-number">0{index + 1} /</span>
              <Icon size={24} strokeWidth={1.5} />
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
        <aside className="bb-photo-tips" aria-labelledby="photo-tips-title">
          <h3 id="photo-tips-title">Photos that work best</h3>
          <ul>
            <li>One person or pet, with the head and upper body visible.</li>
            <li>
              Good light, a clear face, and no sunglasses or heavy filters.
            </li>
            <li>
              JPG, PNG or WebP, up to 20 MB and at least 341 px on each side.
            </li>
            <li>
              Use your own photo or get permission from the person pictured.
            </li>
          </ul>
        </aside>
      </div>
    </section>
  );
}
