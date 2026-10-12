import { Check, Minus } from 'lucide-react';

const recommended = [
  'One person or one pet',
  'A clearly visible face',
  'Good, even lighting',
  'Head-to-waist or full-body framing',
  'A sharp JPG, PNG or WebP image',
];

const avoid = [
  'Crowded group photos',
  'A face hidden by hands or objects',
  'Very dark or blurry images',
  'Heavy beauty filters',
  'Extreme camera angles',
];

export function VideoPhotoGuide() {
  return (
    <section
      className="bb-photo-guide bb-shell"
      aria-labelledby="photo-guide-title"
    >
      <header className="bb-content-heading">
        <span className="bb-section-kicker">BETTER INPUT, BETTER RESULT</span>
        <h2 id="photo-guide-title">
          What Photo Works Best for Burning Bridges AI?
        </h2>
        <p>
          Your source photo gives the AI its reference for the face, hair,
          clothing and overall appearance of the subject. A simple, clear image
          usually produces a more consistent result.
        </p>
      </header>
      <div className="bb-photo-guidance-columns">
        <div>
          <h3>Use a photo with</h3>
          <ul>
            {recommended.map((item) => (
              <li key={item}>
                <Check size={16} aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3>Try to avoid</h3>
          <ul>
            {avoid.map((item) => (
              <li key={item}>
                <Minus size={16} aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="bb-section-note">
        If the generated face changes too much during motion, try again with a
        clearer, front-facing source photo.
      </p>
    </section>
  );
}
